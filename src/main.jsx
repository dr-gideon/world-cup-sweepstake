import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronRight, Download, Flag, PartyPopper, RefreshCcw, Sparkles, Trophy, Users, WandSparkles } from "lucide-react";
import { STAGES } from "./teams.js";
import "./styles.css";

const views = ["enter", "draw", "teams", "admin"];

function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("enter");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const next = await api("/api/state");
      setState(next);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function action(path, options) {
    try {
      const next = await api(path, options);
      if (next?.teams) setState(next);
      else await refresh();
      setError("");
      return next;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  if (loading && !state) return <Splash text="Warming up the draw machine…" />;
  if (!state) return <Splash text={error || "Could not load sweepstake."} />;

  return <div className="experience-shell">
    <Ambient />
    <header className="site-header">
      <button className="logo-button" onClick={() => setView("enter")} aria-label="World Cup Sweepstake home">
        <span className="logo-orb"><Trophy size={22} /></span>
        <span><strong>World Cup 2026</strong><em>Office Sweepstake</em></span>
      </button>
      <nav className="top-nav" aria-label="App sections">
        {views.map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{labelForView(item)}</button>)}
      </nav>
    </header>

    {error && <div className="toast" role="alert">{error}</div>}

    <main>
      {view === "enter" && <EnterScreen state={state} action={action} goDraw={() => setView("draw")} />}
      {view === "draw" && <DrawScreen state={state} action={action} goTeams={() => setView("teams")} />}
      {view === "teams" && <TeamsScreen state={state} />}
      {view === "admin" && <AdminScreen state={state} action={action} refresh={refresh} />}
    </main>
  </div>;
}

function EnterScreen({ state, action, goDraw }) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const spotsLeft = Math.max(48 - state.participants.length, 0);
  const locked = Boolean(state.draw);
  const prizes = usePrizes(state);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim() || locked) return;
    await action("/api/participants", { method: "POST", body: { name, department } });
    setName("");
    setDepartment("");
  }

  return <section className="hero-grid">
    <div className="hero-copy">
      <p className="kicker"><Sparkles size={16} /> Free entry · CEO sponsored · €80 prize pot</p>
      <h1>Draw your team. Survive the chaos. Win office glory.</h1>
      <p className="hero-text">A fast, fun sweepstake for the 2026 World Cup. Join the draw, watch the team reveal, then follow who is still alive on the office board.</p>
      <div className="hero-stats" aria-label="Sweepstake stats">
        <Stat value={state.participants.length} label="players joined" />
        <Stat value={spotsLeft} label="team slots left" />
        <Stat value="€50" label="champion prize" />
        <Stat value="€30" label="runner-up prize" />
      </div>
      <div className="cta-row">
        <button className="mega-btn" onClick={goDraw}>{state.draw ? "Watch the reveal" : "See draw stage"}<ChevronRight size={20} /></button>
        <button className="quiet-btn" onClick={() => downloadJson(state)}>Export backup</button>
      </div>
    </div>

    <div className="entry-card">
      <div className="ticket-stub"><span>ADMIT ONE</span><strong>World Cup Draw Night</strong><em>Free entry</em></div>
      <form onSubmit={submit}>
        <h2>{locked ? "The draw is locked" : "Enter the sweepstake"}</h2>
        <p>{locked ? "The teams are already assigned. Head to the reveal or team board." : "Add your name before the draw closes. No buy-in, no fuss."}</p>
        <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} disabled={locked} placeholder="e.g. Alex Murphy" /></label>
        <label>Department <span>optional</span><input value={department} onChange={(event) => setDepartment(event.target.value)} disabled={locked} placeholder="e.g. Sales" /></label>
        <button className="submit-btn" disabled={locked || !name.trim() || state.participants.length >= 48}><PartyPopper size={18} /> Put me in the draw</button>
        {state.participants.length >= 48 && !locked && <p className="form-note warning">All 48 slots are full. Shared-team mode would need a new rule.</p>}
      </form>
    </div>

    <div className="live-strip">
      <PrizeMini title="€50 champion" prize={prizes.winner} />
      <PrizeMini title="€30 runner-up" prize={prizes.runnerUp} />
      <div className="mini-panel"><strong>{locked ? "Draw locked" : "Registration open"}</strong><span>{locked ? "Participants can no longer be edited." : "Still accepting names."}</span></div>
    </div>
  </section>;
}

