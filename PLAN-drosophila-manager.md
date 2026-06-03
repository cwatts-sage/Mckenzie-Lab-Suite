# PLAN — Drosophila Manager (major v5 feature)

Owner: McKenzie. Solo use. Status: PLANNING (no code yet).
Started: 2026-06-03.

## Vision
A tab to manage Drosophila vials/crosses: track strains, location (which box), flip schedule, AND
intelligently predict the current/upcoming developmental stage of crosses & larval-staggered tubes
by learning the actual growth rate from McKenzie's periodic observations.

## Problem
- ~4 boxes of vials. Stock strains are easy (flip every 3–4 wks). Crosses & larval-stagger boxes are
  tedious and mature at *different rates*, making it hard to catch L3 larvae at the right moment.
- Textbook timing (egg→L3 ≈ 5–6 days at 25°C) doesn't match her real tubes → needs per-tube learning.

## Background biology (reference, 25°C optimal)
Egg→adult ≈ 10 days at 25°C. Holometabolous: embryo → 3 larval instars → pupa → adult.
Approx cumulative timing from egg-lay at 25°C:
- Embryo/egg hatch (→ L1): ~24 h (day 1)
- L1: ~day 1
- L2: ~day 2
- L3: ~days 3–5 (wandering L3 late)
- Pupariation (→ pupa): ~day 5
- Pupa: ~days 5–9/10
- Eclosion (new adults): ~day 10
Temperature dependence is strong & roughly the main knob:
- 25°C ≈ 10 days (baseline, dev rate factor 1.0)
- 18°C ≈ ~19 days (~2x slower; factor ~0.55)
- 29°C ≈ ~9 days (slightly faster; factor ~1.1; upper safe limit)
- ~20°C ≈ ~15 days
These give a starting prior; the app refines per-tube from observations.

## Core data model (Azure Table Storage, new tables)
### Table: flyvials  (PartitionKey = userId, RowKey = vialId)
- name / label (e.g. "w1118 x Arc1-GAL4")
- type: 'stock' | 'cross' | 'larval-stagger' | 'expansion'
- genotype / strain text (free text; optional FlyBase link later)
- parents (for crosses): mother_genotype, father_genotype (optional structured)
- box / location: which box + optional slot (ties into hierarchical location feature later)
- temperature: °C the tube is kept at (drives prediction). Default 25.
- start_date: date cross set / eggs laid / tube started
- start_event: what start_date represents ('egg_lay' | 'cross_set' | 'first_seen_larva' etc.)
- status: 'active' | 'flipped' | 'collected' | 'discarded' | 'archived'
- flip_interval_days: for stocks (default 21–28); null for crosses
- next_flip_date: computed or manual
- notes
- created_at / updated_at

### Table: flyobservations  (PartitionKey = vialId, RowKey = obsId)  -- the "smart" data
- vial_id
- observed_at (datetime)
- stage_seen: 'eggs' | 'L1' | 'L2' | 'L3' | 'wandering_L3' | 'pupa' | 'pharate' | 'eclosed_adults'
- intensity (optional): 'first' | 'few' | 'many' | 'peak'  (helps locate the leading edge)
- note (optional)

## The smart prediction engine (the heart of the feature)
Goal: given start_date + observations, predict the stage a tube is at *now* and *when* it will hit a target (e.g. L3 peak).

Approach — staged, ship the simple version first:
1. BASELINE (no observations yet): use temperature-adjusted standard curve.
   - dev_rate_factor(T) from a small lookup/interpolation (18→0.55, 20→0.67, 25→1.0, 29→1.1).
   - predicted stage = where (now - start_date) * factor falls on the 25°C milestone timeline.
2. CALIBRATED (>=1 observation): fit this tube's actual rate.
   - Each observation = (elapsed_time, known stage-onset point on the canonical 0–1 dev axis).
   - Map stage → canonical "developmental fraction" (eggs=0.0, L1≈0.10, L2≈0.20, L3 start≈0.30,
     wandering L3≈0.45, pupa≈0.50, eclosion≈1.0). (Tunable constants.)
   - Fit dev_fraction = k * elapsed (+ optional lag). With 1 point → solve k (rate). With ≥2 →
     least-squares slope = personalized rate for THIS tube. This directly addresses "my crosses
     mature at different rates."
   - Predict now: dev_fraction_now = k * elapsed_now → map back to stage + ETA to next stages/target.
3. CONFIDENCE: more observations + recent ones = higher confidence. Show as a band, not false precision.

Output shown per tube:
- "Predicted stage now: L3 (wandering) — peak L3 ~tomorrow AM"
- "On track / running ~1.4× slower than 25°C standard"
- countdown to user-chosen target stage (default L3 for crosses)

## UI (new "🪰 Flies" top-level tab, or under Inventory)
- Box/grid overview: cards grouped by box, each tube shows name, predicted stage chip, next action.
- Color/sort by urgency: needs flip today, target-stage window open, etc.
- Tube detail: timeline of observations, predicted curve, "Log observation" quick button
  (tap stage seen → timestamped), edit start/temp, flip action (creates next-gen tube optionally).
- Quick "Log observation" is the daily-driver interaction — must be 2 taps.
- Flip workflow for stocks: mark flipped → auto-set next_flip_date = today + interval.
- Dashboard/Hub widget: "Tubes needing attention today" (flips due + target-stage windows).

## Reminders / proactive (optional phase)
- Could surface "tubes hitting L3 tomorrow" or "flips due" — via Hub widget first; push/notification later.

