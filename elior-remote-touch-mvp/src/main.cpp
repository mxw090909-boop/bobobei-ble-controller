#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "secrets.h"

namespace {

constexpr const char* TARGET_NAME = "SOSEXY";
constexpr const char* SERVICE_UUID = "0000ee01-0000-1000-8000-00805f9b34fb";
constexpr const char* WRITE_CHAR_UUID = "0000ee03-0000-1000-8000-00805f9b34fb";
constexpr const char* NOTIFY_CHAR_UUID = "0000ee02-0000-1000-8000-00805f9b34fb";

constexpr uint32_t CLAIM_INTERVAL_MS = 1200;
constexpr bool RUN_BLE_SELF_TEST_ON_BOOT = false;

NimBLEAdvertisedDevice* targetDevice = nullptr;
NimBLEClient* bleClient = nullptr;
NimBLERemoteCharacteristic* writeChar = nullptr;
NimBLERemoteCharacteristic* notifyChar = nullptr;
String lastBleError;

uint8_t seq = 0;
uint32_t lastClaimAt = 0;

const uint8_t INIT_CMD[] = {0x00, 0x01, 0x00, 0x01, 0x00, 0xC8, 0x11, 0x01};
const uint8_t STOP_CMD[] = {
  0x00, 0x01, 0x00, 0x03,
  0x00, 0x01, 0x11, 0x00,
  0x00, 0x03, 0x11, 0x00,
  0x00, 0x07, 0x11, 0x00,
};

struct ToyCommand {
  String id;
  String type;
  String payloadJson;
  int ch = 0;
  int value = 0;
  int vibe = 0;
  int ems = 0;
  int suck = 0;
  int durationMs = 0;
};

class TargetScanCallbacks : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice* advertisedDevice) override {
    if (advertisedDevice->haveName() && advertisedDevice->getName() == TARGET_NAME) {
      Serial.println("[ble] found SOSEXY");
      targetDevice = new NimBLEAdvertisedDevice(*advertisedDevice);
      NimBLEDevice::getScan()->stop();
    }
  }
};

int clampStrength(int value) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

void setBleError(const char* error) {
  lastBleError = error;
}

bool writeBle(const uint8_t* data, size_t len, const char* label) {
  if (!writeChar) {
    Serial.printf("[ble] cannot write %s: characteristic missing\n", label);
    setBleError("write_char_missing");
    return false;
  }

  bool ok = writeChar->writeValue(data, len, true);
  Serial.printf("[ble] write %s: %s\n", label, ok ? "ok" : "failed");
  if (!ok) {
    if (strcmp(label, "init") == 0) {
      setBleError("init_failed");
    } else if (strcmp(label, "stop") == 0) {
      setBleError("stop_failed");
    } else {
      lastBleError = String(label) + "_failed";
    }
  }
  return ok;
}

void onToyNotify(NimBLERemoteCharacteristic*, uint8_t* data, size_t len, bool isNotify) {
  Serial.printf("[ble] %s:", isNotify ? "notify" : "indicate");
  for (size_t i = 0; i < len; ++i) {
    Serial.printf(" %02X", data[i]);
  }
  Serial.println();
}

bool sendStop() {
  return writeBle(STOP_CMD, sizeof(STOP_CMD), "stop");
}

bool sendSetAll(int vibe, int ems, int suck) {
  uint8_t cmd[] = {
    seq++, 0x01, 0x00, 0x03,
    0x00, 0x01, 0x11, static_cast<uint8_t>(clampStrength(vibe)),
    0x00, 0x03, 0x11, static_cast<uint8_t>(clampStrength(ems)),
    0x00, 0x07, 0x11, static_cast<uint8_t>(clampStrength(suck)),
  };
  return writeBle(cmd, sizeof(cmd), "set_all");
}

bool sendSetOne(int ch, int value) {
  uint8_t cmd[] = {
    seq++, 0x01, 0x00, 0x01,
    0x00, static_cast<uint8_t>(ch), 0x11, static_cast<uint8_t>(clampStrength(value)),
  };
  return writeBle(cmd, sizeof(cmd), "set_one");
}

