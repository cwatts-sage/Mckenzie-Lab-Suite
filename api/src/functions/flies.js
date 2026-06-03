const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');
const { predict } = require('../shared/flyDev');

// ==================== FLY BOXES ====================

function formatBox(e) {
  return {
    id: e.rowKey,
    name: e.name || '',
    temperature: e.temperature != null ? Number(e.temperature) : 22,
    notes: e.notes || '',
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

async function getBoxesMap(userId) {
  const table = await getTable('flyboxes');
  const map = {};
  const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
  for await (const e of entities) map[e.rowKey] = formatBox(e);
  return map;
}

// GET /api/fly/boxes
app.http('flyBoxesGet', {
  methods: ['GET'], authLevel: 'anonymous', route: 'fly/boxes',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const table = await getTable('flyboxes');
      const items = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const e of entities) items.push(formatBox(e));
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return jsonResponse(200, items);
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// POST /api/fly/boxes
app.http('flyBoxesCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'fly/boxes',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const body = await req.json();
      if (!body.name) return jsonResponse(400, { error: 'Name is required' });
      const table = await getTable('flyboxes');
      const now = new Date().toISOString();
      const entity = {
        partitionKey: decoded.id, rowKey: uuidv4(),
        name: body.name,
        temperature: body.temperature != null ? Number(body.temperature) : 22,
        notes: body.notes || '',
        createdAt: now, updatedAt: now,
      };
      await table.createEntity(entity);
      return jsonResponse(201, formatBox(entity));
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// PUT /api/fly/boxes/{id}
app.http('flyBoxesUpdate', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'fly/boxes/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const body = await req.json();
      const table = await getTable('flyboxes');
      let e;
      try { e = await table.getEntity(decoded.id, req.params.id); }
      catch (err) { return jsonResponse(404, { error: 'Box not found' }); }
      if (body.name !== undefined) e.name = body.name;
      if (body.temperature !== undefined) e.temperature = Number(body.temperature);
      if (body.notes !== undefined) e.notes = body.notes || '';
      e.updatedAt = new Date().toISOString();
      await table.updateEntity(e, 'Merge');
      return jsonResponse(200, formatBox(e));
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// DELETE /api/fly/boxes/{id}
app.http('flyBoxesDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'fly/boxes/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const table = await getTable('flyboxes');
      try { await table.getEntity(decoded.id, req.params.id); }
      catch (err) { return jsonResponse(404, { error: 'Box not found' }); }
      await table.deleteEntity(decoded.id, req.params.id);
      return jsonResponse(200, { success: true });
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// ==================== FLY VIALS ====================

function formatVial(e) {
  return {
    id: e.rowKey,
    name: e.name || '',
    type: e.vialType || 'cross', // 'stock' | 'cross'
    genotype: e.genotype || '',
    box_id: e.boxId || null,
    target_stage: e.targetStage || 'L3',
    start_date: e.startDate || null,        // for crosses: day parents set
    flip_interval_days: e.flipIntervalDays != null ? Number(e.flipIntervalDays) : 21,
    last_flip_date: e.lastFlipDate || null,
    next_flip_date: e.nextFlipDate || null,
    status: e.status || 'active',           // active | collected | discarded | archived
    // Staggered-cross lineage:
    lineage_id: e.lineageId || e.rowKey,    // shared across cohorts from same parents
    cohort_number: e.cohortNumber != null ? Number(e.cohortNumber) : 1,
    parent_tube_id: e.parentTubeId || null, // previous cohort the parents came from
    holds_parents: e.holdsParents === false || e.holdsParents === 'false' ? false : true, // current parent-holding tube?
    parents_removed_date: e.parentsRemovedDate || null,
    transfer_interval_days: e.transferIntervalDays != null ? Number(e.transferIntervalDays) : 3,
    notes: e.notes || '',
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

// Apply lineage semantics to a cross prediction:
// - clear-parents only matters for the tube currently holding the parents
// - add transfer_due_in_days nudge for the parent-holding tube
function applyLineageSemantics(v) {
  if (v.type !== 'cross' || !v.prediction) return v;
  if (!v.holds_parents) {
    v.prediction.clear_parents_in_days = null; // parents already gone from this cohort
  } else {
    // Transfer nudge: days since this cohort started vs the transfer interval.
    const interval = v.transfer_interval_days || 3;
    if (v.start_date) {
      const days = Math.floor((Date.now() - new Date(v.start_date + 'T12:00:00').getTime()) / 86400000);
      v.prediction.transfer_due_in_days = Number((interval - days).toFixed(1));
    }
  }
  return v;
}

async function getObservationsForVial(userId, vialId) {
  const table = await getTable('flyobservations');
  const items = [];
  const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${vialId}'` } });
  for await (const e of entities) {
    items.push({ id: e.rowKey, vial_id: e.partitionKey, observed_at: e.observedAt, stage_seen: e.stageSeen, note: e.note || '' });
  }
  items.sort((a, b) => (a.observed_at || '').localeCompare(b.observed_at || ''));
  return items;
}

// GET /api/fly/vials  (includes prediction per vial)
app.http('flyVialsGet', {
  methods: ['GET'], authLevel: 'anonymous', route: 'fly/vials',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const includeArchived = req.query.get('include_archived') === 'true';
      const table = await getTable('flyvials');
      const boxes = await getBoxesMap(decoded.id);
      const obsTable = await getTable('flyobservations');
      // Pre-load all observations grouped by vial for efficiency.
      const obsByVial = {};
      const allObs = obsTable.listEntities();
      for await (const o of allObs) {
        if (!obsByVial[o.partitionKey]) obsByVial[o.partitionKey] = [];
        obsByVial[o.partitionKey].push({ observed_at: o.observedAt, stage_seen: o.stageSeen });
      }
      const items = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const e of entities) {
        const v = formatVial(e);
        if (!includeArchived && (v.status === 'archived' || v.status === 'discarded')) continue;
        const box = v.box_id ? boxes[v.box_id] : null;
        v.box_name = box ? box.name : null;
        v.box_temperature = box ? box.temperature : null;
        if (v.type === 'cross') {
          v.prediction = predict(v, box ? box.temperature : 22, obsByVial[v.id] || []);
          applyLineageSemantics(v);
        } else {
          v.prediction = null;
        }
        items.push(v);
      }
      items.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      return jsonResponse(200, items);
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// GET /api/fly/vials/{id}  (full detail + observations + prediction)
app.http('flyVialGetOne', {
  methods: ['GET'], authLevel: 'anonymous', route: 'fly/vials/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const table = await getTable('flyvials');
      let e;
      try { e = await table.getEntity(decoded.id, req.params.id); }
      catch (err) { return jsonResponse(404, { error: 'Vial not found' }); }
      const v = formatVial(e);
      const boxes = await getBoxesMap(decoded.id);
      const box = v.box_id ? boxes[v.box_id] : null;
      v.box_name = box ? box.name : null;
      v.box_temperature = box ? box.temperature : null;
      v.observations = await getObservationsForVial(decoded.id, v.id);
      v.prediction = v.type === 'cross' ? predict(v, box ? box.temperature : 22, v.observations) : null;
      applyLineageSemantics(v);
      return jsonResponse(200, v);
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

function computeNextFlip(lastFlipOrStart, intervalDays) {
  if (!lastFlipOrStart) return null;
  const d = new Date(lastFlipOrStart);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (intervalDays || 21));
  return d.toISOString().split('T')[0];
}

// POST /api/fly/vials
app.http('flyVialsCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'fly/vials',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const body = await req.json();
      if (!body.name) return jsonResponse(400, { error: 'Name is required' });
      const table = await getTable('flyvials');
      const now = new Date().toISOString();
      const type = body.type === 'stock' ? 'stock' : 'cross';
      const startDate = body.start_date || now.split('T')[0];
      const flipInterval = body.flip_interval_days != null ? Number(body.flip_interval_days) : 21;
      const id = uuidv4();
      const entity = {
        partitionKey: decoded.id, rowKey: id,
        name: body.name,
        vialType: type,
        genotype: body.genotype || '',
        boxId: body.box_id || '',
        targetStage: body.target_stage || 'L3',
        startDate,
        flipIntervalDays: flipInterval,
        lastFlipDate: type === 'stock' ? (body.last_flip_date || startDate) : '',
        nextFlipDate: type === 'stock' ? computeNextFlip(body.last_flip_date || startDate, flipInterval) : '',
        status: 'active',
        // New cross starts its own lineage as cohort 1, holding the parents.
        lineageId: id,
        cohortNumber: 1,
        holdsParents: type === 'cross',
        transferIntervalDays: body.transfer_interval_days != null ? Number(body.transfer_interval_days) : 3,
        notes: body.notes || '',
        createdAt: now, updatedAt: now,
      };
      await table.createEntity(entity);
      return jsonResponse(201, formatVial(entity));
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// PUT /api/fly/vials/{id}
app.http('flyVialsUpdate', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'fly/vials/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const body = await req.json();
      const table = await getTable('flyvials');
      let e;
      try { e = await table.getEntity(decoded.id, req.params.id); }
      catch (err) { return jsonResponse(404, { error: 'Vial not found' }); }
      const map = {
        name: 'name', genotype: 'genotype', box_id: 'boxId', target_stage: 'targetStage',
        start_date: 'startDate', status: 'status', notes: 'notes',
      };
      for (const [k, ek] of Object.entries(map)) if (body[k] !== undefined) e[ek] = body[k];
      if (body.type !== undefined) e.vialType = body.type === 'stock' ? 'stock' : 'cross';
      if (body.flip_interval_days !== undefined) e.flipIntervalDays = Number(body.flip_interval_days);
      // Recompute next flip if interval/last flip changed for stocks.
      if (e.vialType === 'stock' && (body.flip_interval_days !== undefined || body.last_flip_date !== undefined)) {
        if (body.last_flip_date !== undefined) e.lastFlipDate = body.last_flip_date;
        e.nextFlipDate = computeNextFlip(e.lastFlipDate || e.startDate, Number(e.flipIntervalDays) || 21);
      }
      e.updatedAt = new Date().toISOString();
      await table.updateEntity(e, 'Merge');
      return jsonResponse(200, formatVial(e));
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// POST /api/fly/vials/{id}/flip  (stock flip: set last/next flip dates)
app.http('flyVialFlip', {
  methods: ['POST'], authLevel: 'anonymous', route: 'fly/vials/{id}/flip',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const body = await req.json().catch(() => ({}));
      const table = await getTable('flyvials');
      let e;
      try { e = await table.getEntity(decoded.id, req.params.id); }
      catch (err) { return jsonResponse(404, { error: 'Vial not found' }); }
      const flipDate = body.flip_date || new Date().toISOString().split('T')[0];
      e.lastFlipDate = flipDate;
      e.nextFlipDate = computeNextFlip(flipDate, Number(e.flipIntervalDays) || 21);
      e.updatedAt = new Date().toISOString();
      await table.updateEntity(e, 'Merge');
      return jsonResponse(200, formatVial(e));
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// POST /api/fly/vials/{id}/transfer  (cross: move parents to a fresh cohort tube)
// Creates a new cohort in the same lineage, dated today; old tube's parents marked removed.
app.http('flyVialTransfer', {
  methods: ['POST'], authLevel: 'anonymous', route: 'fly/vials/{id}/transfer',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const body = await req.json().catch(() => ({}));
      const table = await getTable('flyvials');
      let src;
      try { src = await table.getEntity(decoded.id, req.params.id); }
      catch (err) { return jsonResponse(404, { error: 'Vial not found' }); }
      if ((src.vialType || 'cross') !== 'cross') return jsonResponse(400, { error: 'Only crosses can transfer parents' });

      const now = new Date().toISOString();
      const transferDate = body.transfer_date || now.split('T')[0];
      const lineageId = src.lineageId || src.rowKey;

      // Determine next cohort number across the lineage.
      let maxCohort = 0;
      const all = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const v of all) {
        if ((v.lineageId || v.rowKey) === lineageId) maxCohort = Math.max(maxCohort, v.cohortNumber || 1);
      }
      const nextCohort = maxCohort + 1;

      // Base name: strip any existing " — set N" suffix from source name.
      const baseName = (src.name || 'Cross').replace(/\s*[\u2014-]\s*set\s*\d+\s*$/i, '').trim();
      const transferInterval = src.transferIntervalDays != null ? Number(src.transferIntervalDays) : 3;

      // Create the new cohort tube (now holds the parents).
      const newId = uuidv4();
      const child = {
        partitionKey: decoded.id, rowKey: newId,
        name: `${baseName} — set ${nextCohort}`,
        vialType: 'cross',
        genotype: src.genotype || '',
        boxId: body.box_id || src.boxId || '',
        targetStage: src.targetStage || 'L3',
        startDate: transferDate,
        status: 'active',
        lineageId,
        cohortNumber: nextCohort,
        parentTubeId: src.rowKey,
        holdsParents: true,
        transferIntervalDays: transferInterval,
        notes: '',
        createdAt: now, updatedAt: now,
      };
      await table.createEntity(child);

      // Source tube: parents have left.
      src.holdsParents = false;
      src.parentsRemovedDate = transferDate;
      src.updatedAt = now;
      await table.updateEntity(src, 'Merge');

      return jsonResponse(201, formatVial(child));
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// DELETE /api/fly/vials/{id}
app.http('flyVialsDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'fly/vials/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const table = await getTable('flyvials');
      try { await table.getEntity(decoded.id, req.params.id); }
      catch (err) { return jsonResponse(404, { error: 'Vial not found' }); }
      // Remove observations too.
      try {
        const obsTable = await getTable('flyobservations');
        const obs = obsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${req.params.id}'` } });
        for await (const o of obs) await obsTable.deleteEntity(o.partitionKey, o.rowKey);
      } catch (err) { /* ok */ }
      await table.deleteEntity(decoded.id, req.params.id);
      return jsonResponse(200, { success: true });
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// ==================== FLY OBSERVATIONS ====================

// POST /api/fly/vials/{id}/observations  { stage_seen, observed_at?, note? }
app.http('flyObsCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'fly/vials/{id}/observations',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const body = await req.json();
      const valid = ['new_tube', 'L3', 'wandering_L3', 'pupa', 'new_adults'];
      if (!valid.includes(body.stage_seen)) return jsonResponse(400, { error: 'Invalid stage' });
      // Ensure vial belongs to user.
      const vialsTable = await getTable('flyvials');
      try { await vialsTable.getEntity(decoded.id, req.params.id); }
      catch (err) { return jsonResponse(404, { error: 'Vial not found' }); }
      const table = await getTable('flyobservations');
      const now = new Date().toISOString();
      const entity = {
        partitionKey: req.params.id, rowKey: uuidv4(),
        ownerId: decoded.id,
        observedAt: body.observed_at || now,
        stageSeen: body.stage_seen,
        note: body.note || '',
        createdAt: now,
      };
      await table.createEntity(entity);
      // bump vial updatedAt so it sorts fresh
      try {
        const v = await vialsTable.getEntity(decoded.id, req.params.id);
        v.updatedAt = now;
        await vialsTable.updateEntity(v, 'Merge');
      } catch (err) { /* ok */ }
      return jsonResponse(201, { id: entity.rowKey, vial_id: req.params.id, observed_at: entity.observedAt, stage_seen: entity.stageSeen, note: entity.note });
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});

// DELETE /api/fly/vials/{vialId}/observations/{obsId}
app.http('flyObsDelete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'fly/vials/{vialId}/observations/{obsId}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });
    try {
      const table = await getTable('flyobservations');
      let o;
      try { o = await table.getEntity(req.params.vialId, req.params.obsId); }
      catch (err) { return jsonResponse(404, { error: 'Observation not found' }); }
      if (o.ownerId && o.ownerId !== decoded.id) return jsonResponse(403, { error: 'Forbidden' });
      await table.deleteEntity(req.params.vialId, req.params.obsId);
      return jsonResponse(200, { success: true });
    } catch (e) { return jsonResponse(500, { error: e.message }); }
  }
});
