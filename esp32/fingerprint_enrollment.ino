/*
 * =========================================================================================
 * Smart Indian Public Distribution System (PDS)
 * ESP32 Biometric Fingerprint Enrollment Module - Specifically for R307 Optical Sensor
 * =========================================================================================
 * 
 * Hardware:
 * - ESP32 NodeMCU-32S / ESP32-WROOM-32
 * - R307 Optical Fingerprint Sensor Module (1000 Fingerprint Storage, 57600 baud, 5V VCC)
 * - 16x2 I2C Character LCD (PCF8574 backpack)
 * - Status LEDs (Green=GPIO 2, Red=GPIO 4) & Active Buzzer (GPIO 5)
 * 
 * R307 6-Pin Connector Wiring:
 *   Pin 1 (Red)    : VCC -> ESP32 5V / VIN (Requires steady 4.5V - 6.0V DC)
 *   Pin 2 (Black)  : GND -> ESP32 GND
 *   Pin 3 (Yellow) : TXD -> ESP32 GPIO 16 (Serial2 RX)
 *   Pin 4 (White)  : RXD -> ESP32 GPIO 17 (Serial2 TX via 1k/2k resistor divider to 3.3V)
 *   Pin 5 (Blue)   : WAK / Touch Out -> ESP32 GPIO 34 (Optional Touch Wakeup)
 *   Pin 6 (Green)  : 3.3V Touch Power -> ESP32 3.3V (Optional)
 * 
 * LCD I2C Wiring:
 *   SDA -> ESP32 GPIO 21
 *   SCL -> ESP32 GPIO 22
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

// Backend API URL (Smart PDS Server)
const char* serverUrl = "http://192.168.1.100:5000/api/iot";
const char* deviceToken = "DEV-ENROLL-KIOSK-01"; // Registered Kiosk Token

// Hardware Pin Definitions
#define R307_RX_PIN 16 // Connects to R307 Yellow (TX)
#define R307_TX_PIN 17 // Connects to R307 White (RX)
#define R307_TOUCH_PIN 34 // Connects to R307 Blue (Touch detect)

const int LED_GREEN = 2;
const int LED_RED = 4;
const int BUZZER = 5;

// Hardware Serial2 for R307 Optical Sensor
HardwareSerial r307Serial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&r307Serial);
LiquidCrystal_I2C lcd(0x27, 16, 2);

String currentSessionId = "";
String currentCustomerId = "";
String currentMemberId = "head";

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n========================================================");
  Serial.println(" SMART PDS - R307 OPTICAL FINGERPRINT ENROLLMENT NODE   ");
  Serial.println(" Sensor: R307 Optical (Baud: 57600, 512B Template)      ");
  Serial.println("========================================================");

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(R307_TOUCH_PIN, INPUT);

  // Initialize LCD
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("SMART PDS R307");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");

  // Connect to WiFi
  WiFi.begin(ssid, password);
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 15) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully. IP: " + WiFi.localIP().toString());
    lcd.setCursor(0, 1);
    lcd.print("WiFi Connected ");
  } else {
    Serial.println("\n[WiFi] Connection timeout. Operating in Standalone / Serial Mode.");
    lcd.setCursor(0, 1);
    lcd.print("WiFi Offline   ");
  }
  delay(1000);

  // Initialize R307 Optical Sensor on Hardware Serial2
  // R307 default baud rate is strictly 57600 bps
  r307Serial.begin(57600, SERIAL_8N1, R307_RX_PIN, R307_TX_PIN);
  delay(500);

  finger.begin(57600);
  if (finger.verifyPassword()) {
    Serial.println("✅ R307 Optical Fingerprint Sensor detected & authenticated!");
    
    // Read and print R307 hardware parameters
    finger.getParameters();
    Serial.print("  - Sensor Status: OK (0x"); Serial.print(finger.status_reg, HEX); Serial.println(")");
    Serial.print("  - Storage Capacity: "); Serial.print(finger.capacity); Serial.println(" fingerprint templates");
    Serial.print("  - Security Level: "); Serial.println(finger.security_level);
    Serial.print("  - Packet Size: "); Serial.println(finger.packet_len);

    lcd.clear();
    lcd.print("R307 SENSOR READY");
    lcd.setCursor(0, 1);
    lcd.print("Cap: " + String(finger.capacity) + " Prints");
    beep(100);
  } else {
    Serial.println("❌ ERROR: R307 Optical Sensor not responding!");
    Serial.println("  Check: 1) VCC is 5V (Not 3.3V) | 2) Yellow wire -> GPIO 16 | 3) White wire -> GPIO 17");
    lcd.clear();
    lcd.print("R307 SENSOR ERR");
    lcd.setCursor(0, 1);
    lcd.print("Check 5V & UART");
    digitalWrite(LED_RED, HIGH);
  }

  delay(2000);
  lcd.clear();
  lcd.print("READY TO ENROLL");
  lcd.setCursor(0, 1);
  lcd.print("Initiate via Web");
}

void loop() {
  // Listen for commands from Serial or Web Dashboard
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    // Command format: ENROLL:<sessionId>:<customerId>:<memberId>
    if (cmd.startsWith("ENROLL:")) {
      int firstColon = cmd.indexOf(':');
      int secondColon = cmd.indexOf(':', firstColon + 1);
      int thirdColon = cmd.indexOf(':', secondColon + 1);

      currentSessionId = cmd.substring(firstColon + 1, secondColon);
      currentCustomerId = cmd.substring(secondColon + 1, thirdColon != -1 ? thirdColon : cmd.length());
      if (thirdColon != -1) {
        currentMemberId = cmd.substring(thirdColon + 1);
      } else {
        currentMemberId = "head";
      }

      int slotId = findNextFreeR307Slot();
      enrollR307Fingerprint(slotId);
    }
  }

  delay(200);
}

// Find next free template slot in R307 internal flash (slots 1 to 1000)
int findNextFreeR307Slot() {
  for (int id = 1; id <= 1000; id++) {
    if (finger.loadModel(id) != FINGERPRINT_OK) {
      return id; // Free slot found
    }
  }
  return 1;
}

// 2-Pass optical image capture & minutiae template generation for R307
void enrollR307Fingerprint(int slotId) {
  int p = -1;
  lcd.clear();
  lcd.print("R307 ENROLL #" + String(slotId));
  lcd.setCursor(0, 1);
  lcd.print("Place Finger...");

  notifyBackendEnrollStep("WAITING_FOR_FINGERPRINT", "");
  Serial.print("\n[R307] Waiting for clean finger placement in slot #"); Serial.println(slotId);

  // PASS 1: Capture first fingerprint image
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    switch (p) {
      case FINGERPRINT_OK:
        Serial.println("[R307] Image 1 captured successfully.");
        break;
      case FINGERPRINT_NOFINGER:
        break;
      case FINGERPRINT_PACKETRECIEVEERR:
        Serial.println("[R307] Communication error with sensor.");
        break;
      case FINGERPRINT_IMAGEFAIL:
        Serial.println("[R307] Optical imaging failure.");
        break;
      default:
        Serial.print("[R307] Unknown error: 0x"); Serial.println(p, HEX);
        break;
    }
    delay(50);
  }

  notifyBackendEnrollStep("SCANNING", "");
  beep(80);
  lcd.setCursor(0, 1);
  lcd.print("Image 1 Converted");

  // Convert Image 1 into CharBuffer 1 (Minutiae extraction)
  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) {
    showR307Error("Minutiae Err 1");
    notifyBackendEnrollStep("FAILED", "Could not extract minutiae from image 1.");
    return;
  }

  // Instruct user to remove finger
  lcd.clear();
  lcd.print("Remove Finger");
  lcd.setCursor(0, 1);
  lcd.print("From R307 Glass");
  Serial.println("[R307] Remove finger from prism");
  delay(1500);

  p = 0;
  while (p != FINGERPRINT_NOFINGER) {
    p = finger.getImage();
    delay(50);
  }

  // PASS 2: Place same finger again for template confirmation
  lcd.clear();
  lcd.print("Place Same");
  lcd.setCursor(0, 1);
  lcd.print("Finger Again...");
  Serial.println("[R307] Place same finger for second verification pass");

  p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    delay(50);
  }

  lcd.setCursor(0, 1);
  lcd.print("Processing 2...");
  beep(80);

  // Convert Image 2 into CharBuffer 2
  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) {
    showR307Error("Minutiae Err 2");
    notifyBackendEnrollStep("FAILED", "Could not extract minutiae from image 2.");
    return;
  }

  // Step 3: Combine CharBuffer 1 & 2 to generate standard R307 Model
  p = finger.createModel();
  if (p == FINGERPRINT_OK) {
    Serial.println("[R307] Both passes matched! Template model generated.");
  } else if (p == FINGERPRINT_ENROLLMISMATCH) {
    showR307Error("Prints Mismatch!");
    notifyBackendEnrollStep("FAILED", "First and second fingerprint passes did not match.");
    return;
  } else {
    showR307Error("Model Gen Err");
    notifyBackendEnrollStep("FAILED", "Could not create template model.");
    return;
  }

  // Step 4: Store in R307 Flash Memory
  p = finger.storeModel(slotId);
  if (p == FINGERPRINT_OK) {
    Serial.println("[R307] Stored successfully in internal flash slot: " + String(slotId));
    digitalWrite(LED_GREEN, HIGH);
    beep(150); delay(100); beep(150);

    // Generate secure one-way reference string (Raw biometric stays on R307 hardware)
    String templateRef = "FP-R307-SLOT" + String(slotId) + "-" + String(millis());

    lcd.clear();
    lcd.print("ENROLLED SUCCESS");
    lcd.setCursor(0, 1);
    lcd.print("Ref: " + templateRef.substring(0, 11));

    notifyBackendEnrollStep("SUCCESS", templateRef);
    delay(3000);
    digitalWrite(LED_GREEN, LOW);
  } else {
    showR307Error("Flash Store Err");
    notifyBackendEnrollStep("FAILED", "Could not write template to R307 flash memory.");
  }

  lcd.clear();
  lcd.print("READY TO ENROLL");
  lcd.setCursor(0, 1);
  lcd.print("Initiate via Web");
}

void notifyBackendEnrollStep(String status, String templateRef) {
  if (WiFi.status() != WL_CONNECTED || currentSessionId == "") return;

  HTTPClient http;
  http.begin(String(serverUrl) + "/enroll/step");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", deviceToken);

  StaticJsonDocument<256> doc;
  doc["sessionId"] = currentSessionId;
  doc["status"] = status;
  if (templateRef != "") doc["templateRef"] = templateRef;

  String reqBody;
  serializeJson(doc, reqBody);

  int httpCode = http.POST(reqBody);
  Serial.print("[Backend] Step notification sent. HTTP Response: "); Serial.println(httpCode);
  http.end();
}

void showR307Error(String msg) {
  lcd.clear();
  lcd.print("R307 ERROR");
  lcd.setCursor(0, 1);
  lcd.print(msg);
  digitalWrite(LED_RED, HIGH);
  beep(600);
  delay(2500);
  digitalWrite(LED_RED, LOW);
}

void beep(int ms) {
  digitalWrite(BUZZER, HIGH);
  delay(ms);
  digitalWrite(BUZZER, LOW);
}
