import test from "node:test";
import assert from "node:assert/strict";
import { runDraw } from "../src/draw.js";
import { DEFAULT_TEAMS } from "../src/teams.js";

const participants = Array.from({ length: 35 }, (_, index) => ({
  id: `p${index + 1}`,
  name: `Participant ${index + 1}`,
  department: "Ops"
}));

test("runDraw assigns all 48 teams exactly once", () => {
  const draw = runDraw(participants, DEFAULT_TEAMS, "test-seed");
  assert.equal(draw.assignments.length, 48);
  assert.equal(new Set(draw.assignments.map((assignment) => assignment.teamId)).size, 48);
});

test("runDraw gives everyone at least one team when participants <= teams", () => {
  const draw = runDraw(participants, DEFAULT_TEAMS, "test-seed");
  const participantIds = new Set(draw.assignments.map((assignment) => assignment.participantId));
  assert.equal(participantIds.size, participants.length);
});

test("runDraw keeps bonus-team spread balanced", () => {
  const draw = runDraw(participants, DEFAULT_TEAMS, "test-seed");
  const counts = participants.map((participant) => draw.assignments.filter((assignment) => assignment.participantId === participant.id).length);
  assert.equal(Math.max(...counts) - Math.min(...counts), 1);
});
