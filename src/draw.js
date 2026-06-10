export function createSeededRandom(seedText = "") {
  let seed = 2166136261;
  for (const char of String(seedText || Date.now())) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return function random() {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normaliseParticipant(name, department = "") {
  return {
    id: cryptoSafeId("p"),
    name: name.trim().replace(/\s+/g, " "),
    department: department.trim().replace(/\s+/g, " "),
    joinedAt: new Date().toISOString()
  };
}

export function cryptoSafeId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function runDraw(participants, teams, seedText = "") {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error("Add at least one participant before running the draw.");
  }
  if (!Array.isArray(teams) || teams.length !== 48) {
    throw new Error("The draw requires exactly 48 team slots.");
  }
  const random = createSeededRandom(seedText || `${Date.now()}:${participants.length}`);
  const participantOrder = shuffle(participants, random);
  const potOrder = [1, 2, 3, 4].flatMap((pot) => shuffle(teams.filter((team) => team.pot === pot), random));
  const assignmentCounts = new Map(participants.map((participant) => [participant.id, 0]));
  const assignments = [];

  potOrder.forEach((team, index) => {
    const minCount = Math.min(...participantOrder.map((participant) => assignmentCounts.get(participant.id)));
    const eligible = participantOrder.filter((participant) => assignmentCounts.get(participant.id) === minCount);
    const owner = eligible[index % eligible.length];
    assignmentCounts.set(owner.id, assignmentCounts.get(owner.id) + 1);
    assignments.push({
      id: cryptoSafeId("a"),
      teamId: team.id,
      participantId: owner.id,
      revealed: false,
      drawIndex: assignments.length
    });
  });

  return {
    id: cryptoSafeId("draw"),
    seed: seedText || "auto",
    createdAt: new Date().toISOString(),
    assignments
  };
}

export function hydrateAssignments(assignments, participants, teams) {
  return assignments
    .map((assignment) => ({
      ...assignment,
      participant: participants.find((participant) => participant.id === assignment.participantId),
      team: teams.find((team) => team.id === assignment.teamId)
    }))
    .filter((assignment) => assignment.participant && assignment.team)
    .sort((a, b) => a.drawIndex - b.drawIndex);
}

export function prizeWinners(assignments, participants, teams) {
  const hydrated = hydrateAssignments(assignments, participants, teams);
  return {
    winner: hydrated.find((assignment) => assignment.team.status === "winner") || null,
    runnerUp: hydrated.find((assignment) => assignment.team.status === "runner-up") || null
  };
}
