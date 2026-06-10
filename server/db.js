import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_TEAMS } from "../src/teams.js";
import { hydrateAssignments, runDraw } from "../src/draw.js";

const DB_PATH = resolve(process.env.SWEEPSTAKE_DB || "data/sweepstake.sqlite");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      flag TEXT NOT NULL,
      pot INTEGER NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS draws (
      id TEXT PRIMARY KEY,
      seed TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reveal_index INTEGER NOT NULL DEFAULT -1
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      draw_id TEXT NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id),
      participant_id TEXT NOT NULL REFERENCES participants(id),
      draw_index INTEGER NOT NULL,
      revealed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      event TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT ''
    );
  `);
  const count = db.prepare("SELECT COUNT(*) AS count FROM teams").get().count;
  if (count !== 48) {
    db.exec("DELETE FROM assignments; DELETE FROM draws; DELETE FROM teams;");
    const insert = db.prepare("INSERT INTO teams (id, name, code, flag, pot, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)");
    db.exec("BEGIN");
    try {
      for (const team of DEFAULT_TEAMS) insert.run(team.id, team.name, team.code, team.flag, team.pot, team.status, team.note || "");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    audit("Team slots seeded", "48 World Cup team slots ready");
  }
}

export function audit(event, detail = "") {
  db.prepare("INSERT INTO audit_events (at, event, detail) VALUES (?, ?, ?)").run(new Date().toISOString(), event, detail);
}

export function getState() {
  const participants = db.prepare("SELECT id, name, department, created_at AS createdAt FROM participants ORDER BY created_at ASC").all();
  const teams = db.prepare("SELECT id, name, code, flag, pot, status, note FROM teams ORDER BY rowid ASC").all();
  const draw = db.prepare("SELECT id, seed, created_at AS createdAt, reveal_index AS revealIndex FROM draws ORDER BY created_at DESC LIMIT 1").get() || null;
  const rawAssignments = draw ? db.prepare("SELECT id, team_id AS teamId, participant_id AS participantId, draw_index AS drawIndex, revealed FROM assignments WHERE draw_id = ? ORDER BY draw_index ASC").all(draw.id).map((assignment) => ({ ...assignment, revealed: Boolean(assignment.revealed) })) : [];
  const assignments = hydrateAssignments(rawAssignments, participants, teams);
  const auditEvents = db.prepare("SELECT at, event, detail FROM audit_events ORDER BY id DESC LIMIT 20").all();
  return {
    registrationOpen: !draw,
    participants,
    teams,
    draw: draw ? { ...draw, assignments: rawAssignments } : null,
    assignments,
    audit: auditEvents
  };
}

export function addParticipant({ name, department = "" }) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const cleanDepartment = String(department || "").trim().replace(/\s+/g, " ");
  if (!cleanName) throw httpError(400, "Name is required.");
  if (currentDraw()) throw httpError(409, "The draw is locked. Reset before changing participants.");
  const participant = { id: crypto.randomUUID(), name: cleanName, department: cleanDepartment, createdAt: new Date().toISOString() };
  db.prepare("INSERT INTO participants (id, name, department, created_at) VALUES (?, ?, ?, ?)").run(participant.id, participant.name, participant.department, participant.createdAt);
  audit("Participant joined", `${participant.name}${participant.department ? ` · ${participant.department}` : ""}`);
  return participant;
}

export function removeParticipant(id) {
  if (currentDraw()) throw httpError(409, "The draw is locked. Reset before changing participants.");
  const result = db.prepare("DELETE FROM participants WHERE id = ?").run(id);
  if (!result.changes) throw httpError(404, "Participant not found.");
  audit("Participant removed", "Removed before draw");
}

export function updateTeam(id, patch) {
  const current = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
  if (!current) throw httpError(404, "Team not found.");
  const next = {
    name: patch.name ?? current.name,
    code: String(patch.code ?? current.code).toUpperCase().slice(0, 3),
    flag: patch.flag ?? current.flag,
    pot: Number(patch.pot ?? current.pot),
    status: patch.status ?? current.status,
    note: patch.note ?? current.note
  };
  db.prepare("UPDATE teams SET name = ?, code = ?, flag = ?, pot = ?, status = ?, note = ? WHERE id = ?").run(next.name, next.code, next.flag, next.pot, next.status, next.note, id);
  if (patch.status) audit("Team status updated", `${next.name} → ${next.status}`);
}

export function createDraw(seed = "office-2026") {
  const participants = db.prepare("SELECT id, name, department, created_at AS createdAt FROM participants ORDER BY created_at ASC").all();
  const teams = db.prepare("SELECT id, name, code, flag, pot, status, note FROM teams ORDER BY rowid ASC").all();
  const draw = runDraw(participants, teams, seed);
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM assignments; DELETE FROM draws;");
    db.prepare("INSERT INTO draws (id, seed, created_at, reveal_index) VALUES (?, ?, ?, ?)").run(draw.id, draw.seed, draw.createdAt, -1);
    const insert = db.prepare("INSERT INTO assignments (id, draw_id, team_id, participant_id, draw_index, revealed) VALUES (?, ?, ?, ?, ?, ?)");
    for (const assignment of draw.assignments) insert.run(assignment.id, draw.id, assignment.teamId, assignment.participantId, assignment.drawIndex, 0);
    audit("Draw created", `${draw.assignments.length} teams assigned across ${participants.length} participants`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function revealNext() {
  const draw = currentDraw();
  if (!draw) throw httpError(404, "No draw exists yet.");
  const nextIndex = Math.min(draw.reveal_index + 1, 47);
  db.prepare("UPDATE draws SET reveal_index = ? WHERE id = ?").run(nextIndex, draw.id);
  db.prepare("UPDATE assignments SET revealed = 1 WHERE draw_id = ? AND draw_index <= ?").run(draw.id, nextIndex);
}

export function revealAll() {
  const draw = currentDraw();
  if (!draw) throw httpError(404, "No draw exists yet.");
  db.prepare("UPDATE draws SET reveal_index = 47 WHERE id = ?").run(draw.id);
  db.prepare("UPDATE assignments SET revealed = 1 WHERE draw_id = ?").run(draw.id);
  audit("Draw fully revealed", "All assignments visible");
}

export function resetSweepstake() {
  db.exec("DELETE FROM assignments; DELETE FROM draws; DELETE FROM participants; UPDATE teams SET status = 'active';");
  audit("Sweepstake reset", "Participants, draw, and results cleared");
}

function currentDraw() {
  return db.prepare("SELECT * FROM draws ORDER BY created_at DESC LIMIT 1").get();
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