function DrawScreen({ state, action, goTeams }) {
  const [seed, setSeed] = useState("office-2026");
  const assignments = state.assignments || [];
  const revealed = assignments.filter((assignment) => assignment.revealed);
  const current = revealed.at(-1);
  const canDraw = !state.draw && state.participants.length > 0 && state.participants.length <= 48;

  async function runDraw() {
    await action("/api/draw", { method: "POST", body: { seed } });
  }

  return <section className="draw-world">
    <div className="stage-card">
      <div className="stage-lights" />
      <p className="kicker"><WandSparkles size={16} /> Live reveal stage</p>
      {current ? <div className="reveal-moment" key={current.id}>
        <span className="giant-flag">{current.team.flag}</span>
        <p className="drawn-name">{current.participant.name}</p>
        <h1>{current.team.name}</h1>
        <p className="team-meta">Pot {current.team.pot} · {current.team.code} · {current.participant.department || "No department"}</p>
      </div> : <div className="reveal-moment idle">
        <span className="giant-flag">🏆</span>
        <p className="drawn-name">Ready?</p>
        <h1>{state.draw ? "Start revealing teams" : "Lock the draw"}</h1>
        <p className="team-meta">{state.participants.length} participants · 48 team slots</p>
      </div>}
      <div className="stage-actions">
        {!state.draw && <><input className="seed-input" value={seed} onChange={(event) => setSeed(event.target.value)} aria-label="Draw seed" /><button className="mega-btn" disabled={!canDraw} onClick={runDraw}>Run the draw</button></>}
        {state.draw && <><button className="mega-btn" onClick={() => action("/api/reveal-next", { method: "POST" })}>Reveal next team</button><button className="quiet-btn inverted" onClick={() => action("/api/reveal-all", { method: "POST" })}>Reveal all</button><button className="quiet-btn inverted" onClick={goTeams}>Open board</button></>}
      </div>
      {!canDraw && !state.draw && <p className="stage-warning">Need 1–48 participants before the draw can run.</p>}
    </div>

    <aside className="reveal-rail">
      <div className="rail-header"><strong>{revealed.length} / 48 revealed</strong><span>Latest picks</span></div>
      <div className="pick-list">
        {revealed.length === 0 && <Empty title="No picks revealed yet" text="Run the draw, then reveal teams one by one." />}
        {revealed.slice().reverse().map((assignment) => <PickRow key={assignment.id} assignment={assignment} />)}
      </div>
    </aside>
  </section>;
}

function TeamsScreen({ state }) {
  const [query, setQuery] = useState("");
  const prizes = usePrizes(state);
  const teams = (state.assignments || []).filter((assignment) => `${assignment.team.name} ${assignment.team.code} ${assignment.participant.name} ${assignment.participant.department}`.toLowerCase().includes(query.toLowerCase()));

  return <section className="teams-page">
    <div className="section-heading">
      <p className="kicker"><Flag size={16} /> Team board</p>
      <h1>Who’s still dreaming?</h1>
      <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team, owner, or department" />
    </div>
    <div className="live-strip">
      <PrizeMini title="€50 champion" prize={prizes.winner} />
      <PrizeMini title="€30 runner-up" prize={prizes.runnerUp} />
      <div className="mini-panel"><strong>{state.teams.filter((team) => team.status !== "eliminated").length} alive</strong><span>Manual result tracking</span></div>
    </div>
    {!state.draw ? <Empty title="No board yet" text="Run the draw first, then this becomes the public office leaderboard." /> : <div className="card-grid">
      {teams.map((assignment) => <TeamTile key={assignment.id} assignment={assignment} />)}
    </div>}
  </section>;
}

