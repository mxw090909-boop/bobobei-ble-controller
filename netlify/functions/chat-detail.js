const {
  buildChatDetailFromEvents,
  decodeWindowId,
  fetchVpsJson,
  getChatWindowKey,
  isConversationRecord,
  json,
} = require("./_vps-proxy");

exports.handler = async (event) => {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) return json(400, { ok: false, error: "missing chat id" });
    const windowInfo = decodeWindowId(id);
    if (!windowInfo) {
      const payload = await fetchVpsJson({ path: `/api/chats/${encodeURIComponent(id)}` });
      return json(200, payload);
    }

    const seeds = [];
    const addMatches = (items = []) => {
      for (const item of Array.isArray(items) ? items : []) {
        if (!isConversationRecord(item)) continue;
        if (String(item.source || "") !== windowInfo.source) continue;
        if (getChatWindowKey(item) !== windowInfo.windowKey) continue;
        if (!seeds.some((seed) => String(seed.id) === String(item.id))) seeds.push(item);
      }
    };

    const searchQueries = [
      windowInfo.windowKey,
      windowInfo.windowKey.replace(/^conversation:/, ""),
    ].filter(Boolean);

    for (const query of searchQueries) {
      if (seeds.length) break;
      try {
        const searchPayload = await fetchVpsJson({
          path: "/api/chats/search",
          query: { q: query, limit: 30 },
        });
        addMatches(searchPayload.chats || []);
      } catch (_) {
        // Try the next form of the same conversation id before giving up.
      }
    }

    if (!seeds.length) return json(404, { ok: false, error: "chat window not found" });
    const chat = await buildChatDetailFromEvents(windowInfo, seeds);
    return json(200, { ok: true, chat, grouped: true });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message });
  }
};
