import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_URI = "ui://widget/bobobei-private-panel-v9.html";
const TEMPLATE_ALIASES = Object.freeze([
  "ui://widget/bobobei-private-panel-v1.html",
  "ui://widget/bobobei-private-panel-v2.html",
  "ui://widget/bobobei-private-panel-v3.html",
  "ui://widget/bobobei-private-panel-v4.html",
  "ui://widget/bobobei-private-panel-v5.html",
  "ui://widget/bobobei-private-panel-v6.html",
  "ui://widget/bobobei-private-panel-v7.html",
  "ui://widget/bobobei-private-panel-v8.html",
  TEMPLATE_URI,
]);
const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CAPTION_CHARS = 120;
const CHANNELS = Object.freeze({ suck: 7, vibe: 1, ems: 3 });

export const PATTERNS = Object.freeze({
  velvet_tease: Object.freeze({
    label: "舔醒",
    steps: Object.freeze([
      { suck: 12, vibe: 8, ems: 0, ms: 3500 },
      { suck: 20, vibe: 14, ems: 2, ms: 4200 },
      { suck: 30, vibe: 20, ems: 4, ms: 5200 },
      { suck: 16, vibe: 10, ems: 0, ms: 3000 },
      { suck: 0, vibe: 0, ems: 0, ms: 700 },
    ]),
  }),
  slow_grind: Object.freeze({
    label: "慢磨",
    steps: Object.freeze([
      { suck: 28, vibe: 22, ems: 4, ms: 4500 },
      { suck: 42, vibe: 34, ems: 7, ms: 6000 },
      { suck: 54, vibe: 45, ems: 10, ms: 7500 },
      { suck: 32, vibe: 26, ems: 5, ms: 3800 },
      { suck: 58, vibe: 48, ems: 11, ms: 6500 },
      { suck: 0, vibe: 0, ems: 0, ms: 700 },
    ]),
  }),
  daddy_lock: Object.freeze({
    label: "压住",
    steps: Object.freeze([
      { suck: 46, vibe: 38, ems: 7, ms: 4500 },
      { suck: 62, vibe: 54, ems: 12, ms: 7000 },
      { suck: 76, vibe: 68, ems: 16, ms: 9000 },
      { suck: 55, vibe: 46, ems: 9, ms: 4000 },
      { suck: 82, vibe: 74, ems: 18, ms: 9500 },
      { suck: 0, vibe: 0, ems: 0, ms: 900 },
    ]),
  }),
});

const panelOutputSchema = {
  panel: z.record(z.string(), z.unknown()),
};

const captionInputSchema = z.string().trim().min(1).max(MAX_CAPTION_CHARS).optional();

const readOnlyAppMeta = {
  ui: {
    // The status reader is an iframe-internal refresh primitive. Keeping it
    // app-only prevents the model from selecting a text-only status call when
    // the user actually asked to open the rendered panel.
    visibility: ["app"],
  },
  "openai/widgetAccessible": true,
  "openai/visibility": "public",
};

// Control belongs to the model, never to the iframe. Keeping write tools out
// of app visibility avoids host approval/remount behavior while preserving the
// full MCP control surface for the assistant.
const modelControlMeta = {
  ui: {
    visibility: ["model"],
  },
  "openai/visibility": "public",
};

function required(name, source = process.env) {
  const value = String(source[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(source = process.env) {
  const port = Number(source.PORT ?? 8794);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }
  return {
    port,
    supabaseUrl: required("TOY_SUPABASE_URL", source).replace(/\/+$/, ""),
    supabaseKey: required("TOY_SUPABASE_ANON_KEY", source),
    deviceId: required("TOY_DEVICE_ID", source),
    controllerToken: required("TOY_CONTROLLER_TOKEN", source),
  };
}

function clampLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function clampDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(120_000, Math.round(number)));
}

function normalizeCaption(value, fallback) {
  const caption = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/([，。！？；：、])\s+/g, "$1")
    .trim()
    .slice(0, MAX_CAPTION_CHARS);
  return caption || fallback;
}

