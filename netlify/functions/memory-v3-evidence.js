const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    return await proxyJson({
      path: "/api/memory/v3/evidence",
      query: {
        card_id: event.queryStringParameters?.card_id || "",
        limit: event.queryStringParameters?.limit || 20,
      },
    });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message });
  }
};
