# bobobei-ble-controller

这是裴郁整理的一份纯 Bluefy / Web Bluetooth 控制页参考代码。

## 包含内容

- `index.html`：可在 Bluefy 中打开的浏览器 BLE 控制页面。
- `.gitignore`：避免把本地配置、缓存和 Netlify 状态文件提交进去。

本仓库不包含 ESP32 固件、PlatformIO 工程、Wi-Fi 配置、Supabase 数据库 SQL，也不包含任何线上项目的真实 token。

## 使用前配置

打开 `index.html`，找到配置区，把下面四项替换成你自己的值：

```js
const SUPABASE_URL = "https://your-project-ref.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
const DEVICE_ID = "YOUR_DEVICE_ID";
const DEVICE_TOKEN = "YOUR_DEVICE_TOKEN";
```

`TARGET_NAME` 默认是 `SOSEXY`，如果你的设备广播名称不同，再按实际名称修改。

Supabase 远程命令监听是页面里的可选能力；如果只使用 Bluefy 本地连接和页面按钮，核心流程是：

```text
Bluefy -> Web Bluetooth -> SOSEXY
```

## 部署到 Netlify

### 方式一：连接 GitHub

1. 在 Netlify 新建站点，选择从 GitHub 导入这个仓库。
2. 构建命令留空。
3. 发布目录填仓库根目录：`.`
4. 部署完成后，用 Netlify 提供的 `https://...netlify.app` 地址打开页面。

### 方式二：手动部署

把包含 `index.html` 的仓库文件夹直接拖到 Netlify 的手动部署区域即可，不需要安装依赖，也不需要构建。

## Bluefy 使用方式

1. 确认手机蓝牙已打开，设备在附近并处于可连接状态。
2. 使用 HTTPS 的 Netlify 地址在 Bluefy 中打开页面。
3. 点击连接按钮，在系统设备选择框中选择 `SOSEXY`。
4. 连接成功后再进行低强度测试；需要停止时优先使用页面上的 `STOP`。
5. 控制过程中让 Bluefy 保持在前台，避免系统挂起页面。

## 注意事项

- 不要把自己的 Supabase 地址、设备 ID 或设备 token 发给别人，也不要把别人的配置填进来。
- 页面运行在浏览器里，所以写入 `index.html` 的配置会对使用者可见；只能使用自己的项目和专用设备凭据，绝对不要填写 `service_role` 或其他服务器密钥。
- 每个朋友都应该使用自己的 Supabase 项目、自己的设备和自己的 token。
- 不要让官方设备 App 同时占用 BLE 连接；如果连接或动作状态不明确，先按 `STOP`，再断开并重新连接。
- Netlify 线上页面只是部署页面；它不会自动替朋友创建 Supabase 项目、设备绑定或 BLE 权限。

线上控制页只作为界面参考使用，真实运行配置没有放进本仓库。
