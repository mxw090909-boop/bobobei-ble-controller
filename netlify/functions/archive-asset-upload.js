const { json, proxyJson, rewriteAssetUrl } = require("./_vps-proxy");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method not allowed" });
  }
  try {
    const payload = event.body ? JSON.parse(event.body) : {};
    const response = await proxyJson({ path: "/api/archive/assets", method: "POST", body: payload });
    const parsed = JSON.parse(response.body || "{}");
    if (parsed.asset) parsed.asset = rewriteAssetUrl(parsed.asset);
    return { ...response, body: JSON.stringify(parsed) };
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
