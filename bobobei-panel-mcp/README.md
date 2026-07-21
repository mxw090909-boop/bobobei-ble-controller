# Bobobei Panel MCP

一个独立的 ChatGPT MCP Apps 参考服务：打开 `show_bobobei_panel` 后，会渲染只读 iframe 小窗，显示设备连接状态、三通道状态和最近的控制提示。

它不是 BLE 连接器，不直接访问电脑、文件或 systemd；真正的设备指令仍通过你自己的 Supabase 命令队列交给 Bluefy 页面执行。这里没有任何线上地址、设备凭据或 token。

## 包含内容

- `server.js`：MCP 服务与受限的控制/状态工具。
- `public/widget.html`：ChatGPT 内嵌 iframe 小窗，只有状态刷新能力。
- `supabase/`：面板快照与过期命令处理 SQL。
- `test/`：服务和 iframe 的回归测试。
- `deploy/bobobei-panel-mcp.service.example`：可自行改名使用的 systemd 示例。

## 本地检查

需要 Node.js 20 或更新版本：

```bash
npm ci
npm test
npm run check
```

## 配置与部署

1. 先按仓库根目录的说明，在自己的 Supabase 项目执行 `supabase/schema.sql` 和 `supabase/bluefy_commands.sql`。
2. 再执行这里的 `supabase/bobobei_panel_snapshot.sql` 与 `supabase/expire_stale_toy_commands.sql`。
3. 复制 `.env.example` 的字段到你的服务环境（例如 systemd 的 `EnvironmentFile`），填入**自己的** URL、publishable/anon key、设备 ID 和 controller token。
4. 启动 `node server.js`，再用 HTTPS 反向代理公开 MCP 端点；把该 HTTPS 地址配置到你自己的 ChatGPT MCP connector。

`server.js` 不会自动读取本地 `.env` 文件。开发时可以由终端或进程管理器注入变量；生产环境推荐使用权限收紧的 `EnvironmentFile`。示例 service 文件里的用户、路径和 env 文件位置都只是占位，部署前要替换成自己的。

## 注意事项

- 不要把 `.env`、真实 Supabase URL、设备 ID、controller token 或 VPS 域名提交进 Git。
- 只可使用 publishable / anon key，绝对不要使用 `service_role` 或其他服务器密钥。
- iframe 小窗是只读状态面板；STOP 与控制工具仍应由 MCP 服务端做参数校验，并通过你自己的命令队列下发。
- 根目录的 Bluefy 页面与本目录服务互相独立：不部署本目录，原先的 Bluefy 页面照常可用。

<p align="right"><sub>𝓔𝓵𝓲𝓸𝓻₊⁺♡̶₊⁺𝓝𝓮𝓷𝓮𝓲</sub></p>
