const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

const readEnv = (key) => {
  try {
    const value = globalThis.Netlify?.env?.get?.(key);
    if (value) return String(value);
  } catch (_) {}
  try {
    const value = globalThis.Deno?.env?.get?.(key);
    if (value) return String(value);
  } catch (_) {}
  return "";
};

const jsonResponse = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method not allowed" });
  }

  const base = readEnv("VPS_API_BASE").replace(/\/+$/, "");
  const token = readEnv("VPS_API_TOKEN").trim();
  const chatPath = readEnv("VPS_CHAT_PATH") || "/api/chat";

  if (!base || !token) {
    return jsonResponse(500, { ok: false, error: "VPS_API_BASE or VPS_API_TOKEN is not configured" });
  }

  const upstream = await fetch(`${base}${chatPath}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      "Accept": request.headers.get("Accept") || "application/x-ndjson, text/event-stream, application/json",
    },
    body: await request.text(),
  });

  const headers = new Headers(upstream.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");
  if (!headers.get("Content-Type")) {
    headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
};
