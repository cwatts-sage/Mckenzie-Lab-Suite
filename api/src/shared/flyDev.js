// Drosophila development model.
// Baseline: temperature-adjusted standard curve. Calibrated: per-tube rate fit from observations.
//
// Canonical "developmental fraction" axis (0 = egg lay, 1 = eclosion / new adults).
// Anchors chosen for the stages McKenzie actually observes. Tunable.
const STAGE_FRACTION = {
  new_tube: 0.00,      // ~egg lay (parents set + lay lag)
  L3: 0.35,
  wandering_L3: 0.45,
  pupa: 0.50,
  new_adults: 1.00,
};

const STAGE_ORDER = ['new_tube', 'L3', 'wandering_L3', 'pupa', 'new_adults'];

// Standard total egg->adult time at 25C (days).
const BASE_DAYS_25 = 10;

// Default lag (days) from "parents set" to effective egg lay onset.
const DEFAULT_LAY_LAG_DAYS = 2;

// User-editable timing settings expressed as DAYS-from-egg-lay at the reference temp (25C).
// McKenzie tunes these when she notices discrepancies; everything (prediction + backward
// planning) derives from them. Defaults match the standard curve above.
const DEFAULT_SETTINGS = {
  ref_temp: 25,
  lay_lag_days: DEFAULT_LAY_LAG_DAYS,
  days_to_L3: 3.5,          // egg-lay -> L3 onset at 25C
  days_to_wandering_L3: 4.5,
  days_to_pupa: 5,
  days_to_new_adults: 10,   // = total egg->adult at 25C
};

// Build the STAGE_FRACTION map + base days from a settings object (day-milestones at ref temp).
// Fractions are days_to_stage / days_to_new_adults so the 0..1 axis stays consistent.
function deriveModel(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const total = Number(s.days_to_new_adults) || BASE_DAYS_25;
  const frac = {
    new_tube: 0,
    L3: (Number(s.days_to_L3) || 0) / total,
    wandering_L3: (Number(s.days_to_wandering_L3) || 0) / total,
    pupa: (Number(s.days_to_pupa) || 0) / total,
    new_adults: 1,
  };
  return { fraction: frac, baseDays: total, layLag: Number(s.lay_lag_days) || 0, refTemp: Number(s.ref_temp) || 25 };
}

// Development rate factor vs 25C, by temperature (C). Interpolated.
// Higher factor = faster development. Based on standard Drosophila timing.
const TEMP_FACTORS = [
  [18, 0.53],
  [20, 0.67],
  [22, 0.80],
  [25, 1.00],
  [27, 1.07],
  [29, 1.11],
];

function devRateFactor(tempC) {
  const t = (tempC == null || isNaN(tempC)) ? 22 : Number(tempC);
  const pts = TEMP_FACTORS;
  if (t <= pts[0][0]) return pts[0][1];
  if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, f0] = pts[i];
    const [t1, f1] = pts[i + 1];
    if (t >= t0 && t <= t1) {
      const r = (t - t0) / (t1 - t0);
      return f0 + r * (f1 - f0);
    }
  }
  return 1.0;
}

// Days between two ISO date(time) strings.
function daysBetween(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return (b - a) / (1000 * 60 * 60 * 24);
}

// Map a developmental fraction back to the nearest stage label, using a fraction map.
function fractionToStage(frac, fracMap) {
  const FR = fracMap || STAGE_FRACTION;
  if (frac <= 0) return 'new_tube';
  let current = 'new_tube';
  for (const s of STAGE_ORDER) {
    if (frac >= FR[s] - 1e-9) current = s;
  }
  if (frac >= FR.new_adults) return 'new_adults';
  return current;
}

// Linear fit of dev_fraction = slope * (elapsedDays) using known observation anchors.
// Observations: [{ elapsedDays, fraction }]. Returns { slope, layLagDays, anchors } or null.
function fitRate(anchors) {
  const pts = anchors.filter(a => a.fraction > 0 && a.elapsedDays != null && a.elapsedDays > 0);
  if (pts.length === 0) return null;
  if (pts.length === 1) {
    // Single anchor: rate so that fraction is hit exactly at its observed elapsed time.
    // layLag MUST be 0 here so fracNow = slope*elapsed reproduces the observation (no double lag).
    const p = pts[0];
    return { slope: p.fraction / p.elapsedDays, layLagDays: 0, n: 1 };
  }
  // >=2 anchors: least-squares fraction = slope*(elapsed - lag). Solve slope & lag via linear regression
  // fraction = slope*elapsed - slope*lag  => treat as y = m*x + b, m=slope, b=-slope*lag.
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.elapsedDays, 0);
  const sy = pts.reduce((s, p) => s + p.fraction, 0);
  const sxx = pts.reduce((s, p) => s + p.elapsedDays * p.elapsedDays, 0);
  const sxy = pts.reduce((s, p) => s + p.elapsedDays * p.fraction, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) {
    const p = pts[pts.length - 1];
    return { slope: p.fraction / p.elapsedDays, layLagDays: DEFAULT_LAY_LAG_DAYS, n };
  }
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const layLagDays = slope !== 0 ? -intercept / slope : DEFAULT_LAY_LAG_DAYS;
  return { slope: Math.max(slope, 1e-6), layLagDays, n };
}

