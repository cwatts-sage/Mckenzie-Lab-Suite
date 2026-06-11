# PLAN — Drosophila Manager v6 (post-real-use feedback)

Owner: McKenzie. Status: PLANNING (2026-06-11). Three issues raised after a few days of real use.

## Current state (deployed)
- Flies tab: boxes (name+temp), tubes (stock|cross), staggered cohorts (lineage, "set M.D"),
  2-tap multi-select observation logger, per-cross predictions (target ETA, clear-parents,
  transfer nudge), stock flip scheduling, Archive vs Delete.
- Attention list: flat array, one row PER concern PER tube. Conditions:
  - flip due <=3d (stocks)
  - target window: eta_to_target <=1.5d & >=-2
  - clear parents <=2d & >=-3
  - transfer due <=0.5d (parent-holder)
- That flat model = the screenshot problem: 17 rows, every cohort of every cross listed,
  "window open now" vs "in ~0.1d" vs "transfer" all mixed, no grouping, no priority.

---

## ISSUE 1 — "Needs Attention" tab is overwhelming
### Root cause
Flat per-tube-per-concern rows + every staggered cohort surfaces independently. With ~7 crosses
× 2-3 cohorts each, dozens of near-identical lines ("Wand L3 window open now" / "in ~0.1d" /
"Transfer parents to a fresh tube").

### Proposed redesign
1. **Group by lineage/cross**, not by tube. One collapsible row per cross; cohorts roll up under it.
   - Header: "Nab2RNAi x DH44GMR — 2 actions" with the most urgent action shown inline.
2. **Priority tiers** (sort + color), collapse the noise:
   - 🔴 NOW / overdue (window open, clear parents now, flip overdue, transfer overdue)
   - 🟡 SOON (within ~1 day)
   - hide everything beyond the urgent horizon (the "~0.1d" stuff folds into NOW; longer-range
     stuff drops off the attention list entirely and lives on the tube card).
3. **De-duplicate the transfer nudge**: "Transfer parents to a fresh tube" is recurring/expected,
   not really "attention." Move it to a quieter sub-line or only show when actually overdue.
4. **Collapse count chips**: e.g. "🎯 6 windows open · 🔄 4 transfers due · 🪰 2 flips" summary
   bar at top; tap to expand the relevant group.
5. **Tighten thresholds** so "in ~0.1d" isn't its own separate line from "now" — bucket anything
   <= ~0.5d as "now".

### Open Qs for McKenzie
- 1A. Group attention by CROSS (collapsible) — yes?
- 1B. Want a top summary bar ("6 windows open · 4 transfers due") or just the grouped list?
- 1C. Should the recurring "transfer parents" nudge stay in Attention, move to a quieter spot,
      or only appear when overdue?
- 1D. How far ahead should Attention look — only "today/now," or also "tomorrow"?

---

## ISSUE 2 — Collection window for STOCKS
### Need
Sometimes she collects larval brains from a STOCK (not just crosses). Wants a collection window
on stocks too — e.g. "collect wandering L3 from this stock between X and Y."

### Current gap
Stocks have NO target_stage / prediction — only flip scheduling. Predictions run for crosses only
(`v.type === 'cross'` gates predict() and attention target logic).

### Proposed
- Allow an OPTIONAL **collection target** on a stock: target_stage + a desired collection window.
  - A stock can be in "just flipping" mode (current) OR have an active collection goal layered on.
- When a collection goal is set, run the same prediction engine on that stock's current tube to
  estimate when the window opens (e.g. wandering L3), using box temp + any observations.
- Surface in Attention like a cross target window, but labeled "collect" (🧫/🧠).
- Keep the flip schedule independent (a stock can flip AND have a collection goal).

### Design choice (need decision)
- Stocks don't have a clean "start_date = parents set" anchor like crosses. Options:
  - (a) Use last flip date as the cohort start for the collection-window prediction.
  - (b) Let her log an observation (she sees L3) and predict the window from that — most reliable.
  - (c) Just let her set the window dates MANUALLY (no prediction) and it reminds her. Simplest.
- Likely: support (c) manual window as the floor, and (b) refine with an observation if logged.

### Open Qs for McKenzie
- 2A. When you collect from a stock, is it from the current/normal flipping tube, or do you set up
      a dedicated tube for the collection?
- 2B. Do you want the app to PREDICT the collection window (from temp + an L3 sighting), or just
      let you set the dates yourself and remind you?
- 2C. Target for stock collection — always wandering L3 (brains), or configurable?

---

## ISSUE 3 — Reverse planning: "I need X ready by DATE → when do I start?"
### Need
Set a desired ready-date + target stage (e.g. wandering L3 by June 20) for a cross or stock, and
the app back-calculates and tells her when to set the cross / start the new tube.

