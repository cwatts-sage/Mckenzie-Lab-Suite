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

// Map a developmental fraction back to the nearest stage label (and whether between stages).
function fractionToStage(frac) {
  if (frac <= 0) return 'new_tube';
  let current = 'new_tube';
  for (const s of STAGE_ORDER) {
    if (frac >= STAGE_FRACTION[s] - 1e-9) current = s;
  }
  if (frac >= STAGE_FRACTION.new_adults) return 'new_adults';
  return current;
}

// Linear fit of dev_fraction = slope * (elapsedDays) using known observation anchors.
// Observations: [{ elapsedDays, fraction }]. Returns { slope, layLagDays, anchors } or null.
function fitRate(anchors) {
  const pts = anchors.filter(a => a.fraction > 0 && a.elapsedDays != null && a.elapsedDays > 0);
  if (pts.length === 0) return null;
  if (pts.length === 1) {
    // Single anchor: rate so that fraction is hit at elapsed (ignoring lag refinement).
    const p = pts[0];
    return { slope: p.fraction / p.elapsedDays, layLagDays: DEFAULT_LAY_LAG_DAYS, n: 1 };
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
// vial: { start_date, target_stage }; boxTemp; observations: [{observed_at, stage_seen}]; nowIso
function predict(vial, boxTemp, observations, nowIso) {
  const now = nowIso || new Date().toISOString();
  const start = vial.start_date;
  if (!start) return { predicted_stage: null, confidence: 'none', note: 'No start date' };

  const elapsedNow = daysBetween(start, now);
  if (elapsedNow == null || elapsedNow < 0) return { predicted_stage: 'new_tube', confidence: 'low' };

  const obs = (observations || [])
    .filter(o => o.observed_at && STAGE_FRACTION[o.stage_seen] != null)
    .map(o => ({ elapsedDays: daysBetween(start, o.observed_at), fraction: STAGE_FRACTION[o.stage_seen], stage: o.stage_seen }))
    .filter(o => o.elapsedDays != null);

  let slope, layLag, mode, n;
  const fit = fitRate(obs);
  if (fit) {
    slope = fit.slope; layLag = fit.layLagDays; n = fit.n;
    mode = n >= 2 ? 'calibrated' : 'single-obs';
  } else {
    // Baseline: temp-adjusted standard curve. dev_fraction per day = factor / BASE_DAYS_25.
    const factor = devRateFactor(boxTemp);
    slope = factor / BASE_DAYS_25;
    layLag = DEFAULT_LAY_LAG_DAYS;
    mode = 'baseline';
    n = 0;
  }

  const fracNow = Math.max(0, slope * (elapsedNow - layLag));
  const predictedStage = fractionToStage(fracNow);

  // ETA to target stage
  const target = vial.target_stage || 'L3';
  const targetFrac = STAGE_FRACTION[target] != null ? STAGE_FRACTION[target] : STAGE_FRACTION.L3;
  let etaDays = null;
  if (slope > 0) {
    const elapsedAtTarget = targetFrac / slope + layLag;
    etaDays = elapsedAtTarget - elapsedNow;
  }

  // "Clear parents by" for crosses: ~2 days before predicted new_adults (first eclosion).
  let clearParentsInDays = null;
  if (vial.type === 'cross' && slope > 0) {
    const elapsedAtAdults = STAGE_FRACTION.new_adults / slope + layLag;
    clearParentsInDays = (elapsedAtAdults - 2) - elapsedNow;
  }

  // Factor vs 25C standard (for "running 1.4x slower" messaging)
  const standardSlope = devRateFactor(25) / BASE_DAYS_25;
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

module.exports = { STAGE_FRACTION, STAGE_ORDER, BASE_DAYS_25, devRateFactor, predict, fitRate, daysBetween };