// Predict current stage + ETA to target.
// vial: { start_date, target_stage }; boxTemp; observations: [{observed_at, stage_seen}]; nowIso; settings
function predict(vial, boxTemp, observations, nowIso, settings) {
  const model = deriveModel(settings);
  const FR = model.fraction;
  const baseDays = model.baseDays;
  const defaultLayLag = model.layLag;
  const now = nowIso || new Date().toISOString();
  const start = vial.start_date;
  if (!start) return { predicted_stage: null, confidence: 'none', note: 'No start date' };

  const elapsedNow = daysBetween(start, now);
  if (elapsedNow == null || elapsedNow < 0) return { predicted_stage: 'new_tube', confidence: 'low' };

  const obs = (observations || [])
    .filter(o => o.observed_at && FR[o.stage_seen] != null)
    .map(o => ({ elapsedDays: daysBetween(start, o.observed_at), fraction: FR[o.stage_seen], stage: o.stage_seen }))
    .filter(o => o.elapsedDays != null);

  let slope, layLag, mode, n;
  const fit = fitRate(obs);
  if (fit) {
    slope = fit.slope; layLag = fit.layLagDays; n = fit.n;
    mode = n >= 2 ? 'calibrated' : 'single-obs';
  } else {
    // Baseline: temp-adjusted standard curve. dev_fraction per day = factor / baseDays.
    const factor = devRateFactor(boxTemp) / devRateFactor(model.refTemp);
    slope = factor / baseDays;
    layLag = defaultLayLag;
    mode = 'baseline';
    n = 0;
  }

  let fracNow = Math.max(0, slope * (elapsedNow - layLag));

  // Observations are authoritative: development only moves forward, so the predicted fraction
  // can never be earlier than the most-recent observed stage's fraction. This guarantees that if
  // you logged "wandering L3" today, the tube reads at least wandering L3 today.
  let latestObsFrac = -1;
  let latestObsElapsed = null;
  obs.forEach(o => {
    if (o.elapsedDays != null && (latestObsElapsed == null || o.elapsedDays >= latestObsElapsed)) {
      latestObsElapsed = o.elapsedDays;
      latestObsFrac = Math.max(latestObsFrac, o.fraction);
    }
  });
  // Use the highest fraction among observations at/after the most recent observation time.
  if (obs.length > 0) {
    const maxObsFrac = Math.max(...obs.map(o => o.fraction));
    // Project forward from the latest observation using the rate (so it can advance past it),
    // but never fall below what was actually seen.
    fracNow = Math.max(fracNow, maxObsFrac);
  }

  const predictedStage = fractionToStage(fracNow, FR);

  // ETA to target stage. If already at/past the target, ETA = 0 (window open now).
  const target = vial.target_stage || 'L3';
  const targetFrac = FR[target] != null ? FR[target] : FR.L3;
  let etaDays = null;
  if (fracNow >= targetFrac) {
    etaDays = 0;
  } else if (slope > 0) {
    const elapsedAtTarget = targetFrac / slope + layLag;
    etaDays = elapsedAtTarget - elapsedNow;
  }

  // "Clear parents by" for crosses: ~2 days before predicted new_adults (first eclosion).
  let clearParentsInDays = null;
  if (vial.type === 'cross' && slope > 0) {
    const elapsedAtAdults = FR.new_adults / slope + layLag;
    clearParentsInDays = (elapsedAtAdults - 2) - elapsedNow;
  }

  // Factor vs reference-temp standard (for "running 1.4x slower" messaging)
  const standardSlope = 1 / baseDays;
  const speedVsStandard = standardSlope > 0 ? slope / standardSlope : null;

  return {
    predicted_stage: predictedStage,
    dev_fraction: Number(fracNow.toFixed(3)),
    elapsed_days: Number(elapsedNow.toFixed(1)),
    target_stage: target,
    eta_to_target_days: etaDays == null ? null : Number(etaDays.toFixed(1)),
    clear_parents_in_days: clearParentsInDays == null ? null : Number(clearParentsInDays.toFixed(1)),
    speed_vs_standard: speedVsStandard == null ? null : Number(speedVsStandard.toFixed(2)),
    mode,
    observation_count: n,
    confidence: mode === 'calibrated' ? 'high' : mode === 'single-obs' ? 'medium' : 'low',
  };
}

// Backward planner: given a desired ready date + target stage + box temp, compute the date the
// cross/tube must START (parents set) to hit that target on time. Uses the BASELINE temp model
// (per McKenzie: most crosses grow at standard rate; she tunes the milestone days in settings).
// Returns { start_date, days_needed, ready_date, target_stage } or null.
function planBackward({ targetStage, readyDate, boxTemp, settings }) {
  if (!readyDate) return null;
  const model = deriveModel(settings);
  const FR = model.fraction;
  const target = FR[targetStage] != null ? targetStage : 'L3';
  const targetFrac = FR[target];
  const factor = devRateFactor(boxTemp) / devRateFactor(model.refTemp);
  const slope = factor / model.baseDays;            // dev fraction per day at this temp
  if (slope <= 0) return null;
  // elapsed from start (parents set) to target = targetFrac/slope + layLag
  const daysNeeded = targetFrac / slope + model.layLag;
  const ready = new Date(readyDate + 'T12:00:00');
  if (isNaN(ready.getTime())) return null;
  const startMs = ready.getTime() - daysNeeded * 86400000;
  const startDate = new Date(startMs).toISOString().split('T')[0];
  return {
    start_date: startDate,
    days_needed: Number(daysNeeded.toFixed(1)),
    ready_date: readyDate,
    target_stage: target,
  };
}

module.exports = { STAGE_FRACTION, STAGE_ORDER, BASE_DAYS_25, DEFAULT_SETTINGS, deriveModel, devRateFactor, predict, planBackward, fitRate, daysBetween };
