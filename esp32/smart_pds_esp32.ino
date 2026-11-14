/**
 * Smart Indian Public Distribution System (PDS)
 * ESP32 Unified Firmware v3.0
 * Sensor: FPM10A / DY50 Optical Fingerprint Sensor
 * Library: Adafruit Fingerprint Sensor Library (same as R307)
 *
 * Features:
 *  - FPM10A/DY50 fingerprint enrollment & authentication
 *  - Baud-rate auto-detection (tries 57600 → 9600 → 19200 → 38400 → 115200)
 *  - USB Web Serial (115200 baud) for browser communication
 *  - WiFi HTTP REST server for IP-based connection
 *  - 4x4 Matrix Keypad (supports 0-9, A, B, C, D, *, #)
 *  - 16x2 I2C LCD display
 *
 * WIRING (FPM10A / DY50):
 *   VCC  → 5V  (MUST be 5V, not 3.3V)
 *   GND  → GND
 *   TXD  → GPIO16 (ESP32 RX2)
 *   RXD  → GPIO17 (ESP32 TX2)
 *
 * USB Serial Protocol (115200 baud):
 *   Browser → ESP32:  CMD:SCAN, CMD:STATUS, ENROLL:<sessionId>:<customerId>:<memberId>
 *   ESP32 → Browser:  FPM10A_READY:<slotCount>, R307_READY:<slotCount> (alias)
 *                     FPM10A_MATCH:<slotId>:<templateRef>, R307_MATCH:<slotId>:<templateRef> (alias)
 *                     FPM10A_NO_MATCH, R307_NO_MATCH (alias)
 *                     ENROLL_OK:<slotId>:<templateRef>
 *                     ENROLL_ERR:<reason>
 *                     KEY:<char>
 *
 * Required Libraries (install via Arduino Library Manager):
 *   - Adafruit Fingerprint Sensor Library (by Adafruit)
 *   - LiquidCrystal_I2C (by Frank de Brabander)
 *   - WiFi (built-in with ESP32 Arduino core)
 */

#include <Arduino.h>
#include <Adafruit_Fingerprint.h>
#include <HardwareSerial.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ============================================================
// CONFIGURATION - Edit these values
// ============================================================

// WiFi credentials (optional - for IP mode)
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// FPM10A / DY50 Sensor UART Pins
#define FP_RX_PIN  16   // GPIO16 → Sensor TXD (Yellow wire)
#define FP_TX_PIN  17   // GPIO17 → Sensor RXD (White wire)

// 4x4 Matrix Keypad Pins
const int ROW_PINS[4] = {13, 12, 14, 27};  // R1, R2, R3, R4
const int COL_PINS[4] = {26, 25, 33, 32};  // C1, C2, C3, C4

// I2C LCD (optional) - set address to 0x27 or 0x3F
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdAvailable = false;

// ============================================================
// FINGERPRINT SENSOR SETUP
// ============================================================
HardwareSerial fpSerial(2);  // UART2 → GPIO16/17
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&fpSerial);

// Baud rates to try for auto-detection (DY50 often 57600 or 9600)
const uint32_t BAUD_CANDIDATES[] = {57600, 9600, 19200, 38400, 115200};
const int      BAUD_COUNT        = 5;

bool   sensorReady   = false;
int    sensorCapacity = 162; // FPM10A DY50 default capacity
uint32_t activeBaud  = 57600;

// ============================================================
// KEYPAD
// ============================================================
const char KEY_MAP[4][4] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

String keypadBuffer = "";
unsigned long lastKeyTime = 0;

// ============================================================
// WEB SERVER
// ============================================================
WebServer server(80);
bool wifiConnected = false;

// Enroll session state
struct EnrollSession {
  bool      active;
  String    sessionId;
  String    customerId;
  String    memberId;
  int       targetSlot;
};
EnrollSession enrollSession = {false, "", "", "", -1};

// ============================================================
// HELPER: LCD display
// ============================================================
void lcdPrint(const char* line1, const char* line2 = "") {
  if (!lcdAvailable) return;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  if (strlen(line2) > 0) {
    lcd.setCursor(0, 1);
    lcd.print(line2);
  }
}