bool sendRuntimeSet(int vibe, int ems, int suck) {
  bool ok = true;

  if (suck > 0) {
    ok = sendSetOne(8, 1) && ok;
    delay(80);
    ok = sendSetOne(7, suck) && ok;
  }

  if (vibe > 0) {
    ok = sendSetOne(2, 1) && ok;
    delay(80);
    ok = sendSetOne(1, vibe) && ok;
  }

  if (ems > 0) {
    ok = sendSetOne(4, 1) && ok;
    delay(80);
    ok = sendSetOne(3, ems) && ok;
  }

  if (vibe == 0 && ems == 0 && suck == 0) {
    ok = sendStop() && ok;
  }

  return ok;
}

bool scanForToy() {
  delete targetDevice;
  targetDevice = nullptr;

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new TargetScanCallbacks(), true);
  scan->setActiveScan(true);
  scan->setInterval(45);
  scan->setWindow(15);

  Serial.println("[ble] scanning for SOSEXY...");
  scan->start(8, false);
  scan->clearResults();

  return targetDevice != nullptr;
}

bool connectToy() {
  lastBleError = "";

  if (writeChar && bleClient && bleClient->isConnected()) {
    return true;
  }

  if (!targetDevice && !scanForToy()) {
    Serial.println("[ble] SOSEXY not found");
    setBleError("scan_failed");
    return false;
  }

  if (!bleClient) {
    bleClient = NimBLEDevice::createClient();
  }

  Serial.println("[ble] connecting...");
  if (!bleClient->connect(targetDevice)) {
    Serial.println("[ble] connect failed");
    setBleError("connect_failed");
    return false;
  }

  NimBLERemoteService* service = bleClient->getService(SERVICE_UUID);
  if (!service) {
    Serial.println("[ble] EE01 service not found");
    setBleError("service_missing");
    bleClient->disconnect();
    return false;
  }

  writeChar = service->getCharacteristic(WRITE_CHAR_UUID);
  if (!writeChar || !writeChar->canWrite()) {
    Serial.println("[ble] EE03 writable characteristic not found");
    setBleError("write_char_missing");
    bleClient->disconnect();
    writeChar = nullptr;
    return false;
  }

  notifyChar = service->getCharacteristic(NOTIFY_CHAR_UUID);
  if (notifyChar && notifyChar->canNotify()) {
    bool notifyOk = notifyChar->subscribe(true, onToyNotify, true);
    Serial.printf("[ble] subscribe notify: %s\n", notifyOk ? "ok" : "failed");
    if (!notifyOk) {
      setBleError("notify_failed");
      bleClient->disconnect();
      writeChar = nullptr;
      notifyChar = nullptr;
      return false;
    }
    delay(150);
  } else {
    Serial.println("[ble] EE02 notify characteristic not found");
    setBleError("notify_failed");
    bleClient->disconnect();
    writeChar = nullptr;
    notifyChar = nullptr;
    return false;
  }

  Serial.println("[ble] connected and ready");
  if (!writeBle(INIT_CMD, sizeof(INIT_CMD), "init")) {
    bleClient->disconnect();
    writeChar = nullptr;
    notifyChar = nullptr;
    return false;
  }

  return true;
}

const char* wifiStatusName(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "idle";
    case WL_NO_SSID_AVAIL: return "ssid not available";
    case WL_SCAN_COMPLETED: return "scan completed";
    case WL_CONNECTED: return "connected";
    case WL_CONNECT_FAILED: return "connect failed";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_DISCONNECTED: return "disconnected";
    default: return "unknown";
  }
}

int findConfiguredWifi(const String& ssid) {
  for (size_t i = 0; i < WIFI_NETWORK_COUNT; ++i) {
    if (ssid == WIFI_SSIDS[i]) {
      return static_cast<int>(i);
    }
  }
  return -1;
}

