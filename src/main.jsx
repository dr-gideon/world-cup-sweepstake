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

const PUBLIC_NAV = ["enter", "draw", "journey"];
const REVEAL_AUDIO = {
  1: ["/audio/reveal-pot-1-a.mp3", "/audio/reveal-pot-1-b.mp3"],
  2: ["/audio/reveal-pot-2-a.mp3", "/audio/reveal-pot-2-b.mp3"],
  3: ["/audio/reveal-pot-3-a.mp3", "/audio/reveal-pot-3-b.mp3"],
  4: ["/audio/reveal-pot-4-a.mp3", "/audio/reveal-pot-4-b.mp3"]
};

function App() {
  const route = window.location.pathname;
  const isTeleRoute = route === "/tele";
  const isStreamRoute = route === "/stream";
  const isAdminRoute = route === "/admin";
  const isJourneyRoute = route === "/journey";
  const isDrawRoute = route === "/draw";
  const [page, setPage] = useState(isTeleRoute ? "tele" : isStreamRoute ? "stream" : isAdminRoute ? "admin" : isJourneyRoute ? "journey" : isDrawRoute ? "draw" : "enter");
  const [state, setState] = useState(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [registeredNotice, setRegisteredNotice] = useState(null);

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
    const intervalMs = isTeleRoute ? 10000 : isStreamRoute ? 3000 : isAdminRoute ? 0 : 7000;
    if (!intervalMs) return undefined;
    const id = setInterval(() => refresh(), intervalMs);
    return () => clearInterval(id);
  }, [isTeleRoute, isStreamRoute, isAdminRoute]);

  function navigatePage(nextPage) {
    const path = nextPage === "enter" ? "/" : `/${nextPage}`;
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setPage(nextPage);
  }

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
    {!isTeleRoute && !isStreamRoute && <nav>
      <button className="nav-logo" onClick={() => isAdminRoute ? null : navigatePage("enter")} aria-label="Home">
        <span className="world-cup-mark" aria-hidden="true">🏆</span>
        <div><div className="nav-title">World Cup 2026</div><div className="nav-sub">Office Sweepstake</div></div>
      </button>
      {!isAdminRoute && <div className="nav-links">{PUBLIC_NAV.map((item) => <button key={item} className={`nav-link ${page === item ? "active" : ""}`} onClick={() => navigatePage(item)}>{label(item)}</button>)}</div>}
      {isAdminRoute && <div className="nav-links"><span className="admin-route-pill">Admin console</span></div>}
    </nav>}
    {error && <div className="error-bar">{error}</div>}
    {page === "enter" && <EnterPage state={state} action={action} setPage={navigatePage} setRegisteredNotice={setRegisteredNotice} />}
    {page === "draw" && <DrawPage state={state} action={action} setPage={navigatePage} />}
    {page === "journey" && <JourneyPage state={state} />}
    {page === "tele" && <TelePage state={state} />}
    {page === "stream" && <StreamPage state={state} />}
    {page === "admin" && <AdminGate authed={adminAuthed} setAuthed={setAdminAuthed} refresh={refresh}><AdminPage state={state} action={action} refresh={refresh} /></AdminGate>}
    {registeredNotice && <RegistrationModal notice={registeredNotice} onClose={() => setRegisteredNotice(null)} onDraw={() => { setRegisteredNotice(null); navigatePage("draw"); }} />}
    {toast && <div className="success-toast">{toast}</div>}
  </div>;
}

