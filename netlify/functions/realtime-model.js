const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method not allowed" });
  }
  try {
    const payload = event.body ? JSON.parse(event.body) : {};
    return await proxyJson({ path: "/api/realtime/model", method: "POST", body: payload });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
