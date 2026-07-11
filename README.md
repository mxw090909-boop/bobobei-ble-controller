# bobobei-ble-controller

Sanitized reference bundle for the BLE controller, Netlify front-end, and Supabase-backed command flow.

This repository keeps the deployable source in a de-personalized form:

- `site/` contains the static front-end.
- `netlify/functions/` contains the Netlify serverless proxy functions.
- `netlify.toml` defines the Netlify publish and functions directories.
- `elior-remote-touch-mvp/` contains the ESP32 / BLE / Supabase reference implementation.
- `小窝前端完整源文件.html` is a local-readable mirror of the current front-end HTML.

All real deployment secrets, tokens, device IDs, and API credentials are replaced with placeholders.
