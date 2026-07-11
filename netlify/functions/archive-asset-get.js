const { buildUrl, getConfig, json } = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters && event.queryStringParameters.id;
    if (!id) return json(400, { ok: false, error: "missing asset id" });
    const { token } = getConfig();
    const response = await fetch(buildUrl(`/api/archive/assets/${encodeURIComponent(id)}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      statusCode: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
};
