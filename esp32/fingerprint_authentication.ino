/*
 * =========================================================================================
 * Smart Indian Public Distribution System (PDS)
 * ESP32 Biometric Authentication Module - Specifically for R307 Optical Sensor
 * =========================================================================================
 * 
 * Hardware:
 * - ESP32 NodeMCU-32S
 * - R307 Optical Fingerprint Sensor (57600 baud, 5V power, 1000 template capacity)
 * - 16x2 I2C LCD (0x27)
 * - Status LEDs (Green=GPIO 2, Red=GPIO 4) & Buzzer (GPIO 5)
 * 
 * R307 Pin Connections:
 *   Pin 1 (Red)    : VCC -> ESP32 5V / VIN (Requires steady 5V DC)
 *   Pin 2 (Black)  : GND -> ESP32 GND
 *   Pin 3 (Yellow) : TXD -> ESP32 GPIO 16 (Serial2 RX)
 *   Pin 4 (White)  : RXD -> ESP32 GPIO 17 (Serial2 TX)
 *   Pin 5 (Blue)   : WAK / Touch Out -> ESP32 GPIO 34 (Optional)
 * =========================================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_Fingerprint.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Smart PDS Backend Verification API Endpoint
const char* verifyApiUrl = "http://192.168.1.100:5000/api/iot/verify";
const char* deviceToken = "DEV-OFF001-ESP32-SECURE"; // Office OFF001 POS Terminal
const char* assignedOfficeId = "OFF001";

#define R307_RX_PIN 16 // To Yellow Wire
#define R307_TX_PIN 17 // To White Wire

const int LED_GREEN = 2;
const int LED_RED = 4;
const int BUZZER = 5;

HardwareSerial r307Serial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&r307Serial);
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Serial.begin(115200);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("R307 PDS POS");
  lcd.setCursor(0, 1);
  lcd.print("Office: " + String(assignedOfficeId));

  WiFi.begin(ssid, password);
  int count = 0;
  while (WiFi.status() != WL_CONNECTED && count < 15) {
    delay(500);
    Serial.print(".");
    count++;
  }

  // Initialize R307 at 57600 baud
  r307Serial.begin(57600, SERIAL_8N1, R307_RX_PIN, R307_TX_PIN);
  delay(500);

  finger.begin(57600);
  if (finger.verifyPassword()) {
    Serial.println("\n✅ R307 Optical Sensor Initialized successfully.");
    finger.getParameters();
    Serial.print("  - R307 Capacity: "); Serial.print(finger.capacity); Serial.println(" templates");
  } else {
    Serial.println("\n❌ R307 Optical Sensor not responding. Check 5V power supply.");
    digitalWrite(LED_RED, HIGH);
  }

  delay(1500);
  resetDisplay();
}

void loop() {
  // Check for citizen finger placed on R307 prism
  int matchedSlot = scanR307Fingerprint();
  if (matchedSlot > 0) {
    handleR307CitizenVerification(matchedSlot);
  }
  delay(100);
}

void resetDisplay() {
  lcd.clear();
  lcd.print("SCAN FINGERPRINT");
  lcd.setCursor(0, 1);
  lcd.print("R307 SENSOR READY");
}

int scanR307Fingerprint() {
  // Step 1: Capture optical image from R307
  uint8_t p = finger.getImage();
  if (p != FINGERPRINT_OK) return -1;

  // Step 2: Extract minutiae to CharBuffer 1
  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return -1;

  // Step 3: Fast 1:N hardware search across R307 flash database
  p = finger.fingerFastSearch();
  if (p != FINGERPRINT_OK) {
    showR307AuthFailed("No Match Found");
    return -1;
  }

  // Fingerprint matched!
  Serial.print("[R307] Matched Template Slot ID #"); Serial.println(finger.fingerID);
  Serial.print("[R307] Matching Confidence Score: "); Serial.println(finger.confidence);
  return finger.fingerID;
}

void handleR307CitizenVerification(int slotId) {
  lcd.clear();
  lcd.print("R307 MATCH #" + String(slotId));
  lcd.setCursor(0, 1);
  lcd.print("Querying PDS...");

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(verifyApiUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", deviceToken);

    // Map slot or pass ID
    StaticJsonDocument<256> doc;
    doc["customerIdOrRationCard"] = "CUST-TN-2025-001"; // Or entered via keypad
    doc["templateRef"] = "FP-REF-GOWTHAM01";
    doc["officeId"] = assignedOfficeId;

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);
    if (httpCode == 200) {
      String response = http.getString();
      StaticJsonDocument<512> res;
      deserializeJson(res, response);

      const char* name = res["customer"]["fullName"];
      const char* cat = res["customer"]["category"];

      lcd.clear();
      lcd.print("CUSTOMER VERIFIED");
      lcd.setCursor(0, 1);
      lcd.print(String(name).substring(0, 10) + " [" + String(cat) + "]");

      digitalWrite(LED_GREEN, HIGH);
      beep(100); delay(50); beep(100);
      delay(3000);
      digitalWrite(LED_GREEN, LOW);
    } else {
      showR307AuthFailed("Backend Rejected");
    }
    http.end();
  } else {
    // Local verification mode
    lcd.clear();
    lcd.print("VERIFIED (LOCAL)");
    lcd.setCursor(0, 1);
    lcd.print("Slot #" + String(slotId) + " Confirmed");

    digitalWrite(LED_GREEN, HIGH);
    beep(150);
    delay(2500);
    digitalWrite(LED_GREEN, LOW);
  }

  resetDisplay();
}

void showR307AuthFailed(String reason) {
  lcd.clear();
  lcd.print("AUTH FAILED!");
  lcd.setCursor(0, 1);
  lcd.print(reason);

  digitalWrite(LED_RED, HIGH);
  beep(500);
  delay(2000);
  digitalWrite(LED_RED, LOW);

  resetDisplay();
}

void beep(int ms) {
  digitalWrite(BUZZER, HIGH);
  delay(ms);
  digitalWrite(BUZZER, LOW);
}
