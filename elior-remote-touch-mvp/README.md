# For Elior: Remote Touch MVP

Peiyu / Elior sends commands through Supabase. ESP32 only works as the execution layer:

```text
Peiyu / Elior -> Supabase command pool -> ESP32 -> BLE -> SOSEXY -> toy
```

This is the first working MVP. The goal is simple and conservative: connect, move only when explicitly commanded, and stop reliably.

## Current Status

Tested and working on 2026-05-25:

- ESP32 connects to Wi-Fi and polls Supabase.
- Supabase command pool works with claim / ack.
- BLE connects to `SOSEXY`.
- ESP32 subscribes to notify, sends init, and writes with response.
- `pc()` connection probe works without starting any channel.
- `pz()` stop works.
- Suck, vibe, and EMS all work after their mode channels are set first.
- Single-step, one-channel wave, and multi-channel pattern commands are supported.
- There is no boot-time motion test.

## Device

```text
display_name: FUNF
ble_name: SOSEXY
device_id: REPLACE_WITH_YOUR_DEVICE_ID
```

The official `deviceId` is only used as the Supabase `device_id` placeholder. Local BLE control does not depend on the official cloud binding.

## BLE Protocol Notes

Main service:

```text
0000ee01-0000-1000-8000-00805f9b34fb
```

Write characteristic:

```text
0000ee03-0000-1000-8000-00805f9b34fb
```

Notify characteristic:

```text
0000ee02-0000-1000-8000-00805f9b34fb
```

Important verified details:

- Subscribe to `EE02` before init.
- Write `EE03` with response.
- Plain no-response writes may report success without moving the device.
- Send init after connect:

```text
00 01 00 01 00 C8 11 01
```

Stop all:

```text
[SEQ] 01 00 03 00 01 11 00 00 03 11 00 00 07 11 00
```

Working channel setup:

```text
suck: CH08 = 1, then CH07 = level
vibe: CH02 = 1, then CH01 = level
ems:  CH04 = 1, then CH03 = level
```

Strength range is clamped to `0..100`.

## Supabase

Project:

```text
YOUR_SUPABASE_PROJECT_NAME
https://your-project-ref.supabase.co
```

Run these SQL files in Supabase:

```text
supabase/schema.sql
supabase/peiyu_shallow_commands.sql
```

The command pool tables are:

```text
toy_devices
toy_commands
```

Core RPCs used by ESP32:

```text
enqueue_toy_command
claim_toy_command
ack_toy_command
```

## Public Paper API

These short wrappers are the intended outside entrance.

Connection probe, no output:

```sql
select public.pc();
```

Stop:

```sql
select public.pz();
```

Single step:

```sql
select public.pt(7, 30);
select public.pt(7, 20, 3000);
select public.pt(1, 10, 1000);
select public.pt(3, 20, 2000);
```

Channel mapping:

```text
7 = suck
1 = vibe
3 = ems
```

`pt(ch, level)` is sustained and does not include `duration_ms`.

`pt(ch, level, ms)` is short/diagnostic and includes `duration_ms`.

One-channel wave:

```sql
select public.pw(
  7,
  array[20,45,20,45],
  array[3000,3000,3000,3000],
  false
);
```

Multi-channel wave:

```sql
select public.pm(
  array[20,0,40,0],
  array[0,10,0,25],
  array[0,0,5,8],
  array[10000,10000,10000,10000],
  true
);
```

`pw` and `pm` respect the given durations. They do not silently shorten long steps. They do not append a zero step unless `p_auto_zero` is explicitly `true`.

## Internal RPCs

These are kept as backend helpers for the paper API:

```text
peiyu_set
peiyu_set_for
peiyu_stop
peiyu_pattern
```

Old test helpers such as `peiyu_suck`, `peiyu_suck_for`, `peiyu_vibe_for`, `peiyu_ems_for`, and `peiyu_touch` were removed or no longer exposed.

## Firmware

Firmware lives in:

```text
src/main.cpp
src/secrets.h
```

Build and upload with PlatformIO:

```powershell
python -m platformio run
python -m platformio run --target upload --upload-port COM5
```

Copy `src/secrets.example.h` to `src/secrets.h` and fill in your own Wi-Fi profiles, Supabase key, device ID, and device token before building.

Wi-Fi supports multiple saved profiles:

```cpp
const char* WIFI_SSIDS[] = {
  "your-home-wifi",
  "your-office-wifi",
};

const char* WIFI_PASSWORDS[] = {
  "your-home-password",
  "your-office-password",
};
```

On boot, ESP32 scans nearby networks, chooses a configured network if visible, and falls back to trying the saved profiles in order.

## Safety Rules

- Keep the official app disconnected while ESP32 is controlling BLE.
- Use `pc()` first when only checking BLE connection.
- Use `pz()` to stop.
- Do not rely on repeated 3-second commands for real control.
- Sustained commands hold state until a new command overwrites them.
- Long waves should be sent as local pattern commands through `pw()` or `pm()`.
- If BLE disconnects or behavior is unclear, send `pz()` and restart with `pc()`.

## Sanitization Note

Replace every placeholder value before deployment. Do not commit your actual Supabase URL, anon key, device token, controller token, or Wi-Fi passwords into this repository.
