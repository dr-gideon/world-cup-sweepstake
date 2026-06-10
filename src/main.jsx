import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const STAGES = [
  { value: "active", label: "Alive" },
  { value: "group", label: "Group" },
  { value: "r32", label: "R32" },
  { value: "r16", label: "R16" },
  { value: "quarter", label: "Quarter" },
  { value: "semi", label: "Semi" },
  { value: "runner-up", label: "Runner-up" },
  { value: "winner", label: "Champion" },
  { value: "eliminated", label: "Out" }
];

const PUBLIC_NAV = ["enter", "draw"];

function App() {
  const route = window.location.pathname;
  const isTeleRoute = route === "/tele";
  const isAdminRoute = route === "/admin";
  const [page, setPage] = useState(isTeleRoute ? "tele" : isAdminRoute ? "admin" : "enter");
  const [state, setState] = useState(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  async function refresh() {
    try {
      const data = await api("/api/state");
      setState(data);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
    if (isAdminRoute) api("/api/auth/status").then((data) => setAdminAuthed(Boolean(data.authenticated))).catch(() => setAdminAuthed(false));
  }, []);

  useEffect(() => {
    const intervalMs = isTeleRoute ? 10000 : isAdminRoute ? 0 : 7000;
    if (!intervalMs) return undefined;
    const id = setInterval(() => refresh(), intervalMs);
    return () => clearInterval(id);
  }, [isTeleRoute, isAdminRoute]);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  async function action(path, options, success) {
    try {
      const data = await api(path, options);
      if (data?.teams) setState(data);
      else await refresh();
      setError("");
      if (success) showToast(success);
      return data;
    } catch (err) {
      setError(err.message);
      showToast(err.message);
      throw err;
    }
  }

  if (!state) return <Splash text={error || "Loading the draw room…"} />;

  return <div className="app">
    <div className="ticker"><div className="ticker-inner">{repeatTickerItems(state).map((item, i) => <span key={i}>{item}<b> · </b></span>)}</div></div>
    {!isTeleRoute && <nav>
      <button className="nav-logo" onClick={() => isAdminRoute ? null : setPage("enter")} aria-label="Home">
        <span className="world-cup-mark" aria-hidden="true">🏆</span>
        <div><div className="nav-title">World Cup 2026</div><div className="nav-sub">Office Sweepstake</div></div>
      </button>
      {!isAdminRoute && <div className="nav-links">{PUBLIC_NAV.map((item) => <button key={item} className={`nav-link ${page === item ? "active" : ""}`} onClick={() => setPage(item)}>{label(item)}</button>)}</div>}
      {isAdminRoute && <div className="nav-links"><span className="admin-route-pill">Admin console</span></div>}
    </nav>}
    {error && <div className="error-bar">{error}</div>}
    {page === "enter" && <EnterPage state={state} action={action} setPage={setPage} />}
    {page === "draw" && <DrawPage state={state} action={action} setPage={setPage} />}
    {page === "tele" && <TelePage state={state} />}
    {page === "admin" && <AdminGate authed={adminAuthed} setAuthed={setAdminAuthed} refresh={refresh}><AdminPage state={state} action={action} refresh={refresh} /></AdminGate>}
    {toast && <div className="success-toast">{toast}</div>}
  </div>;
}

function EnterPage({ state, action, setPage }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [lookup, setLookup] = useState(null);
  const [checking, setChecking] = useState(false);
  const prizes = usePrizes(state);
  const locked = Boolean(state.draw);
  const allowlistReady = state.allowlist?.eligible > 0;
  const canJoin = allowlistReady && lookup?.allowed && !lookup?.joined && !locked && name.trim();

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
    await action("/api/participants", { method: "POST", body: { email, name, department } }, `${name} is in the draw!`);
    setEmail(""); setName(""); setDepartment(""); setLookup(null);
  }

  return <main className="page">
    <div className="hero-layout">
      <section>
        <div className="hero-eyebrow">Free Entry · €80 Prize Pot</div>
        <h1 className="hero-title">Draw your<br />team.<br />Win <span>office</span><br />glory.</h1>
        <p className="hero-body">A fast, fun sweepstake for the 2026 World Cup. Verify your work email, enter the draw, watch the reveal, then follow who survives on the office board.</p>
        <div className="stats-row">
          <Stat value={state.participants.length} label="Players" />
          <Stat value={state.allowlist?.eligible || 0} label="Eligible" />
          <Stat value={Math.max(48 - state.participants.length, 0)} label="Slots left" />
          <Stat value="€80" label="Prize pot" gold />
        </div>
        <div className="btn-row"><button className="btn btn-primary" onClick={() => setPage("draw")}>See draw stage →</button><button className="btn btn-ghost" onClick={() => downloadJson(state)}>Export backup</button></div>
      </section>

      <section className="entry-card">
        <div className="entry-card-header"><div className="entry-card-eyebrow">Admit One</div><div className="entry-card-title">World Cup Draw Night</div><div className="entry-card-sub">Free entry · One verified email</div></div>
        <form className="entry-card-body" onSubmit={submit}>
          <h3>{locked ? "The draw is locked" : "Enter the sweepstake"}</h3>
          <p>{locked ? "Teams are assigned. Head to Draw or Teams." : "Use your work email. Only uploaded employee emails can join."}</p>
          {!allowlistReady && <Notice tone="warn">Admin needs to upload the employee email CSV first.</Notice>}
          <Field label="Work email"><input className="form-input" value={email} disabled={locked || !allowlistReady} placeholder="name@company.com" onBlur={checkEmail} onChange={(e) => { setEmail(e.target.value); setLookup(null); }} /></Field>
          <button type="button" className="btn-check" disabled={!email.trim() || checking || locked || !allowlistReady} onClick={checkEmail}>{checking ? "Checking…" : "Check email"}</button>
          {lookup?.allowed && !lookup?.joined && <Notice tone="ok">You’re on the list{lookup.employee?.name ? ` — welcome, ${lookup.employee.name}.` : "."}</Notice>}
          {lookup?.joined && <Notice tone="warn">Looks like this email is already in the draw.</Notice>}
          {lookup && !lookup.allowed && <Notice tone="warn">This email is not on the sweepstake list.</Notice>}
          <Field label="Your name"><input className="form-input" value={name} disabled={locked || !lookup?.allowed || lookup?.joined} placeholder="e.g. Alex Murphy" onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Department" optional><input className="form-input" value={department} disabled={locked || !lookup?.allowed || lookup?.joined} placeholder="e.g. Sales" onChange={(e) => setDepartment(e.target.value)} /></Field>
          <button className="btn-enter" disabled={!canJoin || state.participants.length >= 48}>🎟 Put me in the draw</button>
        </form>
      </section>
    </div>

    <div className="info-strip">
      <Info icon="🥇" title="€50 champion prize" desc={prizes.winner ? `${prizes.winner.participant.name} — ${prizes.winner.team.name}` : "Waiting for final result"} />
      <Info icon="🥈" title="€30 runner-up prize" desc={prizes.runnerUp ? `${prizes.runnerUp.participant.name} — ${prizes.runnerUp.team.name}` : "Waiting for final result"} />
      <Info icon="🔐" title="Verified entry" desc={`${state.allowlist?.remaining || 0} eligible employees still not joined`} />
    </div>
  </main>;
}

