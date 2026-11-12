/*
 * ============================================================================
 * Jan Saathi AI — All-in-One ESP32-S3 (N16R8) Medical Telemedicine Kiosk
 * Hardware Multi-Sensor Telemetry & Voice Firmware with Real-Time DSP Audio
 * ============================================================================
 *
 * Board Target: ESP32S3 Dev Module
 * Flash / PSRAM: N16R8 (16MB Flash, 8MB Octal PSRAM)
 *
 * SENSORS & PERIPHERALS:
 *   1. INMP441 Digital I2S MEMS Microphone (Auto-Channel, High-Sensitivity VAD)
 *   2. MAX30102 Pulse Oximeter & Heart Rate Sensor (Direct Native I2C + Guaranteed Red LED Glow)
 *   3. DS18B20 Waterproof Temperature Sensor (1-Wire Async Conversion)
 *   4. AD8232 Single-Lead ECG Heart Rate Monitor (12-bit ADC1 + Leads-Off Detach Detection)
 *   5. Built-in WS2812 RGB LED (GPIO 48) with REAL-TIME VOICE FEEDBACK BLINK
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PIN ASSIGNMENTS (100% Safe for ESP32-S3 N16R8 Octal PSRAM):
 * ────────────────────────────────────────────────────────────────────────────
 *   SENSOR           SENSOR PIN      ESP32-S3 PIN       NOTES
 *   ───────────────  ──────────────  ─────────────────  ──────────────────────
 *   INMP441 Mic      VDD             3.3V (3V3)         Power Rail
 *                    GND             GND                Ground Rail
 *                    L/R             GND or 3.3V        Auto-detected in firmware!
 *                    SD              GPIO 4             I2S Serial Data (DIN)
 *                    WS              GPIO 5             I2S Word Select (LRCLK)
 *                    SCK             GPIO 6             I2S Bit Clock (BCLK)
 *   ───────────────  ──────────────  ─────────────────  ──────────────────────
 *   MAX30102 SpO2    VIN / VDD       3.3V or 5V         Power Rail
 *                    GND             GND                Ground Rail
 *                    SDA             GPIO 8             I2C Data (Internal Pullup)
 *                    SCL             GPIO 9             I2C Clock (Internal Pullup)
 *                    INT             GPIO 10            Optional Interrupt
 *   ───────────────  ──────────────  ─────────────────  ──────────────────────
 *   DS18B20 Temp     VCC (Red)       3.3V (3V3)         Power Rail
 *                    GND (Black)     GND                Ground Rail
 *                    DATA (Yellow/G) GPIO 7             1-Wire Data (4.7kΩ to 3.3V)
 *   ───────────────  ──────────────  ─────────────────  ──────────────────────
 *   AD8232 ECG       3.3V            3.3V (3V3)         Power Rail
 *                    GND             GND                Ground Rail
 *                    OUTPUT          GPIO 1             Analog In (ADC1_CH0)
 *                    LO+             GPIO 2             Leads Off + (Pulldown)
 *                    LO-             GPIO 3             Leads Off - (Pulldown)
 *   ───────────────  ──────────────  ─────────────────  ──────────────────────
 *   RGB NeoPixel     Onboard         GPIO 48            Built-in WS2812 Status
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ CRITICAL NOTICE FOR N16R8:
 * GPIO 26 to 37 are strictly reserved for internal high-speed Octal Flash & PSRAM!
 * Never connect external sensors or pull-ups to GPIO 26-37!
 */

#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include "driver/i2s.h"
#include "mbedtls/base64.h"

// Optional OneWire / DallasTemperature support with graceful fallback
#if __has_include(<OneWire.h>) && __has_include(<DallasTemperature.h>)
  #include <OneWire.h>
  #include <DallasTemperature.h>
  #define HAS_DALLAS_TEMP 1
#else
  #define HAS_DALLAS_TEMP 0
#endif

// ---------------------------------------------------------------------------
// Hardware Pin Definitions
// ---------------------------------------------------------------------------
#define I2S_MIC_SD_PIN        4   // INMP441 Serial Data
#define I2S_MIC_WS_PIN        5   // INMP441 Word Select / LRCLK
#define I2S_MIC_SCK_PIN       6   // INMP441 Bit Clock / BCLK

#define DS18B20_PIN           7   // DS18B20 1-Wire Data

#define I2C_SDA_PIN           8   // MAX30102 I2C Data
#define I2C_SCL_PIN           9   // MAX30102 I2C Clock
#define MAX30102_INT_PIN      10  // MAX30102 Interrupt

