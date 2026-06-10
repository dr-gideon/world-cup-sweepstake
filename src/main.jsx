import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronRight, Download, Flag, PartyPopper, RefreshCcw, Sparkles, Trophy, Users, WandSparkles } from "lucide-react";
import { STAGES } from "./teams.js";
import "./styles.css";

const views = ["enter", "draw", "teams", "tele", "admin"];

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
      {view === "tele" && <TeleScreen state={state} />}
      {view === "admin" && <AdminScreen state={state} action={action} refresh={refresh} />}
    </main>
  </div>;
}

function EnterScreen({ state, action, goDraw }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [lookup, setLookup] = useState(null);
  const [checking, setChecking] = useState(false);
  const spotsLeft = Math.max(48 - state.participants.length, 0);
  const locked = Boolean(state.draw);
  const allowlistReady = state.allowlist?.eligible > 0;
  const canJoin = allowlistReady && lookup?.allowed && !lookup?.joined && !locked && name.trim();
  const prizes = usePrizes(state);

  async function checkEmail() {
    if (!email.trim()) return;
    setChecking(true);
    try {
      const result = await api(`/api/allowlist/lookup?email=${encodeURIComponent(email)}`);
      setLookup(result);
      if (result.employee?.name) setName(result.employee.name);
      if (result.employee?.department) setDepartment(result.employee.department);
    } finally {
      setChecking(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!canJoin) return;
    await action("/api/participants", { method: "POST", body: { email, name, department } });
    setEmail("");
    setName("");
    setDepartment("");
    setLookup(null);
  }

  return <section className="hero-grid">
    <div className="hero-copy">
      <p className="kicker"><Sparkles size={16} /> Free entry · CEO sponsored · €80 prize pot</p>
      <h1>Draw your team. Survive the chaos. Win office glory.</h1>
      <p className="hero-text">A fast, fun sweepstake for the 2026 World Cup. Join the draw, watch the team reveal, then follow who is still alive on the office board.</p>
      <div className="hero-stats" aria-label="Sweepstake stats">
        <Stat value={state.participants.length} label="players joined" />
        <Stat value={state.allowlist?.eligible || 0} label="eligible emails" />
        <Stat value={state.allowlist?.remaining || 0} label="not joined yet" />
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
        <p>{locked ? "The teams are already assigned. Head to the reveal or team board." : "Use your work email. Only emails on the organiser's list can join."}</p>
        {!allowlistReady && <p className="form-note warning">Registration is waiting for the organiser to upload the employee email list.</p>}
        <label>Work email<input value={email} onChange={(event) => { setEmail(event.target.value); setLookup(null); }} onBlur={checkEmail} disabled={locked || !allowlistReady} placeholder="name@company.com" /></label>
        <button type="button" className="quiet-form-btn" disabled={!email.trim() || checking || locked || !allowlistReady} onClick={checkEmail}>{checking ? "Checking…" : "Check email"}</button>
        {lookup?.allowed && !lookup?.joined && <p className="form-note success">You’re on the list{lookup.employee?.name ? ` — welcome, ${lookup.employee.name}.` : "."}</p>}
        {lookup?.joined && <p className="form-note warning">Looks like this email is already in the draw.</p>}
        {lookup && !lookup.allowed && <p className="form-note warning">This email is not on the sweepstake list. Check spelling or ask the organiser.</p>}
        <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} disabled={locked || !lookup?.allowed || lookup?.joined} placeholder="e.g. Alex Murphy" /></label>
        <label>Department <span>optional</span><input value={department} onChange={(event) => setDepartment(event.target.value)} disabled={locked || !lookup?.allowed || lookup?.joined} placeholder="e.g. Sales" /></label>
        <button className="submit-btn" disabled={!canJoin || state.participants.length >= 48}><PartyPopper size={18} /> Put me in the draw</button>
        {state.participants.length >= 48 && !locked && <p className="form-note warning">All 48 slots are full. Shared-team mode would need a new rule.</p>}
      </form>
    </div>

    <div className="live-strip">
      <PrizeMini title="€50 champion" prize={prizes.winner} />
      <PrizeMini title="€30 runner-up" prize={prizes.runnerUp} />
      <div className="mini-panel"><strong>{locked ? "Draw locked" : allowlistReady ? "Email-gated entry" : "Awaiting list"}</strong><span>{locked ? "Participants can no longer be edited." : allowlistReady ? "Only uploaded employee emails can join." : "Admin must upload CSV first."}</span></div>
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

function TeleScreen({ state }) {
  const assignments = state.assignments || [];
  const latestImpact = state.audit?.find((event) => event.event === "Match impact");
  const alive = assignments.filter((assignment) => assignment.team.status !== "eliminated");
  const eliminated = assignments.filter((assignment) => assignment.team.status === "eliminated");
  const stageGroups = ["winner", "runner-up", "semi", "quarter", "r16", "r32", "group", "active"];
  const prizes = usePrizes(state);

  return <section className="tele-page">
    <div className="broadcast-frame">
      <div className="broadcast-topline"><span>LIVE FROM THE OFFICE DRAW ROOM</span><strong>WORLD CUP SWEEPSTAKE</strong><em>{new Date().toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}</em></div>
      <div className="broadcast-hero">
        <div>
          <p className="kicker"><Sparkles size={16} /> Post-match impact</p>
          <h1>{latestImpact ? impactHeadline(latestImpact.detail) : "No drama yet. Give it time."}</h1>
          <p>{latestImpact ? latestImpact.detail : "Update team statuses in Admin after each match and this screen becomes the office broadcast."}</p>
        </div>
        <div className="broadcast-scorebug">
          <strong>{alive.length}</strong><span>still alive</span>
          <strong>{eliminated.length}</strong><span>eliminated</span>
        </div>
      </div>

      <div className="broadcast-grid">
        <div className="broadcast-card prize-live">
          <p>Prize race</p>
          <PrizeMini title="€50 champion" prize={prizes.winner} />
          <PrizeMini title="€30 runner-up" prize={prizes.runnerUp} />
        </div>
        <div className="broadcast-card impact-feed">
          <p>Drama feed</p>
          {(state.audit || []).filter((event) => event.event === "Match impact").slice(0, 6).map((event, index) => <div className="impact-row" key={`${event.at}-${index}`}><strong>{impactHeadline(event.detail)}</strong><span>{event.detail}</span></div>)}
          {!(state.audit || []).some((event) => event.event === "Match impact") && <Empty title="No match impacts yet" text="Change a team status in Admin after a match." />}
        </div>
      </div>

      <div className="survival-board">
        {stageGroups.map((stage) => {
          const rows = assignments.filter((assignment) => assignment.team.status === stage);
          if (!rows.length) return null;
          return <div className="survival-column" key={stage}>
            <h2>{stageName(stage)}</h2>
            {rows.slice(0, 8).map((assignment) => <div className="survival-row" key={assignment.id}><span>{assignment.team.flag}</span><strong>{assignment.participant.name}</strong><em>{assignment.team.name}</em></div>)}
            {rows.length > 8 && <small>+{rows.length - 8} more</small>}
          </div>;
        })}
      </div>

      <div className="ticker"><span>OFFICE SWEEPSTAKE LIVE</span><p>{tickerText(state)}</p></div>
    </div>
  </section>;
}

function AdminScreen({ state, action, refresh }) {
  const [csvText, setCsvText] = useState("email,name,department\n");
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

  async function uploadCsv() {
    await action("/api/allowlist", { method: "POST", text: csvText, contentType: "text/csv" });
    await refresh();
  }

  function loadCsvFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(file);
  }

  return <section className="admin-page">
    <div className="section-heading compact">
      <p className="kicker"><RefreshCcw size={16} /> Admin booth</p>
      <h1>Control the sweepstake</h1>
      <div className="cta-row"><button className="quiet-btn" onClick={refresh}>Refresh</button><button className="quiet-btn danger" onClick={reset}>Reset</button></div>
    </div>

    <div className="admin-grid">
      <div className="glass-panel">
        <h2>Employee email list</h2>
        <p>Upload CSV with columns: email, name, department. Emails are used only for eligibility and duplicate prevention.</p>
        <div className="allowlist-stats"><strong>{state.allowlist?.eligible || 0}</strong><span>eligible</span><strong>{state.allowlist?.joined || 0}</strong><span>joined</span><strong>{state.allowlist?.remaining || 0}</strong><span>not joined</span></div>
        <label className="file-picker">Upload CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => loadCsvFile(event.target.files?.[0])} /></label>
        <textarea className="csv-box" value={csvText} onChange={(event) => setCsvText(event.target.value)} spellCheck="false" />
        <button className="submit-btn" disabled={Boolean(state.draw)} onClick={uploadCsv}>Upload employee list</button>
      </div>

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

