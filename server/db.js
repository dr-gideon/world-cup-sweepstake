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
    CREATE TABLE IF NOT EXISTS allowed_employees (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
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

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      stage TEXT NOT NULL DEFAULT 'Group',
      kickoff TEXT NOT NULL DEFAULT '',
      home_team_id TEXT NOT NULL,
      away_team_id TEXT NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(home_team_id) REFERENCES teams(id),
      FOREIGN KEY(away_team_id) REFERENCES teams(id)
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
  ensureParticipantEmailColumn();
  const participants = db.prepare("SELECT id, name, department, created_at AS createdAt FROM participants ORDER BY created_at ASC").all();
  const teams = db.prepare("SELECT id, name, code, flag, pot, status, note FROM teams ORDER BY rowid ASC").all();
  const draw = db.prepare("SELECT id, seed, created_at AS createdAt, reveal_index AS revealIndex FROM draws ORDER BY created_at DESC LIMIT 1").get() || null;
  const rawAssignments = draw ? db.prepare("SELECT id, team_id AS teamId, participant_id AS participantId, draw_index AS drawIndex, revealed FROM assignments WHERE draw_id = ? ORDER BY draw_index ASC").all(draw.id).map((assignment) => ({ ...assignment, revealed: Boolean(assignment.revealed) })) : [];
  const assignments = hydrateAssignments(rawAssignments, participants, teams);
  const auditEvents = db.prepare("SELECT at, event, detail FROM audit_events ORDER BY id DESC LIMIT 20").all();
  const allowlistStats = getAllowlistStats();
  const matches = getMatches();
  return {
    registrationOpen: !draw,
    participants,
    teams,
    draw: draw ? { ...draw, assignments: rawAssignments } : null,
    assignments,
    audit: auditEvents,
    allowlist: allowlistStats,
    matches
  };
}

export function addParticipant({ email, name, department = "" }) {
  ensureParticipantEmailColumn();
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail) throw httpError(400, "Work email is required.");
  if (currentDraw()) throw httpError(409, "The draw is locked. Reset before changing participants.");

  const allowlistCount = db.prepare("SELECT COUNT(*) AS count FROM allowed_employees").get().count;
  if (!allowlistCount) throw httpError(409, "Upload the employee email list before opening registration.");

  const allowed = db.prepare("SELECT email, name, department FROM allowed_employees WHERE email = ?").get(cleanEmail);
  if (!allowed) throw httpError(403, "This email is not on the sweepstake list. Check spelling or ask the organiser.");

  const existing = db.prepare("SELECT id FROM participants WHERE email = ?").get(cleanEmail);
  if (existing) throw httpError(409, "Looks like this email is already in the draw.");

  const cleanName = String(name || allowed.name || "").trim().replace(/\s+/g, " ");
  const cleanDepartment = String(department || allowed.department || "").trim().replace(/\s+/g, " ");
  if (!cleanName) throw httpError(400, "Name is required.");

  const participant = { id: crypto.randomUUID(), email: cleanEmail, name: cleanName, department: cleanDepartment, createdAt: new Date().toISOString() };
  db.prepare("INSERT INTO participants (id, email, name, department, created_at) VALUES (?, ?, ?, ?, ?)").run(participant.id, participant.email, participant.name, participant.department, participant.createdAt);
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
  if (patch.status && patch.status !== current.status) {
    const owner = db.prepare(`
      SELECT p.name, p.department
      FROM assignments a
      JOIN participants p ON p.id = a.participant_id
      JOIN draws d ON d.id = a.draw_id
      WHERE a.team_id = ?
      ORDER BY d.created_at DESC
      LIMIT 1
    `).get(id);
    const ownerText = owner ? `${owner.name}${owner.department ? ` · ${owner.department}` : ""}` : "No owner yet";
    audit("Match impact", `${next.flag} ${next.name}: ${current.status} → ${next.status} | ${ownerText}`);
  }
}

export function createDraw(seed = "office-2026") {
  ensureParticipantEmailColumn();
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
  db.exec("DELETE FROM assignments; DELETE FROM draws; DELETE FROM participants; DELETE FROM matches; UPDATE teams SET status = 'active';");
  audit("Sweepstake reset", "Participants, draw, results, and matches cleared. Employee allowlist kept.");
}

export function getMatches() {
  return db.prepare(`
    SELECT
      m.id, m.stage, m.kickoff, m.home_team_id AS homeTeamId, m.away_team_id AS awayTeamId,
      m.home_score AS homeScore, m.away_score AS awayScore, m.status, m.notes, m.updated_at AS updatedAt,
      ht.name AS homeName, ht.code AS homeCode, ht.flag AS homeFlag,
      at.name AS awayName, at.code AS awayCode, at.flag AS awayFlag
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    ORDER BY COALESCE(NULLIF(m.kickoff, ''), m.updated_at) ASC, m.updated_at DESC
  `).all();
}