function EnterPage({ state, action, setPage, setRegisteredNotice }) {
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

  async function showExistingRegistration() {
    const result = await api(`/api/participants/lookup?email=${encodeURIComponent(email)}`);
    if (result.participant) localStorage.setItem("wcs_participant", JSON.stringify({ id: result.participant.id, email, name: result.participant.name }));
    setRegisteredNotice({ name: result.participant?.name || lookup.employee?.name || name || "You", email, alreadyJoined: true });
  }

  async function submit(event) {
    event.preventDefault();
    if (!canJoin) return;
    const participant = await action("/api/participants", { method: "POST", body: { email, name, department } }, `${name} is in the draw!`);
    localStorage.setItem("wcs_participant", JSON.stringify({ id: participant.id, email, name: participant.name || name }));
    setRegisteredNotice({ name: participant.name || name, email });
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
        <div className="btn-row"><button className="btn btn-primary" onClick={() => setPage("draw")}>See draw stage →</button></div>
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
          {lookup?.joined && <button type="button" className="btn-check" onClick={showExistingRegistration}>Show my registration</button>}
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

function RegistrationModal({ notice, onClose, onDraw }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Registration confirmed">
    <div className="registered-modal">
      <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
      <div className="registered-badge">✓</div>
      <div className="registered-eyebrow">{notice.alreadyJoined ? "Already registered" : "You’re registered"}</div>
      <h2>{notice.name} is in the draw</h2>
      <p>{notice.email} has been verified. {notice.alreadyJoined ? "Go to the Draw page and enter this email to reveal your teams." : "When the draw opens, use this same work email on the Draw page to reveal your teams."}</p>
      <div className="btn-row center"><button className="btn btn-primary" onClick={onDraw}>Go to Draw stage →</button><button className="btn btn-ghost" onClick={onClose}>Stay here</button></div>
    </div>
  </div>;
}

function DrawPage({ state, action, setPage }) {
  const assignments = state.assignments || [];
  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState(null);
  const [revealIndex, setRevealIndex] = useState(0);
  const [revealedTeams, setRevealedTeams] = useState({});
  const [spinning, setSpinning] = useState(false);
  const [spinIndex, setSpinIndex] = useState(0);
  const [showBoard, setShowBoard] = useState(false);
  const [confetti, setConfetti] = useState([]);
  const [soundOn, setSoundOn] = useState(true);
  const remembered = readRememberedParticipant();
  const [nowMs, setNowMs] = useState(Date.now());
  const serverOffsetMs = useMemo(() => state.serverNow ? new Date(state.serverNow).getTime() - Date.now() : 0, [state.serverNow]);
  const drawStartsAt = state.settings?.drawStartsAt || "";
  const drawStartMs = drawStartsAt ? new Date(drawStartsAt).getTime() : 0;
  const drawRemainingMs = Math.max(0, drawStartMs - (nowMs + serverOffsetMs));
  const personalAssignments = lookup?.assignments?.length ? lookup.assignments : [];
  const current = personalAssignments[revealIndex] || personalAssignments[0];
  const isCurrentRevealed = current ? Boolean(current.revealed || revealedTeams[current.id]) : false;
  const spinTeam = state.teams?.[spinIndex % Math.max(state.teams.length, 1)];

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!spinning) return undefined;
    const interval = setInterval(() => setSpinIndex((index) => index + 1), 80);
    return () => clearInterval(interval);
  }, [spinning]);

  async function findTeams(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setRevealedTeams({});
    const result = await api(`/api/participants/lookup?email=${encodeURIComponent(email)}`);
    setLookup(result);
    if (result.participant) localStorage.setItem("wcs_participant", JSON.stringify({ id: result.participant.id, email, name: result.participant.name }));
    setRevealIndex(0);
  }

  function startReveal() {
    if (!current || spinning) return;
    playRevealAudio(current.team.pot, soundOn);
    setSpinning(true);
    setSpinIndex(Math.floor(Math.random() * Math.max(state.teams.length, 1)));
    setTimeout(() => {
      setSpinning(false);
      setRevealedTeams((existing) => ({ ...existing, [current.id]: true }));
      action(`/api/assignments/${current.id}/reveal`, { method: "POST", body: { email } }).then((result) => {
        if (result?.found) setLookup(result);
      }).catch(() => {});
      setConfetti(makeConfetti(current.team.pot));
      setTimeout(() => setConfetti([]), 2400);
    }, 2200);
  }

  function nextReveal() {
    setRevealIndex((index) => Math.min(index + 1, Math.max(personalAssignments.length - 1, 0)));
  }

  function replayReveal() {
    if (!current || spinning) return;
    playRevealAudio(current.team.pot, soundOn);
    setRevealedTeams((existing) => ({ ...existing, [current.id]: false }));
    setSpinning(true);
    setSpinIndex(Math.floor(Math.random() * Math.max(state.teams.length, 1)));
    setTimeout(() => {
      setSpinning(false);
      setRevealedTeams((existing) => ({ ...existing, [current.id]: true }));
      setConfetti(makeConfetti(current.team.pot));
      setTimeout(() => setConfetti([]), 2400);
    }, 2200);
  }

  return <main className="page">
    <div className="hero-eyebrow">Draw Stage</div>
    <h1 className="hero-title small">{state.draw ? "Your team reveal." : "Ready to draw?"}</h1>
    <p className="hero-body">{state.draw ? "Find your entry and reveal your team draw with the drama it deserves." : "Once verified players have entered, the organiser will run the draw from Admin."}</p>

    <a className="stream-link-card" href="/stream" target="_blank" rel="noreferrer">
      <span>📺</span>
      <div><b>Watch the live reveal stream</b><em>See every revealed team as the board fills up</em></div>
      <strong>Open stream →</strong>
    </a>

    <DrawTimePanel startsAt={drawStartsAt} remainingMs={drawRemainingMs} />

    {!state.draw && <Empty icon="🎲" title="Draw hasn't run yet" desc={drawStartsAt ? "The draw time is set. Come back here when the countdown ends." : "Enter with your work email, then come back when the organiser starts the draw."} />}

    {state.draw && <PotRevealSummary assignments={assignments} />}

    {state.draw && <section className="personal-reveal-layout centered">
      {confetti.length > 0 && <Confetti pieces={confetti} />}
      <div className="reveal-card-stage">
        {personalAssignments.length ? <>
          <div className="reveal-count">Team {revealIndex + 1} of {personalAssignments.length}</div>
          <div className={`reveal-card ${spinning ? "spinning" : ""} ${!isCurrentRevealed && !spinning ? "mystery" : ""}`} key={`${current?.id}-${isCurrentRevealed}-${spinning}`}>
            <div className="reveal-card-shine" />
            {spinning ? <>
              <div className="reveal-crest spin-crest"><TeamMark flag={spinTeam?.flag} name={spinTeam?.name || "World Cup"} /></div>
              <div className="reveal-kicker">Drawing the team…</div>
              <h2>{spinTeam?.name || "World Cup"}</h2>
              <p>Flags are flying</p>
            </> : isCurrentRevealed ? <>
              <div className="reveal-crest"><TeamMark flag={current.team.flag} name={current.team.name} /></div>
              <div className="reveal-kicker">{current.participant.name} drew</div>
              <h2>{current.team.name}</h2>
              <p>{current.team.code} · Pot {current.team.pot}</p>
            </> : <>
              <div className="mystery-ball">?</div>
              <div className="reveal-kicker">Your team is locked in</div>
              <h2>Ready?</h2>
            </>}
          </div>
          <div className="btn-row center">{!isCurrentRevealed ? <button className="btn btn-primary" disabled={spinning} onClick={startReveal}>{spinning ? "Revealing…" : "Reveal my team"}</button> : <><button className="btn btn-primary" disabled={revealIndex >= personalAssignments.length - 1} onClick={nextReveal}>Next team →</button><button className="btn btn-ghost" disabled={spinning} onClick={replayReveal}>Start again</button></>}<button className={`btn btn-ghost sound-toggle ${soundOn ? "on" : "off"}`} type="button" onClick={() => setSoundOn((value) => !value)}>Sound: {soundOn ? "On" : "Off"}</button></div>
        </> : <div className="entry-card find-card"><div className="entry-card-header"><div className="entry-card-eyebrow">Email required</div><div className="entry-card-title">Find your draw</div><div className="entry-card-sub">Use the same work email used to join</div></div><form className="entry-card-body" onSubmit={findTeams}><p>Enter your verified work email before revealing. Browser memory is not used for the reveal.</p>{remembered?.email && !email && <Notice tone="ok">Tip: you joined earlier as {remembered.email}. Type that email below to continue.</Notice>}{lookup && !lookup.found && <Notice tone="warn">No draw entry found for that email.</Notice>}<Field label="Work email"><input className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" /></Field><button className="btn-enter" disabled={!email.trim()}>Find my teams</button></form></div>}
      </div>
    </section>}

    {state.draw && <LockedFullBoard assignments={assignments} showBoard={showBoard} setShowBoard={setShowBoard} />}
  </main>;
}


function Confetti({ pieces }) {
  return <div className="confetti-layer" aria-hidden="true">{pieces.map((piece) => <span key={piece.id} className="confetti-piece" style={{ left: `${piece.left}%`, background: piece.color, animationDelay: `${piece.delay}ms`, animationDuration: `${piece.duration}ms`, transform: `rotate(${piece.rotate}deg)` }} />)}</div>;
}

function DrawTimePanel({ startsAt, remainingMs }) {
  if (!startsAt) return null;
  const open = remainingMs <= 0;
  const parts = countdownParts(remainingMs);
  return <div className={`countdown-panel ${open ? "open" : "locked"}`}>
    <div className="countdown-copy">
      <span className="countdown-label">{open ? "Draw time has arrived" : "Draw starts in"}</span>
      <h2>{open ? "The draw is due now" : "World Cup draw countdown"}</h2>
      <p>{open ? "Stay tuned for the organiser to run the draw." : `Draw scheduled for ${formatRevealTime(startsAt)}.`}</p>
    </div>
    <div className="countdown-units" aria-label={open ? "Draw time has arrived" : `Draw starts in ${formatCountdown(remainingMs)}`}>
      <TimeUnit value={parts.days} label="Days" />
      <TimeUnit value={parts.hours} label="Hours" />
      <TimeUnit value={parts.minutes} label="Mins" />
      <TimeUnit value={parts.seconds} label="Secs" pulse />
    </div>
  </div>;
}