function impactHeadline(detail = "") {
  const [teamPart, ownerPart = ""] = detail.split("|").map((part) => part.trim());
  if (teamPart.includes("→ eliminated")) return `${ownerPart || "Someone"} just took a hit`;
  if (teamPart.includes("→ winner")) return `${ownerPart || "Someone"} has won the sweepstake`;
  if (teamPart.includes("→ runner-up")) return `${ownerPart || "Someone"} is in the €30 seat`;
  if (teamPart.includes("→ semi") || teamPart.includes("→ quarter") || teamPart.includes("→ r16") || teamPart.includes("→ r32")) return `${ownerPart || "Someone"} survives another round`;
  return teamPart || "Match impact updated";
}

function stageName(stage) {
  return STAGES.find((item) => item.value === stage)?.label || stage;
}

function tickerText(state) {
  const impacts = (state.audit || []).filter((event) => event.event === "Match impact").slice(0, 4).map((event) => event.detail);
  if (impacts.length) return impacts.join("  •  ");
  if (!state.draw) return "Registration is open. Add names, run the draw, then put this view on the office TV.";
  return `${state.assignments?.length || 0} teams assigned. Update statuses after matches to generate live drama.`;
}

function labelForView(view) {
  return { enter: "Enter", draw: "Draw", teams: "Teams", tele: "Tele", admin: "Admin" }[view];
}

async function api(path, options = {}) {
  const hasText = Object.prototype.hasOwnProperty.call(options, "text");
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: hasText ? { "Content-Type": options.contentType || "text/plain" } : options.body ? { "Content-Type": "application/json" } : undefined,
    body: hasText ? options.text : options.body ? JSON.stringify(options.body) : undefined
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
