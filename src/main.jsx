import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, CheckCircle2, ClipboardList, Download, Flag, Play, RefreshCcw, ShieldCheck, Sparkles, Trophy, Upload, Users } from "lucide-react";
import { DEFAULT_TEAMS, STAGES } from "./teams.js";
import { hydrateAssignments, normaliseParticipant, prizeWinners, runDraw } from "./draw.js";
import "./styles.css";

const STORAGE_KEY = "world-cup-sweepstake:v1";
const initialState = {
  registrationOpen: true,
  participants: [],
  teams: DEFAULT_TEAMS,
  draw: null,
  revealIndex: -1,
  audit: [{ at: new Date().toISOString(), event: "App started", detail: "Ready for registration" }]
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw);
    return { ...initialState, ...parsed, teams: parsed.teams?.length === 48 ? parsed.teams : DEFAULT_TEAMS };
  } catch {
    return initialState;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function App() {
  const [state, setState] = useState(loadState);
  const [view, setView] = useState("dashboard");
  const assignments = useMemo(() => hydrateAssignments(state.draw?.assignments || [], state.participants, state.teams), [state.draw, state.participants, state.teams]);
  const prizes = useMemo(() => prizeWinners(state.draw?.assignments || [], state.participants, state.teams), [state.draw, state.participants, state.teams]);
  const aliveCount = state.teams.filter((team) => team.status !== "eliminated").length;

  function update(mutator) {
    setState((current) => {
      const next = typeof mutator === "function" ? mutator(current) : mutator;
      saveState(next);
      return next;
    });
  }

  function audit(event, detail) {
    return { at: new Date().toISOString(), event, detail };
  }

  function addParticipant(name, department) {
    update((current) => {
      const participant = normaliseParticipant(name, department);
      return {
        ...current,
        participants: [...current.participants, participant],
        audit: [audit("Participant joined", `${participant.name}${participant.department ? ` · ${participant.department}` : ""}`), ...current.audit]
      };
    });
  }

  function removeParticipant(id) {
    update((current) => ({
      ...current,
      participants: current.participants.filter((participant) => participant.id !== id),
      audit: [audit("Participant removed", "Removed before draw"), ...current.audit]
    }));
  }

  function toggleRegistration() {
    update((current) => ({
      ...current,
      registrationOpen: !current.registrationOpen,
      audit: [audit(!current.registrationOpen ? "Registration opened" : "Registration closed", "Admin action"), ...current.audit]
    }));
  }

  function executeDraw(seed) {
    try {
      update((current) => {
        const draw = runDraw(current.participants, current.teams, seed);
        return {
          ...current,
          registrationOpen: false,
          draw,
          revealIndex: -1,
          audit: [audit("Draw created", `${draw.assignments.length} teams assigned across ${current.participants.length} participants`), ...current.audit]
        };
      });
      setView("reveal");
    } catch (error) {
      alert(error.message);
    }
  }

  function revealNext() {
    update((current) => {
      if (!current.draw) return current;
      const nextIndex = Math.min(current.revealIndex + 1, current.draw.assignments.length - 1);
      return {
        ...current,
        revealIndex: nextIndex,
        draw: {
          ...current.draw,
          assignments: current.draw.assignments.map((assignment) => assignment.drawIndex <= nextIndex ? { ...assignment, revealed: true } : assignment)
        }
      };
    });
  }

  function revealAll() {
    update((current) => {
      if (!current.draw) return current;
      return {
        ...current,
        revealIndex: current.draw.assignments.length - 1,
        draw: { ...current.draw, assignments: current.draw.assignments.map((assignment) => ({ ...assignment, revealed: true })) },
        audit: [audit("Draw fully revealed", "All assignments visible"), ...current.audit]
      };
    });
  }

  function updateTeam(teamId, patch) {
    update((current) => ({
      ...current,
      teams: current.teams.map((team) => team.id === teamId ? { ...team, ...patch } : team),
      audit: patch.status ? [audit("Team status updated", `${current.teams.find((team) => team.id === teamId)?.name} → ${stageLabel(patch.status)}`), ...current.audit] : current.audit
    }));
  }

  function resetApp() {
    if (!confirm("Reset this sweepstake on this browser? This clears participants, draw, and results.")) return;
    update({ ...initialState, audit: [audit("Sweepstake reset", "Local browser data cleared")] });
    setView("dashboard");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `world-cup-sweepstake-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported.participants) || !Array.isArray(imported.teams)) throw new Error("Invalid file");
        update({ ...initialState, ...imported, audit: [audit("Data imported", file.name), ...(imported.audit || [])] });
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  const visibleAssignments = assignments.filter((assignment) => assignment.revealed);
  const currentReveal = assignments[state.revealIndex] || null;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <div className="brand-mark"><Trophy size={22} /></div>
          <div>
            <strong>World Cup Draw</strong>
            <span>Office sweepstake</span>
          </div>
        </div>
        <nav>
          <NavButton active={view === "dashboard"} icon={<ClipboardList />} label="Dashboard" onClick={() => setView("dashboard")} />
          <NavButton active={view === "join"} icon={<Users />} label="Join" onClick={() => setView("join")} />
          <NavButton active={view === "reveal"} icon={<Sparkles />} label="Reveal" onClick={() => setView("reveal")} />
          <NavButton active={view === "board"} icon={<Flag />} label="Team board" onClick={() => setView("board")} />
          <NavButton active={view === "admin"} icon={<ShieldCheck />} label="Admin" onClick={() => setView("admin")} />
        </nav>
        <div className="sidebar-footer">
          <StatusPill tone={state.registrationOpen ? "success" : "warning"} label={state.registrationOpen ? "Registration open" : "Registration closed"} />
          <small>Local-first MVP · no buy-ins</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">CEO-sponsored · free entry</p>
            <h1>{pageTitle(view)}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={exportData}><Download size={16} /> Export</button>
            <label className="ghost-btn file-btn"><Upload size={16} /> Import<input type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} /></label>
          </div>
        </header>

        {view === "dashboard" && <Dashboard state={state} assignments={assignments} prizes={prizes} aliveCount={aliveCount} setView={setView} />}
        {view === "join" && <Join registrationOpen={state.registrationOpen} participants={state.participants} addParticipant={addParticipant} removeParticipant={removeParticipant} />}
        {view === "reveal" && <Reveal draw={state.draw} currentReveal={currentReveal} visibleAssignments={visibleAssignments} revealNext={revealNext} revealAll={revealAll} />}
        {view === "board" && <Board assignments={assignments} participants={state.participants} teams={state.teams} prizes={prizes} />}
        {view === "admin" && <Admin state={state} executeDraw={executeDraw} toggleRegistration={toggleRegistration} updateTeam={updateTeam} resetApp={resetApp} />}
      </main>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{React.cloneElement(icon, { size: 18 })}<span>{label}</span></button>;
}

function Dashboard({ state, assignments, prizes, aliveCount, setView }) {
  const revealed = assignments.filter((assignment) => assignment.revealed).length;
  return <section className="dashboard-grid">
    <Kpi icon={<Users />} label="Participants" value={state.participants.length} detail="Expected office headcount around 52" />
    <Kpi icon={<Flag />} label="Teams assigned" value={state.draw ? "48 / 48" : "0 / 48"} detail={state.draw ? `${revealed} revealed so far` : "Run the draw after registration"} accent />
    <Kpi icon={<Trophy />} label="Prize fund" value="€80" detail="€50 winner · €30 runner-up" />

    <div className="card hero-card">
      <div>
        <p className="eyebrow">Format</p>
        <h2>Every team gets an owner. No boring unassigned champion.</h2>
        <p>Everyone receives at least one team. If fewer than 48 colleagues join, bonus teams are spread as evenly as possible using pot-balanced draw order.</p>
      </div>
      <div className="hero-actions">
        <button className="primary-btn" onClick={() => setView("join")}>Open join page</button>
        <button className="secondary-btn" onClick={() => setView(state.draw ? "reveal" : "admin")}>{state.draw ? "Continue reveal" : "Prepare draw"}</button>
      </div>
    </div>

    <PrizeCard title="Currently winning €50" prize={prizes.winner} empty="Set the champion when the tournament ends." />
    <PrizeCard title="Currently winning €30" prize={prizes.runnerUp} empty="Set the runner-up when the final is known." />

    <div className="card status-card">
      <div className="card-header"><div><p className="eyebrow">Tournament state</p><h3>{aliveCount} teams still alive</h3></div><StatusPill tone={state.draw ? "success" : "muted"} label={state.draw ? "Draw ready" : "Awaiting draw"} /></div>
      <div className="audit-list">
        {state.audit.slice(0, 6).map((item, index) => <div className="audit-row" key={`${item.at}-${index}`}><span>{formatTime(item.at)}</span><strong>{item.event}</strong><em>{item.detail}</em></div>)}
      </div>
    </div>
  </section>;
}

function Join({ registrationOpen, participants, addParticipant, removeParticipant }) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  function submit(event) {
    event.preventDefault();
    if (!registrationOpen || !name.trim()) return;
    addParticipant(name, department);
    setName("");
    setDepartment("");
  }
  return <section className="two-column">
    <form className="card join-card" onSubmit={submit}>
      <p className="eyebrow">Join the office draw</p>
      <h2>Free entry. CEO-sponsored prizes. Maximum bragging rights.</h2>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex Murphy" disabled={!registrationOpen} /></label>
      <label>Department <span>optional</span><input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="e.g. Sales" disabled={!registrationOpen} /></label>
      <button className="primary-btn" disabled={!registrationOpen || !name.trim()}>Add me to the sweepstake</button>
      {!registrationOpen && <p className="notice warning">Registration is closed. Ask the admin before editing participants.</p>}
    </form>
    <div className="card">
      <div className="card-header"><div><p className="eyebrow">Participants</p><h3>{participants.length} joined</h3></div><StatusPill tone={participants.length ? "success" : "muted"} label={participants.length ? "Ready" : "Empty"} /></div>
      <div className="participant-list">
        {participants.length === 0 && <EmptyState title="No one has joined yet" detail="Add test participants here before running the draw." />}
        {participants.map((participant) => <div className="participant-row" key={participant.id}><div><strong>{participant.name}</strong><span>{participant.department || "No department"}</span></div><button className="icon-btn" onClick={() => removeParticipant(participant.id)} aria-label={`Remove ${participant.name}`}>×</button></div>)}
      </div>
    </div>
  </section>;
}

function Reveal({ draw, currentReveal, visibleAssignments, revealNext, revealAll }) {
  if (!draw) return <EmptyPanel icon={<Sparkles />} title="No draw yet" detail="Go to Admin, close registration, and run the draw." />;
  return <section className="reveal-layout">
    <div className="card reveal-stage">
      <p className="eyebrow">Big-screen reveal</p>
      {currentReveal ? <>
        <div className="flag-burst" aria-hidden>{currentReveal.team.flag}</div>
        <h2>{currentReveal.participant.name}</h2>
        <p>has drawn</p>
        <div className="team-reveal"><span>{currentReveal.team.flag}</span><strong>{currentReveal.team.name}</strong><em>Pot {currentReveal.team.pot} · {currentReveal.team.code}</em></div>
      </> : <>
        <div className="flag-burst" aria-hidden>🏆</div>
        <h2>Ready to reveal</h2>
        <p>{draw.assignments.length} assignments are locked. Hit reveal when the office is watching.</p>
      </>}
      <div className="hero-actions center">
        <button className="primary-btn" onClick={revealNext}><Play size={16} /> Reveal next</button>
        <button className="secondary-btn" onClick={revealAll}>Reveal all</button>
      </div>
    </div>
    <div className="card reveal-list">
      <div className="card-header"><div><p className="eyebrow">Revealed</p><h3>{visibleAssignments.length} / 48</h3></div></div>
      <div className="assignment-list compact">
        {visibleAssignments.length === 0 && <EmptyState title="Nothing revealed yet" detail="Use this page on a TV or shared screen." />}
        {visibleAssignments.map((assignment) => <AssignmentRow key={assignment.id} assignment={assignment} />)}
      </div>
    </div>
  </section>;
}

function Board({ assignments, participants, teams, prizes }) {
  const [query, setQuery] = useState("");
  const filtered = assignments.filter((assignment) => `${assignment.participant.name} ${assignment.participant.department} ${assignment.team.name} ${assignment.team.code}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="board-layout">
    <div className="board-toolbar card">
      <div><p className="eyebrow">Public board</p><h2>Who owns who</h2></div>
      <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search participant, department, or team" />
    </div>
    <div className="prize-strip">
      <PrizeCard title="€50 winner" prize={prizes.winner} empty="Champion not set" />
      <PrizeCard title="€30 runner-up" prize={prizes.runnerUp} empty="Runner-up not set" />
    </div>
    {assignments.length === 0 ? <EmptyPanel icon={<Flag />} title="No team board yet" detail="Run the draw to generate the ownership board." /> : <div className="team-grid">
      {filtered.map((assignment) => <TeamCard key={assignment.id} assignment={assignment} />)}
    </div>}
    {participants.length > 48 && <p className="notice warning">More than 48 participants joined. MVP assigns 48 team slots only.</p>}
    {teams.some((team) => team.name.startsWith("Qualifier")) && <p className="notice info">Some teams are placeholder qualifier slots. Admin can rename them when qualification is final.</p>}
  </section>;
}

function Admin({ state, executeDraw, toggleRegistration, updateTeam, resetApp }) {
  const [seed, setSeed] = useState("office-2026");
  return <section className="admin-layout">
    <div className="card admin-card">
      <div className="card-header"><div><p className="eyebrow">Draw controls</p><h2>Registration and draw</h2></div><StatusPill tone={state.registrationOpen ? "success" : "warning"} label={state.registrationOpen ? "Open" : "Closed"} /></div>
      <div className="control-grid">
        <button className="secondary-btn" onClick={toggleRegistration}>{state.registrationOpen ? "Close registration" : "Re-open registration"}</button>
        <label>Draw seed<input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Optional seed" /></label>
        <button className="primary-btn" disabled={state.participants.length === 0 || state.participants.length > 48} onClick={() => executeDraw(seed)}><RefreshCcw size={16} /> Run / re-run draw</button>
      </div>
      <p className="notice info">Re-running the draw replaces current assignments. Export a backup first if this is a live office draw.</p>
      {state.participants.length > 48 && <p className="notice warning">There are {state.participants.length} participants for 48 team slots. This MVP blocks the draw until extra entries are removed or shared-team rules are agreed.</p>}
    </div>

    <div className="card admin-card">
      <div className="card-header"><div><p className="eyebrow">Team setup</p><h2>48 team slots</h2></div><StatusPill tone="muted" label="Editable" /></div>
      <div className="team-editor">
        {state.teams.map((team) => <div className="team-edit-row" key={team.id}>
          <input aria-label="Flag" value={team.flag} onChange={(event) => updateTeam(team.id, { flag: event.target.value })} />
          <input aria-label="Team name" value={team.name} onChange={(event) => updateTeam(team.id, { name: event.target.value })} />
          <input aria-label="Code" value={team.code} onChange={(event) => updateTeam(team.id, { code: event.target.value.toUpperCase().slice(0, 3) })} />
          <select value={team.pot} onChange={(event) => updateTeam(team.id, { pot: Number(event.target.value) })}>
            {[1, 2, 3, 4].map((pot) => <option key={pot} value={pot}>Pot {pot}</option>)}
          </select>
          <select value={team.status} onChange={(event) => updateTeam(team.id, { status: event.target.value })}>
            {STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
          </select>
        </div>)}
      </div>
    </div>

    <div className="card danger-zone">
      <p className="eyebrow">Local data</p>
      <h3>Reset this browser</h3>
      <p>Clears local participants, draw, results, and audit entries. Export first if needed.</p>
      <button className="danger-btn" onClick={resetApp}>Reset sweepstake</button>
    </div>
  </section>;
}

function Kpi({ icon, label, value, detail, accent = false }) {
  return <div className={`card kpi-card ${accent ? "accent" : ""}`}><div className="kpi-icon">{React.cloneElement(icon, { size: 20 })}</div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div>;
}

function PrizeCard({ title, prize, empty }) {
  return <div className="card prize-card"><p className="eyebrow">{title}</p>{prize ? <><h3>{prize.participant.name}</h3><div className="mini-team"><span>{prize.team.flag}</span><strong>{prize.team.name}</strong><em>{prize.participant.department || "No department"}</em></div></> : <EmptyState title={empty} detail="Admin updates results manually." />}</div>;
}

function AssignmentRow({ assignment }) {
  return <div className="assignment-row"><span className="team-flag">{assignment.team.flag}</span><div><strong>{assignment.participant.name}</strong><em>{assignment.participant.department || "No department"}</em></div><div><strong>{assignment.team.name}</strong><em>Pot {assignment.team.pot} · {stageLabel(assignment.team.status)}</em></div></div>;
}

function TeamCard({ assignment }) {
  return <article className={`team-card status-${assignment.team.status}`}><div className="team-card-top"><span>{assignment.team.flag}</span><StatusPill tone={toneForStatus(assignment.team.status)} label={stageLabel(assignment.team.status)} /></div><h3>{assignment.team.name}</h3><p>{assignment.team.code} · Pot {assignment.team.pot}</p><div className="owner-chip"><strong>{assignment.participant.name}</strong><span>{assignment.participant.department || "No department"}</span></div></article>;
}

function EmptyPanel({ icon, title, detail }) {
  return <div className="card empty-panel">{React.cloneElement(icon, { size: 34 })}<h2>{title}</h2><p>{detail}</p></div>;
}

function EmptyState({ title, detail }) {
  return <div className="empty-state"><strong>{title}</strong><span>{detail}</span></div>;
}

function StatusPill({ tone = "muted", label }) {
  return <span className={`status-pill ${tone}`}><i />{label}</span>;
}

function pageTitle(view) {
  return ({ dashboard: "Sweepstake control room", join: "Participant registration", reveal: "Live draw reveal", board: "Team ownership board", admin: "Admin setup" })[view] || "World Cup Sweepstake";
}

function stageLabel(value) {
  return STAGES.find((stage) => stage.value === value)?.label || value;
}

function toneForStatus(status) {
  if (status === "winner") return "success";
  if (status === "runner-up") return "info";
  if (status === "eliminated") return "danger";
  return "muted";
}

function formatTime(value) {
  try { return new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value)); }
  catch { return value; }
}

createRoot(document.getElementById("root")).render(<App />);
