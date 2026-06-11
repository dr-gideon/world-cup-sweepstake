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
      provider TEXT NOT NULL DEFAULT 'manual',
      provider_match_id TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(home_team_id) REFERENCES teams(id),
      FOREIGN KEY(away_team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS provider_sync (
      provider TEXT PRIMARY KEY,
      last_sync_at TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      requests_available INTEGER,
      reset_seconds INTEGER,
      imported INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tele_summaries (
      id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL UNIQUE,
      headline TEXT NOT NULL,
      body TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'fallback',
      created_at TEXT NOT NULL
    );
  `);
  ensureMatchProviderColumns();
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
  const providerSync = getProviderSync();
  const teleSummary = getLatestTeleSummary();
  const teleSummaries = getTeleSummaries();
  return {
    registrationOpen: !draw,
    participants,
    teams,
    draw: draw ? { ...draw, assignments: rawAssignments } : null,
    assignments,
    audit: auditEvents,
    allowlist: allowlistStats,
    matches,
    providerSync,
    teleSummary,
    teleSummaries
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
      m.home_score AS homeScore, m.away_score AS awayScore, m.status, m.notes, m.updated_at AS updatedAt, m.provider, m.provider_match_id AS providerMatchId,
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
    INSERT INTO matches (id, stage, kickoff, home_team_id, away_team_id, home_score, away_score, status, notes, updated_at, provider, provider_match_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      stage = excluded.stage, kickoff = excluded.kickoff, home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
      home_score = excluded.home_score, away_score = excluded.away_score, status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at,
      provider = excluded.provider, provider_match_id = excluded.provider_match_id
  `).run(id, String(payload.stage || "Group").trim() || "Group", String(payload.kickoff || "").trim(), homeTeamId, awayTeamId, homeScore, awayScore, status, String(payload.notes || "").trim(), new Date().toISOString(), payload.provider || "manual", payload.providerMatchId || "");
  audit("Match updated", `${home.flag} ${home.name} ${homeScore ?? "-"} — ${awayScore ?? "-"} ${away.flag} ${away.name} | ${status}`);
  return db.prepare("SELECT * FROM matches WHERE id = ?").get(id);
}

export function removeMatch(id) {
  const result = db.prepare("DELETE FROM matches WHERE id = ?").run(id);
  if (!result.changes) throw httpError(404, "Match not found.");
  audit("Match removed", id);
}

