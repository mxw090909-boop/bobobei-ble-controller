const { fetchVpsJson, json } = require("./_vps-proxy");

exports.handler = async () => {
  try {
    const payload = await fetchVpsJson({ path: "/api/system/status" });
    return json(200, {
      ok: true,
      status: payload.status || payload.system || payload,
      source: "/api/system/status",
    });
  } catch (error) {
    try {
      const payload = await fetchVpsJson({ path: "/api/status" });
      return json(200, {
        ok: true,
        status: payload.status || payload.system || payload,
        source: "/api/status",
      });
    } catch (fallbackError) {
      return json(fallbackError.statusCode || 500, {
        ok: false,
        error: fallbackError.message || error.message,
      });
    }
  }
};
