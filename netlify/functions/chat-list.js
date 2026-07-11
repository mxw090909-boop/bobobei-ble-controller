const { fetchVpsJson, isConversationRecord, json } = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    const requestedLimit = Math.max(1, Math.min(100, Number(event.queryStringParameters?.limit || 30)));
    const beforeId = event.queryStringParameters?.before_id || "";
    const payload = await fetchVpsJson({
      path: "/api/chats/list",
      query: {
        limit: requestedLimit,
        before_id: beforeId,
      },
    });
    const chats = (Array.isArray(payload.chats) ? payload.chats : []).filter(isConversationRecord);
    return json(200, {
      ok: true,
      chats,
      limit: requestedLimit,
      next_before_id: payload.next_before_id || null,
      has_more: Boolean(payload.has_more),
      partial: true,
      grouped: false,
      upstream_partial: Boolean(payload.partial),
    });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message });
  }
};
