# ESP32 Biometric Hardware Setup Guide

## 1. Hardware Required
1. **ESP32 DevKit V1** (30-pin or 38-pin version)
2. **Adafruit R307 / AS608 / FPM10A** Optical Fingerprint Module
3. **4x4 Membrane or Tactile Matrix Keypad**
4. **16x2 I2C Character LCD Module** (Address `0x27` or `0x3F`)
5. **Active Buzzer & 2x LEDs (Green & Red)**

---

## 2. Arduino IDE Configuration
1. Open **Arduino IDE**.
2. Go to **File > Preferences** and add to Additional Boards Manager URLs:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Go to **Tools > Board > Boards Manager**, search for `esp32` by Espressif Systems and click **Install**.
4. Install Libraries via Library Manager (`Ctrl+Shift+I`):
   - `Adafruit Fingerprint Sensor Library`
   - `Keypad` by Mark Stanley, Alexander Brevig
   - `LiquidCrystal I2C` by Frank de Brabander
   - `ArduinoJson` by Benoit Blanchon (version 6.x or 7.x)

---

## 3. Flashing Sketches
- **Enrollment Kiosk**: Open `esp32/fingerprint_enrollment.ino`
- **POS Distribution Terminal**: Open `esp32/keypad_integration.ino`
- Update:
  ```cpp
  const char* ssid = "YourWiFiName";
  const char* password = "YourWiFiPassword";
  const char* serverUrl = "http://YOUR_COMPUTER_IP:5000/api/iot";
  ```
- Connect ESP32 via Micro-USB, select port, and click **Upload**.

---

## 4. Virtual Hardware Simulation Bridge
For testing on computers without connected physical microcontrollers, the web application includes a built-in **Interactive Biometric Terminal & Numeric Keypad Simulator** on both the Registration page and the Officer POS Terminal. It communicates with the same secure backend endpoints and allows testing the complete biometric workflow!