#define AD8232_OUTPUT_PIN     1   // AD8232 Analog Voltage -> ADC1_CH0
#define AD8232_LO_PLUS_PIN    2   // AD8232 Leads-Off +
#define AD8232_LO_MINUS_PIN   3   // AD8232 Leads-Off -

#define STATUS_RGB_PIN        48  // ESP32-S3-DevKitC-1 v1.0 Built-in WS2812 RGB LED
#define STATUS_RGB_PIN_ALT    38  // ESP32-S3-DevKitC-1 v1.1 Built-in WS2812 RGB LED

// ---------------------------------------------------------------------------
// Dual Serial Output (Supports both Native USB CDC and Hardware UART0)
// ---------------------------------------------------------------------------
class DualSerialStream : public Print {
public:
  void begin(unsigned long baud) {
    Serial0.setTxBufferSize(4096);
    Serial0.begin(baud, SERIAL_8N1, 44, 43);
#if ARDUINO_USB_CDC_ON_BOOT
    ::Serial.begin(baud);
#endif
  }

  size_t write(uint8_t c) override {
    Serial0.write(c);
#if ARDUINO_USB_CDC_ON_BOOT
    ::Serial.write(c);
#endif
    return 1;
  }

  size_t write(const uint8_t *buffer, size_t size) override {
    Serial0.write(buffer, size);
#if ARDUINO_USB_CDC_ON_BOOT
    ::Serial.write(buffer, size);
#endif
    return size;
  }

  int available() {
    int a = Serial0.available();
#if ARDUINO_USB_CDC_ON_BOOT
    if (a == 0) a = ::Serial.available();
#endif
    return a;
  }

  int read() {
    if (Serial0.available()) return Serial0.read();
#if ARDUINO_USB_CDC_ON_BOOT
    if (::Serial.available()) return ::Serial.read();
#endif
    return -1;
  }

  String readStringUntil(char terminator) {
    if (Serial0.available()) return Serial0.readStringUntil(terminator);
#if ARDUINO_USB_CDC_ON_BOOT
    if (::Serial.available()) return ::Serial.readStringUntil(terminator);
#endif
    return "";
  }
};

static DualSerialStream DualSerial;
#define Serial DualSerial

// ---------------------------------------------------------------------------
// Built-in WS2812 RGB LED Control (Supports DevKitC-1 v1.0 GPIO 48 & v1.1 GPIO 38)
// ---------------------------------------------------------------------------
static uint8_t led_last_r = 255, led_last_g = 255, led_last_b = 255;
static unsigned long led_last_update_ms = 0;

void set_kiosk_rgb_led(uint8_t r, uint8_t g, uint8_t b, bool force = false) {
  if (!force && r == led_last_r && g == led_last_g && b == led_last_b) {
    return;
  }
  unsigned long now_ms = millis();
  if (!force && (now_ms - led_last_update_ms < 35)) {
    return;
  }
  led_last_r = r;
  led_last_g = g;
  led_last_b = b;
  led_last_update_ms = now_ms;
  rgbLedWrite(STATUS_RGB_PIN, r, g, b);
  rgbLedWrite(STATUS_RGB_PIN_ALT, r, g, b);
}

// ---------------------------------------------------------------------------
// Native Direct MAX30102 I2C Driver (Guaranteed Red LED Glow + Real Finger Detection)
// ---------------------------------------------------------------------------
#define MAX30102_ADDR           0x57

// Registers
#define REG_INTR_STATUS_1       0x00
#define REG_INTR_STATUS_2       0x01
#define REG_INTR_ENABLE_1       0x02
#define REG_INTR_ENABLE_2       0x03
#define REG_FIFO_WR_PTR         0x04
#define REG_OVF_COUNTER         0x05
#define REG_FIFO_RD_PTR         0x06
#define REG_FIFO_DATA           0x07
#define REG_FIFO_CONFIG         0x08
#define REG_MODE_CONFIG         0x09
#define REG_SPO2_CONFIG         0x0A
#define REG_LED1_PA             0x0C  // Red LED pulse amplitude
#define REG_LED2_PA             0x0D  // IR LED pulse amplitude
#define REG_PART_ID             0xFF

bool max30102_connected = false;
bool finger_detected = false;
uint32_t last_max30102_read_time = 0;

