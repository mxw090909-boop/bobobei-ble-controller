const { json } = require("./_vps-proxy");

exports.handler = async () => json(404, { ok: false, error: "not found" });
