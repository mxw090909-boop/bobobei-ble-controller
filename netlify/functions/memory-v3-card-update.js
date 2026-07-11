const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  if (event.httpMethod !== "PATCH") {
    return json(405, { ok: false, error: "method not allowed" });
  }
  try {
    const id = String(event.queryStringParameters?.id || "").trim();
    if (!id) return json(400, { ok: false, error: "id is required" });
    const body = event.body ? JSON.parse(event.body) : {};
    return await proxyJson({
      path: `/api/memory/v3/cards/${encodeURIComponent(id)}`,
      method: "PATCH",
      body,
    });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message });
  }
};
