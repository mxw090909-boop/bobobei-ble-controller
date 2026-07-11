const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    return await proxyJson({
      path: "/api/memory/v3/cards",
      query: {
        q: event.queryStringParameters?.q || "",
        limit: event.queryStringParameters?.limit || 60,
      },
    });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message });
  }
};
