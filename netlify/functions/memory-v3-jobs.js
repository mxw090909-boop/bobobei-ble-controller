const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    return await proxyJson({
      path: "/api/memory/v3/jobs",
      query: { limit: event.queryStringParameters?.limit || 40 },
    });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message });
  }
};