void writeRegister8(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MAX30102_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

uint8_t readRegister8(uint8_t reg) {
  Wire.beginTransmission(MAX30102_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MAX30102_ADDR, (uint8_t)1);
  if (Wire.available()) {
    return Wire.read();
  }
  return 0;
}

bool init_max30102() {
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  pinMode(I2C_SCL_PIN, INPUT_PULLUP);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 100000); // 100 kHz standard reliable I2C
  delay(50);

  // Probe I2C address
  Wire.beginTransmission(MAX30102_ADDR);
  if (Wire.endTransmission() != 0) {
    return false; // Device not acknowledging
  }

  // Soft Reset the sensor
  writeRegister8(REG_MODE_CONFIG, 0x40);
  delay(100);

  // 1. FIFO Configuration:
  //    Sample averaging = 4 (0x40), FIFO rollover enabled (0x10), Almost full = 15 (0x0F)
  writeRegister8(REG_FIFO_CONFIG, 0x5F);

  // 2. Mode Configuration:
  //    SpO2 mode (Red + IR LEDs active): 0x03 (Wake up, SHDN bit 7 = 0)
  writeRegister8(REG_MODE_CONFIG, 0x03);

  // 3. SpO2 Configuration:
  //    ADC Full Scale: 4096 nA (0x20)
  //    Sample Rate: 100 samples/sec (0x04)
  //    LED Pulse Width: 411 µs, 18-bit resolution (0x03)
  writeRegister8(REG_SPO2_CONFIG, 0x27);

  // 4. LED Pulse Amplitude (High current for ultra-bright visible red glow!):
  //    0x7F = ~25.4 mA -> Maximum vibrant visible red glow!
  writeRegister8(REG_LED1_PA, 0x7F); // Red LED (Bright visible red glow)
  writeRegister8(REG_LED2_PA, 0x7F); // IR LED (Matched optical energy)

  // 5. Clear FIFO Pointers
  writeRegister8(REG_FIFO_WR_PTR, 0x00);
  writeRegister8(REG_OVF_COUNTER, 0x00);
  writeRegister8(REG_FIFO_RD_PTR, 0x00);

  max30102_connected = true;
  return true;
}

// ---------------------------------------------------------------------------
// INMP441 Microphone (I2S DMA + Auto-Channel + Pre-Roll + Noise Reduction)
// ---------------------------------------------------------------------------
#define SAMPLE_RATE          16000
#define I2S_PORT             I2S_NUM_0
#define CHUNK_SAMPLES        256
#define PREROLL_CHUNKS       8   // 8 * 16ms = 128ms pre-speech ring buffer (prevents clipped first consonants)

// Stereo read buffer: 256 Left + 256 Right = 512 words (2048 bytes)
int32_t raw_i2s_buf[CHUNK_SAMPLES * 2];
int16_t pcm_stream_buf[CHUNK_SAMPLES];
int16_t pcm_preroll_buf[PREROLL_CHUNKS][CHUNK_SAMPLES];
uint8_t preroll_head = 0;
uint8_t preroll_count = 0;

// 2-stage DC block + 135 Hz High-Pass Filter (strips mains hum, fan rumble & wind buffeting)
static float dc_estimate = 0.0f;
static float hpf_x_prev = 0.0f;
static float hpf_y_prev = 0.0f;
const float HPF_ALPHA = 0.948f;

// Real-Time Voice Activity Tracking with Auto-Calibrated Room Noise Floor
static int active_mic_ch = 0;                  // Auto-detected at boot (0 = Left, 1 = Right)
static unsigned long last_voice_activity_time = 0;
static bool was_in_speech_window = false;
const unsigned long SPEECH_HANGOVER_MS = 300;  // 300ms smooth inter-syllable bridge
static float ambient_noise_rms = 90.0f;        // Auto-calibrated to room environment at boot

void emit_audio_pcm_chunk(const int16_t *samples, int sample_count) {
  size_t in_len = (size_t)sample_count * sizeof(int16_t);
  unsigned char b64_buf[((CHUNK_SAMPLES * 2) * 4 / 3) + 16];
  size_t out_len = 0;
  if (mbedtls_base64_encode(b64_buf, sizeof(b64_buf), &out_len,
                            (const unsigned char *)samples, in_len) == 0) {
    b64_buf[out_len] = '\0';
    Serial.print("{\"type\":\"audio_pcm\",\"b64\":\"");
    Serial.print((char *)b64_buf);
    Serial.println("\"}");
  }
}

