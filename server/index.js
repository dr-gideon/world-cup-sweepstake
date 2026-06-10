import crypto from "node:crypto";
import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchFootballDataMatches } from "./football-data.js";
import { buildMatchDramaSummary, buildTeleSummary } from "./tele-summary.js";
import { addParticipant, createDraw, createTeleSummary, exportBackupJson, exportNotJoinedCsv, exportParticipantsCsv, getState, hasTeleSummary, importAllowlist, importFootballDataTeams, initDb, lookupEmployee, recordProviderSync, removeMatch, removeParticipant, resetSweepstake, revealAll, revealNext, syncFootballDataMatches, updateTeam, upsertMatch } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 8097);
const distPath = resolve("dist");
const indexPath = resolve(distPath, "index.html");
const sessions = new Map();
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
const scheduler = { enabled: process.env.FOOTBALL_DATA_AUTO_SYNC === "1", running: false, lastRunAt: "", lastMessage: "", timer: null };

if (!adminPassword) {
  console.error("ADMIN_PASSWORD is required. Set a strong admin password before starting the server.");
  process.exit(1);
}

initDb();
app.use(express.json({ limit: "1mb" }));

app.get("/api/state", (req, res) => res.json({ ...getState(), scheduler: schedulerStatus() }));
app.get("/api/auth/status", (req, res) => res.json({ authenticated: Boolean(getSession(req)) }));
app.post("/api/auth/login", wrap((req, res) => {
  const { username, password } = req.body || {};
  if (!safeEqual(String(username || ""), adminUser) || !safeEqual(String(password || ""), adminPassword)) {
    return res.status(401).json({ error: "Invalid admin username or password." });
  }
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { createdAt: Date.now() });
  res.setHeader("Set-Cookie", cookieHeader("sweepstake_admin", token));
  res.json({ ok: true });
}));
app.post("/api/auth/logout", (req, res) => {
  const token = getCookie(req, "sweepstake_admin");
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", cookieHeader("sweepstake_admin", "", 0));
  res.json({ ok: true });
});

app.get("/api/allowlist/lookup", wrap((req, res) => res.json(lookupEmployee(req.query.email))));
app.post("/api/participants", wrap((req, res) => res.status(201).json(addParticipant(req.body))));

app.post("/api/allowlist", requireAdmin, express.text({ type: ["text/*", "application/csv", "application/vnd.ms-excel"], limit: "2mb" }), wrap((req, res) => res.status(201).json(importAllowlist(req.body))));
app.get("/api/export/backup.json", requireAdmin, (req, res) => { res.setHeader("Content-Disposition", `attachment; filename=world-cup-sweepstake-backup-${dateStamp()}.json`); res.json(exportBackupJson()); });
app.get("/api/export/not-joined.csv", requireAdmin, (req, res) => sendCsv(res, `world-cup-sweepstake-not-joined-${dateStamp()}.csv`, exportNotJoinedCsv()));
app.get("/api/export/participants.csv", requireAdmin, (req, res) => sendCsv(res, `world-cup-sweepstake-participants-${dateStamp()}.csv`, exportParticipantsCsv()));
app.delete("/api/participants/:id", requireAdmin, wrap((req, res) => { removeParticipant(req.params.id); res.status(204).end(); }));
app.patch("/api/teams/:id", requireAdmin, wrap((req, res) => { updateTeam(req.params.id, req.body); res.json(getState()); }));
app.post("/api/draw", requireAdmin, wrap((req, res) => { createDraw(req.body?.seed); res.status(201).json(getState()); }));
app.post("/api/reveal-next", requireAdmin, wrap((req, res) => { revealNext(); res.json(getState()); }));
app.post("/api/reveal-all", requireAdmin, wrap((req, res) => { revealAll(); res.json(getState()); }));
app.post("/api/providers/football-data/import-teams", requireAdmin, wrap(async (req, res) => {
  const result = await fetchFootballDataMatches({
    apiKey: process.env.FOOTBALL_DATA_API_KEY,
    competition: process.env.FOOTBALL_DATA_COMPETITION || req.body?.competition || "WC",
    season: process.env.FOOTBALL_DATA_SEASON || req.body?.season || "2026",
    dateFrom: req.body?.dateFrom || "",
    dateTo: req.body?.dateTo || ""
  });
  if (result.throttling.low) {
    recordProviderSync("football-data", { status: "throttled", message: "Low Football-Data request budget; team import skipped.", requestsAvailable: result.throttling.requestsAvailable, resetSeconds: result.throttling.resetSeconds });
    return res.status(429).json(getState());
  }
  importFootballDataTeams(result.payload.matches || [], result.throttling);
  res.json(getState());
}));
app.post("/api/providers/football-data/sync", requireAdmin, wrap(async (req, res) => {
  await runFootballDataSync({ dateFrom: req.body?.dateFrom || "", dateTo: req.body?.dateTo || "", manual: true });
  res.json({ ...getState(), scheduler: schedulerStatus() });
}));
app.post("/api/tele-summary/generate", requireAdmin, wrap(async (req, res) => {
  const summary = await buildTeleSummary({ state: getState(), providerConfig: llmConfig() });
  createTeleSummary(summary);
  res.json(getState());
}));
app.post("/api/matches", requireAdmin, wrap((req, res) => { upsertMatch(req.body || {}); res.status(201).json(getState()); }));
app.patch("/api/matches/:id", requireAdmin, wrap((req, res) => { upsertMatch({ ...(req.body || {}), id: req.params.id }); res.json(getState()); }));
app.delete("/api/matches/:id", requireAdmin, wrap((req, res) => { removeMatch(req.params.id); res.status(204).end(); }));
app.post("/api/reset", requireAdmin, wrap((req, res) => { resetSweepstake(); res.json(getState()); }));

