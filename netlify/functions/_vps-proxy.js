const json = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  },
  body: JSON.stringify(payload),
});

const getConfig = () => {
  const base = String(process.env.VPS_API_BASE || "").replace(/\/+$/, "");
  const token = String(process.env.VPS_API_TOKEN || "").trim();
  if (!base || !token) {
    throw new Error("VPS_API_BASE or VPS_API_TOKEN is not configured");
  }
  return { base, token };
};

const buildUrl = (path, query = {}) => {
  const { base } = getConfig();
  const url = new URL(`${base}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
};

const proxyJson = async ({ path, method = "GET", query = {}, body = undefined }) => {
  const { token } = getConfig();
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = { ok: false, error: text || "Invalid VPS response" };
  }
  return json(response.status, payload);
};

const fetchVpsJson = async ({ path, method = "GET", query = {}, body = undefined }) => {
  const { token } = getConfig();
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = { ok: false, error: text || "Invalid VPS response" };
  }
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `VPS API ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const encodeWindowId = (source, windowKey) => {
  const raw = JSON.stringify({ source: String(source || ""), windowKey: String(windowKey || "") });
  return `window_${Buffer.from(raw, "utf8").toString("base64url")}`;
};

const decodeWindowId = (id) => {
  const text = String(id || "");
  if (!text.startsWith("window_")) return null;
  try {
    const parsed = JSON.parse(Buffer.from(text.slice("window_".length), "base64url").toString("utf8"));
    if (!parsed || !parsed.windowKey) return null;
    return {
      source: String(parsed.source || ""),
      windowKey: String(parsed.windowKey || ""),
    };
  } catch (_) {
    return null;
  }
};

const getChatWindowKey = (chat = {}) => {
  const source = String(chat.source || "");
  const sourceRef = String(chat.source_ref || chat.sourceRef || "");
  if (sourceRef.startsWith("telegram:")) {
    const parts = sourceRef.split(":");
    if (parts.length >= 3) return parts.slice(0, 3).join(":");
  }
  if (sourceRef.startsWith("conversation:")) return sourceRef;
  if (sourceRef) return sourceRef;
  return String(chat.id || "");
};

const isConversationRecord = (chat = {}) => {
  const source = String(chat.source || "").toLowerCase();
  const sourceRef = String(chat.source_ref || chat.sourceRef || "").toLowerCase();
  if (!source && !sourceRef) return false;
  if (source.includes("anchor") || source.includes("memory_clean") || source.includes("codex_todo")) return false;
  if (source.includes("telegram")) return false;
  if (source === "gpt_export") return true;
  if (sourceRef.startsWith("conversation:")) return true;
  return false;
};

const getChatText = (chat = {}) => String(
  chat.content_text ||
  chat.content ||
  chat.preview ||
  chat.match_preview ||
  chat.matched_preview ||
  ""
).replace(/\s+/g, " ").trim();

const getChatTime = (chat = {}) => String(chat.updated_at || chat.created_at || chat.date || chat.observed_at || "");

const getChatTimestamp = (chat = {}) => {
  const value = Date.parse(getChatTime(chat));
  return Number.isFinite(value) ? value : 0;
};

const getWindowTitle = (group) => {
  const first = group.events[0] || {};
  const source = String(group.source || first.source || "");
  const title = String(first.title || "").trim();
  if (title && !/Telegram Codex turn/i.test(title)) return title;
  if (source === "telegram_codex") return "Telegram / Codex 对话";
  if (source === "gpt_export") return title || "GPT 对话";
  if (source === "codex_todo") return title || "Codex 事项";
  return title || source || "云端对话";
};

const groupChatEvents = (events = []) => {
  const groups = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== "object") continue;
    if (!isConversationRecord(event)) continue;
    const source = String(event.source || "");
    const windowKey = getChatWindowKey(event);
    if (!windowKey) continue;
    const groupId = `${source}\n${windowKey}`;
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        source,
        windowKey,
        events: [],
        latestTs: 0,
      });
    }
    const group = groups.get(groupId);
    group.events.push(event);
    group.latestTs = Math.max(group.latestTs, getChatTimestamp(event));
  }

  return Array.from(groups.values())
    .map((group) => {
      group.events.sort((a, b) => getChatTimestamp(a) - getChatTimestamp(b));
      const latest = group.events[group.events.length - 1] || {};
      const previewSource = [...group.events].reverse().find((item) => getChatText(item)) || latest;
      const preview = getChatText(previewSource).slice(0, 260);
      return {
        id: encodeWindowId(group.source, group.windowKey),
        source: group.source,
        source_ref: group.windowKey,
        title: getWindowTitle(group),
        date: getChatTime(latest),
        updated_at: getChatTime(latest),
        preview,
        tags: [group.source].filter(Boolean),
        message_count: group.events.reduce((count, item) => count + (Number(item.message_count) || 1), 0),
        event_count: group.events.length,
        partial: group.events.some((item) => item.partial),
      };
    })
    .sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
};