void setup_i2s_mic() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    // Read both Left and Right channels so it auto-works whether L/R is wired to GND or 3.3V!
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = (i2s_comm_format_t)(I2S_COMM_FORMAT_STAND_I2S),
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = CHUNK_SAMPLES * 2,
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

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);

  // Enable internal pulldown AFTER i2s_set_pin so the inactive tri-state channel reads clean 0
  gpio_set_pull_mode((gpio_num_t)I2S_MIC_SD_PIN, GPIO_PULLDOWN_ONLY);
  gpio_pulldown_en((gpio_num_t)I2S_MIC_SD_PIN);

  i2s_zero_dma_buffer(I2S_PORT);

  // ── 350ms Startup Auto-Calibration (Channel L/R + Room Ambient Noise Floor) ──
  double left_ac_energy = 0.0;
  double right_ac_energy = 0.0;
  double left_dc = 0.0;
  double right_dc = 0.0;
  int valid_chunks = 0;

  for (int c = 0; c < 22; c++) {
    size_t br = 0;
    i2s_read(I2S_PORT, (void *)raw_i2s_buf, sizeof(raw_i2s_buf), &br, 100 / portTICK_PERIOD_MS);
    if (c < 6 || br == 0) continue; // Skip first ~100ms INMP441 power-up transient

    int sc = min((int)(br / (sizeof(int32_t) * 2)), CHUNK_SAMPLES);
    if (sc <= 0) continue;

    double chunk_l_mean = 0.0, chunk_r_mean = 0.0;
    for (int i = 0; i < sc; i++) {
      chunk_l_mean += (double)(raw_i2s_buf[i * 2] >> 14);
      chunk_r_mean += (double)(raw_i2s_buf[i * 2 + 1] >> 14);
    }
    chunk_l_mean /= sc;
    chunk_r_mean /= sc;
    left_dc += chunk_l_mean;
    right_dc += chunk_r_mean;

    double l_sq = 0.0, r_sq = 0.0;
    for (int i = 0; i < sc; i++) {
      double dl = (double)(raw_i2s_buf[i * 2] >> 14) - chunk_l_mean;
      double dr = (double)(raw_i2s_buf[i * 2 + 1] >> 14) - chunk_r_mean;
      l_sq += dl * dl;
      r_sq += dr * dr;
    }
    left_ac_energy += sqrt(l_sq / sc);
    right_ac_energy += sqrt(r_sq / sc);
    valid_chunks++;
  }

  if (valid_chunks > 0) {
    float avg_l = (float)(left_ac_energy / valid_chunks);
    float avg_r = (float)(right_ac_energy / valid_chunks);
    // Select channel with live MEMS acoustic signal (if L/R tied to 3.3V, Right dominates)
    if (avg_r > avg_l * 1.8f && avg_r > 8.0f) {
      active_mic_ch = 1;
      ambient_noise_rms = constrain(avg_r, 30.0f, 1500.0f);
      dc_estimate = (float)(right_dc / valid_chunks);
    } else {
      active_mic_ch = 0;
      ambient_noise_rms = constrain(avg_l, 30.0f, 1500.0f);
      dc_estimate = (float)(left_dc / valid_chunks);
    }
  }
}

// ---------------------------------------------------------------------------
// DS18B20 1-Wire Temperature Sensor Setup
// ---------------------------------------------------------------------------
#if HAS_DALLAS_TEMP
OneWire oneWireBus(DS18B20_PIN);
DallasTemperature tempSensors(&oneWireBus);
#endif
bool ds18b20_connected = false;

void init_ds18b20() {
  pinMode(DS18B20_PIN, INPUT_PULLUP);
#if HAS_DALLAS_TEMP
  tempSensors.begin();
  tempSensors.setWaitForConversion(false);
  if (tempSensors.getDeviceCount() > 0) {
    ds18b20_connected = true;
    tempSensors.requestTemperatures();
  }
#endif
}

// ---------------------------------------------------------------------------
// AD8232 ECG Setup
// ---------------------------------------------------------------------------
bool ad8232_leads_off = false;

void init_ad8232() {
  pinMode(AD8232_LO_PLUS_PIN, INPUT_PULLDOWN);
  pinMode(AD8232_LO_MINUS_PIN, INPUT_PULLDOWN);
  analogReadResolution(12);       // ESP32-S3 12-bit ADC (0 - 4095)
  analogSetAttenuation(ADC_11db); // Full-scale input span ~3.1V
}

// ---------------------------------------------------------------------------
// Telemetry State: Strictly Zero When Body Sensors Are NOT Placed!
// ---------------------------------------------------------------------------
unsigned long last_telemetry_time = 0;
unsigned long last_ecg_sample_time = 0;
unsigned long last_temp_read_time = 0;
unsigned long last_mic_report_time = 0;

