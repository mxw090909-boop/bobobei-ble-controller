const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    return await proxyJson({
      path: "/api/memory/search",
      query: {
        q: event.queryStringParameters?.q || "",
        limit: event.queryStringParameters?.limit || 20,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
