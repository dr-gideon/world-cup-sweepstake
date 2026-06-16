# DECISIONS.md

## 2026-06-10 — Free-entry CEO-sponsored format

Decision: The sweepstake will be free to enter, with CEO-sponsored prizes of €50 for the winning team owner and €30 for the runner-up team owner.

Rationale: Avoids buy-in/gambling friction and makes participation feel inclusive.

## 2026-06-10 — Assign all 48 teams

Decision: All 48 World Cup teams should be assigned across participating colleagues. If fewer than 48 people join, some participants receive bonus teams.

Rationale: Avoids the boring case where the winning team is unassigned.

## 2026-06-10 — Option C allocation

Decision: Use the “everyone gets at least one team, remaining teams become bonus teams” model.

Rationale: Expected office headcount is around 52, but not everyone will participate. This keeps the format flexible.

## 2026-06-10 — Local-first MVP

Decision: Build the MVP as a local-first React/Vite app using browser LocalStorage, JSON import/export, and manual result updates.

Rationale: Fast to ship, no staff data leaves the browser, and no paid sports API or backend is needed for the office sweepstake.

## 2026-06-10 — Resolve-inspired UI theme

Decision: Use the Resolve visual language: cool-grey canvas, white cards, compact operational layout, restrained magenta accents, dense tables/cards, and clear state pills.

Rationale: Dr. Wells requested the product-designer skill and Resolve theme for the frontend.

## 2026-06-10 — Block over-48 participant draw in MVP

Decision: If more than 48 participants join, the MVP blocks the draw until extra entries are removed or shared-team rules are agreed.

Rationale: A 48-team World Cup allows 48 single-owner team slots. Silently excluding participants would be unfair and audit-hostile.

## 2026-06-10 — Archive dashboard MVP before redesign

Decision: Archive the original Resolve-dashboard build as git tag `mvp-resolve-dashboard-2026-06-10` before rebuilding.

Rationale: The user wanted Resolve colours, not a full dashboard feel. The archived tag preserves the previous working version.

## 2026-06-10 — Rebuild as event-style sweepstake experience

Decision: Replace the dashboard layout with a modern, engaging sweepstake flow: ticket-style entry, reveal stage, energetic visuals, and a public team board.

Rationale: Entering the sweepstake should feel exciting and fun, not like filling in an admin dashboard.

## 2026-06-10 — Add SQLite shared state

Decision: Move from browser LocalStorage to an Express + SQLite backend using Node built-in `node:sqlite`.

Rationale: Office users need shared registrations, one canonical draw, and consistent results across browsers. Built-in SQLite avoids native package installation problems on Windows.


## 2026-06-10 — Add Tele broadcast view

Decision: Add a dedicated Tele view for office screens after matches, backed by richer match-impact audit events when team statuses change.

Rationale: The sweepstake should feel alive during the tournament, with broadcast-style headlines, prize race, survival board, drama feed, and ticker instead of another admin table.


## 2026-06-10 — Gate registration by employee email allowlist

Decision: Admin uploads a CSV employee list with `email,name,department`; registration requires a matching email and each email can join once. Public app state and screens do not display employee email addresses.

Rationale: The office needs fair one-entry-per-employee registration without Microsoft login setup. A CSV allowlist is simple, auditable, and easy for the organiser to prepare.


## 2026-06-10 — Rebuild frontend from Claude sweepstake design

Decision: Archive the SQLite/allowlist/Tele build as `pre-claude-ui-sqlite-allowlist-2026-06-10`, then rebuild the frontend using the Claude-designed `sweepstake.jsx` visual direction and Resolve/Enterpryze logo assets from `/home/giddy/temp/Resolve logo and icon/`.

Rationale: Dr. Wells preferred the Claude design. The rebuild keeps the production backend features while adopting the stronger dark/gold sports-event UI.


## 2026-06-10 — Split app into public, Tele, and Admin surfaces

Decision: Public employees use `/` and only see Enter/Draw. Tele runs standalone at `/tele` without nav/admin controls. Admin runs at `/admin` behind simple username/password cookie auth. Admin mutation APIs require authentication.