## ✅ FINAL DECISIONS (McKenzie 2026-06-03) — SPEC LOCKED, building Phase 1
- TUBE TYPES: just `stock` and `cross` (no separate larval-stagger).
  - stock: low-touch, flip every 21 days. Attention = flip due.
  - cross: high-touch. Two concerns: (a) catch offspring at target stage (L3/etc), (b) CLEAR PARENTS
    before first offspring eclose so parents don't mix with new adults.
    => Derive a "clear parents by" deadline = predicted new_adults date minus safety margin
       (default ~2 days before first eclosion). Surface in attention widget for crosses.
- ATTENTION WIDGET (v1): flips due (stocks) + tubes entering target-stage window (crosses) +
  "clear parents" deadline approaching (crosses).

## (superseded) earlier locked notes
- STAGES (simplified to what she can actually observe): `new_tube` → `L3` → `wandering_L3` → `pupa` → `new_adults`.
  - `new_tube` ~correlates with egg-lay (she usually can't see eggs/L1/L2). It's both the start marker and a loggable observation.
  - Dropping eggs/L1/L2 as observation options. Canonical dev-fraction anchors (tunable):
    new_tube/egg-lay = 0.00, L3 = 0.35, wandering_L3 = 0.45, pupa = 0.50, new_adults = 1.00.
- TARGET: per-tube, default to L3; common alt = new_adults. Tube stores target_stage.
- TEMPERATURE: a property of the BOX, not the tube. All boxes room temp (~22°C) now, but a box may
  go cold later → box has a temperature field; tubes inherit their box's temp for prediction.
  (Room temp ≈ 22°C → dev_rate_factor ~0.8 vs 25°C. Use ~22 as default box temp.)
- START EVENT: start_date = day parents were set together. So there is an egg-lay LAG before dev clock
  effectively starts (~1–3 days of laying). Model: treat parents-set as t0 but apply a small lay-lag
  offset (default ~2 days, refined by observations) before mapping to the 0→1 dev axis. Observations
  (esp. first L3) will correct this automatically via the fit.
- FLIP: every 3 weeks (21 days) for stocks. (Per-strain override later if needed.)
- BOXES: free-text box name for now (+ the box temperature field). Hierarchy deferred.
- #7 auto-create next tube on flip: UNDECIDED → defer, design flip as simple status+next_flip_date for now.
- #8 link tube to Project/Experiment/Sample: UNDECIDED → defer to later phase.
- #9 FlyBase import: LATER.

## Model refinement from decisions
- Because start = parents-set (not egg-lay) and eggs/L1/L2 are invisible, the FIRST reliable anchor is
  usually the first L3 sighting. Strategy:
  - Phase-2 baseline: predict from box temp + (elapsed - lay_lag) on the standard curve.
  - Phase-3 calibrated: as soon as there's a dated L3 (or wandering L3 / pupa) observation, fit this
    tube's rate by anchoring known dev-fraction(s) to elapsed-since-t0. With 2+ anchors, also solve the
    effective lay-lag/offset, which absorbs the parents-set→egg-lay variability per cross. This is what
    makes "my crosses mature at different rates" actually work.
- Per-tube output: predicted stage now, ETA to target (L3 or new_adults), and a slower/faster-than-standard factor.

## (Resolved) earlier open questions for McKenzie
Q1. Stages: is eggs / L1 / L2 / L3 / wandering-L3 / pupa / eclosed enough, or split further?
Q2. Target stage: is it always L3 you're trying to catch, or per-tube configurable?
Q3. Temperature: do your tubes sit at different temps (25 vs 18 etc.)? Should temp be per-tube?
Q4. Start point: when you "start" a cross, are you logging the day you set parents together, or the
    day you first see eggs/larvae? (Affects the egg-lay offset in predictions.)
Q5. Stock flip interval: default 21 or 28 days? Per-strain override?
Q6. Boxes: just a free-text box name for now, or tie into the hierarchical-location feature we
    discussed (temp → rack → box)?
Q7. Do you want a flip to optionally spawn the "next" tube automatically (lineage chain)?
Q8. Link a fly vial to a Project/Experiment/Sample in the existing notebook? (e.g. cross feeds an experiment)
Q9. FlyBase link import (auto-pull allele info) — include in v1 or defer to a follow-up?

## Phasing proposal (LOCKED)
- Phase 1: new tables (flyvials, flyboxes, flyobservations) + CRUD tube tracker (name, type, genotype,
  box, target_stage, start_date=parents-set) + box management w/ temperature + stock flip scheduling
  (21d) + Hub "needs attention today" widget (flips due + target-stage windows).
- Phase 2: 2-tap observation logging (new_tube/L3/wandering_L3/pupa/new_adults) + baseline temp-adjusted
  prediction (uses box temp + lay-lag).
- Phase 3: per-tube calibrated rate model (fit rate + effective lay-lag from observations) + target ETA
  + slower/faster-than-standard factor + confidence band.
- Phase 4 (later, undecided/deferred): auto-create next tube on flip (lineage), notebook linking,
  FlyBase allele import, push reminders.

## Data model deltas from decisions
- New `flyboxes` table: { id, name, temperature (default 22), notes }. Tubes reference box_id; temp inherited.
- `flyvials`: drop per-tube temperature; add box_id, target_stage (default 'L3'), start_event fixed to 'parents_set'.
- `flyobservations.stage_seen` enum reduced to: new_tube | L3 | wandering_L3 | pupa | new_adults.
- flip_interval_days default 21.
