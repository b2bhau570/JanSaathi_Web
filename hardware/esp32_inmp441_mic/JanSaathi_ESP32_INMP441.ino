/*
 * Jan Saathi AI — ESP32-S3 (N16R8) + INMP441 MEMS Omnidirectional Microphone
 * Firmware for USB Audio Voice Input to Jan Saathi AI Telemedicine Platform
 *
 * Board: ESP32S3 Dev Module (or any ESP32-S3 N16R8 board)
 * Mic:   INMP441 I2S Digital MEMS Microphone
 *
 * Pin Connections:
 *   INMP441 VDD  -> ESP32-S3 3.3V
 *   INMP441 GND  -> ESP32-S3 GND
 *   INMP441 L/R  -> ESP32-S3 GND (Sets Left Channel)
 *   INMP441 SD   -> ESP32-S3 GPIO 4 (I2S Serial Data In)
 *   INMP441 WS   -> ESP32-S3 GPIO 5 (I2S Word Select / LRCLK)
 *   INMP441 SCK  -> ESP32-S3 GPIO 6 (I2S Serial Clock / BCLK)
 *
 * Output: Streams 16 kHz, 16-bit Mono PCM audio over USB Serial to the PC.
 */

#include <Arduino.h>
#include "driver/i2s.h"

// ---------------------------------------------------------------------------
// Pin Definitions (Adjust if your board routes differently)
// ---------------------------------------------------------------------------
#define I2S_MIC_SD_PIN   4  // Serial Data (SD)
#define I2S_MIC_WS_PIN   5  // Word Select / LRCLK (WS)
#define I2S_MIC_SCK_PIN  6  // Serial Clock / BCLK (SCK)

// Built-in LED on ESP32-S3 (GPIO 2, 48, or 38 depending on module)
#define LED_STATUS_PIN   48 // Optional RGB/Status LED (change to your board's LED)

// ---------------------------------------------------------------------------
// Audio Configuration (Optimized for Sarvam STT & Speech-to-Text)
// ---------------------------------------------------------------------------
#define SAMPLE_RATE       16000 // 16 kHz sample rate
#define I2S_PORT          I2S_NUM_0
#define BUFFER_SAMPLES    512   // Chunk size per read (512 samples = 32ms)
#define DIGITAL_GAIN      4     // Digital volume boost for INMP441 (2x - 8x)

// Framing Protocol for Robust USB Serial Reception
// Packet: [SYNC 0x55 0xAA] [LENGTH_HI] [LENGTH_LO] [PCM_PAYLOAD...]
const uint8_t SYNC_BYTES[2] = {0x55, 0xAA};

int32_t raw_i2s_buffer[BUFFER_SAMPLES];
int16_t pcm_16bit_buffer[BUFFER_SAMPLES];

// ---------------------------------------------------------------------------
// I2S Driver Setup for INMP441
// ---------------------------------------------------------------------------
void setup_i2s() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // INMP441 sends 24-bit in 32-bit slot
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,  // L/R tied to GND
        .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_STAND_I2S),
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = BUFFER_SAMPLES,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_MIC_SCK_PIN,
        .ws_io_num = I2S_MIC_WS_PIN,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_MIC_SD_PIN
    };

    esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] Failed to install I2S driver: %d\n", err);
        while (1) { delay(1000); }
    }

    err = i2s_set_pin(I2S_PORT, &pin_config);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] Failed to set I2S pins: %d\n", err);
        while (1) { delay(1000); }
    }

    i2s_zero_dma_buffer(I2S_PORT);
    Serial.println("[INFO] INMP441 I2S microphone initialized at 16000 Hz 16-bit Mono.");
}

void setup() {
    // High-speed USB Serial for real-time audio transmission
    Serial.begin(921600);
    delay(1000);

    Serial.println("\n========================================================");
    Serial.println("  Jan Saathi AI — ESP32-S3 + INMP441 Voice Hardware   ");
    Serial.println("========================================================");

    pinMode(LED_STATUS_PIN, OUTPUT);
    digitalWrite(LED_STATUS_PIN, HIGH);

    setup_i2s();
}

void loop() {
    size_t bytes_read = 0;
    // Read raw 32-bit audio samples from INMP441 via DMA
    esp_err_t result = i2s_read(
        I2S_PORT,
        (void*)raw_i2s_buffer,
        sizeof(raw_i2s_buffer),
        &bytes_read,
        portMAX_DELAY
    );

    if (result == ESP_OK && bytes_read > 0) {
        int samples_read = bytes_read / sizeof(int32_t);

        // Convert INMP441 24-bit MSB samples to standard 16-bit signed PCM
        // and apply gain multiplier
        for (int i = 0; i < samples_read; i++) {
            // INMP441 transmits 24-bit data in the upper bits of a 32-bit frame.
            // Shifting right by 14 or 15 scales it down cleanly to 16-bit int range.
            int32_t s = raw_i2s_buffer[i] >> 14;
            s = s * DIGITAL_GAIN;

            // Clamp / saturate to prevent integer clipping distortion
            if (s > 32767) s = 32767;
            if (s < -32768) s = -32768;

            pcm_16bit_buffer[i] = (int16_t)s;
        }

        uint16_t payload_bytes = samples_read * sizeof(int16_t);

        // Send framed audio packet over USB Serial
        Serial.write(SYNC_BYTES, 2);
        Serial.write((uint8_t)(payload_bytes >> 8));   // High byte
        Serial.write((uint8_t)(payload_bytes & 0xFF)); // Low byte
        Serial.write((const uint8_t*)pcm_16bit_buffer, payload_bytes);
    }
}

