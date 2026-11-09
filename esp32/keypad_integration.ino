/*
 * =========================================================================================
 * Smart Indian Public Distribution System (PDS)
 * ESP32 POS Terminal: 4x4 Keypad + R307 Optical Sensor
 * Dual Mode Connectivity: Direct USB Cable (Web Serial) & WiFi Network IP Server (Port 80)
 * =========================================================================================
 * 
 * Hardware Pin Connections:
 * - R307 Optical Sensor (Hardware Serial2):
 *     Red (VCC)    -> ESP32 5V / VIN (Requires steady 5V DC)
 *     Black (GND)  -> ESP32 GND
 *     Yellow (TXD) -> ESP32 GPIO 16 (Serial2 RX)
 *     White (RXD)  -> ESP32 GPIO 17 (Serial2 TX)
 * 
 * - 4x4 Matrix Keypad:
 *     Row Pins: GPIO 13, 12, 14, 27
 *     Col Pins: GPIO 26, 25, 33, 32
 * 
 * - 16x2 I2C LCD (PCF8574):
 *     SDA -> GPIO 21 | SCL -> GPIO 22
 * 
 * - Output Indicators:
 *     Green LED -> GPIO 2
 *     Red LED   -> GPIO 4
 *     Buzzer    -> GPIO 5
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

// WiFi Configuration (For IP connection mode)
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Backend Server API (Direct Cloud or Local Backend)
const char* verifyApiUrl = "http://192.168.1.100:5000/api/iot/verify";
const char* deviceToken = "DEV-OFF001-ESP32-SECURE";
const char* officeId = "OFF001";

// 4x4 Keypad Setup
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

// R307 Optical Fingerprint Sensor on Serial2 (57600 Baud)
#define R307_RX_PIN 16
#define R307_TX_PIN 17
HardwareSerial r307Serial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&r307Serial);

// LCD Display (0x27)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// WebServer for WiFi IP Mode on Port 80
WebServer ipServer(80);

const int LED_GREEN = 2;
const int LED_RED = 4;
const int BUZZER = 5;

String inputBuffer = "";
enum PosState { ENTER_ID, SCAN_R307, VERIFYING };
PosState currentState = ENTER_ID;

// Event queue for WiFi IP polling
String lastEventType = "";
String lastEventData = "";

void setup() {
  // Primary Serial for USB Cable communication with Browser Web Serial API at 115200 Baud
  Serial.begin(115200);
  delay(500);

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  // Initialize LCD
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("SMART PDS R307");
  lcd.setCursor(0, 1);
  lcd.print("Office: " + String(officeId));

  // Connect to WiFi for IP Connection Mode
  WiFi.begin(ssid, password);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 12) {
    delay(400);
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP Address: " + WiFi.localIP().toString());
    lcd.clear();
    lcd.print("IP: " + WiFi.localIP().toString());
    setupWebServerEndpoints();
    ipServer.begin();
  } else {
    Serial.println("\n[WiFi] Offline. USB Cable Web Serial Mode Active.");
    lcd.clear();
    lcd.print("USB Serial Ready");
  }

  // Initialize R307 Sensor at 57600 baud
  r307Serial.begin(57600, SERIAL_8N1, R307_RX_PIN, R307_TX_PIN);
  delay(500);
  finger.begin(57600);

  if (finger.verifyPassword()) {
    Serial.println("R307_READY:Sensor initialized successfully at 57600 baud.");
  } else {
    Serial.println("R307_ERROR:Optical sensor not detected. Check 5V power.");
  }

  delay(1500);
  promptEnterId();
}

void loop() {
  // Handle HTTP REST requests if connected via WiFi IP
  if (WiFi.status() == WL_CONNECTED) {
    ipServer.handleClient();
  }

  // Read incoming commands from USB Cable (Web Serial from Browser)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    handleUSBCommand(cmd);
  }

  // Handle 4x4 physical Keypad
  char key = keypad.getKey();
  if (key) {
    // Send to USB Cable immediately for Web Serial API
    Serial.println("KEY:" + String(key));

    // Queue for WiFi IP poll
    lastEventType = "KEY";
    lastEventData = String(key);

    beep(40);
    handleKeypadPress(key);
  }

  // Optical Fingerprint Sensor scanning when in SCAN_R307 state
  if (currentState == SCAN_R307) {
    scanR307Prism();
  }
}

// -------------------------------------------------------------
// WEBSERVER ENDPOINTS FOR WIFI IP CONNECTION MODE
// -------------------------------------------------------------
void setupWebServerEndpoints() {
  // Enable CORS so browser can access directly
  ipServer.enableCORS(true);

  // Status check endpoint: GET http://<IP>/status
  ipServer.on("/status", HTTP_GET, []() {
    ipServer.sendHeader("Access-Control-Allow-Origin", "*");
    String json = "{\"status\":\"ONLINE\",\"device\":\"ESP32-R307-POS\",\"sensor\":\"R307 Optical\",\"officeId\":\"" + String(officeId) + "\",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
    ipServer.send(200, "application/json", json);
  });

  // Polling endpoint for events: GET http://<IP>/poll
  ipServer.on("/poll", HTTP_GET, []() {
    ipServer.sendHeader("Access-Control-Allow-Origin", "*");
    String json = "{\"type\":\"" + lastEventType + "\",\"key\":\"" + lastEventData + "\",\"inputBuffer\":\"" + inputBuffer + "\"}";
    lastEventType = ""; // Clear after poll
    ipServer.send(200, "application/json", json);
  });

  // Trigger optical scan via IP: POST http://<IP>/scan
  ipServer.on("/scan", HTTP_POST, []() {
    ipServer.sendHeader("Access-Control-Allow-Origin", "*");
    int slot = performR307OpticalMatch();
    if (slot > 0) {
      String json = "{\"success\":true,\"slotId\":" + String(slot) + ",\"templateRef\":\"FP-R307-SLOT" + String(slot) + "\"}";
      ipServer.send(200, "application/json", json);
    } else {
      ipServer.send(200, "application/json", "{\"success\":false,\"error\":\"Fingerprint not matched on R307\"}");
    }
  });
}

// -------------------------------------------------------------
// USB SERIAL COMMANDS (FROM BROWSER WEB SERIAL API)
// -------------------------------------------------------------
void handleUSBCommand(String cmd) {
  if (cmd == "CMD:STATUS") {
    Serial.println("STATUS:ONLINE:ESP32-R307-POS:OFF001");
  } else if (cmd == "CMD:SCAN") {
    currentState = SCAN_R307;
    lcd.clear();
    lcd.print("R307 OPTICAL");
    lcd.setCursor(0, 1);
    lcd.print("PLACE FINGER...");
    scanR307Prism();
  } else if (cmd == "CMD:BEEP") {
    beep(100);
  }
}

void promptEnterId() {
  inputBuffer = "";
  currentState = ENTER_ID;
  lcd.clear();
  lcd.print("ENTER CUST/RC ID:");
  lcd.setCursor(0, 1);
  lcd.print("> ");
}

void handleKeypadPress(char key) {
  if (key == '#') {
    if (inputBuffer.length() > 0) {
      currentState = SCAN_R307;
      lcd.clear();
      lcd.print("ID: " + inputBuffer);
      lcd.setCursor(0, 1);
      lcd.print("PLACE FINGER...");
    }
  } else if (key == '*') {
    if (inputBuffer.length() > 0) {
      inputBuffer.remove(inputBuffer.length() - 1);
      lcd.setCursor(2, 1);
      lcd.print(inputBuffer + " ");
    }
  } else {
    if (inputBuffer.length() < 14) {
      inputBuffer += key;
      lcd.setCursor(2, 1);
      lcd.print(inputBuffer);
    }
  }
}

int performR307OpticalMatch() {
  uint8_t p = finger.getImage();
  if (p != FINGERPRINT_OK) return -1;

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return -1;

  p = finger.fingerFastSearch();
  if (p != FINGERPRINT_OK) return -1;

  return finger.fingerID;
}

void scanR307Prism() {
  int slotId = performR307OpticalMatch();
  if (slotId > 0) {
    String templateRef = "FP-R307-SLOT" + String(slotId);

    // Emit match event to USB Web Serial
    Serial.println("R307_MATCH:" + String(slotId) + ":" + templateRef);

    // Queue for WiFi IP
    lastEventType = "MATCH";
    lastEventData = String(slotId);

    lcd.clear();
    lcd.print("R307 MATCH #" + String(slotId));
    lcd.setCursor(0, 1);
    lcd.print("VERIFIED!");

    digitalWrite(LED_GREEN, HIGH);
    beep(100); delay(60); beep(100);
    delay(2000);
    digitalWrite(LED_GREEN, LOW);

    promptEnterId();
  }
}

void beep(int ms) {
  digitalWrite(BUZZER, HIGH);
  delay(ms);
  digitalWrite(BUZZER, LOW);
}
