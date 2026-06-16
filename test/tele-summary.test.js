import assert from "node:assert/strict";
import test from "node:test";
import { buildTeleSummary } from "../server/tele-summary.js";

const privateState = {
  matches: [{ id: "match-1", status: "finished", homeName: "Iran", awayName: "New Zealand", homeCode: "IRN", awayCode: "NZL", homeScore: 2, awayScore: 2, updatedAt: "2026-06-16T01:00:00Z" }],
  assignments: [
    { team: { name: "Iran", status: "alive" }, participant: { name: "Alice Murphy", department: "Finance" } },
    { team: { name: "New Zealand", status: "winner" }, participant: { name: "Bob Lee", department: "Legal Services" } }
  ],
  audit: [{ at: "2026-06-16T01:05:00Z", event: "Match impact", detail: "Iran alive | Alice Murphy · Finance" }]
};

test("Tele LLM prompt excludes private identity and department context", async () => {
  const originalFetch = globalThis.fetch;
  let prompt = "";
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    prompt = body.messages[0].content;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ headline: "Draw drama", body: "Iran and New Zealand split the points." }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await buildTeleSummary({ state: privateState, providerConfig: { openAiKey: "test-key" } });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.doesNotMatch(prompt, /Alice Murphy|Bob Lee|Finance|Legal Services/);
  assert.match(prompt, /Mandatory privacy rule/);
});

test("Tele fallback summary does not expose participant names", async () => {
  const summary = await buildTeleSummary({ state: privateState });
  assert.doesNotMatch(`${summary.headline} ${summary.body}`, /Alice Murphy|Bob Lee/);
});