function TimeUnit({ value, label, pulse }) {
  return <div className={`time-unit ${pulse ? "pulse" : ""}`}><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span></div>;
}



function PotRevealSummary({ assignments }) {
  const rows = [1, 2, 3, 4].map((pot) => {
    const potAssignments = assignments.filter((assignment) => assignment.team.pot === pot);
    const revealed = potAssignments.filter((assignment) => assignment.revealed).length;
    return { pot, total: potAssignments.length, revealed, remaining: potAssignments.length - revealed };
  });
  const totalRevealed = assignments.filter((assignment) => assignment.revealed).length;
  return <section className="pot-reveal-summary">
    <div className="pot-summary-head"><span>Sealed draw board</span><b>{totalRevealed} / {assignments.length} revealed</b></div>
    <div className="pot-summary-grid">{rows.map((row) => <div className="pot-summary-card" key={row.pot}><strong>Pot {row.pot}</strong><div><b>{row.revealed}</b><span>revealed</span></div><div><b>{row.remaining}</b><span>still in pot</span></div></div>)}</div>
  </section>;
}


function LockedFullBoard({ assignments, showBoard, setShowBoard }) {
  const revealed = assignments.filter((assignment) => assignment.revealed).length;
  const unlocked = assignments.length > 0 && revealed === assignments.length;
  return <section className="full-board collapsed-board">
    <button className={`board-toggle ${!unlocked ? "locked" : ""}`} disabled={!unlocked} onClick={() => setShowBoard((show) => !show)}>
      <span>{unlocked ? showBoard ? "Hide full draw board" : "Show full draw board" : "Full draw board locked"}</span>
      <em>{unlocked ? `${assignments.length} teams revealed` : `Unlocks after all reveals · ${revealed}/${assignments.length}`}</em>
    </button>
    {unlocked && showBoard && <div className="draw-grid compact">{assignments.map((assignment) => <DrawCard key={assignment.id} assignment={assignment} />)}</div>}
  </section>;
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

function JourneyPage({ state }) {
  const [email, setEmail] = useState(readRememberedParticipant()?.email || "");
  const [journey, setJourney] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadJourney(event) {
    event?.preventDefault?.();
    if (!email.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/api/journey?email=${encodeURIComponent(email)}`);
      setJourney(result);
      if (!result.found) setMessage("No draw entry found for that email yet.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveComment({ assignmentId, matchId, comment }) {
    const result = await api("/api/manager-comments", { method: "POST", body: { assignmentId, matchId, email, comment } });
    setJourney(result);
    setMessage("Manager comment saved for the Drama Feed.");
  }

  return <main className="page journey-page">
    <section className="journey-hero">
      <div><div className="hero-eyebrow">My Team Journey</div><h1 className="hero-title small">Manage your World Cup chaos.</h1><p className="hero-body">Use your work email to see the teams you manage, follow their fixtures, and leave one pre-match manager comment for the <a className="inline-link" href="/tele" target="_blank" rel="noreferrer">Tele Drama Feed</a>.</p></div>
      <form className="journey-lookup" onSubmit={loadJourney}><input className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /><button className="btn btn-primary" disabled={busy || !email.trim()}>{busy ? "Checking…" : "Open journey"}</button></form>
    </section>
    {message && <Notice tone={journey?.found ? "ok" : "warn"}>{message}</Notice>}
    {!state.draw && <Empty icon="🔒" title="Journeys open after the draw" desc="Once teams are assigned, this page becomes each manager's match timeline." />}
    {state.draw && journey?.found && journey.assignments.length > 0 && <section className="journey-grid">
      {journey.assignments.map((assignment) => <JourneyTeamCard key={assignment.id} assignment={assignment} matches={journey.matches || []} comments={journey.comments || []} assignments={state.assignments || []} onSaveComment={saveComment} />)}
    </section>}
    {state.draw && journey?.found && journey.assignments.length === 0 && <Empty icon="🎁" title="Teams still sealed" desc="Reveal your team on the Draw page first. Your journey opens once your assignment is revealed." />}
    {state.draw && journey && !journey.found && <Empty icon="📭" title="No entry found" desc="Check the email used when joining the sweepstake." />}
  </main>;
}

function JourneyTeamCard({ assignment, matches, comments, assignments, onSaveComment }) {
  const teamMatches = matches.filter((match) => match.homeTeamId === assignment.team.id || match.awayTeamId === assignment.team.id);
  const nextMatch = teamMatches.find((match) => match.status === "scheduled" && !matchStarted(match));
  const timelineMatches = sortJourneyTimelineMatches(teamMatches.filter((match) => match.id !== nextMatch?.id));
  return <article className="journey-card">
    <div className="journey-card-head"><div className="journey-flag"><TeamMark flag={assignment.team.flag} name={assignment.team.name} /></div><div><span>Team Manager</span><h2>{assignment.team.name}</h2><p>{assignment.team.code} · Pot {assignment.team.pot} · {stageLabel(assignment.team.status)}</p></div></div>
    {nextMatch ? <ManagerCommentBox assignment={assignment} match={nextMatch} assignments={assignments} existing={comments.find((comment) => comment.assignmentId === assignment.id && comment.matchId === nextMatch.id)} onSave={onSaveComment} /> : <Notice tone="warn">No upcoming editable fixture for this team yet.</Notice>}
    <div className="journey-timeline"><div className="section-label">Timeline</div>{timelineMatches.length ? timelineMatches.map((match) => <JourneyMatchRow key={match.id} match={match} teamId={assignment.team.id} assignments={assignments} comment={comments.find((item) => item.assignmentId === assignment.id && item.matchId === match.id)} />) : <p className="journey-empty">Future fixtures and finished results will appear here after the next fixture.</p>}</div>
  </article>;
}

function ManagerCommentBox({ assignment, match, assignments, existing, onSave }) {
  const [comment, setComment] = useState(existing?.comment || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setComment(existing?.comment || ""), [existing?.comment, match.id]);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ assignmentId: assignment.id, matchId: match.id, comment });
    } finally {
      setSaving(false);
    }
  }
  const opponentManager = opponentManagerName(match, assignment.team.id, assignments);
  return <form className="manager-comment-box" onSubmit={submit}>
    <div><span>Next fixture</span><b>{match.homeName} v {match.awayName}</b><em>{formatMatchDate(match.kickoff)} {formatMatchTime(match.kickoff)} · Against <strong>{opponentManager}</strong></em></div>
    <textarea value={comment} maxLength={140} onChange={(e) => setComment(e.target.value)} placeholder={`As ${assignment.team.name} manager, say something before kickoff…`} />
    <div className="manager-comment-actions"><small>{comment.length}/140 · no names or emails needed</small><button className="btn btn-primary" disabled={saving || !comment.trim()}>{saving ? "Saving…" : existing ? "Update comment" : "Save comment"}</button></div>
  </form>;
}

function JourneyMatchRow({ match, teamId, assignments, comment }) {
  const side = match.homeTeamId === teamId ? "home" : "away";
  const opponentManager = opponentManagerName(match, teamId, assignments);
  return <div className={`journey-match-row ${match.status}`}>
    <div className="journey-match-time"><b>{formatMatchDate(match.kickoff)}</b><span>{formatMatchTime(match.kickoff) || match.stage}</span></div>
    <div className="journey-match-teams">
      <span className="journey-team-side"><TeamMark flag={match.homeFlag} name={match.homeName} /><strong>{match.homeCode}</strong></span>
      <b>{scoreText(match)}</b>
      <span className="journey-team-side away"><strong>{match.awayCode}</strong><TeamMark flag={match.awayFlag} name={match.awayName} /></span>
    </div>
    <div className="journey-match-meta"><em>{side === "home" ? "Home" : "Away"} · {match.status}</em><small>Against <strong>{opponentManager}</strong></small>{comment && <small className="saved">Manager comment saved</small>}</div>
  </div>;
}

function opponentManagerName(match, teamId, assignments) {
  const side = match.homeTeamId === teamId ? "home" : "away";
  const opponentTeamId = side === "home" ? match.awayTeamId : match.homeTeamId;
  const opponentAssignment = assignments.find((assignment) => assignment.team.id === opponentTeamId);
  return shortDisplayName(opponentAssignment?.participant?.name) || "Unassigned";
}

function sortJourneyTimelineMatches(matches) {
  return [...matches].sort((a, b) => journeyMatchSortRank(a) - journeyMatchSortRank(b) || matchTime(a) - matchTime(b));
}

function journeyMatchSortRank(match) {
  if (match.status === "scheduled" && !matchStarted(match)) return 0;
  if (match.status === "live") return 1;
  if (match.status === "postponed") return 2;
  if (match.status === "finished") return 4;
  return 3;
}

function StreamPage({ state }) {
  const revealed = [...(state.assignments || [])].filter((assignment) => assignment.revealed).sort((a, b) => revealTime(b) - revealTime(a));
  const latest = revealed[0];
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [lastSeenId, setLastSeenId] = useState(latest?.id || "");
  const [highlightId, setHighlightId] = useState("");
  const [confetti, setConfetti] = useState([]);

  useEffect(() => {
    if (!latest?.id) return;
    if (!lastSeenId) { setLastSeenId(latest.id); return; }
    if (latest.id !== lastSeenId) {
      setLastSeenId(latest.id);
      setHighlightId(latest.id);
      setConfetti(makeConfetti(latest.team.pot));
      if (soundEnabled) playStreamAudio();
      const timer = setTimeout(() => { setHighlightId(""); setConfetti([]); }, 2600);
      return () => clearTimeout(timer);
    }
  }, [latest?.id, lastSeenId, soundEnabled]);

  return <main className="page stream-page">
    {confetti.length > 0 && <Confetti pieces={confetti} />}
    <section className="stream-hero">
      <div><div className="hero-eyebrow">Reveal Stream</div><h1 className="hero-title small">Live draw reveals.</h1><p className="hero-body">Auto-refreshing office screen for every revealed team.</p></div>
      <button className="btn btn-primary stream-sound" onClick={() => setSoundEnabled((enabled) => !enabled)}>{soundEnabled ? "Sound enabled" : "Enable sound"}</button>
    </section>
    <PotRevealSummary assignments={state.assignments || []} />
    {latest ? <section className={`latest-reveal-card ${highlightId === latest.id ? "new" : ""}`}>
      <div className="latest-reveal-flag"><TeamMark flag={latest.team.flag} name={latest.team.name} /></div>
      <div><span>Latest reveal</span><h2>{latest.participant.name} revealed {latest.team.name}</h2><p>{latest.team.code} · Pot {latest.team.pot} · {formatRevealStamp(latest.revealedAt)}</p></div>
    </section> : <Empty icon="📺" title="No reveals yet" desc="This screen will light up as people reveal their teams." />}
    <section className="reveal-feed">
      <div className="section-label">Reveal feed</div>
      {revealed.length ? revealed.slice(0, 24).map((assignment) => <div className={`reveal-feed-row ${highlightId === assignment.id ? "new" : ""}`} key={assignment.id}><span><TeamMark flag={assignment.team.flag} name={assignment.team.name} /></span><b>{assignment.participant.name}</b><strong>{assignment.team.name}</strong><em>Pot {assignment.team.pot}</em><small>{formatRevealStamp(assignment.revealedAt)}</small></div>) : <p className="stream-empty-copy">Waiting for the first reveal…</p>}
    </section>
  </main>;
}

function TelePage({ state }) {
  const live = (state.matches || []).filter((match) => match.status === "live");
  const upcoming = (state.matches || []).filter((match) => match.status === "scheduled").sort((a, b) => matchTime(a) - matchTime(b));
  const results = overnightResultMatches(state);
  return <main className="page tele-page">
    <div className="tele-frame morning-tele">
      <TeleNowCard match={live[0] || upcoming[0]} live={Boolean(live[0])} assignments={state.assignments || []} />
      <div className="morning-section-title"><span>Overnight results & roasts</span></div>
      <section className="overnight-feed">
        {results.length ? results.map((match) => <TeleResultCard key={match.id} match={match} summary={summaryForMatch(state, match)} managerComments={managerCommentsForMatch(state, match)} assignments={state.assignments || []} />) : <div className="tele-empty-card"><Empty icon="☕" title="No overnight damage" desc="Finished results and roasts will appear here for the morning catch-up." />{upcoming.slice(0, 4).map((match) => <div className="tele-mini-fixture" key={match.id}>{compactUpcomingLine(match)}</div>)}</div>}
      </section>
    </div>
  </main>;
}

function TeleNowCard({ match, live, assignments }) {
  if (!match) return <section className="tele-now-card empty"><div><span className="tele-now-kicker">Today</span><h2>No fixtures scheduled</h2><p>The Tele feed will wake up when fixtures or results arrive.</p></div></section>;
  const homeManager = teleManagerForTeam(assignments, match.homeTeamId);
  const awayManager = teleManagerForTeam(assignments, match.awayTeamId);
  return <section className={`tele-now-card ${live ? "live" : "upcoming"}`}>
    <div className="tele-now-status"><span className={live ? "live-dot on" : "live-dot"} />{live ? "Live now" : "Next up"}</div>
    <div className="tele-now-fixture">
      <div className="tele-now-team"><TeamMark flag={match.homeFlag} name={match.homeName} /><div><b>{match.homeName}</b><em>{homeManager}</em></div></div>
      <div className="tele-now-score"><strong>{live && hasScore(match) ? `${match.homeScore}:${match.awayScore}` : "vs"}</strong><span>{formatMatchDate(match.kickoff)} · {formatMatchTime(match.kickoff) || match.stage}</span></div>
      <div className="tele-now-team away"><div><b>{match.awayName}</b><em>{awayManager}</em></div><TeamMark flag={match.awayFlag} name={match.awayName} /></div>
    </div>
  </section>;
}

function TeleResultCard({ match, summary, managerComments = [], assignments = [] }) {
  const category = resultCategory(match);
  const homeManager = teleManagerForTeam(assignments, match.homeTeamId);
  const awayManager = teleManagerForTeam(assignments, match.awayTeamId);
  return <article className="tele-result-card">
    <div className="tele-result-scoreline">
      <div className="tele-result-team"><TeamMark flag={match.homeFlag} name={match.homeName} /><div><b>{match.homeName}</b><em>{homeManager}</em></div></div>
      <div className="tele-result-score"><strong>{match.homeScore}:{match.awayScore}</strong><span>{formatMatchDate(match.kickoff)} · {formatMatchTime(match.kickoff)}</span></div>
      <div className="tele-result-team away"><div><b>{match.awayName}</b><em>{awayManager}</em></div><TeamMark flag={match.awayFlag} name={match.awayName} /></div>
    </div>
    <div className="tele-result-body">
      <div className={`roast-pill ${category.tone}`}>{category.icon} {category.label}</div>
      <h2>{summary?.headline || `${match.homeCode} ${scoreText(match)} ${match.awayCode}`}</h2>
      <p>{summary?.body || `${match.homeName} and ${match.awayName} have filed their overnight paperwork. The Drama Feed is waiting for a proper roast.`}</p>
      {managerComments.length > 0 && <div className="manager-quotes">{managerComments.map((managerComment) => <div className="manager-quote" key={managerComment.id}><span>{managerComment.managerInitials}</span><q>{managerComment.comment}</q><em>{managerComment.managerDisplayName}</em></div>)}</div>}
    </div>
  </article>;
}

function overnightResultMatches(state) {
  const finished = [...(state.matches || [])].filter((match) => match.status === "finished" && hasScore(match)).sort((a, b) => matchTime(b) - matchTime(a));
  if (!finished.length) return [];
  const now = state.serverNow ? new Date(state.serverNow) : new Date();
  const cutoff = new Date(now);
  cutoff.setHours(18, 0, 0, 0);
  if (now.getHours() < 12) cutoff.setDate(cutoff.getDate() - 1);
  const overnight = finished.filter((match) => matchTime(match) >= cutoff.getTime());
  return (overnight.length ? overnight : finished).slice(0, 6);
}

function summaryForMatch(state, match) {
  const summaries = (state.teleSummaries || [])
    .map((summary) => ({ ...summary, matchId: String(summary.sourceKey || "").match(/^(?:match|manager-comment:[^:]+):([^:]+):/)?.[1], managerComment: String(summary.sourceKey || "").startsWith("manager-comment:") }))
    .filter((summary) => summary.matchId === match.id)
    .sort((a, b) => Number(b.managerComment) - Number(a.managerComment) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return summaries[0] || null;
}

function managerCommentsForMatch(state, match) {
  const comments = (state.teleManagerComments || []).filter((comment) => comment.matchId === match.id);
  return [
    ...comments.filter((comment) => comment.teamId === match.homeTeamId),
    ...comments.filter((comment) => comment.teamId === match.awayTeamId),
    ...comments.filter((comment) => comment.teamId !== match.homeTeamId && comment.teamId !== match.awayTeamId)
  ];
}

function teleManagerForTeam(assignments, teamId) {
  const assignment = assignments.find((item) => item.team.id === teamId);
  return shortDisplayName(assignment?.participant?.name) || "Unassigned manager";
}

function shortDisplayName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return [parts[0], parts[1]?.charAt(0)].filter(Boolean).join(" ");
}

function compactMatchLine(match) {
  return `${match.homeCode} ${scoreText(match)} ${match.awayCode}`;
}

function compactUpcomingLine(match) {
  return `${match.homeCode} vs ${match.awayCode} — ${formatMatchTime(match.kickoff) || "TBC"} ${isToday(match.kickoff) ? "today" : formatMatchDate(match.kickoff)}`;
}

function resultCategory(match) {
  const diff = Math.abs(Number(match.homeScore) - Number(match.awayScore));
  if (diff >= 3) return { label: "Dominant", icon: "🔥", tone: "hot" };
  if (diff === 0) return { label: "Snoozefest", icon: "😴", tone: "flat" };
  if (diff === 1) return { label: "Nervy", icon: "😬", tone: "edge" };
  return { label: "Damage", icon: "⚽", tone: "gold" };
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(String(value).length === 16 ? `${value}:00Z` : value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function hasScore(match) {
  return match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined;
}

function matchTime(match) {
  const source = match.kickoff || match.updatedAt;
  if (!source) return 0;
  return new Date(String(source).length === 16 ? `${source}:00Z` : source).getTime() || 0;
}

function matchStarted(match) {
  const time = matchTime(match);
  return Boolean(time && Date.now() >= time);
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
  const addEmployeeLabel = csvPreview.valid.length ? `Add ${csvPreview.valid.length} employee${csvPreview.valid.length === 1 ? "" : "s"}` : "Add employees";
  const filteredTeams = state.teams.filter((team) => `${team.name} ${team.code}`.toLowerCase().includes(adminSearch.toLowerCase()));
  async function addEmployees() {
    if (!csvPreview.valid.length) throw new Error("CSV has no valid employee emails.");
    await action("/api/allowlist/append", { method: "POST", text: csvText, contentType: "text/csv" }, "Employees added");
    await refresh();
  }
  async function replaceEmployeeList() {
    if (!csvPreview.valid.length) throw new Error("CSV has no valid employee emails.");
    if (!confirm("Replace the full employee list? This clears current participants before the draw.")) return;
    await action("/api/allowlist", { method: "POST", text: csvText, contentType: "text/csv" }, "Employee list replaced");
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
    <section className="admin-panel export-panel"><div className="admin-panel-title">Backups and exports</div><p className="admin-panel-sub">Download backups before the real draw and export not-joined lists for reminders.</p><div className="btn-row"><a className="btn btn-primary" href="/api/export/backup.json">Download full backup</a><a className="btn btn-ghost" href="/api/export/not-joined.csv">Not joined CSV</a><a className="btn btn-ghost" href="/api/export/participants.csv">Participants CSV</a></div></section>
    <ProviderPanel state={state} action={action} />
    <div className="admin-grid">
      <section className="admin-panel employee-panel"><div className="admin-panel-title">Employee email list</div><p className="admin-panel-sub">Add missed employees without disturbing joined players. Only use replace when restarting the setup list.</p><div className="allowlist-stats"><b>{state.allowlist?.eligible || 0}</b><span>eligible</span><b>{state.allowlist?.joined || 0}</b><span>joined</span><b>{state.allowlist?.remaining || 0}</b><span>left</span></div><div className="btn-row csv-actions"><button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button><label className="file-upload">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(e) => loadFile(e.target.files?.[0])} /></label></div><textarea className="csv-box" value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="email,name,department" /><CsvPreview preview={csvPreview} /><div className="employee-action-stack"><button className="btn btn-primary employee-primary-action" disabled={Boolean(state.draw) || !csvPreview.valid.length} onClick={addEmployees}>{addEmployeeLabel}<span>keeps existing entries</span></button><button className="employee-danger-action" disabled={Boolean(state.draw) || !csvPreview.valid.length} onClick={replaceEmployeeList}>Replace full list<span>clears joined players before draw</span></button></div></section>
      <section className="admin-panel"><div className="admin-panel-title">Participants</div><p className="admin-panel-sub">Locked after draw.</p>{state.participants.map((p) => <div className="participant-chip" key={p.id}><div className="participant-avatar">{initials(p.name)}</div><div><div className="participant-name">{p.name}</div><div className="participant-dept">{p.department || "No department"}</div></div><button className="participant-delete" disabled={Boolean(state.draw)} onClick={() => action(`/api/participants/${p.id}`, { method: "DELETE" }, "Participant removed")}>×</button></div>)}{!state.participants.length && <Empty icon="👥" title="No participants" desc="Upload the employee list, then people can enter." />}</section>
    </div>
    <MatchAdmin state={state} action={action} />
    <section className="admin-panel wide"><div className="teams-header"><div><div className="admin-panel-title">Teams and results</div><p className="admin-panel-sub">Rename qualifiers and update match status.</p></div><input className="search-input" placeholder="Search teams…" value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} /></div><div>{filteredTeams.map((team) => <AdminTeamRow key={team.id} team={team} action={action} />)}</div></section>
  </main>;
}

function ProviderPanel({ state, action }) {
  const [season, setSeason] = useState("2026");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const footballStatus = (state.providerSync || []).find((item) => item.provider === "football-data");
  return <section className="admin-panel export-panel provider-panel"><div className="admin-panel-title">Football data and Tele summaries</div><p className="admin-panel-sub">Import confirmed teams, sync fixtures/results, and generate the office TV drama feed. Football-Data sync is rate-limit-aware.</p>
    <div className="provider-controls">
      <label><span>Competition</span><input className="admin-input" value="WC" readOnly /></label>
      <label><span>Season</span><input className="admin-input" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Season" /></label>
      <label><span>From</span><input className="admin-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
      <label><span>To</span><input className="admin-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
      <div className="provider-actions"><button className="btn btn-primary" onClick={() => action("/api/providers/football-data/import-teams", { method: "POST", body: { competition: "WC", season, dateFrom, dateTo } }, "Football-Data teams imported")}>Import teams</button><button className="btn btn-ghost" onClick={() => action("/api/providers/football-data/sync", { method: "POST", body: { competition: "WC", season, dateFrom, dateTo } }, "Football-Data sync complete")}>Sync matches</button><button className="btn btn-ghost" onClick={() => action("/api/tele-summary/generate", { method: "POST" }, "Tele summary generated")}>Generate Tele summary</button></div>
    </div>
    <div className="provider-status-grid"><div className="provider-status"><b>Football-Data</b><span>{footballStatus ? `${footballStatus.status}: ${footballStatus.message}` : "Not synced yet"}</span><em>{footballStatus ? `Requests left: ${footballStatus.requestsAvailable ?? "?"}; reset: ${footballStatus.resetSeconds ?? "?"}s` : "Headers will show after sync"}</em></div><div className="provider-status"><b>Auto-sync</b><span>{state.scheduler?.enabled ? "Enabled" : "Disabled"}{state.scheduler?.running ? " · running" : ""}</span><em>{state.scheduler?.lastMessage || "Set FOOTBALL_DATA_AUTO_SYNC=1 to enable."}</em></div>
    {state.teleSummary && <div className="provider-status"><b>Tele summary</b><span>{state.teleSummary.headline}</span><em>{state.teleSummary.provider} · {state.teleSummary.createdAt}</em></div>}</div>
  </section>;
}

function MatchAdmin({ state, action }) {
  const first = state.teams[0]?.id || "";
  const second = state.teams[1]?.id || "";
  const [form, setForm] = useState({ stage: "Group", kickoff: "", homeTeamId: first, awayTeamId: second, homeScore: "", awayScore: "", status: "scheduled", notes: "" });
  const [editingId, setEditingId] = useState("");
  useEffect(() => { setForm((current) => ({ ...current, homeTeamId: current.homeTeamId || first, awayTeamId: current.awayTeamId || second })); }, [first, second]);
  function update(patch) { setForm((current) => ({ ...current, ...patch })); }
  async function save() {
    await action("/api/matches", { method: "POST", body: form }, "Match saved");
    setForm((current) => ({ ...current, homeScore: "", awayScore: "", notes: "" }));
  }
  const matches = [...(state.matches || [])].sort((a, b) => matchTime(a) - matchTime(b));
  return <section className="admin-panel wide match-admin"><div className="teams-header"><div><div className="admin-panel-title">Fixtures and results</div><p className="admin-panel-sub">Manual match layer now, live provider later. Tele reads from these results.</p></div></div>
    <div className="match-form">
      <input className="admin-input" value={form.stage} onChange={(e) => update({ stage: e.target.value })} placeholder="Stage" />
      <input className="admin-input" type="datetime-local" value={form.kickoff} onChange={(e) => update({ kickoff: e.target.value })} />
      <select className="admin-select" value={form.homeTeamId} onChange={(e) => update({ homeTeamId: e.target.value })}>{state.teams.map((team) => <option key={team.id} value={team.id}>{team.flag?.startsWith?.("http") ? "🌐" : team.flag} {team.name}</option>)}</select>
      <select className="admin-select" value={form.awayTeamId} onChange={(e) => update({ awayTeamId: e.target.value })}>{state.teams.map((team) => <option key={team.id} value={team.id}>{team.flag?.startsWith?.("http") ? "🌐" : team.flag} {team.name}</option>)}</select>
      <input className="admin-input" type="number" min="0" value={form.homeScore} onChange={(e) => update({ homeScore: e.target.value })} placeholder="Home" />
      <input className="admin-input" type="number" min="0" value={form.awayScore} onChange={(e) => update({ awayScore: e.target.value })} placeholder="Away" />
      <select className="admin-select" value={form.status} onChange={(e) => update({ status: e.target.value })}><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="finished">Finished</option><option value="postponed">Postponed</option></select>
      <input className="admin-input" value={form.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Notes" />
      <button className="btn btn-primary" disabled={!form.homeTeamId || !form.awayTeamId || form.homeTeamId === form.awayTeamId} onClick={save}>Save match</button>
    </div>
    <div className="match-list">{matches.map((match) => <MatchAdminRow key={match.id} match={match} action={action} editing={editingId === match.id} onEdit={() => setEditingId(match.id)} onCancel={() => setEditingId("")} />)}{!matches.length && <Empty icon="⚽" title="No matches yet" desc="Add fixtures or results manually for Tele." />}</div>
  </section>;
}

function MatchAdminRow({ match, action, editing, onEdit, onCancel }) {
  const [draft, setDraft] = useState({ homeScore: match.homeScore ?? "", awayScore: match.awayScore ?? "", status: match.status || "scheduled", notes: match.notes || "" });
  useEffect(() => {
    if (editing) setDraft({ homeScore: match.homeScore ?? "", awayScore: match.awayScore ?? "", status: match.status || "scheduled", notes: match.notes || "" });
  }, [editing, match.homeScore, match.awayScore, match.status, match.notes]);
  function update(patch) { setDraft((current) => ({ ...current, ...patch })); }
  async function save() {
    await action(`/api/matches/${match.id}`, { method: "PATCH", body: { stage: match.stage, kickoff: match.kickoff, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, homeScore: draft.homeScore, awayScore: draft.awayScore, status: draft.status, notes: draft.notes } }, "Match updated");
    onCancel();
  }
  return <div className={`match-row-wrap ${editing ? "editing" : ""}`}>
    <div className="match-row"><span>{formatMatchDate(match.kickoff)}<small>{formatMatchTime(match.kickoff)}</small></span><b><TeamMark flag={match.homeFlag} name={match.homeName} /> {match.homeName}</b><strong>{scoreText(match)}</strong><b>{match.awayName} <TeamMark flag={match.awayFlag} name={match.awayName} /></b><em>{match.status}</em><div className="match-row-actions"><button className="match-edit" onClick={editing ? onCancel : onEdit}>{editing ? "Close" : "Edit"}</button><button className="participant-delete" onClick={() => action(`/api/matches/${match.id}`, { method: "DELETE" }, "Match removed")}>×</button></div></div>
    {editing && <div className="match-inline-editor"><div className="inline-match-title"><b>{match.homeName}</b><span>vs</span><b>{match.awayName}</b></div><input className="admin-input" type="number" min="0" value={draft.homeScore} onChange={(e) => update({ homeScore: e.target.value })} placeholder={match.homeCode || "Home"} /><input className="admin-input" type="number" min="0" value={draft.awayScore} onChange={(e) => update({ awayScore: e.target.value })} placeholder={match.awayCode || "Away"} /><select className="admin-select" value={draft.status} onChange={(e) => update({ status: e.target.value })}><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="finished">Finished</option><option value="postponed">Postponed</option></select><input className="admin-input" value={draft.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Notes" /><button className="btn btn-primary" onClick={save}>Save result</button><button className="btn btn-ghost" onClick={onCancel}>Cancel</button></div>}
  </div>;
}

function TeleMatches({ matches }) {
  const live = matches.filter((m) => m.status === "live").slice(0, 3);
  const upcoming = matches.filter((m) => m.status === "scheduled").slice(0, 4);
  const recent = matches.filter((m) => m.status === "finished").slice(-4).reverse();
  if (!matches.length) return <Empty icon="⚽" title="No fixtures yet" desc="Admin can add manual fixtures/results or sync Football-Data." />;
  return <div className="tele-fixtures">
    <FixtureSection title="Live now" rows={live} empty="No live matches" />
    <FixtureSection title="Next up" rows={upcoming} empty="No scheduled fixtures" />
    <FixtureSection title="Recent results" rows={recent} empty="No results yet" />
  </div>;
}

function FixtureSection({ title, rows, empty }) {
  return <section className="fixture-section"><h3>{title}</h3>{rows.length ? rows.map((match) => <FixtureRow key={match.id} match={match} />) : <p>{empty}</p>}</section>;
}

function FixtureRow({ match }) {
  return <div className={`fixture-row ${match.status}`}>
    <div className="fixture-time"><b>{formatMatchDate(match.kickoff)}</b><span>{formatMatchTime(match.kickoff)}</span></div>
    <div className="fixture-team"><TeamMark flag={match.homeFlag} name={match.homeName} /><strong>{match.homeCode}</strong></div>
    <strong className="fixture-score">{scoreText(match)}</strong>
    <div className="fixture-team away"><strong>{match.awayCode}</strong><TeamMark flag={match.awayFlag} name={match.awayName} /></div>
  </div>;
}

function formatMatchDate(value) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-IE", { day: "2-digit", month: "short" }).format(date);
}
function formatMatchTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit" }).format(date);
}
function scoreText(match) {
  const home = match.homeScore ?? "-";
  const away = match.awayScore ?? "-";
  return `${home} : ${away}`;
}

function AdminDrawControls({ state, action }) {
  const [seed, setSeed] = useState("office-2026");
  const [drawStartsAt, setDrawStartsAt] = useState(toLocalDateTimeInput(state.settings?.drawStartsAt));
  const canDraw = !state.draw && state.participants.length > 0 && state.participants.length <= 48;
  useEffect(() => setDrawStartsAt(toLocalDateTimeInput(state.settings?.drawStartsAt)), [state.settings?.drawStartsAt]);
  function saveDrawTime(value = drawStartsAt) {
    return action("/api/settings", { method: "PATCH", body: { drawStartsAt: value ? new Date(value).toISOString() : "" } }, value ? "Draw time saved" : "Draw time cleared");
  }
  return <div className="admin-draw-stack">
    <div className="admin-draw-controls">
      {!state.draw && <><input className="seed-input" value={seed} onChange={(e) => setSeed(e.target.value)} /><button className="btn btn-primary" disabled={!canDraw} onClick={() => action("/api/draw", { method: "POST", body: { seed } }, "Draw complete")}>Run draw ({state.participants.length})</button></>}
      {state.draw && <><button className="btn btn-primary" onClick={() => action("/api/reveal-next", { method: "POST" }, "Next team revealed")}>Reveal next</button><button className="btn btn-ghost" onClick={() => action("/api/reveal-all", { method: "POST" }, "All teams revealed")}>Reveal all</button></>}
    </div>
    <div className="countdown-admin">
      <label><span>Draw time</span><input className="admin-input" type="datetime-local" value={drawStartsAt} onChange={(e) => setDrawStartsAt(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={!drawStartsAt} onClick={() => saveDrawTime()}>Save draw time</button>
      <button className="btn btn-ghost" onClick={() => { setDrawStartsAt(""); saveDrawTime(""); }}>Clear draw time</button>
    </div>
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
  return <div className="admin-team-row"><div className="admin-crest-cell" title={team.flag}><TeamMark flag={team.flag} name={team.name} /></div><input className="admin-input" value={team.name} onChange={(e) => patch({ name: e.target.value })} /><input className="admin-input" value={team.code} onChange={(e) => patch({ code: e.target.value })} /><select className="admin-select" value={team.pot} onChange={(e) => patch({ pot: Number(e.target.value) })}>{[1,2,3,4].map((pot) => <option key={pot} value={pot}>Pot {pot}</option>)}</select><select className="admin-select" value={team.status} onChange={(e) => patch({ status: e.target.value })}>{STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></div>;
}

function DrawCard({ assignment }) {
  const pot = potColor(assignment.team.pot);
  return <div className={`draw-card ${assignment.revealed ? "assigned" : "hidden"}`}><span className="pot-badge" style={{ background: pot.bg, color: pot.text }}>POT {assignment.team.pot}</span><div className="draw-card-flag">{assignment.revealed ? <TeamMark flag={assignment.team.flag} name={assignment.team.name} /> : "❔"}</div><div className="draw-card-team">{assignment.revealed ? assignment.team.name : "Hidden team"}</div>{assignment.revealed ? <div className="draw-card-owner">{assignment.participant.name}</div> : <div className="draw-card-empty">Waiting reveal</div>}</div>;
}

function TeamRow({ assignment }) {
  return <div className={`team-row ${assignment.team.status === "eliminated" ? "eliminated" : ""}`}><div className="team-flag"><TeamMark flag={assignment.team.flag} name={assignment.team.name} /></div><div><div className="team-name">{assignment.team.name}</div><div className="team-name-sub">Pot {assignment.team.pot}</div></div><div className="team-code">{assignment.team.code}</div><div className="team-owner">{assignment.participant.name}</div><Status status={assignment.team.status} /></div>;
}

function SurvivalBoard({ assignments }) {
  const stages = ["winner", "runner-up", "semi", "quarter", "r16", "r32", "group", "active"];
  return <div className="survival-board">{stages.map((stage) => { const rows = assignments.filter((a) => a.team.status === stage); if (!rows.length) return null; return <div className="survival-column" key={stage}><h3>{stageLabel(stage)}</h3>{rows.slice(0, 8).map((a) => <div className="survival-row" key={a.id}><span><TeamMark flag={a.team.flag} name={a.team.name} /></span><b>{a.participant.name}</b><em>{a.team.name}</em></div>)}{rows.length > 8 && <small>+{rows.length - 8} more</small>}</div>; })}</div>;
}

function TeamMark({ flag, name }) {
  if (String(flag || "").startsWith("http")) return <img className="team-crest" src={flag} alt={`${name} crest`} loading="lazy" />;
  return <>{flag || "🏳️"}</>;
}

function revealTime(assignment) {
  return assignment.revealedAt ? new Date(assignment.revealedAt).getTime() || 0 : 0;
}
function formatRevealStamp(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}
function playStreamAudio() {
  try {
    const audio = new Audio("/audio/stream-reveal.mp3");
    audio.volume = 0.95;
    audio.play().catch(() => {});
  } catch {}
}

function flagText(flag) { return String(flag || "").startsWith("http") ? "🌐" : (flag || "🏳️"); }
function Status({ status }) { return <span className={`status-badge ${status}`}>{stageLabel(status)}</span>; }
function Stat({ value, label, gold }) { return <div className="stat-pill"><div className={`stat-pill-num ${gold ? "gold" : ""}`}>{value}</div><div className="stat-pill-label">{label}</div></div>; }
function Info({ icon, title, desc }) { return <div className="info-strip-card"><div className="info-strip-icon">{icon}</div><div className="info-strip-title">{title}</div><div className="info-strip-desc">{desc}</div></div>; }
function Prize({ icon, amount, label, text, green }) { return <div className="prize-card"><div className="prize-icon">{icon}</div><div className="prize-amount" style={green ? { color: "#22c55e" } : undefined}>{amount}</div><div className="prize-label">{label}</div><div className="prize-status">{text}</div></div>; }
function Field({ label, optional, children }) { return <div className="form-group"><div className="form-label">{label} {optional && <span>(optional)</span>}</div>{children}</div>; }
function Notice({ tone, children }) { return <p className={`notice ${tone}`}>{children}</p>; }
function Empty({ icon, title, desc }) { return <div className="empty-state"><div className="empty-state-icon">{icon}</div><div className="empty-state-title">{title}</div><div className="empty-state-desc">{desc}</div></div>; }
function Splash({ text }) { return <div className="app splash"><div className="empty-state"><div className="empty-state-icon">🏆</div><div className="empty-state-title">{text}</div></div></div>; }



function playRevealAudio(pot, enabled) {
  if (!enabled) return;
  const files = REVEAL_AUDIO[pot] || REVEAL_AUDIO[4] || [];
  const file = files[Math.floor(Math.random() * files.length)];
  if (!file) return;
  try {
    const audio = new Audio(file);
    audio.volume = pot === 1 ? 0.82 : 0.72;
    audio.play().catch(() => {});
  } catch {}
}

function makeConfetti(pot = 4) {
  const count = ({ 1: 72, 2: 58, 3: 46, 4: 38 })[pot] || 42;
  const palette = ["#FFD700", "#ff8c00", "#ffffff", "#60a5fa", "#22c55e"];
  return Array.from({ length: count }, (_, index) => ({
    id: `${Date.now()}-${index}`,
    left: 8 + Math.random() * 84,
    color: palette[index % palette.length],
    delay: Math.random() * 220,
    duration: 1300 + Math.random() * 1000,
    rotate: Math.random() * 360
  }));
}

function countdownParts(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  };
}
function formatCountdown(ms) {
  const parts = countdownParts(ms);
  return `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds`;
}
function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function formatRevealTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the scheduled time";
  return new Intl.DateTimeFormat("en-IE", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function readRememberedParticipant() {
  try { return JSON.parse(localStorage.getItem("wcs_participant") || "null"); } catch { return null; }
}
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
function label(view) { return { enter: "Enter", draw: "Draw", journey: "My Team Journey", teams: "Teams", tele: "Tele", admin: "Admin" }[view]; }
function stageLabel(value) { return STAGES.find((stage) => stage.value === value)?.label || value; }
function potColor(pot) { return ({ 1: { bg: "#FFD700", text: "#1a1200" }, 2: { bg: "#C0C0C0", text: "#111" }, 3: { bg: "#CD7F32", text: "#1a0800" }, 4: { bg: "#2a3050", text: "#9ba3c9" } })[pot] || { bg: "#2a3050", text: "#fff" }; }
function initials(name) { return String(name || "?").split(/\s+/).slice(0,2).map((p) => p[0]).join("").toUpperCase(); }
function impactHeadline(detail = "") { const [, owner = "Someone"] = detail.split("|").map((p) => p.trim()); if (detail.includes("→ eliminated")) return `${owner} just took a hit`; if (detail.includes("→ winner")) return `${owner} has won the sweepstake`; if (detail.includes("→ runner-up")) return `${owner} is in the €30 seat`; return `${owner} survives another round`; }
async function api(path, options = {}) { const hasText = Object.prototype.hasOwnProperty.call(options, "text"); const response = await fetch(path, { method: options.method || "GET", headers: hasText ? { "Content-Type": options.contentType || "text/plain" } : options.body ? { "Content-Type": "application/json" } : undefined, body: hasText ? options.text : options.body ? JSON.stringify(options.body) : undefined }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Request failed: ${response.status}`); } if (response.status === 204) return null; return response.json(); }

createRoot(document.getElementById("root")).render(<App />);
