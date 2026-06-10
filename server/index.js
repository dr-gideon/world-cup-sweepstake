import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { addParticipant, createDraw, getState, importAllowlist, initDb, lookupEmployee, removeParticipant, resetSweepstake, revealAll, revealNext, updateTeam } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 8097);
const distPath = resolve("dist");

initDb();
app.use(express.json({ limit: "1mb" }));

app.get("/api/state", (req, res) => res.json(getState()));
app.post("/api/allowlist", express.text({ type: ["text/*", "application/csv", "application/vnd.ms-excel"], limit: "2mb" }), wrap((req, res) => res.status(201).json(importAllowlist(req.body))));
app.get("/api/allowlist/lookup", wrap((req, res) => res.json(lookupEmployee(req.query.email))));
app.post("/api/participants", wrap((req, res) => res.status(201).json(addParticipant(req.body))));
app.delete("/api/participants/:id", wrap((req, res) => { removeParticipant(req.params.id); res.status(204).end(); }));
app.patch("/api/teams/:id", wrap((req, res) => { updateTeam(req.params.id, req.body); res.json(getState()); }));
app.post("/api/draw", wrap((req, res) => { createDraw(req.body?.seed); res.status(201).json(getState()); }));
app.post("/api/reveal-next", wrap((req, res) => { revealNext(); res.json(getState()); }));
app.post("/api/reveal-all", wrap((req, res) => { revealAll(); res.json(getState()); }));
app.post("/api/reset", wrap((req, res) => { resetSweepstake(); res.json(getState()); }));

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/.*/, (req, res) => res.sendFile(resolve(distPath, "index.html")));
}

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || "Unexpected error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`World Cup Sweepstake server listening on http://0.0.0.0:${port}`);
});

function wrap(handler) {
  return async (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