// ============================================================
// HELPER: Find next free fingerprint slot
// ============================================================
int findNextFreeSlot() {
  for (int i = 1; i <= sensorCapacity; i++) {
    if (finger.loadModel(i) != FINGERPRINT_OK) {
      return i; // slot is empty
    }
  }
  return -1; // sensor full
}

// ============================================================
// SENSOR INIT: Try multiple baud rates
// ============================================================
bool initFPM10ASensor() {
  Serial.println("[FPM10A] Initializing sensor (auto-detecting baud rate)...");

  for (int b = 0; b < BAUD_COUNT; b++) {
    uint32_t baud = BAUD_CANDIDATES[b];
    Serial.printf("[FPM10A] Trying baud rate: %lu\n", baud);
    fpSerial.begin(baud, SERIAL_8N1, FP_RX_PIN, FP_TX_PIN);
    delay(300);
    finger.begin(baud);
    delay(200);

    if (finger.verifyPassword()) {
      activeBaud = baud;
      Serial.printf("[FPM10A] ✓ Sensor found at %lu baud!\n", baud);
      sensorReady = true;

      // Read template count
      if (finger.getParameters() == FINGERPRINT_OK) {
        sensorCapacity = finger.capacity;
        Serial.printf("[FPM10A] Capacity: %d templates, Status: %d\n", sensorCapacity, finger.status_reg);
      }

      lcdPrint("FPM10A Ready", "PDS System v3");
      Serial.printf("FPM10A_READY:%d\n", sensorCapacity);
      Serial.printf("R307_READY:%d\n", sensorCapacity); // backward compat alias

      return true;
    }

    fpSerial.end();
    delay(200);
  }

  Serial.println("[FPM10A] ✗ Sensor not found on any baud rate.");
  Serial.println("[FPM10A] Check: 5V VCC, TXD→GPIO16, RXD→GPIO17");
  lcdPrint("Sensor Error", "Check Wiring!");
  return false;
}

// ============================================================
// FINGERPRINT SCAN: Returns slot ID on match
// ============================================================
int scanFingerprint() {
  if (!sensorReady) return -1;

  int result = finger.getImage();
  if (result != FINGERPRINT_OK) return 0; // No finger yet

  result = finger.image2Tz();
  if (result != FINGERPRINT_OK) return -2;

  result = finger.fingerSearch();
  if (result == FINGERPRINT_OK) {
    return finger.fingerID; // matched slot
  }
  return -3; // no match
}

