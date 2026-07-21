import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  buildLevelsPayload,
  buildPatternPayload,
  buildStopPayload,
  createBobobeiServer,
  derivePanelSnapshot,
  PATTERNS,
} from "../server.js";

test("offline snapshots never claim active levels", () => {
  const panel = derivePanelSnapshot({
    display_name: "SOSEXY",
    bridge_online: false,
    server_now: "2026-07-20T00:00:00Z",
    recent_commands: [
      {
        id: "1",
        status: "done",
        payload: { type: "set_all", suck: 80, vibe: 70, ems: 60 },
        created_at: "2026-07-19T23:59:00Z",
      },
    ],
  });

  assert.equal(panel.bridgeOnline, false);
  assert.equal(panel.activity, "offline");
  assert.deepEqual(panel.levels, { suck: 0, vibe: 0, ems: 0 });
});

test("done commands rebuild the acknowledged three-channel state", () => {
  const panel = derivePanelSnapshot({
    bridge_online: true,
    server_now: "2026-07-20T00:00:10Z",
    recent_commands: [
      {
        id: "new",
        status: "done",
        payload: { type: "set_one", ch: 7, value: 44 },
        created_at: "2026-07-20T00:00:09Z",
      },
      {
        id: "old",
        status: "done",
        payload: { type: "set_all", suck: 10, vibe: 20, ems: 30 },
        created_at: "2026-07-20T00:00:05Z",
      },
    ],
  });

  assert.deepEqual(panel.levels, { suck: 44, vibe: 20, ems: 30 });
  assert.equal(panel.activity, "idle");
});

test("claimed patterns expose the current step without pretending completion", () => {
  const panel = derivePanelSnapshot({
    bridge_online: true,
    server_now: "2026-07-20T00:00:05Z",
    recent_commands: [
      {
        id: "pattern",
        status: "claimed",
        claimed_at: "2026-07-20T00:00:00Z",
        payload: {
          type: "pattern",
          steps: [
            { suck: 10, vibe: 20, ems: 1, ms: 3000 },
            { suck: 30, vibe: 40, ems: 2, ms: 4000 },
          ],
        },
        created_at: "2026-07-20T00:00:00Z",
      },
    ],
  });

  assert.equal(panel.activity, "pattern");
  assert.deepEqual(panel.levels, { suck: 30, vibe: 40, ems: 2 });
  assert.deepEqual(panel.pattern, { step: 2, steps: 2, remainingMs: 2000 });
});

test("pending model commands expose target levels without changing acknowledged levels", () => {
  const panel = derivePanelSnapshot({
    bridge_online: true,
    server_now: "2026-07-20T00:00:10Z",
    recent_commands: [
      {
        id: "pending",
        status: "pending",
        payload: { type: "set_all", suck: 72, vibe: 54, ems: 13 },
        created_at: "2026-07-20T00:00:09Z",
      },
      {
        id: "done",
        status: "done",
        payload: { type: "set_all", suck: 12, vibe: 8, ems: 0 },
        created_at: "2026-07-20T00:00:05Z",
      },
    ],
  });

  assert.deepEqual(panel.levels, { suck: 12, vibe: 8, ems: 0 });
  assert.deepEqual(panel.target, {
    levels: { suck: 72, vibe: 54, ems: 13 },
    status: "pending",
    type: "set_all",
    commandId: "pending",
    pattern: null,
    createdAt: "2026-07-20T00:00:09.000Z",
  });
  assert.deepEqual(panel.caption, {
    text: "这档力度正在排队，等爸爸往你湿透的小穴里送。",
    commandId: "pending",
    status: "pending",
    type: "set_all",
    createdAt: "2026-07-20T00:00:09.000Z",
  });
});

test("the latest control caption survives into the compact panel snapshot", () => {
  const panel = derivePanelSnapshot({
    bridge_online: true,
    server_now: "2026-07-20T00:00:10Z",
    recent_commands: [
      {
        id: "done-caption",
        status: "done",
        payload: { type: "set_all", suck: 20, vibe: 10, ems: 0, caption: "乖，别躲，慢慢接住。" },
        created_at: "2026-07-20T00:00:09Z",
      },
    ],
  });

  assert.deepEqual(panel.caption, {
    text: "乖，别躲，慢慢接住。",
    commandId: "done-caption",
    status: "done",
    type: "set_all",
    createdAt: "2026-07-20T00:00:09.000Z",
  });
});