app.use("/tele", (req, res, next) => { if (req.method !== "GET") return next(); res.type("html").send(readFileSync(indexPath, "utf8")); });
app.use("/admin", (req, res, next) => { if (req.method !== "GET") return next(); res.type("html").send(readFileSync(indexPath, "utf8")); });

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.type("html").send(readFileSync(indexPath, "utf8"));
  });
}

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || "Unexpected error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`World Cup Sweepstake server listening on http://0.0.0.0:${port}`);
  startFootballDataScheduler();
});

function startFootballDataScheduler() {
  if (!scheduler.enabled) return;
  if (!process.env.FOOTBALL_DATA_API_KEY) {
    scheduler.lastMessage = "FOOTBALL_DATA_AUTO_SYNC enabled but FOOTBALL_DATA_API_KEY is missing.";
    console.warn(scheduler.lastMessage);
    return;
  }
  const intervalMinutes = Math.max(5, Number(process.env.FOOTBALL_DATA_SYNC_INTERVAL_MINUTES || 15));
  scheduler.lastMessage = `Football-Data auto-sync enabled every ${intervalMinutes} minutes.`;
  scheduler.timer = setInterval(() => runFootballDataSync({ manual: false }).catch((error) => {
    scheduler.lastMessage = error.message;
    console.warn("Football-Data auto-sync failed:", error.message);
  }), intervalMinutes * 60 * 1000);
}

async function runFootballDataSync({ dateFrom = "", dateTo = "", manual = false } = {}) {
  if (scheduler.running) {
    if (manual) throw Object.assign(new Error("Football-Data sync already running."), { status: 409 });
    return;
  }
  scheduler.running = true;
  try {
    const result = await fetchFootballDataMatches({
      apiKey: process.env.FOOTBALL_DATA_API_KEY,
      competition: process.env.FOOTBALL_DATA_COMPETITION || "WC",
      season: process.env.FOOTBALL_DATA_SEASON || "2026",
      dateFrom,
      dateTo
    });
    if (result.throttling.low) {
      recordProviderSync("football-data", { status: "throttled", message: "Low Football-Data request budget; sync skipped.", requestsAvailable: result.throttling.requestsAvailable, resetSeconds: result.throttling.resetSeconds });
      scheduler.lastRunAt = new Date().toISOString();
      scheduler.lastMessage = "Skipped sync due to low Football-Data request budget.";
      if (manual) throw Object.assign(new Error(scheduler.lastMessage), { status: 429 });
      return;
    }
    const sync = syncFootballDataMatches(result.payload.matches || [], result.throttling);
    const drama = await generateDramaForFinishedMatches();
    scheduler.lastRunAt = new Date().toISOString();
    scheduler.lastMessage = `Imported ${sync.imported}, skipped ${sync.skipped}, status updates ${sync.statusUpdates || 0}, drama ${drama}.`;
  } finally {
    scheduler.running = false;
  }
}

async function generateDramaForFinishedMatches() {
  const state = getState();
  const finished = (state.matches || []).filter((match) => match.status === "finished").slice(-12);
  let generated = 0;
  for (const match of finished) {
    const sourceKey = `match:${match.id}:${match.status}:${match.homeScore ?? ""}:${match.awayScore ?? ""}`;
    if (hasTeleSummary(sourceKey)) continue;
    const summary = await buildMatchDramaSummary({ match, providerConfig: llmConfig() });
    createTeleSummary(summary);
    generated += 1;
  }
  return generated;
}

function llmConfig() {
  return {
    openRouterKey: process.env.OPENROUTER_API_KEY || "",
    openRouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    openAiKey: process.env.OPENAI_API_KEY || "",
    openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini"
  };
}

function schedulerStatus() {
  return { enabled: scheduler.enabled, running: scheduler.running, lastRunAt: scheduler.lastRunAt, lastMessage: scheduler.lastMessage };
}

function requireAdmin(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: "Admin login required." });
  next();
}

function getSession(req) {
  const token = getCookie(req, "sweepstake_admin");
  if (!token || !sessions.has(token)) return null;
  return sessions.get(token);
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return "";
}

function cookieHeader(name, value, maxAge = 60 * 60 * 8) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (process.env.COOKIE_SECURE === "1") attrs.push("Secure");
  return attrs.join("; ");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sendCsv(res, filename, csv) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.send(csv);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function wrap(handler) {
  return async (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
