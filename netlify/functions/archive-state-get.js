const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async () => {
  try {
    return await proxyJson({ path: "/api/archive/state" });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