const parseTurnText = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return [];
  const matches = [...text.matchAll(/\b(user|assistant|system|tool):\s*/gi)];
  if (!matches.length) return [{ role: "conversation", text }];
  const messages = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const role = match[1].toLowerCase();
    const body = text.slice(match.index + match[0].length, next ? next.index : text.length).trim();
    if (body) messages.push({ role, text: body });
  }
  return messages.length ? messages : [{ role: "conversation", text }];
};

const buildChatDetailFromEvents = async (windowInfo, seedEvents = []) => {
  const events = [];
  for (const event of seedEvents) {
    if (!event || typeof event !== "object") continue;
    if (event.content_text || event.content || event.messages) {
      events.push(event);
      continue;
    }
    if (!event.id) {
      events.push(event);
      continue;
    }
    try {
      const detail = await fetchVpsJson({ path: `/api/chats/${encodeURIComponent(event.id)}` });
      events.push(detail.chat || event);
    } catch (_) {
      events.push(event);
    }
  }
  events.sort((a, b) => getChatTimestamp(a) - getChatTimestamp(b));

  const messages = [];
  for (const event of events) {
    const at = getChatTime(event);
    const rawMessages = Array.isArray(event.messages) && event.messages.length
      ? event.messages.flatMap((msg) => {
          const role = String(msg.role || msg.author || "conversation");
          const text = String(msg.text || msg.content || "");
          if (role === "conversation" && /\b(user|assistant|system|tool):\s*/i.test(text)) {
            return parseTurnText(text);
          }
          return [{ role, text }];
        })
      : parseTurnText(getChatText(event));
    rawMessages.forEach((msg) => {
      if (!msg.text) return;
      messages.push({
        role: msg.role,
        text: msg.text,
        at,
      });
    });
  }

  const first = events[0] || {};
  const latest = events[events.length - 1] || first;
  const content = messages.map((msg) => {
    const role = msg.role === "assistant" ? "裴郁" : msg.role === "user" ? "年年" : msg.role;
    return `${role}：${msg.text}`;
  }).join("\n");

  return {
    id: encodeWindowId(windowInfo.source, windowInfo.windowKey),
    source: windowInfo.source,
    source_ref: windowInfo.windowKey,
    title: getWindowTitle({ source: windowInfo.source, events }),
    date: getChatTime(latest),
    updated_at: getChatTime(latest),
    preview: getChatText(latest).slice(0, 260),
    content,
    messages,
    tags: [windowInfo.source].filter(Boolean),
    message_count: messages.length,
    event_count: events.length,
    partial: events.some((item) => item.partial),
  };
};

const rewriteAssetUrl = (asset) => {
  if (!asset || !asset.id) return asset;
  return {
    ...asset,
    url: `/.netlify/functions/archive-asset-get?id=${encodeURIComponent(asset.id)}`,
  };
};

module.exports = {
  buildUrl,
  buildChatDetailFromEvents,
  decodeWindowId,
  fetchVpsJson,
  getChatWindowKey,
  getConfig,
  groupChatEvents,
  isConversationRecord,
  json,
  proxyJson,
  rewriteAssetUrl,
};