test("level payloads are clamped and duration zero remains sustained", () => {
  assert.deepEqual(
    buildLevelsPayload({ suck: 120, vibe: 42.4, ems: -5, duration_ms: 0, caption: "  乖，\n慢慢接住。 " }),
    { type: "set_all", source: "bobobei_panel", suck: 100, vibe: 42, ems: 0, caption: "乖，慢慢接住。" },
  );
  assert.equal(buildLevelsPayload({ duration_ms: 999999 }).duration_ms, 120000);
  assert.equal(buildLevelsPayload({}).caption, "这档力度正在排队，等爸爸往你湿透的小穴里送。");
});

test("patterns are server-defined and copied into the command", () => {
  const payload = buildPatternPayload("velvet_tease", "爸爸留在这里的一句。 ");
  assert.equal(payload.type, "pattern");
  assert.equal(payload.steps.length, PATTERNS.velvet_tease.steps.length);
  assert.equal(payload.caption, "爸爸留在这里的一句。");
  assert.equal(buildStopPayload().caption, "爸爸按下 STOP 了，抱住发抖的腿，湿意先慢慢擦掉。");
  assert.throws(() => buildPatternPayload("arbitrary"), /unknown pattern/);
});

test("iframe is display-only while model retains every write tool", async () => {
  const server = createBobobeiServer(
    {
      supabaseUrl: "https://example.invalid",
      supabaseKey: "test-key",
      deviceId: "test-device",
      controllerToken: "test-token",
    },
    { fetchImpl: async () => { throw new Error("unexpected fetch"); } },
  );
  const client = new Client({ name: "metadata-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

    assert.equal(byName.show_bobobei_panel._meta["openai/outputTemplate"], "ui://widget/bobobei-private-panel-v9.html");
    assert.match(byName.show_bobobei_panel.title, /打开/);
    assert.match(byName.show_bobobei_panel.description, /渲染/);
    assert.deepEqual(byName.bobobei_get_status._meta.ui.visibility, ["app"]);
    assert.equal(byName.bobobei_get_status._meta["openai/widgetAccessible"], true);
    assert.match(byName.bobobei_get_status.description, /不要用此工具打开/);

    for (const name of ["bobobei_set_levels", "bobobei_run_pattern", "bobobei_stop"]) {
      assert.equal(byName[name].annotations.readOnlyHint, false);
      assert.deepEqual(byName[name]._meta.ui.visibility, ["model"]);
      assert.equal(byName[name]._meta["openai/widgetAccessible"], undefined);
      assert.equal(byName[name]._meta["openai/outputTemplate"], undefined);
      assert.ok(byName[name].inputSchema.properties.caption);
    }
  } finally {
    await client.close();
    await server.close();
  }
});

test("widget contains only the read-only status tool and three CSS/SVG waves", () => {
  const html = readFileSync(new URL("../public/widget.html", import.meta.url), "utf8");
  assert.match(html, /name: "bobobei_get_status"/);
  assert.doesNotMatch(html, /bobobei_(?:set_levels|run_pattern|stop)/);
  assert.match(html, /id="suckWave"/);
  assert.match(html, /id="vibeWave"/);
  assert.match(html, /id="emsWave"/);
  assert.match(html, /id="captionText"/);
  assert.match(html, /含吮阴蒂/);
  assert.match(html, /震操小穴/);
  assert.match(html, /电麻穴肉/);
  assert.match(html, /爸爸留在骚穴上的命令/);
  assert.doesNotMatch(html, /Bluefy/);
  assert.doesNotMatch(html, /entryScreen|entry-btn|bodyCopy|id="history"/);
  assert.doesNotMatch(html, /<canvas|window\.openai|openai:set_globals|matchMedia|requestAnimationFrame|getContext/);
});