export function upsertMatch(payload) {
  const homeTeamId = String(payload.homeTeamId || "").trim();
  const awayTeamId = String(payload.awayTeamId || "").trim();
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) throw httpError(400, "Choose two different teams.");
  const home = db.prepare("SELECT name, flag FROM teams WHERE id = ?").get(homeTeamId);
  const away = db.prepare("SELECT name, flag FROM teams WHERE id = ?").get(awayTeamId);
  if (!home || !away) throw httpError(404, "Match team not found.");
  const id = payload.id || crypto.randomUUID();
  const status = ["scheduled", "live", "finished", "postponed"].includes(payload.status) ? payload.status : "scheduled";
  const homeScore = payload.homeScore === "" || payload.homeScore === null || payload.homeScore === undefined ? null : Number(payload.homeScore);
  const awayScore = payload.awayScore === "" || payload.awayScore === null || payload.awayScore === undefined ? null : Number(payload.awayScore);
  db.prepare(`
    INSERT INTO matches (id, stage, kickoff, home_team_id, away_team_id, home_score, away_score, status, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      stage = excluded.stage, kickoff = excluded.kickoff, home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
      home_score = excluded.home_score, away_score = excluded.away_score, status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at
  `).run(id, String(payload.stage || "Group").trim() || "Group", String(payload.kickoff || "").trim(), homeTeamId, awayTeamId, homeScore, awayScore, status, String(payload.notes || "").trim(), new Date().toISOString());
  audit("Match updated", `${home.flag} ${home.name} ${homeScore ?? "-"} — ${awayScore ?? "-"} ${away.flag} ${away.name} | ${status}`);
  return db.prepare("SELECT * FROM matches WHERE id = ?").get(id);
}

export function removeMatch(id) {
  const result = db.prepare("DELETE FROM matches WHERE id = ?").run(id);
  if (!result.changes) throw httpError(404, "Match not found.");
  audit("Match removed", id);
}

export function importAllowlist(csvText) {
  if (currentDraw()) throw httpError(409, "The draw is locked. Reset before replacing the employee list.");
  const rows = parseCsv(csvText);
  if (!rows.length) throw httpError(400, "CSV is empty.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const emailIndex = headers.indexOf("email");
  const nameIndex = headers.indexOf("name");
  const departmentIndex = headers.indexOf("department");
  if (emailIndex === -1) throw httpError(400, "CSV must include an email column.");

  const seen = new Set();
  const employees = [];
  for (const row of rows.slice(1)) {
    const email = normaliseEmail(row[emailIndex]);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    employees.push({
      email,
      name: String(row[nameIndex] || "").trim().replace(/\s+/g, " "),
      department: String(row[departmentIndex] || "").trim().replace(/\s+/g, " ")
    });
  }
  if (!employees.length) throw httpError(400, "No valid email addresses found.");

  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM participants; DELETE FROM allowed_employees;");
    const insert = db.prepare("INSERT INTO allowed_employees (email, name, department, uploaded_at) VALUES (?, ?, ?, ?)");
    const uploadedAt = new Date().toISOString();
    for (const employee of employees) insert.run(employee.email, employee.name, employee.department, uploadedAt);
    audit("Employee list uploaded", `${employees.length} eligible employees`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getAllowlistStats();
}

export function lookupEmployee(email) {
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail) throw httpError(400, "Email is required.");
  const employee = db.prepare("SELECT email, name, department FROM allowed_employees WHERE email = ?").get(cleanEmail);
  const joined = db.prepare("SELECT id FROM participants WHERE email = ?").get(cleanEmail);
  return {
    allowed: Boolean(employee),
    joined: Boolean(joined),
    employee: employee ? { name: employee.name, department: employee.department } : null
  };
}

function getAllowlistStats() {
  const eligible = db.prepare("SELECT COUNT(*) AS count FROM allowed_employees").get().count;
  const joined = db.prepare("SELECT COUNT(*) AS count FROM participants").get().count;
  return { eligible, joined, remaining: Math.max(eligible - joined, 0), required: true };
}

function normaliseEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? email : "";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ""; continue; }
    if (char === "\n" && !quoted) { row.push(cell); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

function ensureParticipantEmailColumn() {
  const columns = db.prepare("PRAGMA table_info(participants)").all().map((column) => column.name);
  if (!columns.includes("email")) {
    db.exec("DELETE FROM participants; ALTER TABLE participants ADD COLUMN email TEXT NOT NULL DEFAULT '';");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_email ON participants(email)");
  }
}

function currentDraw() {
  return db.prepare("SELECT * FROM draws ORDER BY created_at DESC LIMIT 1").get();
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