export function importFootballDataTeams(matches, throttling = {}) {
  if (currentDraw()) throw httpError(409, "Cannot replace teams after the draw has run. Reset first if this is still setup data.");
  const unique = new Map();
  for (const match of matches || []) {
    for (const apiTeam of [match.homeTeam, match.awayTeam]) {
      if (!apiTeam?.id || unique.has(apiTeam.id)) continue;
      unique.set(apiTeam.id, {
        id: `fd_${apiTeam.id}`,
        name: apiTeam.name || apiTeam.shortName || apiTeam.tla || `Team ${apiTeam.id}`,
        code: String(apiTeam.tla || apiTeam.shortName || apiTeam.name || "TBD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "TBD",
        flag: apiTeam.crest || "🏳️",
        status: "active",
        note: `Football-Data team ${apiTeam.id}`
      });
    }
  }
  const teams = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (teams.length !== 48) {
    recordProviderSync("football-data", {
      status: "team-import-blocked",
      message: `Expected 48 teams from Football-Data WC matches, found ${teams.length}.`,
      requestsAvailable: throttling.requestsAvailable,
      resetSeconds: throttling.resetSeconds,
      imported: 0,
      skipped: Math.max(0, 48 - teams.length)
    });
    throw httpError(409, `Expected 48 teams from Football-Data WC matches, found ${teams.length}.`);
  }
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM matches; DELETE FROM assignments; DELETE FROM draws; DELETE FROM teams;");
    const insert = db.prepare("INSERT INTO teams (id, name, code, flag, pot, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)");
    teams.forEach((team, index) => insert.run(team.id, team.name, team.code, team.flag, Math.floor(index / 12) + 1, team.status, team.note));
    audit("Football-Data teams imported", "48 World Cup teams imported from fixtures");
    recordProviderSync("football-data", {
      status: "teams-imported",
      message: "Imported 48 World Cup teams from Football-Data fixtures.",
      requestsAvailable: throttling.requestsAvailable,
      resetSeconds: throttling.resetSeconds,
      imported: 48,
      skipped: 0
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { imported: 48, skipped: 0 };
}

export function syncFootballDataMatches(matches, throttling = {}) {
  const teams = db.prepare("SELECT id, name, code, flag FROM teams").all();
  let imported = 0;
  let skipped = 0;
  for (const match of matches || []) {
    const homeTeam = mapFootballDataTeam(match.homeTeam, teams);
    const awayTeam = mapFootballDataTeam(match.awayTeam, teams);
    if (!homeTeam || !awayTeam) { skipped += 1; continue; }
    upsertMatch({
      id: `football-data-${match.id}`,
      provider: "football-data",
      providerMatchId: String(match.id),
      stage: normaliseFootballStage(match.stage || match.group || "Group"),
      kickoff: match.utcDate ? String(match.utcDate).slice(0, 16) : "",
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore: match.score?.fullTime?.home ?? match.score?.regularTime?.home ?? null,
      awayScore: match.score?.fullTime?.away ?? match.score?.regularTime?.away ?? null,
      status: normaliseFootballStatus(match.status),
      notes: `Football-Data ${match.status || ""}`.trim()
    });
    imported += 1;
  }
  const statusUpdates = applyKnockoutStatusUpdates(matches || []);
  recordProviderSync("football-data", {
    status: "ok",
    message: `Imported ${imported}, skipped ${skipped}, status updates ${statusUpdates}`,
    requestsAvailable: throttling.requestsAvailable,
    resetSeconds: throttling.resetSeconds,
    imported,
    skipped
  });
  return { imported, skipped, statusUpdates };
}

export function recordProviderSync(provider, result) {
  db.prepare(`
    INSERT INTO provider_sync (provider, last_sync_at, status, message, requests_available, reset_seconds, imported, skipped)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      last_sync_at = excluded.last_sync_at, status = excluded.status, message = excluded.message,
      requests_available = excluded.requests_available, reset_seconds = excluded.reset_seconds,
      imported = excluded.imported, skipped = excluded.skipped
  `).run(provider, new Date().toISOString(), result.status || "ok", result.message || "", result.requestsAvailable ?? null, result.resetSeconds ?? null, result.imported || 0, result.skipped || 0);
}

export function getProviderSync() {
  return db.prepare("SELECT provider, last_sync_at AS lastSyncAt, status, message, requests_available AS requestsAvailable, reset_seconds AS resetSeconds, imported, skipped FROM provider_sync ORDER BY provider ASC").all();
}

export function createTeleSummary({ sourceKey, headline, body, provider = "fallback" }) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO tele_summaries (id, source_key, headline, body, provider, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key) DO UPDATE SET headline = excluded.headline, body = excluded.body, provider = excluded.provider, created_at = excluded.created_at
  `).run(id, sourceKey, headline, body, provider, new Date().toISOString());
  return getLatestTeleSummary();
}

export function getLatestTeleSummary() {
  return db.prepare("SELECT id, source_key AS sourceKey, headline, body, provider, created_at AS createdAt FROM tele_summaries ORDER BY created_at DESC LIMIT 1").get() || null;
}

export function getTeleSummaries() {
  return db.prepare("SELECT id, source_key AS sourceKey, headline, body, provider, created_at AS createdAt FROM tele_summaries ORDER BY created_at DESC LIMIT 50").all();
}

export function hasTeleSummary(sourceKey) {
  return Boolean(db.prepare("SELECT id FROM tele_summaries WHERE source_key = ?").get(sourceKey));
}

function mapFootballDataTeam(apiTeam, teams) {
  if (!apiTeam) return null;
  const candidates = [apiTeam.tla, apiTeam.shortName, apiTeam.name].filter(Boolean).map(normaliseTeamText);
  return teams.find((team) => candidates.includes(normaliseTeamText(team.code)) || candidates.includes(normaliseTeamText(team.name))) || null;
}

function normaliseTeamText(value) {
  return String(value || "").toLowerCase().replace(/\b(cf|fc|afc|sc|club|national|team)\b/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function normaliseFootballStatus(status) {
  if (["IN_PLAY", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT"].includes(status)) return "live";
  if (status === "FINISHED" || status === "AWARDED") return "finished";
  if (status === "POSTPONED" || status === "SUSPENDED" || status === "CANCELLED") return "postponed";
  return "scheduled";
}

function normaliseFootballStage(stage) {
  return String(stage || "Group").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function applyKnockoutStatusUpdates(apiMatches) {
  const teams = db.prepare("SELECT id, name, code, flag, status FROM teams").all();
  let updates = 0;
  for (const match of apiMatches) {
    if (match.status !== "FINISHED" && match.status !== "AWARDED") continue;
    const stage = String(match.stage || "");
    if (!isKnockoutStage(stage)) continue;
    const home = mapFootballDataTeam(match.homeTeam, teams);
    const away = mapFootballDataTeam(match.awayTeam, teams);
    if (!home || !away) continue;
    const homeScore = match.score?.fullTime?.home ?? match.score?.regularTime?.home;
    const awayScore = match.score?.fullTime?.away ?? match.score?.regularTime?.away;
    if (homeScore === null || homeScore === undefined || awayScore === null || awayScore === undefined || homeScore === awayScore) continue;
    const winner = homeScore > awayScore ? home : away;
    const loser = homeScore > awayScore ? away : home;
    if (stage === "FINAL") {
      updates += updateTeamStatusIfChanged(winner.id, "winner");
      updates += updateTeamStatusIfChanged(loser.id, "runner-up");
    } else {
      updates += updateTeamStatusIfChanged(loser.id, "eliminated");
      const nextStatus = stageToSurvivorStatus(stage);
      if (nextStatus) updates += updateTeamStatusIfChanged(winner.id, nextStatus);
    }
  }
  return updates;
}

function isKnockoutStage(stage) {
  return ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL", "THIRD_PLACE"].includes(stage);
}

function stageToSurvivorStatus(stage) {
  if (stage === "LAST_32") return "r16";
  if (stage === "LAST_16") return "quarter";
  if (stage === "QUARTER_FINALS") return "semi";
  if (stage === "SEMI_FINALS") return "active";
  return "active";
}

function updateTeamStatusIfChanged(teamId, status) {
  const current = db.prepare("SELECT id, name, flag, status FROM teams WHERE id = ?").get(teamId);
  if (!current || current.status === status) return 0;
  db.prepare("UPDATE teams SET status = ? WHERE id = ?").run(status, teamId);
  const owner = db.prepare(`
    SELECT p.name, p.department
    FROM assignments a
    JOIN participants p ON p.id = a.participant_id
    JOIN draws d ON d.id = a.draw_id
    WHERE a.team_id = ?
    ORDER BY d.created_at DESC
    LIMIT 1
  `).get(teamId);
  const ownerText = owner ? `${owner.name}${owner.department ? ` · ${owner.department}` : ""}` : "No owner yet";
  audit("Match impact", `${current.flag} ${current.name}: ${current.status} → ${status} | ${ownerText}`);
  return 1;
}

export function importAllowlist(csvText) {
  if (currentDraw()) throw httpError(409, "The draw is locked. Reset before replacing the employee list.");
  const employees = parseEmployeeCsv(csvText);

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

export function appendAllowlist(csvText) {
  if (currentDraw()) throw httpError(409, "The draw is locked. Reset before adding employees.");
  const employees = parseEmployeeCsv(csvText);
  const insert = db.prepare(`
    INSERT INTO allowed_employees (email, name, department, uploaded_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = CASE WHEN excluded.name != '' THEN excluded.name ELSE allowed_employees.name END,
      department = CASE WHEN excluded.department != '' THEN excluded.department ELSE allowed_employees.department END,
      uploaded_at = excluded.uploaded_at
  `);
  const before = db.prepare("SELECT COUNT(*) AS count FROM allowed_employees").get().count;
  db.exec("BEGIN");
  try {
    const uploadedAt = new Date().toISOString();
    for (const employee of employees) insert.run(employee.email, employee.name, employee.department, uploadedAt);
    const after = db.prepare("SELECT COUNT(*) AS count FROM allowed_employees").get().count;
    audit("Employee list appended", `${after - before} new eligible employees, ${employees.length} rows processed`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getAllowlistStats();
}

function parseEmployeeCsv(csvText) {
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
  return employees;
}

export function lookupParticipantTeams(email) {
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail) throw httpError(400, "Email is required.");
  const participant = db.prepare("SELECT id, name, department FROM participants WHERE email = ?").get(cleanEmail);
  if (!participant) return { found: false, participant: null, assignments: [] };
  const state = getState();
  return { found: true, participant, assignments: state.assignments.filter((assignment) => assignment.participant.id === participant.id) };
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

export function exportBackupJson() {
  ensureParticipantEmailColumn();
  return {
    exportedAt: new Date().toISOString(),
    allowedEmployees: db.prepare("SELECT email, name, department, uploaded_at AS uploadedAt FROM allowed_employees ORDER BY email ASC").all(),
    participants: db.prepare("SELECT email, name, department, created_at AS createdAt FROM participants ORDER BY created_at ASC").all(),
    teams: db.prepare("SELECT id, name, code, flag, pot, status, note FROM teams ORDER BY rowid ASC").all(),
    draws: db.prepare("SELECT id, seed, created_at AS createdAt, reveal_index AS revealIndex FROM draws ORDER BY created_at ASC").all(),
    assignments: db.prepare("SELECT id, draw_id AS drawId, team_id AS teamId, participant_id AS participantId, draw_index AS drawIndex, revealed FROM assignments ORDER BY draw_index ASC").all(),
    matches: db.prepare("SELECT id, stage, kickoff, home_team_id AS homeTeamId, away_team_id AS awayTeamId, home_score AS homeScore, away_score AS awayScore, status, notes, updated_at AS updatedAt, provider, provider_match_id AS providerMatchId FROM matches ORDER BY updated_at ASC").all(),
    audit: db.prepare("SELECT at, event, detail FROM audit_events ORDER BY id ASC").all()
  };
}

export function exportNotJoinedCsv() {
  const rows = db.prepare(`
    SELECT ae.email, ae.name, ae.department
    FROM allowed_employees ae
    LEFT JOIN participants p ON p.email = ae.email
    WHERE p.email IS NULL
    ORDER BY ae.email ASC
  `).all();
  return toCsv(["email", "name", "department"], rows.map((row) => [row.email, row.name, row.department]));
}

export function exportParticipantsCsv() {
  ensureParticipantEmailColumn();
  const rows = db.prepare("SELECT email, name, department, created_at AS createdAt FROM participants ORDER BY created_at ASC").all();
  return toCsv(["email", "name", "department", "joined_at"], rows.map((row) => [row.email, row.name, row.department, row.createdAt]));
}

function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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

function ensureMatchProviderColumns() {
  const columns = db.prepare("PRAGMA table_info(matches)").all().map((column) => column.name);
  if (columns.length && !columns.includes("provider")) db.exec("ALTER TABLE matches ADD COLUMN provider TEXT NOT NULL DEFAULT 'manual'");
  if (columns.length && !columns.includes("provider_match_id")) db.exec("ALTER TABLE matches ADD COLUMN provider_match_id TEXT NOT NULL DEFAULT ''");
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
