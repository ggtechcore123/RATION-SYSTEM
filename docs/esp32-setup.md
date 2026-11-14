# ESP32 Biometric Hardware Setup Guide

## 1. Hardware Required
1. **ESP32 DevKit V1** (30-pin or 38-pin version)
2. **R307** Optical Fingerprint Module (UART TTL)
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

## 3. R307 Wiring
Use the ESP32's UART2 pins and the R307's default 57600 baud rate:

| R307 wire | ESP32 connection |
|---|---|
| Red (VCC) | 5V / VIN (steady 5V supply; do not use 3.3V) |
| Black (GND) | GND (common ground) |
| Yellow (TXD) | GPIO 16 (UART2 RX) |
| White (RXD) | GPIO 17 (UART2 TX) |

The blue touch-output and green touch-power wires are optional and are not used by the unified sketch. See [the full wiring guide](../esp32/circuit_diagram_and_wiring.md) for the other peripherals.

## 4. Flashing Sketches
- **Unified R307 POS terminal**: Open `esp32/smart_pds_esp32.ino` for keypad, enrollment, and fingerprint authentication.
- **Standalone enrollment kiosk**: Open `esp32/fingerprint_enrollment.ino`
- **Standalone keypad terminal**: Open `esp32/keypad_integration.ino`
- Update:
  ```cpp
  const char* ssid = "YourWiFiName";
  const char* password = "YourWiFiPassword";
  const char* serverUrl = "http://YOUR_COMPUTER_IP:5000/api/iot";
  ```
- Connect ESP32 via Micro-USB, select port, and click **Upload**.

---

## 5. Virtual Hardware Simulation Bridge
For testing on computers without connected physical microcontrollers, the web application includes a built-in **Interactive Biometric Terminal & Numeric Keypad Simulator** on both the Registration page and the Officer POS Terminal. It communicates with the same secure backend endpoints and allows testing the complete biometric workflow!