Rationale: The office-facing app should not expose organiser controls. Hiding tabs is not security, so server-side API protection is required before real use.


## 2026-06-10 — Operational polish before LLM Tele summaries

Decision: Prioritize admin password hardening, CSV template/validation UX, and public/Tele auto-refresh before wiring LLM summaries.

Rationale: The app needs reliable office operation before adding AI-generated copy. Admin password is now required via env var; public/Tele displays refresh automatically; CSV upload is easier to validate before import.


## 2026-06-10 — Add manual match data layer before live football API

Decision: Add a local SQLite `matches` table and Admin fixture/result editor before integrating any live football API provider. Tele reads from this local match layer.

Rationale: Avoid paid API dependency and provider lock-in while giving the app a stable contract for fixtures/results. A future provider can sync into the same table.


## 2026-06-10 — Add deployment readiness exports

Decision: Add admin-only JSON backup, not-joined CSV, and participants CSV exports, plus `.env.example` and deployment documentation.

Rationale: Before real office use, the organiser needs a safe backup path, reminder list, and clear Windows deployment instructions. Export endpoints require admin auth.


## 2026-06-10 — Production-style dry-run passed

Decision: Validate deployment readiness from a clean clone and temp database before any real hosting decision.

Rationale: This proves the production path works independent of the working tree and preview state. The dry-run passed install, build, start, surfaces, admin auth, 48-user allowlist/register/draw/reveal, match result, winner/runner-up, and exports.


## 2026-06-10 — Add optional Football-Data sync and cached Tele summaries

Decision: Use Football-Data as the first live football provider, behind an optional env-keyed sync endpoint. Record rate-limit response headers and skip imports where API teams cannot be confidently mapped to local sweepstake teams. Add cached Tele summaries with optional OpenAI-backed generation and deterministic fallback.

Rationale: This adds the live-data/LLM path without making the app dependent on paid/API availability or risking corrupt match/team mappings while 2026 qualifiers are incomplete.


## 2026-06-10 — Import confirmed World Cup teams from Football-Data

Decision: Add an Admin `Import teams` action that fetches Football-Data WC fixtures, extracts the 48 unique teams, replaces local placeholder team slots before the draw, and stores crest URLs for UI display. The action is blocked once a draw exists.

Rationale: The confirmed World Cup team list and fixtures are available from Football-Data, so the app should not require manual entry of all teams. Blocking after draw protects existing assignments.


## 2026-06-10 — Add Football-Data auto-sync and safe knockout status updates

Decision: Add an optional in-app Football-Data scheduler controlled by env vars, and derive team statuses only from finished knockout/final matches.

Rationale: Tele should update without manual sync during the tournament, but group-stage elimination has standings/tiebreaker complexity. Knockout losers/champion/runner-up are safe to derive from finished match results.


## 2026-06-10 — Use OpenRouter for cached Tele drama summaries

Decision: Support `OPENROUTER_API_KEY` as the primary LLM path for Tele drama summaries, with OpenAI and deterministic fallback remaining available. Cache summaries by match/result source key.

Rationale: Dr. Wells provided an OpenRouter key and wants group-stage match results to feed Tele drama. Caching avoids repeated LLM calls on every Tele refresh or sync.


## 2026-06-10 — Final office-TV/product direction

Decision: Tele should be a simple office TV surface showing fixtures/results and a sarcastic drama feed only. Remove survival/alive/prize clutter from `/tele`.

Rationale: Dr. Wells wants people to glance at scores and laugh at the drama feed; extra tournament/admin state distracts from that use case.

Decision: Draw should be personal and animated, but the full draw board should be collapsed by default.

Rationale: The employee journey should focus on “what team did I get?” with drama. The full board is useful secondary information, not the main moment.

## 2026-06-11 — Keep participant names out of LLM drama context

Decision: OpenRouter/OpenAI Tele drama context should not include participant names. The LLM receives team names, team statuses, match data, and department where available.