function AdminScreen({ state, action, refresh }) {
  async function patchTeam(id, patch) {
    await action(`/api/teams/${id}`, { method: "PATCH", body: patch });
  }
  async function remove(id) {
    await action(`/api/participants/${id}`, { method: "DELETE" });
  }
  async function reset() {
    if (!confirm("Reset participants, draw, and results? Export first if this is real data.")) return;
    await action("/api/reset", { method: "POST" });
  }

  return <section className="admin-page">
    <div className="section-heading compact">
      <p className="kicker"><RefreshCcw size={16} /> Admin booth</p>
      <h1>Control the sweepstake</h1>
      <div className="cta-row"><button className="quiet-btn" onClick={refresh}>Refresh</button><button className="quiet-btn danger" onClick={reset}>Reset</button></div>
    </div>

    <div className="admin-grid">
      <div className="glass-panel">
        <h2>Participants</h2>
        <p>{state.draw ? "Locked after draw." : "Editable until the draw runs."}</p>
        <div className="admin-list">
          {state.participants.map((participant) => <div className="admin-row" key={participant.id}><span><strong>{participant.name}</strong><em>{participant.department || "No department"}</em></span><button disabled={Boolean(state.draw)} onClick={() => remove(participant.id)}>Remove</button></div>)}
          {state.participants.length === 0 && <Empty title="No participants" text="Use the entry page to add people." />}
        </div>
      </div>

      <div className="glass-panel wide">
        <h2>Teams and results</h2>
        <p>Rename qualifier slots when the final 2026 field is known. Update statuses manually during the tournament.</p>
        <div className="team-table">
          {state.teams.map((team) => <div className="team-edit" key={team.id}>
            <input value={team.flag} onChange={(event) => patchTeam(team.id, { flag: event.target.value })} aria-label="Flag" />
            <input value={team.name} onChange={(event) => patchTeam(team.id, { name: event.target.value })} aria-label="Team name" />
            <input value={team.code} onChange={(event) => patchTeam(team.id, { code: event.target.value })} aria-label="Code" />
            <select value={team.pot} onChange={(event) => patchTeam(team.id, { pot: Number(event.target.value) })}>{[1,2,3,4].map((pot) => <option key={pot} value={pot}>Pot {pot}</option>)}</select>
            <select value={team.status} onChange={(event) => patchTeam(team.id, { status: event.target.value })}>{STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select>
          </div>)}
        </div>
      </div>
    </div>
  </section>;
}

function Ambient() {
  return <div className="ambient" aria-hidden><span /><span /><span /></div>;
}

function Splash({ text }) {
  return <div className="splash"><Ambient /><div className="splash-card"><Trophy size={38} /><strong>{text}</strong></div></div>;
}

function Stat({ value, label }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>;
}

function PrizeMini({ title, prize }) {
  return <div className="mini-panel prize"><span>{prize?.team?.flag || "🏆"}</span><strong>{prize ? prize.participant.name : title}</strong><em>{prize ? `${prize.team.name} · ${title}` : "Waiting for final result"}</em></div>;
}

function PickRow({ assignment }) {
  return <div className="pick-row"><span>{assignment.team.flag}</span><strong>{assignment.participant.name}</strong><em>{assignment.team.name}</em></div>;
}

function TeamTile({ assignment }) {
  return <article className={`team-tile ${assignment.team.status}`}>
    <div><span className="tile-flag">{assignment.team.flag}</span><Status status={assignment.team.status} /></div>
    <h2>{assignment.team.name}</h2>
    <p>{assignment.team.code} · Pot {assignment.team.pot}</p>
    <footer><strong>{assignment.participant.name}</strong><span>{assignment.participant.department || "No department"}</span></footer>
  </article>;
}

function Status({ status }) {
  const label = STAGES.find((stage) => stage.value === status)?.label || status;
  return <span className={`status ${status}`}>{label}</span>;
}

function Empty({ title, text }) {
  return <div className="empty"><strong>{title}</strong><span>{text}</span></div>;
}

function usePrizes(state) {
  return useMemo(() => ({
    winner: state.assignments?.find((assignment) => assignment.team.status === "winner") || null,
    runnerUp: state.assignments?.find((assignment) => assignment.team.status === "runner-up") || null
  }), [state.assignments]);
}

function labelForView(view) {
  return { enter: "Enter", draw: "Draw", teams: "Teams", admin: "Admin" }[view];
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `world-cup-sweepstake-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

createRoot(document.getElementById("root")).render(<App />);
