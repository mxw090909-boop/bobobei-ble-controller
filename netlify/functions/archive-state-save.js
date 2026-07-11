const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST" && event.httpMethod !== "PUT") {
    return json(405, { ok: false, error: "method not allowed" });
  }
  try {
    const payload = event.body ? JSON.parse(event.body) : {};
    return await proxyJson({ path: "/api/archive/state", method: "PUT", body: payload });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
