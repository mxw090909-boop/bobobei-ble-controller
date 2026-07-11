# bobobei-ble-controller

Sanitized reference bundle for the Bobobei Bluefy BLE controller.

This repository contains:

- `index.html`: the standalone Bluefy/Web Bluetooth control page.
- `elior-remote-touch-mvp/`: the ESP32 firmware, PlatformIO settings, BLE protocol notes, and Supabase SQL command flow.
- `.gitignore`: keeps local secrets, firmware build output, and Netlify state out of Git.

Before using the page, replace the four placeholders near the configuration block in `index.html` with values from your own Supabase project and your own device. Do not reuse anyone else's project, device token, or Wi-Fi credentials.

The live Netlify page was used only as the UI reference. Its runtime values are not included here.