function DrawPage({ state, action, setPage }) {
  const [seed, setSeed] = useState("office-2026");
  const assignments = state.assignments || [];
  const revealed = assignments.filter((a) => a.revealed);
  const canDraw = !state.draw && state.participants.length > 0 && state.participants.length <= 48;
  return <main className="page">
    <div className="hero-eyebrow">Draw Stage</div>
    <h1 className="hero-title small">{state.draw ? "Teams revealed." : "Ready to draw?"}</h1>
    <p className="hero-body">{state.draw ? `${state.participants.length} players have been assigned teams. Reveal them one by one or jump to the board.` : "Once verified players have entered, run the draw to assign all 48 teams."}</p>
    <div className="btn-row draw-actions">
      {!state.draw && <p className="public-note">The organiser will run the draw from the admin console once registration is ready.</p>}
      {state.draw && <p className="public-note">The draw is live. Reveals are controlled by the organiser.</p>}
    </div>
    {state.draw ? <div className="draw-grid">{assignments.map((assignment) => <DrawCard key={assignment.id} assignment={assignment} />)}</div> : <Empty icon="🎲" title="Draw hasn't run yet" desc="Enter with your work email, then watch this page when the organiser starts the reveal." />}
  </main>;
}

function TeamsPage({ state }) {
  const [search, setSearch] = useState("");
  const prizes = usePrizes(state);
  const aliveCount = state.teams.filter((team) => team.status !== "eliminated").length;
  const rows = (state.assignments || []).filter((a) => `${a.team.name} ${a.team.code} ${a.participant.name} ${a.participant.department}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="page">
    <div className="teams-header"><div><div className="hero-eyebrow">Team Board</div><h1 className="hero-title small">Who's still dreaming?</h1></div><input className="search-input" placeholder="Search team, owner, department…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <div className="prizes-row"><Prize icon="🥇" amount="€50" label="Champion" text={prizes.winner ? `${prizes.winner.participant.name} — ${prizes.winner.team.name}` : "Waiting for final result"} /><Prize icon="🥈" amount="€30" label="Runner-up" text={prizes.runnerUp ? `${prizes.runnerUp.participant.name} — ${prizes.runnerUp.team.name}` : "Waiting for final result"} /><Prize icon="⚽" amount={aliveCount} label="Still alive" text="Manual status tracking" green /></div>
    {!state.draw ? <Empty icon="🏆" title="No board yet" desc="Run the draw first." /> : <div className="team-list">{rows.map((assignment) => <TeamRow key={assignment.id} assignment={assignment} />)}</div>}
  </main>;
}

function TelePage({ state }) {
  const impacts = (state.audit || []).filter((event) => event.event === "Match impact");
  const latest = impacts[0];
  const alive = (state.assignments || []).filter((a) => a.team.status !== "eliminated");
  const out = (state.assignments || []).filter((a) => a.team.status === "eliminated");
  const prizes = usePrizes(state);
  return <main className="page tele-page">
    <div className="tele-frame">
      <div className="tele-top"><span>LIVE FROM THE OFFICE DRAW ROOM</span><b>WORLD CUP SWEEPSTAKE</b><span>{new Date().toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}</span></div>
      <section className="tele-hero"><div><div className="hero-eyebrow">Post-match impact</div><h1 className="hero-title tele-title">{latest ? impactHeadline(latest.detail) : "No drama yet."}</h1><p>{latest ? latest.detail : "Update team statuses in Admin after each match and this screen becomes the office broadcast."}</p></div><div className="scorebug"><strong>{alive.length}</strong><span>Alive</span><strong>{out.length}</strong><span>Out</span></div></section>
      <div className="tele-grid"><div className="tele-card"><div className="section-label">Prize race</div><Prize icon="🥇" amount="€50" label="Champion" text={prizes.winner ? `${prizes.winner.participant.name} — ${prizes.winner.team.name}` : "Waiting"} /><Prize icon="🥈" amount="€30" label="Runner-up" text={prizes.runnerUp ? `${prizes.runnerUp.participant.name} — ${prizes.runnerUp.team.name}` : "Waiting"} /></div><div className="tele-card"><div className="section-label">Latest matches</div><TeleMatches matches={state.matches || []} /></div></div>
      <div className="tele-grid"><div className="tele-card wide-card"><div className="section-label">Drama feed</div>{impacts.length ? impacts.slice(0, 6).map((impact, i) => <div className="impact-row" key={i}><b>{impactHeadline(impact.detail)}</b><span>{impact.detail}</span></div>) : <Empty icon="📺" title="No match impacts" desc="Change team statuses after matches." />}</div></div>
      <SurvivalBoard assignments={state.assignments || []} />
    </div>
  </main>;
}

function AdminGate({ authed, setAuthed, refresh, children }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/auth/login", { method: "POST", body: { username, password } });
      setAuthed(true);
      await refresh();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setAuthed(false);
  }

  if (!authed) {
    return <main className="page admin-login-page">
      <section className="entry-card admin-login-card">
        <div className="entry-card-header"><div className="entry-card-eyebrow">Restricted</div><div className="entry-card-title">Admin Login</div><div className="entry-card-sub">Organiser controls only</div></div>
        <form className="entry-card-body" onSubmit={login}>
          <h3>Sign in to manage the draw</h3>
          <p>Admin controls are separate from the employee-facing app.</p>
          {message && <Notice tone="warn">{message}</Notice>}
          <Field label="Username"><input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
          <Field label="Password"><input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <button className="btn-enter" disabled={busy || !username || !password}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>;
  }

  return <>{children}<button className="admin-logout" onClick={logout}>Logout admin</button></>;
}

function AdminPage({ state, action, refresh }) {
  const [csvText, setCsvText] = useState("email,name,department\n");
  const [adminSearch, setAdminSearch] = useState("");
  const csvPreview = useMemo(() => validateEmployeeCsv(csvText), [csvText]);
  const filteredTeams = state.teams.filter((team) => `${team.name} ${team.code}`.toLowerCase().includes(adminSearch.toLowerCase()));
  async function uploadCsv() {
    if (!csvPreview.valid.length) throw new Error("CSV has no valid employee emails.");
    await action("/api/allowlist", { method: "POST", text: csvText, contentType: "text/csv" }, "Employee list uploaded");
    await refresh();
  }
  function downloadTemplate() {
    const template = "email,name,department\nalice@company.com,Alice Murphy,Sales\nbob@company.com,Bob Lee,Support\n";
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "world-cup-sweepstake-employees.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  function loadFile(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => setCsvText(String(reader.result || "")); reader.readAsText(file); }
  async function reset() { if (confirm("Reset participants, draw, and results? Employee list is kept.")) await action("/api/reset", { method: "POST" }, "Sweepstake reset"); }
  return <main className="page">
    <div className="teams-header"><div><div className="hero-eyebrow">Admin Booth</div><h1 className="hero-title small">Control room.</h1></div><div className="btn-row"><button className="btn btn-ghost" onClick={refresh}>Refresh</button><button className="btn btn-ghost danger" onClick={reset}>Reset</button></div></div>
    <section className="admin-panel draw-control-panel"><div className="admin-panel-title">Draw controls</div><p className="admin-panel-sub">Only admin can run or reveal the draw. Employees can only watch Enter/Draw.</p><AdminDrawControls state={state} action={action} /></section>
    <div className="admin-grid">
      <section className="admin-panel"><div className="admin-panel-title">Employee email list</div><p className="admin-panel-sub">Upload CSV: email,name,department. Emails are not shown publicly.</p><div className="allowlist-stats"><b>{state.allowlist?.eligible || 0}</b><span>eligible</span><b>{state.allowlist?.joined || 0}</b><span>joined</span><b>{state.allowlist?.remaining || 0}</b><span>left</span></div><div className="btn-row csv-actions"><button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button><label className="file-upload">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(e) => loadFile(e.target.files?.[0])} /></label></div><textarea className="csv-box" value={csvText} onChange={(e) => setCsvText(e.target.value)} /><CsvPreview preview={csvPreview} /><button className="btn btn-primary full" disabled={Boolean(state.draw) || !csvPreview.valid.length} onClick={uploadCsv}>Upload {csvPreview.valid.length || ""} employee{csvPreview.valid.length === 1 ? "" : "s"}</button></section>
      <section className="admin-panel"><div className="admin-panel-title">Participants</div><p className="admin-panel-sub">Locked after draw.</p>{state.participants.map((p) => <div className="participant-chip" key={p.id}><div className="participant-avatar">{initials(p.name)}</div><div><div className="participant-name">{p.name}</div><div className="participant-dept">{p.department || "No department"}</div></div><button className="participant-delete" disabled={Boolean(state.draw)} onClick={() => action(`/api/participants/${p.id}`, { method: "DELETE" }, "Participant removed")}>×</button></div>)}{!state.participants.length && <Empty icon="👥" title="No participants" desc="Upload the employee list, then people can enter." />}</section>
    </div>
    <MatchAdmin state={state} action={action} />
    <section className="admin-panel wide"><div className="teams-header"><div><div className="admin-panel-title">Teams and results</div><p className="admin-panel-sub">Rename qualifiers and update match status.</p></div><input className="search-input" placeholder="Search teams…" value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} /></div><div>{filteredTeams.map((team) => <AdminTeamRow key={team.id} team={team} action={action} />)}</div></section>
  </main>;
}

function MatchAdmin({ state, action }) {
  const first = state.teams[0]?.id || "";
  const second = state.teams[1]?.id || "";
  const [form, setForm] = useState({ stage: "Group", kickoff: "", homeTeamId: first, awayTeamId: second, homeScore: "", awayScore: "", status: "scheduled", notes: "" });
  useEffect(() => { setForm((current) => ({ ...current, homeTeamId: current.homeTeamId || first, awayTeamId: current.awayTeamId || second })); }, [first, second]);
  function update(patch) { setForm((current) => ({ ...current, ...patch })); }
  async function save() {
    await action("/api/matches", { method: "POST", body: form }, "Match saved");
    setForm((current) => ({ ...current, homeScore: "", awayScore: "", notes: "" }));
  }
  return <section className="admin-panel wide match-admin"><div className="teams-header"><div><div className="admin-panel-title">Fixtures and results</div><p className="admin-panel-sub">Manual match layer now, live provider later. Tele reads from these results.</p></div></div>
    <div className="match-form">
      <input className="admin-input" value={form.stage} onChange={(e) => update({ stage: e.target.value })} placeholder="Stage" />
      <input className="admin-input" type="datetime-local" value={form.kickoff} onChange={(e) => update({ kickoff: e.target.value })} />
      <select className="admin-select" value={form.homeTeamId} onChange={(e) => update({ homeTeamId: e.target.value })}>{state.teams.map((team) => <option key={team.id} value={team.id}>{team.flag} {team.name}</option>)}</select>
      <select className="admin-select" value={form.awayTeamId} onChange={(e) => update({ awayTeamId: e.target.value })}>{state.teams.map((team) => <option key={team.id} value={team.id}>{team.flag} {team.name}</option>)}</select>
      <input className="admin-input" type="number" min="0" value={form.homeScore} onChange={(e) => update({ homeScore: e.target.value })} placeholder="Home" />
      <input className="admin-input" type="number" min="0" value={form.awayScore} onChange={(e) => update({ awayScore: e.target.value })} placeholder="Away" />
      <select className="admin-select" value={form.status} onChange={(e) => update({ status: e.target.value })}><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="finished">Finished</option><option value="postponed">Postponed</option></select>
      <input className="admin-input" value={form.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Notes" />
      <button className="btn btn-primary" disabled={!form.homeTeamId || !form.awayTeamId || form.homeTeamId === form.awayTeamId} onClick={save}>Save match</button>
    </div>
    <div className="match-list">{(state.matches || []).slice().reverse().map((match) => <div className="match-row" key={match.id}><span>{match.stage}</span><b>{match.homeFlag} {match.homeName}</b><strong>{scoreText(match)}</strong><b>{match.awayFlag} {match.awayName}</b><em>{match.status}</em><button className="participant-delete" onClick={() => action(`/api/matches/${match.id}`, { method: "DELETE" }, "Match removed")}>×</button></div>)}{!(state.matches || []).length && <Empty icon="⚽" title="No matches yet" desc="Add fixtures or results manually for Tele." />}</div>
  </section>;
}

function TeleMatches({ matches }) {
  const latest = matches.filter((m) => m.status === "live" || m.status === "finished").slice(-4).reverse();
  const upcoming = matches.filter((m) => m.status === "scheduled").slice(0, 3);
  const rows = latest.length ? latest : upcoming;
  if (!rows.length) return <Empty icon="⚽" title="No fixtures yet" desc="Admin can add manual fixtures/results." />;
  return <div className="tele-match-list">{rows.map((match) => <div className={`tele-match ${match.status}`} key={match.id}><span>{match.stage}</span><b>{match.homeFlag} {match.homeCode}</b><strong>{scoreText(match)}</strong><b>{match.awayCode} {match.awayFlag}</b><em>{match.status}</em></div>)}</div>;
}

function scoreText(match) {
  const home = match.homeScore ?? "-";
  const away = match.awayScore ?? "-";
  return `${home} : ${away}`;
}

function AdminDrawControls({ state, action }) {
  const [seed, setSeed] = useState("office-2026");
  const canDraw = !state.draw && state.participants.length > 0 && state.participants.length <= 48;
  return <div className="admin-draw-controls">
    {!state.draw && <><input className="seed-input" value={seed} onChange={(e) => setSeed(e.target.value)} /><button className="btn btn-primary" disabled={!canDraw} onClick={() => action("/api/draw", { method: "POST", body: { seed } }, "Draw complete")}>Run draw ({state.participants.length})</button></>}
    {state.draw && <><button className="btn btn-primary" onClick={() => action("/api/reveal-next", { method: "POST" }, "Next team revealed")}>Reveal next</button><button className="btn btn-ghost" onClick={() => action("/api/reveal-all", { method: "POST" }, "All teams revealed")}>Reveal all</button></>}
  </div>;
}

function CsvPreview({ preview }) {
  return <div className="csv-preview">
    <div><b>{preview.valid.length}</b><span>valid</span></div>
    <div><b>{preview.duplicates.length}</b><span>duplicates</span></div>
    <div><b>{preview.invalid.length}</b><span>invalid</span></div>
    {(preview.duplicates.length > 0 || preview.invalid.length > 0) && <p>{preview.duplicates.length ? `Duplicates ignored: ${preview.duplicates.slice(0, 3).join(", ")}${preview.duplicates.length > 3 ? "…" : ""}. ` : ""}{preview.invalid.length ? `Invalid rows: ${preview.invalid.slice(0, 3).join(", ")}${preview.invalid.length > 3 ? "…" : ""}.` : ""}</p>}
  </div>;
}

function AdminTeamRow({ team, action }) {
  function patch(patchBody) { action(`/api/teams/${team.id}`, { method: "PATCH", body: patchBody }); }
  return <div className="admin-team-row"><input className="admin-input flag" value={team.flag} onChange={(e) => patch({ flag: e.target.value })} /><input className="admin-input" value={team.name} onChange={(e) => patch({ name: e.target.value })} /><input className="admin-input" value={team.code} onChange={(e) => patch({ code: e.target.value })} /><select className="admin-select" value={team.pot} onChange={(e) => patch({ pot: Number(e.target.value) })}>{[1,2,3,4].map((pot) => <option key={pot} value={pot}>Pot {pot}</option>)}</select><select className="admin-select" value={team.status} onChange={(e) => patch({ status: e.target.value })}>{STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></div>;
}

function DrawCard({ assignment }) {
  const pot = potColor(assignment.team.pot);
  return <div className={`draw-card ${assignment.revealed ? "assigned" : "hidden"}`}><span className="pot-badge" style={{ background: pot.bg, color: pot.text }}>POT {assignment.team.pot}</span><div className="draw-card-flag">{assignment.revealed ? assignment.team.flag : "❔"}</div><div className="draw-card-team">{assignment.revealed ? assignment.team.name : "Hidden team"}</div>{assignment.revealed ? <div className="draw-card-owner">{assignment.participant.name}</div> : <div className="draw-card-empty">Waiting reveal</div>}</div>;
}

function TeamRow({ assignment }) {
  return <div className={`team-row ${assignment.team.status === "eliminated" ? "eliminated" : ""}`}><div className="team-flag">{assignment.team.flag}</div><div><div className="team-name">{assignment.team.name}</div><div className="team-name-sub">Pot {assignment.team.pot}</div></div><div className="team-code">{assignment.team.code}</div><div className="team-owner">{assignment.participant.name}</div><Status status={assignment.team.status} /></div>;
}

function SurvivalBoard({ assignments }) {
  const stages = ["winner", "runner-up", "semi", "quarter", "r16", "r32", "group", "active"];
  return <div className="survival-board">{stages.map((stage) => { const rows = assignments.filter((a) => a.team.status === stage); if (!rows.length) return null; return <div className="survival-column" key={stage}><h3>{stageLabel(stage)}</h3>{rows.slice(0, 8).map((a) => <div className="survival-row" key={a.id}><span>{a.team.flag}</span><b>{a.participant.name}</b><em>{a.team.name}</em></div>)}{rows.length > 8 && <small>+{rows.length - 8} more</small>}</div>; })}</div>;
}

function Status({ status }) { return <span className={`status-badge ${status}`}>{stageLabel(status)}</span>; }
function Stat({ value, label, gold }) { return <div className="stat-pill"><div className={`stat-pill-num ${gold ? "gold" : ""}`}>{value}</div><div className="stat-pill-label">{label}</div></div>; }
function Info({ icon, title, desc }) { return <div className="info-strip-card"><div className="info-strip-icon">{icon}</div><div className="info-strip-title">{title}</div><div className="info-strip-desc">{desc}</div></div>; }
function Prize({ icon, amount, label, text, green }) { return <div className="prize-card"><div className="prize-icon">{icon}</div><div className="prize-amount" style={green ? { color: "#22c55e" } : undefined}>{amount}</div><div className="prize-label">{label}</div><div className="prize-status">{text}</div></div>; }
function Field({ label, optional, children }) { return <div className="form-group"><div className="form-label">{label} {optional && <span>(optional)</span>}</div>{children}</div>; }
function Notice({ tone, children }) { return <p className={`notice ${tone}`}>{children}</p>; }
function Empty({ icon, title, desc }) { return <div className="empty-state"><div className="empty-state-icon">{icon}</div><div className="empty-state-title">{title}</div><div className="empty-state-desc">{desc}</div></div>; }
function Splash({ text }) { return <div className="app splash"><div className="empty-state"><div className="empty-state-icon">🏆</div><div className="empty-state-title">{text}</div></div></div>; }

function usePrizes(state) { return useMemo(() => ({ winner: state.assignments?.find((a) => a.team.status === "winner") || null, runnerUp: state.assignments?.find((a) => a.team.status === "runner-up") || null }), [state.assignments]); }
function tickerItems(state) { return ["FREE ENTRY", "€80 PRIZE POT", `${state.participants.length} PLAYERS`, `${state.allowlist?.remaining || 0} NOT JOINED`, "OFFICE GLORY AWAITS"]; }
function validateEmployeeCsv(text) {
  const rows = parseCsv(text);
  const headers = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const emailIndex = headers.indexOf("email");
  const nameIndex = headers.indexOf("name");
  const departmentIndex = headers.indexOf("department");
  const seen = new Set();
  const valid = [];
  const duplicates = [];
  const invalid = [];
  if (emailIndex === -1) return { valid, duplicates, invalid: rows.length ? ["missing email column"] : [] };
  rows.slice(1).forEach((row, index) => {
    const email = String(row[emailIndex] || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { invalid.push(`row ${index + 2}`); return; }
    if (seen.has(email)) { duplicates.push(email); return; }
    seen.add(email);
    valid.push({ email, name: row[nameIndex] || "", department: row[departmentIndex] || "" });
  });
  return { valid, duplicates, invalid };
}
function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  const input = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]; const next = input[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ""; continue; }
    if (char === "\n" && !quoted) { row.push(cell); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  row.push(cell); if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function repeatTickerItems(state) { return Array.from({ length: 8 }, () => tickerItems(state)).flat(); }
function label(view) { return { enter: "Enter", draw: "Draw", teams: "Teams", tele: "Tele", admin: "Admin" }[view]; }
function stageLabel(value) { return STAGES.find((stage) => stage.value === value)?.label || value; }
function potColor(pot) { return ({ 1: { bg: "#FFD700", text: "#1a1200" }, 2: { bg: "#C0C0C0", text: "#111" }, 3: { bg: "#CD7F32", text: "#1a0800" }, 4: { bg: "#2a3050", text: "#9ba3c9" } })[pot] || { bg: "#2a3050", text: "#fff" }; }
function initials(name) { return String(name || "?").split(/\s+/).slice(0,2).map((p) => p[0]).join("").toUpperCase(); }
function impactHeadline(detail = "") { const [, owner = "Someone"] = detail.split("|").map((p) => p.trim()); if (detail.includes("→ eliminated")) return `${owner} just took a hit`; if (detail.includes("→ winner")) return `${owner} has won the sweepstake`; if (detail.includes("→ runner-up")) return `${owner} is in the €30 seat`; return `${owner} survives another round`; }
function downloadJson(data) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `world-cup-sweepstake-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url); }
async function api(path, options = {}) { const hasText = Object.prototype.hasOwnProperty.call(options, "text"); const response = await fetch(path, { method: options.method || "GET", headers: hasText ? { "Content-Type": options.contentType || "text/plain" } : options.body ? { "Content-Type": "application/json" } : undefined, body: hasText ? options.text : options.body ? JSON.stringify(options.body) : undefined }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Request failed: ${response.status}`); } if (response.status === 204) return null; return response.json(); }

createRoot(document.getElementById("root")).render(<App />);