Rationale: The office app can still generate useful/funny Tele copy without sending colleague names to the external LLM provider. Emails were already excluded from public/Tele state.

## 2026-06-11 — Tele shows yesterday's drama only

Decision: The `/tele` drama feed should display only summaries for finished matches from yesterday, not all cached feed items or historical match-impact events.

Rationale: The office TV should stay fresh and focused on recent match chatter instead of replaying stale tournament history.

## 2026-06-11 — Separate add employees from replace employee list

Decision: Employee CSV management now has two explicit paths: append missed employees without touching participants, and replace the full employee list with confirmation.

Rationale: The original upload replaced the allowlist and cleared participants before the draw, which surprised real office use when a partial CSV was uploaded after people had already joined.

## 2026-06-11 — Latest match drama over calendar-yesterday drama

Decision: Tele should show latest available match drama, not only yesterday's match drama.

Rationale: During live tournament use, newly finished matches should appear on office TV immediately after sync, regardless of calendar day. Auto-sync should also run once at startup so restarted containers do not wait for the first interval before scores update.

## 2026-06-11 — Never erase known scores with incomplete provider payloads

Decision: If a non-manual provider returns `null` scores for an existing match, preserve the stored SQLite score. Tele drama should only show summaries tied to scored finished matches.

Rationale: Football-Data can mark a match `FINISHED` while returning `null` scores. The app must not wipe known/manual results or show stale/generated drama for incomplete score data.

## 2026-06-11 — Manual correction for imported fixtures

Decision: Imported match rows must be editable from Admin, not only deletable.

Rationale: Provider data can be incomplete or delayed. Organisers need a direct way to correct scores on the existing fixture so Tele and drama generation use the right result without creating duplicate matches.

## 2026-06-11 — Inline editing for fixture results

Decision: Existing fixture result edits should happen inline under the selected match row.

Rationale: Loading imported fixtures into the top add-match form was confusing and looked broken. Inline editing keeps the correction anchored to the match being updated and avoids accidental duplicate fixtures.

## 2026-06-13 — Separate My Team Journey with manager comments

Decision: Add My Team Journey as a separate public `/journey` page instead of putting match timelines and comments inside the Draw page.

Rationale: Draw should stay focused on the reveal moment. Journey is an ongoing tournament surface for fixtures, results, and manager comments.

Decision: Treat participants as team managers for pre-match comments, and send the LLM only team, manager comment, and match result.

Rationale: This keeps Tele Drama Feed engaging while avoiding names, emails, departments, and participant metadata in LLM context.

## 2026-06-13 — Tele as morning catch-up feed

Decision: Redesign `/tele` around overnight results and roasts instead of a live-match TV board.

Rationale: The office is in Europe/Ireland and colleagues are unlikely to watch live overnight World Cup matches in the office. The useful behaviour is reading results and Drama Feed recaps in the morning.

Decision: Tele may show manager comments as team-manager quotes, but not participant names, emails, or departments.

Rationale: Manager comments are intended to feed office banter, but identity metadata should remain out of the public Tele surface and LLM context.

## 2026-06-14 — Show first names on Tele manager comments

Decision: Tele result cards should show manager comments with the participant's first name and team name.

Rationale: Dr. Wells wants the office cards to feel personal and match the intended banter format. The public Tele payload still excludes email, department, and full participant name; LLM drama context remains limited to team/comment/match result.

Decision: Tele manager comments use a compact identity format: initials avatar plus short display name (`First L`) and team.

Rationale: This matches the intended office-TV card design from Dr. Wells' screenshot while keeping the display concise and avoiding email, department, and full participant name exposure.

## 2026-06-16 — Tele drama must never use departments or identities

Decision: All Tele LLM summary paths must exclude participant names, emails, departments, identities, job roles, companies, and private details from both prompt instructions and supplied context. This applies even when a custom `TELE_DRAMA_PROMPT` is configured.

Rationale: Production showed cached Tele drama inventing department-based roasts. The office TV can still be funny using team/result/manager-comment facts only; private or invented workplace identity context is unnecessary and risky.
