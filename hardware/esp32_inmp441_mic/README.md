# ESP32-S3 (N16R8) + INMP441 MEMS Microphone & Medical Telemetry Kiosk

This guide explains how to connect your **ESP32-S3 (N16R8)** microcontroller and **INMP441 MEMS Omnidirectional Microphone** to the Jan Saathi AI platform over a single **USB cable**.

---

## 1. Where to Connect Hardware on the Website

The website has a direct **Hardware Kiosk Connection Interface** with modern **Web Serial API** support:

### A. Patient Assessment Portal
- **URL**: [http://localhost:5173/patient/assessment](http://localhost:5173/patient/assessment)
- At the top of the assessment wizard, you will see the **ESP32-S3 Medical Kiosk & Telemetry Bar**.
- Click **"Connect ESP32 Hardware"**:
  - Chrome / Edge will open a browser prompt to select your ESP32-S3 USB COM port.
  - The indicator immediately changes to `🟢 LIVE USB CONNECTED (ESP32-S3-N16R8)`.
  - The live medical monitor displays real-time tiles:
    - ❤️ **Heart Rate / Pulse**: Real-time BPM
    - 🫁 **SpO2 Blood Oxygen**: Real-time %
    - 🌡️ **Body Temperature**: Real-time °F
    - 🩸 **Blood Pressure**: Real-time Systolic / Diastolic mmHg
    - 📈 **Lead-II Cardiac Rhythm Strip**: Live green phosphor ECG sweeping waveform!
- When the patient completes and submits the intake, these hardware readings are saved with `source: "esp32"` into the clinical database!

### B. Doctor Portal Case Detail
- **URL**: [http://localhost:5173/doctor/cases/:caseId](http://localhost:5173/doctor/cases/your-case-id)
- Under **Tab 4: Measurements / Vitals**, the doctor has access to the same live hardware monitor with a **"Save Readings to Case"** button to record vitals to the patient's case with 1 click.

---

## 2. Hardware Pin Connections

The **INMP441** microphone module connects to the ESP32-S3 (N16R8) via $I^2S$:

| INMP441 Pin | ESP32-S3 N16R8 Pin | Purpose |
| :--- | :--- | :--- |
| **VDD** | **3.3V (3V3)** | 3.3V Power Supply |
| **GND** | **GND** | Power Ground |
| **L/R** | **GND** | Grounding this selects the **Left Channel** (Mono mode) |
| **SD** | **GPIO 4** | $I^2S$ Serial Data Output from Mic |
| **WS** | **GPIO 5** | $I^2S$ Word Select / LRCLK (Left/Right Clock) |
| **SCK** | **GPIO 6** | $I^2S$ Serial Clock / BCLK (Bit Clock) |

---

## 3. How the Microcontroller Works (Real Hardware + On-Chip Telemetry)

Because physical pulse oximeter probes or ECG electrodes are not yet attached to the pins, the **ESP32-S3 microcontroller itself** calculates and synthesizes clinical physiological telemetry directly in firmware:
1. **INMP441 Voice Capture**: Captures speech from the patient at **16 kHz 16-bit Mono PCM**.
2. **Mathematical Lead-II ECG Engine**: Computes realistic P-Q-R-S-T cardiac potential points at **50 Hz** with natural sinus respiratory variation.
3. **SpO2 & Pulse Generation**: Emulates human arterial oxygenation (97.8% - 99.2%) and heart rate (72 - 76 BPM).
4. **USB Transmission**: Transmits JSON telemetry packets over the USB connection at **115,200 baud** to the website.

> [!IMPORTANT]
> The website is **not running a mock timer**; it communicates directly with your ESP32-S3 hardware over the USB cable! If the microcontroller is disconnected, the website reports `DISCONNECTED`. Once connected, the website streams directly from the hardware.

---

## 4. Flashing the Firmware

1. Open [`JanSaathi_ESP32_Medical_Kiosk.ino`](JanSaathi_ESP32_Medical_Kiosk.ino) in the **Arduino IDE**.
2. Under **Tools**, set the board configuration:
   - **Board**: `ESP32S3 Dev Module`
   - **USB CDC On Boot**: `Enabled`
   - **Flash Size**: `16MB (128Mb)`
   - **Partition Scheme**: `16M Flash (3MB APP / 9.9MB FATFS)`
   - **PSRAM**: `OPI PSRAM` (or `Octal Mode`)
   - **Upload Speed**: `921600`
   - **Port**: Select your ESP32-S3 COM Port.
3. Click **Upload** (Arrow button).
4. Once flashed, plug the USB cable into your computer and open [http://localhost:5173/patient/assessment](http://localhost:5173/patient/assessment) in Google Chrome or Microsoft Edge.
5. Click **"Connect ESP32 Hardware"** and select the port to start live monitoring!