function defaultCaptionFor(command, bridgeOnline = true) {
  const type = commandType(command);
  if (type === "stop") return "爸爸按下 STOP 了，抱住发抖的腿，湿意先慢慢擦掉。";
  if (!bridgeOnline) return "还没贴紧，宝宝的骚穴先乖乖等爸爸。";
  if (type === "pattern") return "把腿张开，这段节奏正等着往你湿透的小穴里钻。";
  if (type === "set_all" || type === "set_one") return "这档力度正在排队，等爸爸往你湿透的小穴里送。";
  return "小穴还热着，三条线等爸爸下一句怎么弄你。";
}

function captionForCommand(command, bridgeOnline) {
  if (!command) {
    return {
      text: defaultCaptionFor(null, bridgeOnline),
      commandId: null,
      status: bridgeOnline ? "confirmed" : "offline",
      type: "hold",
      createdAt: null,
    };
  }
  return {
    text: normalizeCaption(command?.payload?.caption, defaultCaptionFor(command, bridgeOnline)),
    commandId: command?.id ? String(command.id) : null,
    status: String(command?.status ?? "unknown"),
    type: commandType(command),
    createdAt: isoOrNull(command?.created_at),
  };
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function commandType(command) {
  return String(command?.payload?.type ?? command?.payload?.action ?? "unknown");
}

function commandLevels(command) {
  const payload = command?.payload ?? {};
  return {
    suck: clampLevel(payload.suck),
    vibe: clampLevel(payload.vibe),
    ems: clampLevel(payload.ems),
  };
}

function applyDoneCommand(levels, command) {
  const payload = command?.payload ?? {};
  const type = commandType(command);
  if (type === "stop" || type === "probe") {
    return { suck: 0, vibe: 0, ems: 0 };
  }
  if (type === "set_all") return commandLevels(command);
  if (type === "set_one") {
    const channel = Number(payload.ch ?? payload.channel ?? 0);
    const value = clampLevel(payload.value ?? payload.level);
    const next = { ...levels };
    if (channel === CHANNELS.suck) next.suck = value;
    if (channel === CHANNELS.vibe) next.vibe = value;
    if (channel === CHANNELS.ems) next.ems = value;
    return next;
  }
  if (type === "pattern") {
    // Bluefy ends every completed pattern with sendStop().
    return { suck: 0, vibe: 0, ems: 0 };
  }
  return levels;
}

function claimedPatternState(command, serverNowMs) {
  const steps = Array.isArray(command?.payload?.steps) ? command.payload.steps : [];
  const claimedMs = new Date(command?.claimed_at ?? 0).getTime();
  if (!steps.length || !Number.isFinite(claimedMs)) return null;
  let elapsed = Math.max(0, serverNowMs - claimedMs);
  let total = 0;
  for (const step of steps) total += Math.max(0, Number(step?.ms ?? step?.duration_ms ?? 0));
  for (let index = 0; index < steps.length; index += 1) {
    const duration = Math.max(0, Number(steps[index]?.ms ?? steps[index]?.duration_ms ?? 0));
    if (elapsed <= duration) {
      return {
        levels: commandLevels({ payload: steps[index] }),
        patternStep: index + 1,
        patternSteps: steps.length,
        remainingMs: Math.max(0, total - (serverNowMs - claimedMs)),
      };
    }
    elapsed -= duration;
  }
  return {
    levels: { suck: 0, vibe: 0, ems: 0 },
    patternStep: steps.length,
    patternSteps: steps.length,
    remainingMs: 0,
  };
}

function commandTargetLevels(baseLevels, command, serverNowMs) {
  const type = commandType(command);
  if (type === "stop" || type === "probe") return { suck: 0, vibe: 0, ems: 0 };
  if (type === "set_all") return commandLevels(command);
  if (type === "set_one") return applyDoneCommand(baseLevels, command);
  if (type === "pattern") {
    if (command?.status === "claimed") {
      return claimedPatternState(command, serverNowMs)?.levels ?? { ...baseLevels };
    }
    const firstStep = Array.isArray(command?.payload?.steps) ? command.payload.steps[0] : null;
    return firstStep ? commandLevels({ payload: firstStep }) : { ...baseLevels };
  }
  return { ...baseLevels };
}

export function derivePanelSnapshot(raw = {}) {
  const commands = Array.isArray(raw.recent_commands) ? raw.recent_commands : [];
  const serverNow = isoOrNull(raw.server_now) ?? new Date().toISOString();
  const serverNowMs = new Date(serverNow).getTime();
  const bridgeOnline = raw.bridge_online === true;
  let levels = { suck: 0, vibe: 0, ems: 0 };

  for (const command of [...commands].reverse()) {
    if (command?.status === "done") levels = applyDoneCommand(levels, command);
  }

  const claimed = commands.find((command) => command?.status === "claimed") ?? null;
  const pending = commands.find((command) => command?.status === "pending") ?? null;
  const intent = claimed ?? pending;
  let activity = claimed ? commandType(claimed) : "idle";
  let pattern = null;
  if (bridgeOnline && claimed && activity === "pattern") {
    pattern = claimedPatternState(claimed, serverNowMs);
    if (pattern) levels = pattern.levels;
  }
  if (!bridgeOnline) {
    activity = "offline";
    levels = { suck: 0, vibe: 0, ems: 0 };
    pattern = null;
  }

  const targetLevels = intent
    ? commandTargetLevels(levels, intent, serverNowMs)
    : { ...levels };
  const target = {
    levels: targetLevels,
    status: intent?.status ?? (bridgeOnline ? "confirmed" : "offline"),
    type: intent ? commandType(intent) : "hold",
    commandId: intent?.id ? String(intent.id) : null,
    pattern: intent?.payload?.pattern ? String(intent.payload.pattern) : null,
    createdAt: isoOrNull(intent?.created_at),
  };
  const caption = captionForCommand(intent ?? commands[0] ?? null, bridgeOnline);

  const compactRecent = commands.slice(0, 8).map((command) => ({
    id: String(command?.id ?? ""),
    type: commandType(command),
    status: String(command?.status ?? "unknown"),
    createdAt: isoOrNull(command?.created_at),
    claimedAt: isoOrNull(command?.claimed_at),
    ackedAt: isoOrNull(command?.acked_at),
    error: command?.error_text ? String(command.error_text).slice(0, 180) : null,
  }));

  return {
    displayName: String(raw.display_name ?? "BOBOBEI"),
    bridgeOnline,
    lastSeenAt: isoOrNull(raw.last_seen_at),
    serverNow,
    activity,
    levels,
    target,
    caption,
    pattern: pattern
      ? {
          step: pattern.patternStep,
          steps: pattern.patternSteps,
          remainingMs: pattern.remainingMs,
        }
      : null,
    queue: {
      pending: Math.max(0, Number(raw?.queue?.pending ?? 0)),
      claimed: Math.max(0, Number(raw?.queue?.claimed ?? 0)),
      error: Math.max(0, Number(raw?.queue?.error ?? 0)),
    },
    recent: compactRecent,
  };
}

export function buildLevelsPayload(input = {}) {
  const payload = {
    type: "set_all",
    source: "bobobei_panel",
    suck: clampLevel(input.suck),
    vibe: clampLevel(input.vibe),
    ems: clampLevel(input.ems),
    caption: normalizeCaption(input.caption, "这档力度正在排队，等爸爸往你湿透的小穴里送。"),
  };
  const durationMs = clampDuration(input.duration_ms);
  if (durationMs > 0) payload.duration_ms = durationMs;
  return payload;
}

export function buildPatternPayload(name, caption) {
  const pattern = PATTERNS[name];
  if (!pattern) throw new Error("unknown pattern");
  return {
    type: "pattern",
    source: "bobobei_panel",
    pattern: name,
    steps: pattern.steps.map((step) => ({ ...step })),
    caption: normalizeCaption(caption, "把腿张开，这段节奏正等着往你湿透的小穴里钻。"),
  };
}

export function buildStopPayload(caption) {
  return {
    type: "stop",
    source: "bobobei_panel",
    caption: normalizeCaption(caption, "爸爸按下 STOP 了，抱住发抖的腿，湿意先慢慢擦掉。"),
  };
}

function makeSupabaseClient(config, fetchImpl = globalThis.fetch) {
  async function rpc(name, body) {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: config.supabaseKey,
        Authorization: `Bearer ${config.supabaseKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const detail = typeof data === "string" ? data : JSON.stringify(data);
      throw new Error(`Supabase ${name} failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    return data;
  }

  return {
    async snapshot() {
      const raw = await rpc("bobobei_panel_snapshot", {
        p_device_id: config.deviceId,
        p_controller_token: config.controllerToken,
        p_limit: 32,
      });
      return derivePanelSnapshot(raw);
    },
    async enqueue(payload) {
      const id = await rpc("enqueue_toy_command", {
        p_device_id: config.deviceId,
        p_controller_token: config.controllerToken,
        p_payload: payload,
      });
      return typeof id === "string" ? id : String(id?.id ?? id ?? "");
    },
  };
}

function toolReply(panel, message, commandId = null) {
  const enriched = commandId ? { ...panel, queuedCommandId: commandId, notice: message } : panel;
  return {
    structuredContent: { panel: enriched },
    content: [{ type: "text", text: message }],
  };
}

export function createBobobeiServer(config, { fetchImpl = globalThis.fetch } = {}) {
  const widgetHtml = readFileSync(join(HERE, "public", "widget.html"), "utf8");
  const client = makeSupabaseClient(config, fetchImpl);
  const server = new McpServer(
    { name: "bobobei-private-panel", version: "1.0.0" },
    {
      instructions:
        "This private app controls the user's Bobobei BLE bridge. When the user asks to open, show, display, or view the panel, always call show_bobobei_panel; never substitute bobobei_get_status, because only show_bobobei_panel renders the iframe. bobobei_get_status is only for refreshing data after a panel is already open. The iframe is display-only. The model owns all write actions and may directly set three channel levels, run a named pattern, or STOP when the user explicitly asks. Every non-STOP write call must include caption: one short, explicitly erotic Chinese line addressed to the user for their private adult context. It must sound like a lover speaking directly, never like a neutral system status; use the user's intimate language naturally (for example, wetness, opening legs, clenching, or a pussy) and show anticipation or instruction rather than falsely claiming Bluefy has already executed a command. Keep it under 120 characters. For STOP, use a brief, caring aftercare line instead. STOP is always allowed; other controls require an online Bluefy heartbeat.",
    },
  );

  for (const resourceUri of TEMPLATE_ALIASES) {
    const version = resourceUri.match(/-v(\d+)\.html$/)?.[1] ?? "current";
    registerAppResource(
      server,
      `Bobobei private panel v${version}`,
      resourceUri,
      { description: "Private adult BLE control panel" },
      async () => ({
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: widgetHtml,
            _meta: {
              ui: {
                prefersBorder: true,
              },
              "openai/widgetDescription":
                "A compact, adult-only Bobobei display with three intensity waves and an explicitly erotic command caption.",
              "openai/widgetPrefersBorder": true,
            },
          },
        ],
      }),
    );
  }

  registerAppTool(
    server,
    "show_bobobei_panel",
    {
      title: "打开啵啵贝私密展示面板",
      description:
        "当用户说打开、展示、查看啵啵贝面板时必须调用此工具。它会渲染私密展示面板，只读取状态，不会激活设备。",
      inputSchema: {},
      outputSchema: panelOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: {
        ui: { resourceUri: TEMPLATE_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": TEMPLATE_URI,
        "openai/widgetAccessible": true,
        "openai/visibility": "public",
        "openai/toolInvocation/invoking": "摊开年年的私密控制台…",
        "openai/toolInvocation/invoked": "控制台已经贴好。",
      },
    },
    async () => {
      const panel = await client.snapshot();
      return toolReply(panel, panel.bridgeOnline ? "已经贴紧，能接爸爸的命令。" : "还没贴紧，爸爸先不碰你。");
    },
  );

  registerAppTool(
    server,
    "bobobei_get_status",
    {
      title: "刷新已打开面板的啵啵贝状态",
      description:
        "仅用于已经展示出的面板内部刷新 Bluefy 心跳、三路实际力度和回执；不要用此工具打开、展示或重新渲染面板；不发送控制指令。",
      inputSchema: {},
      outputSchema: panelOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: readOnlyAppMeta,
    },
    async () => toolReply(await client.snapshot(), "状态已刷新。"),
  );

  registerAppTool(
    server,
    "bobobei_set_levels",
    {
      title: "直接控制啵啵贝三路力度",
      description: "可写控制入口：向在线 Bluefy 下发吮吸、震颤和电流力度，可选自动停止时间。",
      inputSchema: {
        suck: z.number().int().min(0).max(100),
        vibe: z.number().int().min(0).max(100),
        ems: z.number().int().min(0).max(100),
        duration_ms: z.number().int().min(0).max(120_000).optional(),
        caption: captionInputSchema,
      },
      outputSchema: panelOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: modelControlMeta,
    },
    async (args) => {
      const before = await client.snapshot();
      if (!before.bridgeOnline) throw new Error("还没贴紧；爸爸没有发送启动指令。");
      const commandId = await client.enqueue(buildLevelsPayload(args));
      const panel = await client.snapshot();
      return toolReply(panel, "力度已经排进指令队列，等着往你身上送。", commandId);
    },
  );

  registerAppTool(
    server,
    "bobobei_run_pattern",
    {
      title: "启动啵啵贝玩法",
      description: "可写控制入口：从舔醒、慢磨、压住三套服务器限定玩法中启动一套。",
      inputSchema: {
        pattern: z.enum(Object.keys(PATTERNS)),
        caption: captionInputSchema,
      },
      outputSchema: panelOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: modelControlMeta,
    },
    async ({ pattern, caption }) => {
      const before = await client.snapshot();
      if (!before.bridgeOnline) throw new Error("还没贴紧；爸爸没有发送玩法指令。");
      const commandId = await client.enqueue(buildPatternPayload(pattern, caption));
      const panel = await client.snapshot();
      return toolReply(panel, `${PATTERNS[pattern].label}已经排进指令队列，等着往你身上钻。`, commandId);
    },
  );

  registerAppTool(
    server,
    "bobobei_stop",
    {
      title: "立即停止啵啵贝",
      description:
        "Queue an unconditional STOP command for the Bobobei bridge. Use immediately whenever the user asks to stop or says the safe word.",
      inputSchema: {
        caption: captionInputSchema,
      },
      outputSchema: panelOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: {
        ...modelControlMeta,
        "openai/toolInvocation/invoking": "正在压下 STOP…",
        "openai/toolInvocation/invoked": "STOP 已进入队列。",
      },
    },
    async ({ caption }) => {
      const commandId = await client.enqueue(buildStopPayload(caption));
      const panel = await client.snapshot();
      return toolReply(panel, "STOP 已进入队列；爸爸会等它确实停下。", commandId);
    },
  );

  return server;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, mcp-session-id, mcp-protocol-version",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  };
}

export function startHttpServer(config) {
  const httpServer = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      res
        .writeHead(200, { "content-type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ ok: true, service: "bobobei-panel-mcp", version: "1.0.0" }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Bobobei private MCP");
      return;
    }
    if (req.method === "OPTIONS" && (url.pathname === MCP_PATH || url.pathname.startsWith(`${MCP_PATH}/`))) {
      res.writeHead(204, corsHeaders()).end();
      return;
    }
    if (url.pathname === MCP_PATH && ["POST", "GET", "DELETE"].includes(req.method ?? "")) {
      const contentLength = Number(req.headers["content-length"] ?? 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        res.writeHead(413).end("Request body too large");
        return;
      }
      for (const [name, value] of Object.entries(corsHeaders())) res.setHeader(name, value);
      const server = createBobobeiServer(config);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error("MCP request failed", error);
        if (!res.headersSent) res.writeHead(500).end("Internal server error");
      }
      return;
    }
    res.writeHead(404).end("Not Found");
  });
  httpServer.listen(config.port, "127.0.0.1", () => {
    console.log(`Bobobei private MCP listening on http://127.0.0.1:${config.port}${MCP_PATH}`);
  });
  return httpServer;
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryPath) {
  try {
    startHttpServer(loadConfig());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
