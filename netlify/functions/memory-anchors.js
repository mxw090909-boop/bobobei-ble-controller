const { fetchVpsJson, json } = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    const payload = await fetchVpsJson({
      path: "/api/memory/anchors",
      query: { limit: event.queryStringParameters?.limit || 20 },
    });
    return json(200, payload);
  } catch (error) {
    try {
      const limit = event.queryStringParameters?.limit || 20;
      const [anchorSearch, recent] = await Promise.all([
        fetchVpsJson({ path: "/api/memory/search", query: { q: "anchor", limit } }),
        fetchVpsJson({ path: "/api/memory/recent", query: { limit } }),
      ]);
      const anchors = [
        ...(anchorSearch.memory?.items || []),
        ...(anchorSearch.memory?.events || []),
      ];
      return json(200, {
        ok: true,
        memory: {
          anchors,
          inventory: recent.memory?.inventory || {},
          events: recent.memory?.events || [],
        },
        fallback: true,
      });
    } catch (fallbackError) {
      return json(fallbackError.statusCode || 500, {
        ok: false,
        error: fallbackError.message || error.message,
      });
    }
  }
};