int printWifiScanAndChoose() {
  Serial.println("[wifi] scanning nearby networks...");
  int count = WiFi.scanNetworks();
  if (count <= 0) {
    Serial.println("[wifi] no networks found");
    return -1;
  }

  int bestConfigIndex = -1;
  int bestRssi = -1000;

  for (int i = 0; i < count; ++i) {
    String ssid = WiFi.SSID(i);
    int configIndex = findConfiguredWifi(ssid);
    Serial.printf("[wifi] %2d: %s rssi=%d channel=%d encryption=%s\n",
                  i + 1,
                  ssid.c_str(),
                  WiFi.RSSI(i),
                  WiFi.channel(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "open" : "secured");

    if (configIndex >= 0 && WiFi.RSSI(i) > bestRssi) {
      bestConfigIndex = configIndex;
      bestRssi = WiFi.RSSI(i);
    }
  }

  return bestConfigIndex;
}

bool tryWifiNetwork(size_t index) {
  if (index >= WIFI_NETWORK_COUNT) {
    return false;
  }

  Serial.printf("[wifi] connecting to %s", WIFI_SSIDS[index]);
  WiFi.begin(WIFI_SSIDS[index], WIFI_PASSWORDS[index]);

  uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] connected to %s: %s\n",
                  WIFI_SSIDS[index],
                  WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.printf("\n[wifi] failed on %s: %s (%d)\n",
                WIFI_SSIDS[index],
                wifiStatusName(WiFi.status()),
                WiFi.status());
  WiFi.disconnect(false);
  delay(250);
  return false;
}

bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(250);

  int preferredIndex = printWifiScanAndChoose();
  if (preferredIndex >= 0 && tryWifiNetwork(static_cast<size_t>(preferredIndex))) {
    return true;
  }

  for (size_t i = 0; i < WIFI_NETWORK_COUNT; ++i) {
    if (static_cast<int>(i) == preferredIndex) {
      continue;
    }
    if (tryWifiNetwork(i)) {
      return true;
    }
  }

  Serial.println("[wifi] all configured networks failed");
  return false;
}

bool postRpc(const char* rpcName, const JsonDocument& request, String& response) {
  if (WiFi.status() != WL_CONNECTED) {
    if (!connectWifi()) {
      return false;
    }
  }

  String body;
  serializeJson(request, body);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/" + rpcName;
  if (!http.begin(client, url)) {
    Serial.println("[http] begin failed");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int code = http.POST(body);
  response = http.getString();
  http.end();

  if (code < 200 || code >= 300) {
    Serial.printf("[http] %s failed: %d %s\n", rpcName, code, response.c_str());
    return false;
  }

  return true;
}

bool claimCommand(ToyCommand& out, bool stopOnly) {
  StaticJsonDocument<256> req;
  req["p_device_id"] = DEVICE_ID;
  req["p_device_token"] = DEVICE_TOKEN;
  req["p_stop_only"] = stopOnly;

  String response;
  if (!postRpc("claim_toy_command", req, response)) {
    return false;
  }

  StaticJsonDocument<4096> doc;
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.printf("[json] claim parse failed: %s\n", err.c_str());
    return false;
  }

  if (!doc.is<JsonArray>() || doc.as<JsonArray>().size() == 0) {
    return false;
  }

  JsonObject row = doc[0];
  JsonObject payload = row["payload"];
  out.id = row["command_id"].as<const char*>();
  out.type = payload["type"].as<const char*>();
  serializeJson(payload, out.payloadJson);
  out.ch = payload["ch"] | 0;
  out.value = payload["value"] | 0;
  out.vibe = payload["vibe"] | 0;
  out.ems = payload["ems"] | 0;
  out.suck = payload["suck"] | 0;
  out.durationMs = payload["duration_ms"] | 0;
  return true;
}

void ackCommand(const ToyCommand& command, const char* status, const char* errorText = nullptr) {
  StaticJsonDocument<384> req;
  req["p_device_id"] = DEVICE_ID;
  req["p_device_token"] = DEVICE_TOKEN;
  req["p_command_id"] = command.id;
  req["p_status"] = status;
  if (errorText) {
    req["p_error_text"] = errorText;
  } else {
    req["p_error_text"] = nullptr;
  }

  String response;
  postRpc("ack_toy_command", req, response);
}

