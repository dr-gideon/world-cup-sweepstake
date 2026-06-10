export async function buildMatchDramaSummary({ match, providerConfig = {} }) {
  const sourceKey = `match:${match.id}:${match.status}:${match.homeScore ?? ""}:${match.awayScore ?? ""}`;
  const fallback = {
    headline: `${match.homeCode} ${scoreText(match)} ${match.awayCode}`,
    body: `${match.stage} result: ${match.homeName} ${scoreText(match)} ${match.awayName}. The office sweepstake board has another result to chew on.`
  };
  return generateSummary({ sourceKey, fallback, context: { match }, providerConfig });
}

export async function buildTeleSummary({ state, providerConfig = {}, openAiKey = "", model = "gpt-4o-mini" }) {
  const sourceKey = makeSourceKey(state);
  const fallback = fallbackSummary(state);
  return generateSummary({ sourceKey, fallback, context: compactContext(state), providerConfig: providerConfig.openRouterKey || providerConfig.openAiKey ? providerConfig : { openAiKey, model } });
}

async function generateSummary({ sourceKey, fallback, context, providerConfig }) {
  const config = normaliseProviderConfig(providerConfig);
  if (!config.key) return { sourceKey, ...fallback, provider: "fallback" };
  try {
    const prompt = [
      "Write a short office-safe World Cup sweepstake TV drama summary.",
      "Tone: fun, sharp, but kind. No profanity. Do not invent facts.",
      "Return JSON only with keys headline and body.",
      `Context: ${JSON.stringify(context).slice(0, 5000)}`
    ].join("\n");
    const response = await fetch(config.url, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: prompt }], temperature: 0.8, max_tokens: 180 })
    });
    if (!response.ok) throw new Error(`LLM request failed: ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content.replace(/^```json\s*/i, "").replace(/```$/i, ""));
    return { sourceKey, headline: String(parsed.headline || fallback.headline).slice(0, 120), body: String(parsed.body || fallback.body).slice(0, 360), provider: config.provider };
  } catch {
    return { sourceKey, ...fallback, provider: "fallback" };
  }
}

function normaliseProviderConfig(config = {}) {
  if (config.openRouterKey) return {
    provider: "openrouter",
    key: config.openRouterKey,
    model: config.openRouterModel || "openai/gpt-4o-mini",
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: { Authorization: `Bearer ${config.openRouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://world-cup-sweepstake.local", "X-Title": "World Cup Sweepstake" }
  };
  if (config.openAiKey) return {
    provider: "openai",
    key: config.openAiKey,
    model: config.model || config.openAiModel || "gpt-4o-mini",
    url: "https://api.openai.com/v1/chat/completions",
    headers: { Authorization: `Bearer ${config.openAiKey}`, "Content-Type": "application/json" }
  };
  return { provider: "fallback", key: "" };
}

function makeSourceKey(state) {
  const latestMatch = state.matches?.at(-1);
  const latestImpact = state.audit?.find((event) => event.event === "Match impact");
  return JSON.stringify({ match: latestMatch?.updatedAt || latestMatch?.id || "none", impact: latestImpact?.at || "none" });
}

function fallbackSummary(state) {
  const latestMatch = [...(state.matches || [])].reverse().find((match) => match.status === "finished" || match.status === "live") || state.matches?.[0];
  const winner = state.assignments?.find((assignment) => assignment.team.status === "winner");
  const runner = state.assignments?.find((assignment) => assignment.team.status === "runner-up");
  if (winner) return { headline: `${winner.participant.name} is in the €50 seat`, body: `${winner.team.flag} ${winner.team.name} are marked champion. The office prize race has a leader.` };
  if (latestMatch) return { headline: `${latestMatch.homeCode} ${scoreText(latestMatch)} ${latestMatch.awayCode}`, body: `${latestMatch.stage} update: ${latestMatch.homeName} vs ${latestMatch.awayName}. ${runner ? `${runner.participant.name} is tracking the runner-up prize.` : "Prize positions are still waiting for the final."}` };
  return { headline: "No drama yet", body: "Add fixtures or update team statuses and the Tele screen will turn them into office sweepstake headlines." };
}

function compactContext(state) {
  return {
    matches: (state.matches || []).slice(-6),
    impacts: (state.audit || []).filter((event) => event.event === "Match impact").slice(0, 6),
    prizes: {
      winner: state.assignments?.find((assignment) => assignment.team.status === "winner") || null,
      runnerUp: state.assignments?.find((assignment) => assignment.team.status === "runner-up") || null
    }
  };
}

function scoreText(match) {
  return `${match.homeScore ?? "-"} : ${match.awayScore ?? "-"}`;
}
