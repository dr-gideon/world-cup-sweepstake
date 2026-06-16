export async function buildMatchDramaSummary({ match, providerConfig = {} }) {
  const sourceKey = `match:${match.id}:${match.status}:${match.homeScore ?? ""}:${match.awayScore ?? ""}`;
  const fallback = {
    headline: `${match.homeCode} ${scoreText(match)} ${match.awayCode}: someone check on the ${match.awayCode} owner`,
    body: `${match.homeName} nicked it ${scoreText(match)} against ${match.awayName}. Not a disaster, unless your name is attached to ${match.awayName}, in which case: thoughts and prayers.`
  };
  return generateSummary({ sourceKey, fallback, context: { match }, providerConfig });
}

export async function buildManagerCommentDramaSummary({ sourceKey, candidate, providerConfig = {} }) {
  const managerTeam = candidate.teamName;
  const fallback = {
    headline: `${managerTeam} manager enters the evidence locker`,
    body: `Before kickoff: “${candidate.comment}”. Final score: ${candidate.homeCode} ${scoreText(candidate)} ${candidate.awayCode}. The Drama Feed will allow the office to draw its own conclusions.`
  };
  const context = {
    team: managerTeam,
    managerComment: candidate.comment,
    match: {
      stage: candidate.stage,
      home: candidate.homeName,
      away: candidate.awayName,
      score: `${candidate.homeScore} : ${candidate.awayScore}`,
      status: candidate.status
    }
  };
  return generateSummary({ sourceKey, fallback, context, providerConfig, promptOverride: MANAGER_COMMENT_PROMPT });
}

const DEFAULT_TELE_DRAMA_PROMPT = [
  "Write one short office-TV World Cup sweepstake roast for colleagues checking scores.",
  "Use only the supplied match, team, score, and team-status facts.",
  "Do not use or invent names, emails, departments, identities, job roles, or private details.",
  "Tone: funny, sarcastic, mildly insulting, dry, Irish/UK office banter. No profanity, slurs, cruelty, HR disasters, or invented facts.",
  "Make it punchy: headline max 12 words, body max 35 words. Tease the teams or the result only."
].join("\n");

const MANAGER_COMMENT_PROMPT = [
  "Write one short office-TV World Cup sweepstake Drama Feed item.",
  "The participant is a team manager. Use only the supplied team, manager comment, and match result.",
  "Do not use or invent names, emails, departments, identities, or private details.",
  "Tone: funny, sarcastic, dry, Irish/UK office banter. No profanity, slurs, cruelty, HR disasters, or invented facts.",
  "Make it punchy: headline max 12 words, body max 35 words. You may paraphrase the manager comment but keep it office-safe."
].join("\n");

export async function buildTeleSummary({ state, providerConfig = {}, openAiKey = "", model = "gpt-4o-mini" }) {
  const sourceKey = makeSourceKey(state);
  const fallback = fallbackSummary(state);
  return generateSummary({ sourceKey, fallback, context: compactContext(state), providerConfig: providerConfig.openRouterKey || providerConfig.openAiKey ? providerConfig : { openAiKey, model } });
}

async function generateSummary({ sourceKey, fallback, context, providerConfig, promptOverride = "" }) {
  const config = normaliseProviderConfig(providerConfig);
  if (!config.key) return { sourceKey, ...fallback, provider: "fallback" };
  try {
    const prompt = [
      promptOverride || config.prompt || DEFAULT_TELE_DRAMA_PROMPT,
      "Mandatory privacy rule: do not use or invent names, emails, departments, identities, job roles, companies, or private details.",
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
    const parsed = JSON.parse(extractJson(content));
    return { sourceKey, headline: String(parsed.headline || fallback.headline).slice(0, 100), body: String(parsed.body || fallback.body).slice(0, 240), provider: config.provider };
  } catch {
    return { sourceKey, ...fallback, provider: "fallback" };
  }
}

function extractJson(content) {
  const trimmed = String(content || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function normaliseProviderConfig(config = {}) {
  if (config.openRouterKey) return {
    provider: "openrouter",
    key: config.openRouterKey,
    model: config.openRouterModel || "openai/gpt-4o-mini",
    prompt: normalisePrompt(config.teleDramaPrompt),
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: { Authorization: `Bearer ${config.openRouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://world-cup-sweepstake.local", "X-Title": "World Cup Sweepstake" }
  };
  if (config.openAiKey) return {
    provider: "openai",
    key: config.openAiKey,
    model: config.model || config.openAiModel || "gpt-4o-mini",
    prompt: normalisePrompt(config.teleDramaPrompt),
    url: "https://api.openai.com/v1/chat/completions",
    headers: { Authorization: `Bearer ${config.openAiKey}`, "Content-Type": "application/json" }
  };
  return { provider: "fallback", key: "" };
}

function normalisePrompt(prompt) {
  return String(prompt || "").trim().replaceAll("\\n", "\n");
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
  if (winner) return { headline: `${winner.team.name} are in the €50 seat`, body: `${winner.team.flag} ${winner.team.name} are marked champion. The office prize race has a leader.` };
  if (latestMatch) return { headline: `${latestMatch.homeCode} ${scoreText(latestMatch)} ${latestMatch.awayCode}: office bragging rights updated`, body: `${latestMatch.homeName} vs ${latestMatch.awayName}. Someone is pretending not to care. Nobody believes them.` };
  return { headline: "No drama yet", body: "Add fixtures or update team statuses and the Tele screen will turn them into office sweepstake headlines." };
}

function compactContext(state) {
  const compactAssignment = (assignment) => ({
    team: assignment.team.name,
    status: assignment.team.status
  });
  return {
    matches: (state.matches || []).slice(-6),
    assignments: (state.assignments || []).map(compactAssignment).slice(0, 80),
    impacts: (state.audit || []).filter((event) => event.event === "Match impact").slice(0, 6).map(compactImpact),
    prizes: {
      winner: compactPrizeAssignment(state.assignments?.find((assignment) => assignment.team.status === "winner")),
      runnerUp: compactPrizeAssignment(state.assignments?.find((assignment) => assignment.team.status === "runner-up"))
    }
  };
}

function compactImpact(event) {
  const [teamStatus] = String(event.detail || "").split("|").map((part) => part.trim());
  return { at: event.at, detail: teamStatus };
}

function compactPrizeAssignment(assignment) {
  if (!assignment) return null;
  return {
    team: assignment.team.name,
    status: assignment.team.status
  };
}

function scoreText(match) {
  return `${match.homeScore ?? "-"} : ${match.awayScore ?? "-"}`;
}