bool interruptibleDuration(int durationMs) {
  uint32_t endAt = millis() + static_cast<uint32_t>(durationMs);
  while (static_cast<int32_t>(endAt - millis()) > 0) {
    delay(200);

    ToyCommand stopCommand;
    if (claimCommand(stopCommand, true) && stopCommand.type == "stop") {
      Serial.println("[cmd] stop interrupted active command");
      sendStop();
      ackCommand(stopCommand, "done");
      return true;
    }
  }
  return false;
}

bool executePattern(const ToyCommand& command) {
  StaticJsonDocument<4096> doc;
  DeserializationError err = deserializeJson(doc, command.payloadJson);
  if (err) {
    Serial.printf("[json] pattern parse failed: %s\n", err.c_str());
    return false;
  }

  JsonArray steps = doc["steps"].as<JsonArray>();
  if (steps.isNull() || steps.size() == 0) {
    Serial.println("[cmd] pattern has no steps");
    return false;
  }

  for (JsonObject step : steps) {
    int vibe = step["vibe"] | 0;
    int ems = step["ems"] | 0;
    int suck = step["suck"] | 0;
    int ms = step["ms"] | 0;

    Serial.printf("[cmd] pattern step vibe=%d suck=%d ems=%d ms=%d\n", vibe, suck, ems, ms);
    if (!sendRuntimeSet(vibe, ems, suck)) {
      return false;
    }

    if (ms > 0 && interruptibleDuration(ms)) {
      return true;
    }
  }

  sendStop();
  return true;
}

void executeCommand(ToyCommand& command) {
  if (!connectToy()) {
    ackCommand(command, "error", lastBleError.length() ? lastBleError.c_str() : "connect_failed");
    return;
  }

  if (command.type == "stop") {
    bool ok = sendStop();
    ackCommand(command, ok ? "done" : "error", ok ? nullptr : "BLE stop failed");
    return;
  }

  if (command.type == "probe") {
    bool ok = sendStop();
    ackCommand(command, ok ? "done" : "error", ok ? nullptr : "stop_failed");
    return;
  }

  if (command.type == "set_all") {
    bool ok = sendRuntimeSet(command.vibe, command.ems, command.suck);
    if (!ok) {
      ackCommand(command, "error", "BLE set_all failed");
      return;
    }

    if (command.durationMs > 0) {
      bool interrupted = interruptibleDuration(command.durationMs);
      if (!interrupted) {
        sendStop();
      }
    }

    ackCommand(command, "done");
    return;
  }

  if (command.type == "set_one") {
    bool ok = sendSetOne(command.ch, command.value);
    if (!ok) {
      ackCommand(command, "error", "BLE set_one failed");
      return;
    }

    if (command.durationMs > 0) {
      bool interrupted = interruptibleDuration(command.durationMs);
      if (!interrupted) {
        sendStop();
      }
    }

    ackCommand(command, "done");
    return;
  }

  if (command.type == "pattern") {
    bool ok = executePattern(command);
    ackCommand(command, ok ? "done" : "error", ok ? nullptr : "BLE pattern failed");
    return;
  }

  ackCommand(command, "error", "unknown command type");
}

void runBleSelfTest() {
  Serial.println("[selftest] conservative BLE test starting");
  if (!connectToy()) {
    Serial.println("[selftest] BLE setup failed");
    return;
  }

  if (sendSetAll(5, 0, 0)) {
    delay(2000);
  }
  sendStop();
  Serial.println("[selftest] done");
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1200);

  Serial.println("\nElior Remote Touch MVP");
  NimBLEDevice::init("");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  connectWifi();

  if (RUN_BLE_SELF_TEST_ON_BOOT) {
    runBleSelfTest();
  }
}

void loop() {
  if (millis() - lastClaimAt < CLAIM_INTERVAL_MS) {
    delay(20);
    return;
  }
  lastClaimAt = millis();

  ToyCommand command;
  if (claimCommand(command, false)) {
    Serial.printf("[cmd] claimed %s type=%s\n", command.id.c_str(), command.type.c_str());
    executeCommand(command);
  }
}
