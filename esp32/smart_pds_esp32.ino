/*
 * =========================================================================================
 * Smart Indian Public Distribution System (PDS)
 * UNIFIED SINGLE-FILE ESP32 FIRMWARE
 * =========================================================================================
 * Combines:
 *   1. R307 Optical Fingerprint Enrollment (2-step capture & flash storage)
 *   2. R307 Optical Fingerprint Authentication (Fast 1:N search)
 *   3. 4x4 Matrix Keypad Input (Beneficiary ID entry & mode control)
 *   4. 16x2 I2C LCD Status Display + Green/Red LEDs + Active Buzzer
 *   5. Dual Connectivity:
 *      - Direct USB Cable (Web Serial API @ 115200 baud - works with GitHub Pages & Local)
 *      - WiFi Network IP HTTP Server (Port 80 with CORS: /status, /poll, /scan, /enroll)
 *
 * Required Arduino Libraries (Install via Library Manager):
 *   - Adafruit Fingerprint Sensor Library (by Adafruit)
 *   - Keypad (by Mark Stanley, Alexander Brevig)
 *   - LiquidCrystal I2C (by Frank de Brabander)
 *   - ArduinoJson (by Benoit Blanchon, v6 or v7)
 *
 * Pin Connections (ESP32 DevKit V1):
 *   - R307 VCC (Red)     -> 5V / VIN (Must be 5V, NOT 3.3V)
 *   - R307 GND (Black)   -> GND
 *   - R307 TXD (Yellow)  -> GPIO 16 (Serial2 RX)
 *   - R307 RXD (White)   -> GPIO 17 (Serial2 TX)
 *   - Keypad Rows        -> GPIO 13, 12, 14, 27
 *   - Keypad Cols        -> GPIO 26, 25, 33, 32
 *   - I2C LCD (0x27)     -> SDA: GPIO 21, SCL: GPIO 22, VCC: 5V, GND: GND
 *   - Green LED          -> GPIO 2
 *   - Red LED            -> GPIO 4
 *   - Active Buzzer      -> GPIO 5
 * =========================================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <Keypad.h>
#include <Adafruit_Fingerprint.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ==================== USER CONFIGURATION ====================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* OFFICE_ID     = "OFF001";
const char* DEVICE_TOKEN  = "DEV-OFF001-ESP32-SECURE";
// Optional local Node.js backend URL (leave as-is if using USB Web Serial / GitHub Pages)
const char* BACKEND_URL   = "http://192.168.1.100:5000/api/iot";
// ============================================================

// Hardware Pins
#define R307_RX_PIN 16
#define R307_TX_PIN 17
const int LED_GREEN = 2;
const int LED_RED   = 4;
const int BUZZER    = 5;

// 4x4 Matrix Keypad Setup
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {13, 12, 14, 27};
byte colPins[COLS] = {26, 25, 33, 32};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// R307 Optical Sensor & LCD & HTTP Server
HardwareSerial r307Serial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&r307Serial);
LiquidCrystal_I2C lcd(0x27, 16, 2);
WebServer ipServer(80);

// State Management
enum DeviceMode {
  MODE_IDLE_AUTH,      // Default: listen for keypad ID & R307 authentication
  MODE_SCANNING_AUTH,  // Waiting for finger on R307 to authenticate
  MODE_ENROLLING       // Enrolling new finger into R307 flash slot
};
DeviceMode currentMode = MODE_IDLE_AUTH;

String keypadBuffer = "";
bool sensorReady = false;

// Event queue for WiFi IP /poll endpoint
String pendingEventType = "NONE";
String pendingEventKey  = "";
int    pendingSlotId    = -1;
String pendingTemplateRef = "";

// ==================== HELPER FUNCTIONS ====================

void beep(int durationMs, int count = 1) {
  for (int i = 0; i < count; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(durationMs);
    digitalWrite(BUZZER, LOW);
    if (i < count - 1) delay(80);
  }
}

void showLCD(const String& line1, const String& line2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  if (line2.length() > 0) {
    lcd.setCursor(0, 1);
    lcd.print(line2.substring(0, 16));
  }
}

void signalSuccess(const String& l1, const String& l2) {
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_RED, LOW);
  showLCD(l1, l2);
  beep(150, 1);
  delay(1500);
  digitalWrite(LED_GREEN, LOW);
}

void signalError(const String& l1, const String& l2) {
  digitalWrite(LED_RED, HIGH);
  digitalWrite(LED_GREEN, LOW);
  showLCD(l1, l2);
  beep(100, 3);
  delay(1500);
  digitalWrite(LED_RED, LOW);
}

void queueEvent(const String& type, const String& key = "", int slotId = -1, const String& tplRef = "") {
  pendingEventType = type;
  pendingEventKey  = key;
  pendingSlotId    = slotId;
  pendingTemplateRef = tplRef;
}

int findNextFreeSlot() {
  for (int id = 1; id <= 1000; id++) {
    if (finger.loadModel(id) != FINGERPRINT_OK) {
      return id;
    }
  }
  return 1;
}

bool initR307Sensor() {
  // Try standard pins: RX=16 (Yellow TXD), TX=17 (White RXD) at 57600 baud
  r307Serial.begin(57600, SERIAL_8N1, R307_RX_PIN, R307_TX_PIN);
  delay(600);
  finger.begin(57600);
  for (int attempt = 0; attempt < 3; attempt++) {
    if (finger.verifyPassword()) {
      sensorReady = true;
      return true;
    }
    delay(250);
  }

  // Fallback: Try swapped TX/RX pins (RX=17, TX=16) in case Yellow/White wires are reversed
  r307Serial.end();
  delay(100);
  r307Serial.begin(57600, SERIAL_8N1, R307_TX_PIN, R307_RX_PIN);
  delay(500);
  finger.begin(57600);
  if (finger.verifyPassword()) {
    sensorReady = true;
    Serial.println("R307_INFO:Detected with swapped RX/TX (17/16)");
    return true;
  }

  // Restore default pins
  r307Serial.end();
  r307Serial.begin(57600, SERIAL_8N1, R307_RX_PIN, R307_TX_PIN);
  sensorReady = false;
  return false;
}

// ==================== R307 AUTHENTICATION ====================

// Performs one non-blocking or short-check scan on R307.
// Returns matched Slot ID (>0) or -1 if no finger / no match.
int scanR307Once(bool showNoMatchError = true) {
  if (!sensorReady) return -1;

  uint8_t p = finger.getImage();
  if (p != FINGERPRINT_OK) return -1;

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return -1;

  p = finger.fingerFastSearch();
  if (p != FINGERPRINT_OK) {
    if (showNoMatchError) {
      Serial.println("R307_NO_MATCH");
      signalError("AUTH FAILED", "No Finger Match");
    }
    return -1;
  }

  int slotId = finger.fingerID;
  String templateRef = "FP-R307-SLOT" + String(slotId);

  // Send exact protocol expected by frontend/js/esp32-connection.js
  Serial.println("R307_MATCH:" + String(slotId) + ":" + templateRef);
  queueEvent("MATCH", "", slotId, templateRef);

  signalSuccess("VERIFIED #" + String(slotId), "Conf: " + String(finger.confidence));
  return slotId;
}

// Blocking scan used when Web Dashboard sends CMD:SCAN or POST /scan
int waitAndScanR307(unsigned long timeoutMs = 10000) {
  if (!sensorReady && !initR307Sensor()) {
    Serial.println("R307_NO_MATCH");
    signalError("R307 NOT FOUND", "Check 5V & Wires");
    return -1;
  }
  showLCD("PLACE FINGER", "On R307 Sensor..");
  unsigned long start = millis();

  while (millis() - start < timeoutMs) {
    if (WiFi.status() == WL_CONNECTED) ipServer.handleClient();

    uint8_t p = finger.getImage();
    if (p == FINGERPRINT_OK) {
      p = finger.image2Tz();
      if (p != FINGERPRINT_OK) {
        signalError("IMAGE ERROR", "Try Again");
        return -1;
      }
      p = finger.fingerFastSearch();
      if (p == FINGERPRINT_OK) {
        int slotId = finger.fingerID;
        String templateRef = "FP-R307-SLOT" + String(slotId);
        Serial.println("R307_MATCH:" + String(slotId) + ":" + templateRef);
        queueEvent("MATCH", "", slotId, templateRef);
        signalSuccess("MATCH SLOT #" + String(slotId), "Access Granted");
        return slotId;
      } else {
        Serial.println("R307_NO_MATCH");
        signalError("NO MATCH FOUND", "Unregistered");
        return -1;
      }
    }
    delay(80);
  }

  Serial.println("R307_NO_MATCH");
  signalError("SCAN TIMEOUT", "No Finger Placed");
  return -1;
}

// ==================== R307 ENROLLMENT ====================

bool enrollR307Slot(int slotId, const String& customerId = "", const String& memberId = "head") {
  if (!sensorReady && !initR307Sensor()) {
    Serial.println("ENROLL_ERR:R307 not detected on GPIO16/17 (Check 5V VCC & Yellow/White wires)");
    signalError("R307 NOT READY", "Check 5V & UART");
    return false;
  }
  if (slotId <= 0) slotId = findNextFreeSlot();

  currentMode = MODE_ENROLLING;
  Serial.println("ENROLL_START:" + String(slotId));
  showLCD("ENROLL SLOT #" + String(slotId), "Place Finger...");

  // Step 1: Wait for first finger placement
  unsigned long start = millis();
  int p = -1;
  while (p != FINGERPRINT_OK) {
    if (millis() - start > 15000) {
      Serial.println("ENROLL_ERR:Timeout waiting for 1st scan");
      signalError("ENROLL TIMEOUT", "Try Again");
      currentMode = MODE_IDLE_AUTH;
      return false;
    }
    p = finger.getImage();
    delay(50);
  }

  if (finger.image2Tz(1) != FINGERPRINT_OK) {
    Serial.println("ENROLL_ERR:Image 1 conversion failed");
    signalError("SCAN 1 ERROR", "Clean Sensor");
    currentMode = MODE_IDLE_AUTH;
    return false;
  }

  beep(80, 1);
  showLCD("REMOVE FINGER", "Wait...");
  delay(1500);
  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    delay(50);
  }

  // Step 2: Wait for second finger placement
  showLCD("PLACE SAME", "FINGER AGAIN...");
  start = millis();
  p = -1;
  while (p != FINGERPRINT_OK) {
    if (millis() - start > 15000) {
      Serial.println("ENROLL_ERR:Timeout waiting for 2nd scan");
      signalError("ENROLL TIMEOUT", "Try Again");
      currentMode = MODE_IDLE_AUTH;
      return false;
    }
    p = finger.getImage();
    delay(50);
  }

  if (finger.image2Tz(2) != FINGERPRINT_OK) {
    Serial.println("ENROLL_ERR:Image 2 conversion failed");
    signalError("SCAN 2 ERROR", "Try Again");
    currentMode = MODE_IDLE_AUTH;
    return false;
  }

  // Step 3: Create and store template in R307 Flash
  if (finger.createModel() != FINGERPRINT_OK) {
    Serial.println("ENROLL_ERR:Fingerprints did not match");
    signalError("MISMATCH ERROR", "Use Same Finger");
    currentMode = MODE_IDLE_AUTH;
    return false;
  }

  if (finger.storeModel(slotId) != FINGERPRINT_OK) {
    Serial.println("ENROLL_ERR:Flash store failed");
    signalError("STORAGE ERROR", "R307 Flash Full");
    currentMode = MODE_IDLE_AUTH;
    return false;
  }

  String templateRef = "FP-R307-SLOT" + String(slotId);
  Serial.println("ENROLL_OK:" + String(slotId) + ":" + templateRef);
  signalSuccess("ENROLLED #" + String(slotId), templateRef);

  // Optional: notify backend if WiFi is connected and customerId provided
  if (WiFi.status() == WL_CONNECTED && customerId.length() > 0) {
    HTTPClient http;
    http.begin(String(BACKEND_URL) + "/enroll/complete");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", DEVICE_TOKEN);
    StaticJsonDocument<256> doc;
    doc["customerId"] = customerId;
    doc["memberId"] = memberId;
    doc["slotId"] = slotId;
    doc["templateRef"] = templateRef;
    String payload;
    serializeJson(doc, payload);
    http.POST(payload);
    http.end();
  }

  currentMode = MODE_IDLE_AUTH;
  showIdleLCD();
  return true;
}

void showIdleLCD() {
  if (keypadBuffer.length() > 0) {
    showLCD("ID: " + keypadBuffer, "#:OK  *:CLR");
  } else {
    showLCD("SMART PDS R307", "Scan or Enter ID");
  }
}

// ==================== USB SERIAL COMMAND HANDLER ====================

void handleUSBCommand(String cmd) {
  if (cmd.length() == 0) return;

  if (cmd == "CMD:SCAN") {
    waitAndScanR307(10000);
    showIdleLCD();
  }
  else if (cmd == "CMD:STATUS") {
    Serial.println("STATUS:READY:" + String(OFFICE_ID) + ":" + (sensorReady ? "R307_OK" : "R307_ERR"));
  }
  else if (cmd.startsWith("CMD:ENROLL")) {
    // Format: CMD:ENROLL or CMD:ENROLL:<slotId>
    int slot = -1;
    int colonIdx = cmd.indexOf(':', 4);
    if (colonIdx > 0) {
      slot = cmd.substring(colonIdx + 1).toInt();
    }
    enrollR307Slot(slot);
  }
  else if (cmd.startsWith("ENROLL:")) {
    // Format: ENROLL:<sessionId>:<customerId>:<memberId>
    int c1 = cmd.indexOf(':');
    int c2 = cmd.indexOf(':', c1 + 1);
    int c3 = cmd.indexOf(':', c2 + 1);
    String custId = (c2 > 0 && c3 > c2) ? cmd.substring(c2 + 1, c3) : "";
    String memId  = (c3 > 0) ? cmd.substring(c3 + 1) : "head";
    enrollR307Slot(-1, custId, memId);
  }
  else if (cmd.startsWith("LCD:")) {
    String msg = cmd.substring(4);
    int sep = msg.indexOf('|');
    if (sep >= 0) {
      showLCD(msg.substring(0, sep), msg.substring(sep + 1));
    } else {
      showLCD(msg, "");
    }
  }
}

// ==================== WIFI IP WEBSERVER ENDPOINTS ====================

void sendCORSHeaders() {
  ipServer.sendHeader("Access-Control-Allow-Origin", "*");
  ipServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  ipServer.sendHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Token");
}

void setupWebServerEndpoints() {
  ipServer.on("/status", HTTP_OPTIONS, []() { sendCORSHeaders(); ipServer.send(204); });
  ipServer.on("/poll",   HTTP_OPTIONS, []() { sendCORSHeaders(); ipServer.send(204); });
  ipServer.on("/scan",   HTTP_OPTIONS, []() { sendCORSHeaders(); ipServer.send(204); });
  ipServer.on("/enroll", HTTP_OPTIONS, []() { sendCORSHeaders(); ipServer.send(204); });

  ipServer.on("/status", HTTP_GET, []() {
    sendCORSHeaders();
    StaticJsonDocument<256> doc;
    doc["status"] = "ONLINE";
    doc["device"] = "ESP32-R307-POS";
    doc["sensor"] = sensorReady ? "R307 Optical" : "R307 Error";
    doc["officeId"] = OFFICE_ID;
    doc["ip"] = WiFi.localIP().toString();
    String out;
    serializeJson(doc, out);
    ipServer.send(200, "application/json", out);
  });

  ipServer.on("/poll", HTTP_GET, []() {
    sendCORSHeaders();
    StaticJsonDocument<256> doc;
    doc["type"] = pendingEventType;
    if (pendingEventType == "KEY") {
      doc["key"] = pendingEventKey;
    } else if (pendingEventType == "MATCH") {
      doc["slotId"] = pendingSlotId;
      doc["templateRef"] = pendingTemplateRef;
    }
    // Clear queue once read
    pendingEventType = "NONE";
    pendingEventKey  = "";
    pendingSlotId    = -1;
    pendingTemplateRef = "";

    String out;
    serializeJson(doc, out);
    ipServer.send(200, "application/json", out);
  });

  ipServer.on("/scan", HTTP_POST, []() {
    sendCORSHeaders();
    int slotId = waitAndScanR307(10000);
    showIdleLCD();
    StaticJsonDocument<256> doc;
    if (slotId > 0) {
      doc["success"] = true;
      doc["slotId"] = slotId;
      doc["templateRef"] = "FP-R307-SLOT" + String(slotId);
      String out;
      serializeJson(doc, out);
      ipServer.send(200, "application/json", out);
    } else {
      doc["success"] = false;
      doc["message"] = "Fingerprint not matched or timed out";
      String out;
      serializeJson(doc, out);
      ipServer.send(200, "application/json", out);
    }
  });

  ipServer.on("/enroll", HTTP_POST, []() {
    sendCORSHeaders();
    int slot = findNextFreeSlot();
    bool ok = enrollR307Slot(slot);
    StaticJsonDocument<256> doc;
    doc["success"] = ok;
    doc["slotId"] = slot;
    doc["templateRef"] = "FP-R307-SLOT" + String(slot);
    String out;
    serializeJson(doc, out);
    ipServer.send(200, "application/json", out);
  });
}

// ==================== SETUP & MAIN LOOP ====================

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  // Initialize I2C LCD
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  showLCD("SMART PDS R307", "Booting Node...");

  // Connect WiFi (non-blocking timeout so USB mode works offline too)
  if (String(WIFI_SSID) != "YOUR_WIFI_SSID") {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int tries = 0;
    while (WiFi.status() != WL_CONNECTED && tries < 12) {
      delay(400);
      tries++;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WiFi] Connected! IP: " + WiFi.localIP().toString());
    showLCD("WiFi IP Mode", WiFi.localIP().toString());
    setupWebServerEndpoints();
    ipServer.begin();
    delay(1200);
  } else {
    Serial.println("[USB] WiFi skipped/offline. USB Web Serial Mode Ready.");
  }

  // Initialize R307 Optical Fingerprint Sensor (57600 baud, with retry & pin-swap auto-detect)
  if (initR307Sensor()) {
    finger.getParameters();
    Serial.println("R307_READY:Sensor OK. Capacity=" + String(finger.capacity));
    signalSuccess("R307 READY", "Cap: " + String(finger.capacity) + " Prints");
  } else {
    Serial.println("R307_ERROR:Check 5V VCC, Yellow->GPIO16, White->GPIO17");
    signalError("R307 ERROR", "Check 5V & UART");
  }

  showIdleLCD();
}

void loop() {
  // 1. Handle WiFi HTTP Server (IP Mode)
  if (WiFi.status() == WL_CONNECTED) {
    ipServer.handleClient();
  }

  // 2. Handle USB Serial Commands from Web Portal
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    handleUSBCommand(cmd);
  }

  // 3. Handle 4x4 Matrix Keypad Input
  char key = keypad.getKey();
  if (key) {
    beep(40, 1);
    Serial.println("KEY:" + String(key));
    queueEvent("KEY", String(key));

    if (key == '*') {
      keypadBuffer = "";
      currentMode = MODE_IDLE_AUTH;
      showIdleLCD();
    } else if (key == '#') {
      if (keypadBuffer.length() > 0) {
        currentMode = MODE_SCANNING_AUTH;
        showLCD("ID: " + keypadBuffer, "Place Finger...");
      }
    } else {
      // Allow 0-9 and A, B, C, D as Customer ID characters
      if (keypadBuffer.length() < 14) {
        keypadBuffer += key;
        showIdleLCD();
      }
    }
  }

  // 4. Passive R307 Finger Scan (detects finger placed anytime in Idle/Auth mode)
  if (sensorReady && currentMode != MODE_ENROLLING) {
    int matched = scanR307Once(true);
    if (matched > 0) {
      keypadBuffer = "";
      currentMode = MODE_IDLE_AUTH;
      showIdleLCD();
    }
  }

  delay(40);
}