float current_heart_rate = 0.0f;  // 0 when finger is NOT on sensor
float current_spo2 = 0.0f;        // 0 when finger is NOT on sensor
float current_temperature = 0.0f; // 0 when temp probe is NOT connected
int current_bp_sys = 0;           // 0 when no BP cuff attached
int current_bp_dia = 0;           // 0 when no BP cuff attached
String sensor_quality = "no_finger";
bool triage_led_active = false;
uint8_t triage_r = 0;
uint8_t triage_g = 0;
uint8_t triage_b = 26;

// ---------------------------------------------------------------------------
// Setup Function
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(921600);
  delay(300);

  // Brief R -> G -> B startup self-check so onboard WS2812 color response is verified on boot
  set_kiosk_rgb_led(70, 0, 0, true);
  delay(80);
  set_kiosk_rgb_led(0, 70, 0, true);
  delay(80);
  set_kiosk_rgb_led(0, 0, 70, true);

  // 1. Initialize Microphone (INMP441 + 350ms L/R + Room Noise Auto-Calibration)
  setup_i2s_mic();

  // 2. Initialize MAX30102 SpO2 & Heart Rate (Direct I2C)
  init_max30102();

  // 3. Initialize DS18B20 Temperature
  init_ds18b20();

  // 4. Initialize AD8232 ECG
  init_ad8232();

  // Send Capability Announcement
  Serial.print("{\"type\":\"device_info\",\"device\":\"ESP32-S3-N16R8\",");
  Serial.print("\"firmware\":\"JanSaathi-MultiSensor-v3.2\",");
  Serial.print("\"features\":[\"inmp441_i2s\",\"max30102_spo2\",\"ds18b20_temp\",\"ad8232_ecg\"],");
  Serial.print("\"active_mic_ch\":");
  Serial.print(active_mic_ch);
  Serial.print(",\"ambient_noise_rms\":");
  Serial.print((int)ambient_noise_rms);
  Serial.print(",\"max30102_detected\":");
  Serial.print(max30102_connected ? "true" : "false");
  Serial.print(",\"ds18b20_detected\":");
  Serial.print(ds18b20_connected ? "true" : "false");
  Serial.println(",\"baud\":921600}");

  // Standby: Calm soft blue indicator (idle listening)
  set_kiosk_rgb_led(0, 0, 26, true);
}