### Engine
We already have forward prediction (start + temp → stage/ETA). Reverse is the inverse:
- target_stage → canonical dev_fraction (L3=0.35, wand_L3=0.45, etc.)
- need elapsed_dev_days = dev_fraction × baseline(25°C=10d) / dev_rate_factor(boxTemp)
- add lay-lag (~2d for crosses, parents-set anchor) → total calendar days from start to target
- **start_date = desired_ready_date − total_days**
- Use per-lineage calibrated rate if history exists (her past cohorts of that cross) for accuracy —
  this is where the "learns your real rate" payoff shows up.

### UX
- New "🎯 Plan backward" action (own small planner, or a mode in the add-tube form):
  - pick: target stage, desired ready date, box (temp), and optionally which existing cross
    (to reuse its learned rate).
  - output: "Set this cross on **June 12** to hit wandering L3 by June 20 (at 22°C, ~8 days)."
  - optionally show a window (±1d confidence) not a false-precise single day.
- Could also generate a reminder/attention entry: "Start <cross> today to hit target by <date>."
- Ties into Issue 2: same reverse math answers "when do I flip the stock to have L3 brains by X."

### Open Qs for McKenzie
- 3A. Standalone "Backward planner" tool (enter target+date, get start date), or baked into the
      add-tube/collection form?
- 3B. Should planning a backward target auto-create a reminder when the start day arrives
      ("start this cross today")?
- 3C. Reuse a specific past cross's learned rate, or just use the temperature baseline?

---

## Phasing proposal
- P1 (highest value, quick win): **Issue 1** attention redesign (grouping + tiers + thresholds).
  Pure frontend, no schema change. Fixes the daily pain immediately.
- P2: **Issue 3** backward planner (mostly new reverse fn in flyDev.js + small UI). High value,
  low schema cost (could be a calculator that doesn't even persist).
- P3: **Issue 2** stock collection windows (schema: stock target_stage + collection window fields;
  extend predict() to stocks). Bit more involved.

## ✅ FINAL DECISIONS (McKenzie 2026-06-11) — SPEC LOCKED

### Issue 1 — Attention redesign
- Summary bar up top: YES (e.g. "6 windows open · 4 transfers due · 2 flips"). Tap to expand group.
- Group attention by CROSS (collapsible), cohorts roll up.
- Transfer nudge: ONLY show when OVERDUE (not on schedule). Plus:
  - Add ability to CUSTOMIZE the transfer date (per parent-holding tube, editable).
  - Add a SNOOZE on transfer (and ideally on other attention items) — push the nudge out N days.
- Attention focus = TODAY. Add a non-distracting "Preview tomorrow" toggle/peek (collapsed by
  default, e.g. a small "+ tomorrow (3)" expander) so it doesn't add daily noise.
- Bucket anything <= ~0.5d as "now".

### Issue 2 — Stock collection windows
- Collect from the NORMAL flipping tube (no dedicated tube).
- PREDICT the window: use box temp + an observation (she logs L3 sighting) → predict wandering L3 etc.
  - Anchor for stock prediction = last flip date as cohort start, refined by logged observation.
- Collection target is CHANGEABLE (configurable per stock, default wandering L3).
- Stock keeps its flip schedule independently; collection goal layers on top.
- Surface in Attention/summary labeled "collect" (🧠).

### Issue 3 — Reverse planning
- NOT its own standalone tool. Surface as a REMINDER that's part of the top summary bar
  ("Start <cross> today to hit wand L3 by <date>").
- Engine: TEMPERATURE BASELINE only to start (most crosses grow at standard rate).
- BUT make the stage timings EDITABLE/overridable: let her adjust time-to-wandering-L3,
  time-to-pupa, time-to-new-adults (global defaults she can tune; possibly per-box-temp).
  When she notices a discrepancy she fixes the numbers and all predictions/planning update.
  => This effectively replaces the per-tube auto-fit complexity with user-tunable constants.
- Where to enter a backward target: on the add-tube/collection form (pick target stage + desired
  ready date) — app stores the planned start date and emits the "start today" reminder in the
  summary bar when that day arrives.

## Implications / refactor notes
- Add a settings surface for tunable stage timings (wand L3 / pupa / new adults days at a reference
  temp), feeding both forward prediction and backward planning. flyDev.js currently hardcodes
  STAGE_FRACTION + 25C=10d baseline; expose these as editable + persist (new flysettings row or
  per-user config). Keep the temp-factor curve.
- predict() must accept stocks when a collection target is set (currently cross-only gate).
- New persisted fields:
  - flyvials (stock): collection_target_stage (nullable), collection enabled flag.
  - flyvials: planned_start_date / desired_ready_date + planned_target_stage (for backward reminders).
  - flyvials: transfer_date override + snooze_until (attention snooze).
- Attention becomes: grouped-by-lineage, tiered, summary-bar-driven, with today/tomorrow split
  and snooze support.

## Build order (confirmed direction)
1. Issue 1 attention redesign (summary bar, group-by-cross, overdue-only transfer, snooze,
   today + tomorrow peek, editable transfer date). Mostly frontend + small snooze/transfer-date persistence.
2. Tunable stage-timing settings + Issue 3 backward planner reminder (in summary bar).
3. Issue 2 stock collection windows (predict() for stocks + collection target fields).
