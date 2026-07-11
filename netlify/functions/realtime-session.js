const { fetchVpsJson, json } = require("./_vps-proxy");

const rewriteUrl = (value = "", assetId = "") => {
  const raw = String(value || "").trim();
  if (!raw && assetId) return `/.netlify/functions/archive-asset-get?id=${encodeURIComponent(assetId)}`;
  if (!raw) return raw;
  if (raw.startsWith("/.netlify/functions/archive-asset-get")) return raw;
  try {
    const parsed = new URL(raw, "https://example.com");
    const foundId = parsed.searchParams.get("id") || assetId;
    if (foundId) return `/.netlify/functions/archive-asset-get?id=${encodeURIComponent(foundId)}`;
  } catch (_) {
    if (assetId) return `/.netlify/functions/archive-asset-get?id=${encodeURIComponent(assetId)}`;
  }
  return raw;
};

const rewriteMessageAsset = (message = {}) => {
  if (!message || typeof message !== "object") return message;
  const next = { ...message };
  if (next.asset_url || next.asset_id) next.asset_url = rewriteUrl(next.asset_url, next.asset_id);
  if (next.url || next.asset_id) next.url = rewriteUrl(next.url, next.asset_id);
  return next;
};

exports.handler = async (event) => {
  try {
    const payload = await fetchVpsJson({
      path: "/api/realtime/session",
      query: {
        session: event.queryStringParameters?.session || "",
        user_id: event.queryStringParameters?.user_id || "",
      },
    });
    const messages = (Array.isArray(payload.messages) ? payload.messages : []).map(rewriteMessageAsset);
    const session = payload.session && typeof payload.session === "object"
      ? {
          ...payload.session,
          messages: (Array.isArray(payload.session.messages) ? payload.session.messages : []).map(rewriteMessageAsset),
        }
      : null;
    return json(200, {
      ...payload,
      messages,
      session,
    });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message });
  }
};