// ============================================================
// FINGERPRINT ENROLLMENT: 2-scan process
// ============================================================
bool enrollFingerprint(int slot) {
  Serial.printf("[FPM10A] Starting enrollment into slot %d\n", slot);
  Serial.println("ENROLL_STATUS:STARTING");
  lcdPrint("Place Finger", "Scan 1 of 2...");

  // =========================================================
  // SCAN 1: Wait up to 20 seconds for 1st fingerprint
  // =========================================================
  Serial.println("ENROLL_STATUS:WAITING_SCAN1");
  unsigned long t = millis();
  int r1 = FINGERPRINT_NOFINGER;
  while (millis() - t < 20000) {
    r1 = finger.getImage();
    if (r1 == FINGERPRINT_OK) {
      Serial.println("ENROLL_STATUS:SCAN1_OK");
      break;
    }
    if (r1 == FINGERPRINT_NOFINGER) {
      delay(100);
      continue;
    }
    // Other error
    Serial.printf("ENROLL_ERR:Scan 1 image error (code %d). Re-seat finger on center of sensor.\n", r1);
    return false;
  }

  if (r1 != FINGERPRINT_OK) {
    Serial.println("ENROLL_ERR:Timeout on 1st scan. Place finger firmly on center of sensor within 20 seconds.");
    lcdPrint("Scan 1 Timeout", "Try Again");
    return false;
  }

  // Convert scan 1 image to template buffer 1
  int conv1 = finger.image2Tz(1);
  if (conv1 != FINGERPRINT_OK) {
    Serial.printf("ENROLL_ERR:Scan 1 conversion failed (code %d). Keep finger flat & steady.\n", conv1);
    return false;
  }
  Serial.println("ENROLL_STATUS:SCAN1_CONVERTED");
  lcdPrint("Scan 1 OK!", "Remove Finger");
  Serial.println("[FPM10A] Scan 1 captured OK. Remove finger...");

  // =========================================================
  // WAIT FOR FINGER REMOVAL (up to 5 seconds)
  // =========================================================
  delay(500);
  unsigned long removeStart = millis();
  while (millis() - removeStart < 5000) {
    if (finger.getImage() == FINGERPRINT_NOFINGER) break;
    delay(200);
  }
  Serial.println("ENROLL_STATUS:FINGER_REMOVED");
  Serial.println("[FPM10A] Finger removed. Waiting 1.5s before 2nd scan...");
  delay(1500); // 1.5s clear gap — DY50 needs time to reset between captures

  // =========================================================
  // SCAN 2: Wait up to 20 seconds for 2nd fingerprint
  // =========================================================
  lcdPrint("Place Finger", "Scan 2 of 2...");
  Serial.println("ENROLL_STATUS:WAITING_SCAN2");
  Serial.println("[FPM10A] Ready for 2nd scan. Place same finger again...");

  unsigned long t2 = millis();
  int r2 = FINGERPRINT_NOFINGER;
  while (millis() - t2 < 20000) {
    r2 = finger.getImage();
    if (r2 == FINGERPRINT_OK) {
      Serial.println("ENROLL_STATUS:SCAN2_OK");
      break;
    }
    if (r2 == FINGERPRINT_NOFINGER) {
      delay(100);
      continue;
    }
    Serial.printf("ENROLL_ERR:Scan 2 image error (code %d). Re-seat finger on sensor.\n", r2);
    return false;
  }

  if (r2 != FINGERPRINT_OK) {
    Serial.println("ENROLL_ERR:Timeout on 2nd scan. Place same finger within 20 seconds of removing.");
    lcdPrint("Scan 2 Timeout", "Try Again");
    return false;
  }

  // Convert scan 2 image to template buffer 2
  int conv2 = finger.image2Tz(2);
  if (conv2 != FINGERPRINT_OK) {
    Serial.printf("ENROLL_ERR:Scan 2 conversion failed (code %d). Same finger must be used for both scans.\n", conv2);
    return false;
  }
  Serial.println("ENROLL_STATUS:SCAN2_CONVERTED");

  // =========================================================
  // CREATE MODEL FROM BOTH BUFFERS
  // =========================================================
  Serial.println("[FPM10A] Creating model from both scans...");
  int modelResult = finger.createModel();
  if (modelResult == FINGERPRINT_ENROLLMISMATCH) {
    Serial.println("ENROLL_ERR:Fingerprints did not match (different fingers used). Use the SAME finger for both scans.");
    lcdPrint("Mismatch!", "Use Same Finger");
    return false;
  }
  if (modelResult != FINGERPRINT_OK) {
    Serial.printf("ENROLL_ERR:Model creation failed (code %d). Try again.\n", modelResult);
    return false;
  }

  // =========================================================
  // STORE MODEL IN SENSOR FLASH
  // =========================================================
  int storeResult = finger.storeModel(slot);
  if (storeResult != FINGERPRINT_OK) {
    Serial.printf("ENROLL_ERR:Failed to store template in slot %d (code %d).\n", slot, storeResult);
    return false;
  }

  // SUCCESS
  String tplRef = "FP-DY50-SLOT" + String(slot);
  lcdPrint("Enrolled!", tplRef.c_str());
  Serial.printf("ENROLL_OK:%d:%s\n", slot, tplRef.c_str());
  Serial.printf("[FPM10A] ✓ Enrollment complete! Slot %d, Template: %s\n", slot, tplRef.c_str());
  return true;
}

// ============================================================
// KEYPAD SCAN
// ============================================================
char readKeypad() {
  for (int r = 0; r < 4; r++) {
    digitalWrite(ROW_PINS[r], LOW);
    for (int c = 0; c < 4; c++) {
      if (digitalRead(COL_PINS[c]) == LOW) {
        delay(50); // debounce
        while (digitalRead(COL_PINS[c]) == LOW) {}
        digitalWrite(ROW_PINS[r], HIGH);
        return KEY_MAP[r][c];
      }
    }
    digitalWrite(ROW_PINS[r], HIGH);
  }
  return 0;
}

// ============================================================
// USB SERIAL COMMAND PARSER
// ============================================================
String serialBuffer = "";

