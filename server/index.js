import crypto from "node:crypto";
import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addParticipant, createDraw, getState, importAllowlist, initDb, lookupEmployee, removeParticipant, resetSweepstake, revealAll, revealNext, updateTeam } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 8097);
const distPath = resolve("dist");
const indexPath = resolve(distPath, "index.html");
const sessions = new Map();
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword) {
  console.error("ADMIN_PASSWORD is required. Set a strong admin password before starting the server.");
  process.exit(1);
}

initDb();
app.use(express.json({ limit: "1mb" }));

app.get("/api/state", (req, res) => res.json(getState()));
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
app.delete("/api/participants/:id", requireAdmin, wrap((req, res) => { removeParticipant(req.params.id); res.status(204).end(); }));
app.patch("/api/teams/:id", requireAdmin, wrap((req, res) => { updateTeam(req.params.id, req.body); res.json(getState()); }));
app.post("/api/draw", requireAdmin, wrap((req, res) => { createDraw(req.body?.seed); res.status(201).json(getState()); }));
app.post("/api/reveal-next", requireAdmin, wrap((req, res) => { revealNext(); res.json(getState()); }));
app.post("/api/reveal-all", requireAdmin, wrap((req, res) => { revealAll(); res.json(getState()); }));
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
});

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

function wrap(handler) {
  return async (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
