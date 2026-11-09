# R307 Optical Fingerprint Sensor & ESP32 Hardware Wiring Guide

## 1. R307 Optical Fingerprint Sensor Specifications

| Parameter | Value |
|---|---|
| **Sensor Model** | **R307 Optical Fingerprint Module** |
| **Operating Voltage** | **DC 4.2V - 6.0V** (Recommended: 5V steady supply) |
| **Operating Current** | Peak: 140mA, Typical: 50mA |
| **Interface** | Standard UART TTL (Logic level: 3.3V / 5V) |
| **Default Baud Rate** | **57600 bps** (8 data bits, 1 stop bit, no parity) |
| **Template Capacity** | **1,000 Fingerprint Templates** (Flash ID #1 to #1000) |
| **Security Level** | 1 to 5 (Default: 3) |
| **Template Size** | 512 Bytes per fingerprint |
| **Window Dimensions** | 19mm × 21mm (Blue / Red LED backlight prism) |
| **Resolution** | 500 DPI |
| **False Acceptance Rate (FAR)** | < 0.001% |
| **False Rejection Rate (FRR)** | < 0.1% |

---

## 2. R307 6-Pin Wire Pinout Table

The R307 sensor comes with a 6-pin JST color-coded cable:

| Pin # | Wire Color | Signal Name | ESP32 Connection | Description & Voltage |
|:---:|:---:|:---:|:---:|---|
| **1** | **RED** | **VCC** | **ESP32 5V / VIN** | **Power Supply (5.0V)**. *Do NOT power R307 with 3.3V pin; sensor optical LED requires 4.5V-6V.* |
| **2** | **BLACK** | **GND** | **ESP32 GND** | Common Ground |
| **3** | **YELLOW** | **TXD** | **ESP32 GPIO 16 (RX2)** | Serial Data Output from sensor into ESP32 Hardware UART2 RX |
| **4** | **WHITE** | **RXD** | **ESP32 GPIO 17 (TX2)** | Serial Data Input into sensor from ESP32 Hardware UART2 TX |
| **5** | **BLUE** | **TOUCH OUT** | **ESP32 GPIO 34** *(Optional)* | Touch induction signal. Goes HIGH (3.3V) when finger is placed. |
| **6** | **GREEN** | **TOUCH VCC** | **ESP32 3.3V** *(Optional)* | Power for touch induction circuit. Leave unconnected if polling via software. |

> **IMPORTANT VOLTAGE NOTE:**
> Connect the **RED wire** to the **5V / VIN pin** of the ESP32 (powered via USB 5V). Powering the R307 from a 3.3V pin will cause communication or imaging failures.

---

## 3. Complete Circuit Wiring Diagram

```
           +---------------------------------------------+
           |                ESP32 DEVKIT V1              |
           |                                             |
           | 5V / VIN  ------------------------+ (5.0V)  |
           | GND       ------------+           |         |
           |                       |           |         |
           | GPIO 16 (RX2) <-------|---|-------+ Yellow (TXD) -+
           | GPIO 17 (TX2) --------|---|-------+ White  (RXD)  |  R307 SENSOR
           | GPIO 34 (IN)  <-------|---|-------+ Blue   (WAK)  |
           |                       |   +-------+ Red    (VCC)  |
           |                       +-----------+ Black  (GND) -+
           |                                             |
           | GPIO 21 (SDA) <-------------------> LCD SDA -+
           | GPIO 22 (SCL) --------------------> LCD SCL  |  16x2 I2C LCD
           | 5V / VIN      --------------------> LCD VCC  |  (Address 0x27)
           | GND           --------------------> LCD GND -+
           |                                             |
           | GPIO 13 (Row 1) <-> Keypad Pin 1            |
           | GPIO 12 (Row 2) <-> Keypad Pin 2            |
           | GPIO 14 (Row 3) <-> Keypad Pin 3            |  4x4 MATRIX
           | GPIO 27 (Row 4) <-> Keypad Pin 4            |  KEYPAD
           | GPIO 26 (Col 1) <-> Keypad Pin 5            |
           | GPIO 25 (Col 2) <-> Keypad Pin 6            |
           | GPIO 33 (Col 3) <-> Keypad Pin 7            |
           | GPIO 32 (Col 4) <-> Keypad Pin 8            |
           |                                             |
           | GPIO 2  (OUT) ----> Green LED (+) (Success) |
           | GPIO 4  (OUT) ----> Red LED (+)   (Failure) |
           | GPIO 5  (OUT) ----> Active Buzzer (+)       |
           | GND           <---> LEDs & Buzzer (-)       |
           +---------------------------------------------+
```

---

## 4. Arduino IDE Libraries Required for R307

Open Arduino IDE, go to **Tools > Manage Libraries...** and install:
1. **Adafruit Fingerprint Sensor Library** by Adafruit (Version 2.1.3 or higher)
2. **Keypad** by Mark Stanley, Alexander Brevig
3. **LiquidCrystal I2C** by Frank de Brabander
4. **ArduinoJson** by Benoit Blanchon (Version 6.x or 7.x)

---

## 5. Security & Biometric Template Protection

In compliance with UIDAI and National PDS biometric standards:
1. The **R307 sensor stores minutiae templates internally** in protected flash memory (Slots 1 to 1000).
2. Raw biometric images are **never transferred over the internet** or saved to Firebase/Blockchain.
3. Only **one-way encrypted cryptographic template references** (e.g. `FP-R307-SLOT1-1731148800`) are communicated to the backend API.
