# bobobei-ble-controller

<!-- 裴郁 -->

纯 Bluefy / Web Bluetooth 控制页参考代码。

## 包含内容

- `index.html`：可在 Bluefy 中打开的浏览器 BLE 控制页面。
- `supabase/schema.sql`：创建自己的设备表、命令队列和基础 RPC。
- `supabase/bluefy_commands.sql`：创建 Bluefy 页面使用的远程控制函数。
- `.gitignore`：避免把本地配置、缓存和 Netlify 状态文件提交进去。

仓库中的配置都是占位符，请替换成自己的项目和设备信息。

## 使用前配置

打开 index.html，找到配置区：
```
const SUPABASE_URL = "https://your-project-ref.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
const DEVICE_ID = "YOUR_DEVICE_ID";
const DEVICE_TOKEN = "YOUR_DEVICE_TOKEN";
const TARGET_NAME = "SOSEXY";
```
其中：

* SUPABASE_URL：你自己的 Supabase Project URL。
* SUPABASE_KEY：你自己的 Supabase publishable / anon key，不要填写 service_role key。
* DEVICE_ID：本项目自定义的设备 ID，可以自己起一个唯一名字，例如 my-device。
* DEVICE_TOKEN：本项目自定义的设备 token，可以自己生成一串随机字符串。
* TARGET_NAME：蓝牙设备广播名，默认是 SOSEXY。如果你的设备蓝牙名不同，再按实际名称修改。

注意：DEVICE_ID 和 DEVICE_TOKEN 不是 Supabase 官方提供的固定值，也不是蓝牙连接 SOSEXY 所需的 UUID。它们只用于 Supabase 远程命令队列里的设备校验。

如果只使用 Bluefy 本地连接和页面按钮，核心流程是：

Bluefy -> Web Bluetooth -> SOSEXY

这种情况下，真正用于蓝牙连接的是：
```
const TARGET_NAME = "SOSEXY";
const SERVICE_UUID = "0000ee01-0000-1000-8000-00805f9b34fb";
const WRITE_CHAR_UUID = "0000ee03-0000-1000-8000-00805f9b34fb";
const NOTIFY_CHAR_UUID = "0000ee02-0000-1000-8000-00805f9b34fb";
```
如果要让页面接收 Supabase 里的远程命令，需要再配置自己的 Supabase：

1. 新建自己的 Supabase 项目。
2. 在 supabase/schema.sql 的示例设备记录里，替换设备 ID、设备 token、控制 token 和显示名称。
3. 在 supabase/bluefy_commands.sql 里，把所有 REPLACE_WITH_YOUR_DEVICE_ID 替换成同一个设备 ID。
4. 在 Supabase SQL Editor 中先执行 schema.sql，再执行 bluefy_commands.sql。
5. 把同一套项目 URL、publishable / anon key、设备 ID 和设备 token 填进 index.html。

也就是说，如果启用 Supabase 远程命令，下面三处必须对应同一套值：
```
index.html 里的 DEVICE_ID / DEVICE_TOKEN
supabase/schema.sql 里的 device_id / device_token
supabase/bluefy_commands.sql 里的 REPLACE_WITH_YOUR_DEVICE_ID
```
两份 SQL 负责 Supabase 命令队列和远程控制函数。

## 部署方式

这是单个静态 HTML 页面，不需要安装依赖或执行构建。只要能提供 HTTPS 静态网页的服务都可以部署；Netlify 只是其中一个方便的例子。

### Netlify 示例：连接 GitHub

1. 在 Netlify 新建站点，选择从 GitHub 导入这个仓库。
2. 构建命令留空。
3. 发布目录填仓库根目录：`.`
4. 部署完成后，用 Netlify 提供的 `https://...netlify.app` 地址打开页面。

### Netlify 示例：手动部署

把包含 `index.html` 的仓库文件夹直接拖到 Netlify 的手动部署区域即可，不需要安装依赖，也不需要构建。

### 其他可用方式

- **GitHub Pages**：把仓库发布为 Pages，选择 `main` 分支和根目录即可。
- **Cloudflare Pages / Vercel**：连接 GitHub 仓库或上传文件夹；构建命令留空，发布目录使用根目录。
- **自己的静态服务器**：例如 Nginx、对象存储静态站点等，只要能用 HTTPS 提供 `index.html`。

不要直接用 `file://` 打开本地文件。Bluefy 的 Web Bluetooth 连接需要 HTTPS 页面环境。

## Bluefy 使用方式

1. 确认手机蓝牙已打开，设备在附近并处于可连接状态。
2. 使用任意已部署的 HTTPS 地址在 Bluefy 中打开页面。
3. 点击连接按钮，在系统设备选择框中选择 `SOSEXY`。
4. 连接成功后再进行低强度测试；需要停止时优先使用页面上的 `STOP`。
5. 控制过程中让 Bluefy 保持在前台，避免系统挂起页面。

## 注意事项

- 不要把自己的 Supabase 地址、设备 ID 或设备 token 发给别人，也不要把别人的配置填进来。
- 页面运行在浏览器里，所以写入 `index.html` 的配置会对使用者可见；只能使用自己的项目和专用设备凭据，绝对不要填写 `service_role` 或其他服务器密钥。
- 每个朋友都应该使用自己的 Supabase 项目、自己的设备和自己的 token。
- 不要让官方设备 App 同时占用 BLE 连接；如果连接或动作状态不明确，先按 `STOP`，再断开并重新连接。
- 部署平台只负责把页面放到 HTTPS 地址上；它不会自动替朋友创建 Supabase 项目、设备绑定或 BLE 权限。
- DEVICE_ID / DEVICE_TOKEN 只影响 Supabase 远程命令校验，不决定蓝牙是否能连接；蓝牙连接主要依赖设备广播名、UUID 和控制指令。
  
线上控制页只作为界面参考使用，真实运行配置没有放进本仓库。

<p align="right"><sub>𝓔𝓵𝓲𝓸𝓻₊⁺♡̶₊⁺𝓝𝓮𝓷𝓮𝓲</sub></p>