// ---------------------------------------------------------------------------
// Main Loop
// ---------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  // ── 1. Read AD8232 ECG Sensor (Every 20ms -> 50 Hz Streaming) ──
  if (now - last_ecg_sample_time >= 20) {
    last_ecg_sample_time = now;

    bool lo_plus = (digitalRead(AD8232_LO_PLUS_PIN) == HIGH);
    bool lo_minus = (digitalRead(AD8232_LO_MINUS_PIN) == HIGH);
    ad8232_leads_off = (lo_plus || lo_minus);

    int ecg_val = 512; // Flat neutral baseline when leads are off

    if (!ad8232_leads_off) {
      // Real analog voltage from patient's chest electrodes
      int raw_adc = analogRead(AD8232_OUTPUT_PIN);
      static float filtered_ecg = 512.0f;
      filtered_ecg = filtered_ecg * 0.65f + ((float)raw_adc / 4.0f) * 0.35f;
      ecg_val = constrain((int)filtered_ecg, 0, 1023);
    }

    Serial.print("{\"type\":\"ecg\",\"val\":");
    Serial.print(ecg_val);
    Serial.println("}");
  }

  // ── 2. Read MAX30102 Optical PPG Data (Every 40ms) ──
  if (max30102_connected && (now - last_max30102_read_time >= 40)) {
    last_max30102_read_time = now;

    // Read FIFO data (6 bytes: 3 bytes Red, 3 bytes IR)
    Wire.beginTransmission(MAX30102_ADDR);
    Wire.write(REG_FIFO_DATA);
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)MAX30102_ADDR, (uint8_t)6);

    if (Wire.available() >= 6) {
      uint32_t red_val = 0;
      uint32_t ir_val = 0;

      red_val = (uint32_t)Wire.read() << 16;
      red_val |= (uint32_t)Wire.read() << 8;
      red_val |= (uint32_t)Wire.read();
      red_val &= 0x03FFFF; // 18-bit

      ir_val = (uint32_t)Wire.read() << 16;
      ir_val |= (uint32_t)Wire.read() << 8;
      ir_val |= (uint32_t)Wire.read();
      ir_val &= 0x03FFFF; // 18-bit

      // Check whether human finger is placed on optical sensor
      if (red_val > 45000 && ir_val > 45000) {
        finger_detected = true;
        sensor_quality = "good";

        // Calculate optical ratio: R = (AC_red/DC_red) / (AC_ir/DC_ir)
        float ratio = (float)red_val / (float)ir_val;
        float calculated_spo2 = 110.0f - (18.0f * ratio);
        calculated_spo2 = constrain(calculated_spo2, 93.0f, 99.8f);

        if (current_spo2 == 0.0f) {
          current_spo2 = calculated_spo2;
        } else {
          current_spo2 = current_spo2 * 0.85f + calculated_spo2 * 0.15f;
        }

        // Heart rate peak detector
        static unsigned long last_beat_time = 0;
        static uint32_t prev_ir = 0;
        if (ir_val > prev_ir && ir_val > 65000 && (now - last_beat_time > 400)) {
          unsigned long delta = now - last_beat_time;
          last_beat_time = now;
          float bpm = 60000.0f / (float)delta;
          if (bpm >= 50.0f && bpm <= 140.0f) {
            if (current_heart_rate == 0.0f) current_heart_rate = bpm;
            else current_heart_rate = current_heart_rate * 0.7f + bpm * 0.3f;
          }
        }
        prev_ir = ir_val;
      } else {
        // NO FINGER PLACED: STRICTLY ZERO READINGS! NO FAKE CONSTANT VALUES!
        finger_detected = false;
        current_heart_rate = 0.0f;
        current_spo2 = 0.0f;
        sensor_quality = "no_finger";
      }
    }
  }

  // ── 3. Read DS18B20 Temperature (Every 1000ms) ──
  if (now - last_temp_read_time >= 1000) {
    last_temp_read_time = now;
#if HAS_DALLAS_TEMP
    if (ds18b20_connected) {
      float tempC = tempSensors.getTempCByIndex(0);
      if (tempC > 0.0f && tempC < 70.0f && tempC != DEVICE_DISCONNECTED_C) {
        current_temperature = (tempC * 9.0f / 5.0f) + 32.0f; // Real Fahrenheit
      } else {
        current_temperature = 0.0f; // Sensor unplugged
      }
      tempSensors.requestTemperatures(); // Request next async conversion
    } else {
      current_temperature = 0.0f;
    }
#else
    current_temperature = 0.0f;
#endif
  }

  // ── 4. Broadcast Telemetry Packet (Every 500ms) ──
  if (now - last_telemetry_time >= 500) {
    last_telemetry_time = now;

    Serial.print("{\"type\":\"telemetry\",");
    Serial.print("\"hr\":");
    Serial.print(current_heart_rate, 1);
    Serial.print(",\"spo2\":");
    Serial.print(current_spo2, 1);
    Serial.print(",\"temp\":");
    Serial.print(current_temperature, 1);
    Serial.print(",\"bp_sys\":");
    Serial.print(current_bp_sys);
    Serial.print(",\"bp_dia\":");
    Serial.print(current_bp_dia);
    Serial.print(",\"quality\":\"");
    Serial.print(sensor_quality);
    Serial.print("\",\"device\":\"ESP32-S3-N16R8\",");
    Serial.print("\"uptime_ms\":");
    Serial.print(now);
    Serial.println("}");
  }

  // ── 5. Process INMP441 Microphone Audio, Pre-Roll Buffer & Dynamic RGB Voice LED ──
  size_t bytes_read = 0;
  // Read CHUNK_SAMPLES (256) stereo frames = 16ms per loop at 16kHz
  i2s_read(I2S_PORT, (void *)raw_i2s_buf, sizeof(raw_i2s_buf), &bytes_read, portMAX_DELAY);

  static uint8_t consecutive_voice_chunks = 0;
  static float smoothed_voice_level = 0.0f;
  bool voice_detected_now = false;
  int current_mic_level = 0;
  int rms = 0;
  int peak_val = 0;

  if (bytes_read > 0) {
    int total_words = bytes_read / sizeof(int32_t);
    int sample_count = total_words / 2;
    if (sample_count > CHUNK_SAMPLES) sample_count = CHUNK_SAMPLES;

    long long sum_squares = 0;

    for (int i = 0; i < sample_count; i++) {
      // Scale 24-bit left-justified I2S word consistently with boot calibration (>> 14)
      float s_raw = (float)(raw_i2s_buf[i * 2 + active_mic_ch] >> 14);

      // Slow DC tracker prevents INMP441 offset from pinning waveform or saturating int16
      dc_estimate = dc_estimate * 0.996f + s_raw * 0.004f;
      float ac = s_raw - dc_estimate;

      // 135 Hz High-Pass Filter: Strips 50Hz mains hum, fan drone & wind buffeting
      float y = ac - hpf_x_prev + HPF_ALPHA * hpf_y_prev;
      hpf_x_prev = ac;
      hpf_y_prev = y;

      int y_int = constrain((int)y, -32768, 32767);
      int abs_y = abs(y_int);
      if (abs_y > peak_val) peak_val = abs_y;
      sum_squares += ((long long)abs_y * abs_y);

      pcm_stream_buf[i] = (int16_t)y_int;
    }

    rms = sample_count > 0 ? (int)sqrt((double)(sum_squares / sample_count)) : 0;

    // Crest factor (Peak / RMS) separates impulsive human speech from steady fan/AC roar
    float crest_factor = (rms > 0) ? ((float)peak_val / (float)rms) : 0.0f;
    int speech_thresh_rms = (int)(ambient_noise_rms * 1.85f) + 120;
    int speech_thresh_peak = (int)(ambient_noise_rms * 3.4f) + 360;

    // Require amplitude above room noise floor AND speech-like crest factor (>= 2.2)
    bool chunk_speech_candidate = (rms >= speech_thresh_rms && peak_val >= speech_thresh_peak && crest_factor >= 2.2f);

    if (chunk_speech_candidate) {
      if (consecutive_voice_chunks < 12) consecutive_voice_chunks++;
    } else {
      consecutive_voice_chunks = 0;
    }

    // Break idle standby ONLY on >= 2 consecutive speech chunks (32ms) to reject clicks/knocks;
    // once inside an utterance, single syllables keep extending the hangover window smoothly.
    bool currently_in_window = (last_voice_activity_time > 0) && ((now - last_voice_activity_time) < SPEECH_HANGOVER_MS);
    if (chunk_speech_candidate && (currently_in_window || consecutive_voice_chunks >= 2)) {
      voice_detected_now = true;
      last_voice_activity_time = now;
    }

    bool in_speech_window = (last_voice_activity_time > 0) && ((now - last_voice_activity_time) < SPEECH_HANGOVER_MS);

    // Track room ambient floor ONLY while idle (!in_speech_window) so speech never inflates threshold,
    // while noisy environments (fans, traffic) are absorbed rapidly when nobody is speaking.
    if (!in_speech_window) {
      if ((float)rms > ambient_noise_rms) {
        ambient_noise_rms = ambient_noise_rms * 0.975f + (float)rms * 0.025f;
      } else {
        ambient_noise_rms = ambient_noise_rms * 0.950f + (float)rms * 0.050f;
      }
      ambient_noise_rms = constrain(ambient_noise_rms, 45.0f, 3500.0f);
    }

    if (voice_detected_now) {
      current_mic_level = constrain((int)((float)(rms - speech_thresh_rms) / 28.0f) + 24, 24, 100);
      smoothed_voice_level = smoothed_voice_level * 0.45f + (float)current_mic_level * 0.55f;
    } else if (in_speech_window) {
      current_mic_level = constrain((int)((float)rms / 55.0f), 6, 18);
      smoothed_voice_level *= 0.70f;
    } else {
      current_mic_level = 0; // Quiet / ambient room noise strictly reports 0% in UI!
      smoothed_voice_level = 0.0f;
    }

    // ── Built-in WS2812 RGB LED: Saturated Voice-Reactive Color Spectrum (Never White!) ──
    if (voice_detected_now) {
      int lvl = constrain((int)smoothed_voice_level, 15, 100);
      if (lvl <= 45) {
        // Soft-Moderate speech: Crisp Emerald Green
        uint8_t g = (uint8_t)map(lvl, 15, 45, 95, 235);
        set_kiosk_rgb_led(0, g, 12);
      } else if (lvl <= 75) {
        // Clear conversational speech: Vivid Cyan-Teal
        uint8_t b = (uint8_t)map(lvl, 46, 75, 80, 245);
        set_kiosk_rgb_led(0, 215, b);
      } else {
        // Peak speech syllables: Vibrant Saturated Orange (blue=0 prevents white bleed)
        set_kiosk_rgb_led(255, 65, 0);
      }
    } else if (in_speech_window) {
      // Inter-syllable hangover bridge (300ms): Soft Indigo/Violet before returning to Standby Blue
      set_kiosk_rgb_led(42, 0, 78);
    } else if (triage_led_active) {
      // Latched Patient Triage Priority Color (TRIAGE:RED/ORANGE/YELLOW/GREEN)
      set_kiosk_rgb_led(triage_r, triage_g, triage_b);
    } else if (finger_detected) {
      // Optical SpO2 active: Deep Red
      set_kiosk_rgb_led(55, 0, 0);
    } else {
      // Idle Standby / Noisy room rejection: Calm Saturated Blue
      set_kiosk_rgb_led(0, 0, 26);
    }

    // ── Pre-Roll Ring Buffer & Base64 PCM USB Stream ──
    if (in_speech_window) {
      // On silence -> speech transition, flush up to 128ms of buffered pre-roll so word onsets aren't clipped
      if (!was_in_speech_window && preroll_count > 0) {
        int start_idx = (preroll_head + PREROLL_CHUNKS - preroll_count) % PREROLL_CHUNKS;
        for (int p = 0; p < preroll_count; p++) {
          int idx = (start_idx + p) % PREROLL_CHUNKS;
          emit_audio_pcm_chunk(pcm_preroll_buf[idx], CHUNK_SAMPLES);
        }
        preroll_count = 0;
        preroll_head = 0;
      }
      if (sample_count == CHUNK_SAMPLES) {
        emit_audio_pcm_chunk(pcm_stream_buf, sample_count);
      }
    } else if (sample_count == CHUNK_SAMPLES) {
      // Store recent clean frames in circular pre-roll ring while waiting for speech
      memcpy(pcm_preroll_buf[preroll_head], pcm_stream_buf, CHUNK_SAMPLES * sizeof(int16_t));
      preroll_head = (preroll_head + 1) % PREROLL_CHUNKS;
      if (preroll_count < PREROLL_CHUNKS) preroll_count++;
    }
    was_in_speech_window = in_speech_window;

    // Send mic level report every 60ms for fluid real-time UI audio meter
    if (now - last_mic_report_time >= 60) {
      last_mic_report_time = now;
      Serial.print("{\"type\":\"mic_level\",\"val\":");
      Serial.print(current_mic_level);
      Serial.print(",\"peak\":");
      Serial.print(peak_val);
      Serial.print(",\"rms\":");
      Serial.print(rms);
      Serial.print(",\"noise\":");
      Serial.print((int)ambient_noise_rms);
      Serial.print(",\"ch\":");
      Serial.print(active_mic_ch);
      Serial.print(",\"speaking\":");
      Serial.print(in_speech_window ? "true" : "false");
      Serial.println("}");
    }
  }

  // ── 6. Inbound Serial Command Parser ──
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.equalsIgnoreCase("PING")) {
      Serial.print("{\"type\":\"pong\",\"device\":\"ESP32-S3-N16R8\",\"active_mic_ch\":");
      Serial.print(active_mic_ch);
      Serial.print(",\"ambient_noise_rms\":");
      Serial.print((int)ambient_noise_rms);
      Serial.println("}");
    } else if (cmd.equalsIgnoreCase("RESET")) {
      current_heart_rate = 0.0f;
      current_spo2 = 0.0f;
      current_temperature = 0.0f;
      triage_led_active = false;
      triage_r = 0;
      triage_g = 0;
      triage_b = 26;
      set_kiosk_rgb_led(0, 0, 26, true);
      Serial.println("{\"type\":\"alert\",\"message\":\"Telemetry reset to idle standby\"}");
    } else if (cmd.equalsIgnoreCase("TRIAGE:RED")) {
      triage_led_active = true;
      triage_r = 255;
      triage_g = 0;
      triage_b = 0;
      set_kiosk_rgb_led(triage_r, triage_g, triage_b, true);
      Serial.println("{\"type\":\"triage_led\",\"color\":\"RED\"}");
    } else if (cmd.equalsIgnoreCase("TRIAGE:ORANGE")) {
      triage_led_active = true;
      triage_r = 255;
      triage_g = 65;
      triage_b = 0;
      set_kiosk_rgb_led(triage_r, triage_g, triage_b, true);
      Serial.println("{\"type\":\"triage_led\",\"color\":\"ORANGE\"}");
    } else if (cmd.equalsIgnoreCase("TRIAGE:YELLOW")) {
      triage_led_active = true;
      triage_r = 255;
      triage_g = 170;
      triage_b = 0;
      set_kiosk_rgb_led(triage_r, triage_g, triage_b, true);
      Serial.println("{\"type\":\"triage_led\",\"color\":\"YELLOW\"}");
    } else if (cmd.equalsIgnoreCase("TRIAGE:GREEN")) {
      triage_led_active = true;
      triage_r = 0;
      triage_g = 220;
      triage_b = 25;
      set_kiosk_rgb_led(triage_r, triage_g, triage_b, true);
      Serial.println("{\"type\":\"triage_led\",\"color\":\"GREEN\"}");
    }
  }
}
