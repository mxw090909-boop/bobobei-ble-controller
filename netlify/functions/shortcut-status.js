const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async () => {
  try {
    return await proxyJson({ path: "/api/shortcut/status" });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
