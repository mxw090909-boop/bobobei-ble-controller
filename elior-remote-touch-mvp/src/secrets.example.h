#pragma once

const char* WIFI_SSIDS[] = {
  "your-home-wifi",
  "your-office-wifi",
};

const char* WIFI_PASSWORDS[] = {
  "your-home-password",
  "your-office-password",
};

const size_t WIFI_NETWORK_COUNT = sizeof(WIFI_SSIDS) / sizeof(WIFI_SSIDS[0]);

const char* SUPABASE_URL = "https://your-project-ref.supabase.co";
const char* SUPABASE_KEY = "your-supabase-anon-or-publishable-key";

const char* DEVICE_ID = "your-device-id";
const char* DEVICE_TOKEN = "your-device-token";