void processSerialLine(String line) {
  line.trim();
  Serial.printf("[CMD] Received: %s\n", line.c_str());

  if (line == "CMD:STATUS") {
    if (sensorReady) {
      Serial.printf("FPM10A_READY:%d\n", sensorCapacity);
      Serial.printf("R307_READY:%d\n", sensorCapacity); // backward compat
    } else {
      Serial.println("FPM10A_NOT_READY");
      Serial.println("R307_NOT_READY");
    }
  }
  else if (line == "CMD:SCAN") {
    if (!sensorReady) {
      Serial.println("FPM10A_NO_MATCH");
      Serial.println("R307_NO_MATCH");
      return;
    }
    lcdPrint("Place Finger", "Scanning...");
    // Wait up to 10s for a finger then search
    unsigned long t = millis();
    bool found = false;
    while (millis() - t < 10000) {
      int r = finger.getImage();
      if (r == FINGERPRINT_OK) {
        if (finger.image2Tz() == FINGERPRINT_OK && finger.fingerSearch() == FINGERPRINT_OK) {
          String tRef = "FP-DY50-SLOT" + String(finger.fingerID);
          Serial.printf("FPM10A_MATCH:%d:%s\n", finger.fingerID, tRef.c_str());
          Serial.printf("R307_MATCH:%d:%s\n", finger.fingerID, tRef.c_str()); // backward compat
          lcdPrint("Match Found!", tRef.c_str());
          found = true;
          break;
        } else {
          Serial.println("FPM10A_NO_MATCH");
          Serial.println("R307_NO_MATCH");
          lcdPrint("No Match", "Try Again");
          found = true;
          break;
        }
      }
      delay(100);
    }
    if (!found) {
      Serial.println("FPM10A_NO_MATCH");
      Serial.println("R307_NO_MATCH");
    }
  }
  else if (line.startsWith("ENROLL:")) {
    // Format: ENROLL:<sessionId>:<customerId>:<memberId>
    String parts[4];
    int partIdx = 0;
    int start = 7;
    for (int i = 7; i <= line.length() && partIdx < 3; i++) {
      if (i == line.length() || line[i] == ':') {
        parts[partIdx++] = line.substring(start, i);
        start = i + 1;
      }
    }
    parts[partIdx] = line.substring(start);

    int slot = findNextFreeSlot();
    if (slot < 1) {
      Serial.println("ENROLL_ERR:Sensor storage full (162 templates max).");
      return;
    }

    enrollSession = {true, parts[0], parts[1], parts[2], slot};
    bool ok = enrollFingerprint(slot);
    enrollSession.active = false;

    if (!ok) {
      // Error already printed inside enrollFingerprint()
    }
  }
}

void readSerialInput() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialBuffer.length() > 0) {
        processSerialLine(serialBuffer);
        serialBuffer = "";
      }
    } else {
      serialBuffer += c;
    }
  }
}

