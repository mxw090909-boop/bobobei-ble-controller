const { json, proxyJson } = require("./_vps-proxy");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST" && event.httpMethod !== "PUT") {
    return json(405, { ok: false, error: "method not allowed" });
  }
  try {
    const payload = event.body ? JSON.parse(event.body) : undefined;
    return await proxyJson({
      path: "/api/elior/memo",
      method: event.httpMethod === "GET" ? "GET" : "PUT",
      body: event.httpMethod === "GET" ? undefined : payload,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
