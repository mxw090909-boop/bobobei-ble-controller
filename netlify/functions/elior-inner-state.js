const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, error: "method not allowed" });
  }
  try {
    return await proxyJson({ path: "/api/elior/inner-state" });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