// ============================================================
// WIFI HTTP SERVER ROUTES
// ============================================================
void setupWebServer() {
  server.on("/status", HTTP_GET, []() {
    String json = "{\"device\":\"ESP32-FPM10A-PDS\",\"sensor\":\"FPM10A DY50 Optical\",";
    json += "\"ready\":" + String(sensorReady ? "true" : "false") + ",";
    json += "\"capacity\":" + String(sensorCapacity) + ",";
    json += "\"baud\":" + String(activeBaud) + "}";
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);
  });

  server.on("/scan", HTTP_POST, []() {
    if (!sensorReady) {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"success\":false,\"error\":\"Sensor not ready\"}");
      return;
    }
    int slot = scanFingerprint();
    String json;
    if (slot > 0) {
      json = "{\"success\":true,\"slotId\":" + String(slot) + ",\"templateRef\":\"FP-DY50-SLOT" + String(slot) + "\"}";
    } else {
      json = "{\"success\":false,\"error\":\"No fingerprint match\"}";
    }
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);
  });

  server.on("/enroll", HTTP_POST, []() {
    if (!sensorReady) {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"success\":false,\"error\":\"Sensor not ready\"}");
      return;
    }
    int slot = findNextFreeSlot();
    if (slot < 1) {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"success\":false,\"error\":\"Sensor full\"}");
      return;
    }

    bool ok = enrollFingerprint(slot);
    String json;
    if (ok) {
      json = "{\"success\":true,\"slotId\":" + String(slot) + ",\"templateRef\":\"FP-DY50-SLOT" + String(slot) + "\"}";
    } else {
      json = "{\"success\":false,\"error\":\"Enrollment failed\"}";
    }
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);
  });

  server.on("/poll", HTTP_GET, []() {
    // Returns keypad events if any
    if (keypadBuffer.length() > 0 && millis() - lastKeyTime < 500) {
      String key = keypadBuffer.substring(keypadBuffer.length() - 1);
      String json = "{\"type\":\"KEY\",\"key\":\"" + key + "\"}";
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", json);
    } else {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(200, "application/json", "{\"type\":\"IDLE\"}");
    }
  });

  server.onNotFound([]() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(404, "application/json", "{\"error\":\"Route not found\"}");
  });

  server.begin();
  Serial.println("[WiFi] HTTP server started on port 80");
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  // USB Serial (for browser Web Serial API)
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================");
  Serial.println(" Smart PDS ESP32 Firmware v3.0");
  Serial.println(" Sensor: FPM10A / DY50");
  Serial.println("========================================");

  // LCD Init
  Wire.begin(21, 22); // SDA=21, SCL=22 (default ESP32)
  lcd.init();
  lcd.backlight();
  lcdAvailable = true;
  lcdPrint("Smart PDS v3.0", "Initializing...");

  // Keypad
  for (int r = 0; r < 4; r++) {
    pinMode(ROW_PINS[r], OUTPUT);
    digitalWrite(ROW_PINS[r], HIGH);
  }
  for (int c = 0; c < 4; c++) {
    pinMode(COL_PINS[c], INPUT_PULLUP);
  }

  // FPM10A Sensor Init
  if (!initFPM10ASensor()) {
    Serial.println("[WARN] FPM10A not detected. System running without biometrics.");
    Serial.println("[WARN] Check: 5V VCC, TXD→GPIO16, RXD→GPIO17, secure JST connector");
  }

  // WiFi (optional — comment out if not needed)
  Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 20) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    lcdPrint("WiFi Connected", WiFi.localIP().toString().c_str());
    setupWebServer();
    delay(1500);
  } else {
    Serial.println("\n[WiFi] Not connected. Using USB Serial mode only.");
    lcdPrint("WiFi Failed", "USB Mode Only");
    delay(1000);
  }

  if (sensorReady) {
    lcdPrint("Ready! Place", "Finger or Key");
  } else {
    lcdPrint("No Sensor!", "USB Bridge OK");
  }

  Serial.println("[PDS] System ready. Waiting for commands...");
}

// ============================================================
// MAIN LOOP
// ============================================================
unsigned long lastAutoScan = 0;

void loop() {
  // 1. Handle USB serial commands from browser
  readSerialInput();

  // 2. Handle WiFi HTTP requests
  if (wifiConnected) {
    server.handleClient();
  }

  // 3. Auto-scan fingerprint every 1 second (passive mode, not during enrollment)
  if (sensorReady && !enrollSession.active && millis() - lastAutoScan > 1000) {
    lastAutoScan = millis();
    if (finger.getImage() == FINGERPRINT_OK) {
      if (finger.image2Tz() == FINGERPRINT_OK) {
        if (finger.fingerSearch() == FINGERPRINT_OK) {
          String tRef = "FP-DY50-SLOT" + String(finger.fingerID);
          Serial.printf("FPM10A_MATCH:%d:%s\n", finger.fingerID, tRef.c_str());
          Serial.printf("R307_MATCH:%d:%s\n", finger.fingerID, tRef.c_str()); // compat
          lcdPrint("Matched!", tRef.c_str());
          delay(2000);
          lcdPrint("Ready! Place", "Finger or Key");
        } else {
          Serial.println("FPM10A_NO_MATCH");
          Serial.println("R307_NO_MATCH");
          lcdPrint("No Match", "Try Again");
          delay(1500);
          lcdPrint("Ready! Place", "Finger or Key");
        }
      }
    }
  }

  // 4. Keypad scan
  char key = readKeypad();
  if (key != 0) {
    Serial.printf("KEY:%c\n", key);
    keypadBuffer += key;
    lastKeyTime = millis();
    lcdPrint("Key Pressed:", String(key).c_str());
    delay(200);
    lcdPrint("Ready! Place", "Finger or Key");
  }
}
