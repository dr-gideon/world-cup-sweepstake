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
