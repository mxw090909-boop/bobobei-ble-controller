const { fetchVpsJson, json } = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    const payload = await fetchVpsJson({
      path: "/api/activity/recent",
      query: { limit: event.queryStringParameters?.limit || 30 },
    });
    return json(200, payload);
  } catch (error) {
    try {
      const payload = await fetchVpsJson({
        path: "/api/memory/events/recent",
        query: { limit: event.queryStringParameters?.limit || 30 },
      });
      return json(200, {
        ok: true,
        events: payload.events || payload.memory?.events || [],
        audit: [],
        fallback: "memory-events",
      });
    } catch (fallbackError) {
      return json(fallbackError.statusCode || 500, {
        ok: false,
        error: fallbackError.message || error.message,
      });
    }
  }
};
