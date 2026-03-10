const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// Helper: get units map
async function getUnitsMap(userId) {
  const unitsTable = await getTable('storageunits');
  const map = {};
  const entities = unitsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
  for await (const u of entities) {
    map[u.rowKey] = { name: u.name, temperature: u.temperature, type: u.unitType };
  }
  return map;
}

// Helper: get locations map
async function getLocationsMap(userId) {
  const locsTable = await getTable('storagelocations');
  const map = {};
  const entities = locsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
  for await (const l of entities) {
    map[l.rowKey] = { storageUnitId: l.storageUnitId, rack: l.rack, box: l.box, position: l.position };
  }
  return map;
}

// Helper: enrich sample with location info
function enrichSample(s, locsMap, unitsMap) {
  const loc = locsMap[s.storageLocationId] || {};
  const unit = unitsMap[loc.storageUnitId] || {};
  return {
    id: s.rowKey,
    user_id: s.partitionKey,
    name: s.name,
    date_collected: s.dateCollected || null,
    experiment: s.experiment || null,
    experiment_id: s.experimentId || null,
    organism_strain: s.organismStrain || null,
    storage_location_id: s.storageLocationId || null,
    quantity: s.quantity ?? null,
    quantity_unit: s.quantityUnit || null,
    notes: s.notes || null,
    status: s.status || 'stored',
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    rack: loc.rack || null,
    box: loc.box || null,
    position: loc.position || null,
    unit_name: unit.name || null,
    unit_temperature: unit.temperature || null
  };
}

// GET /api/samples
app.http('samplesGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'samples',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const search = req.query.get('search');
      const unitId = req.query.get('unit_id');
      const status = req.query.get('status');

      const table = await getTable('samples');
      const locsMap = await getLocationsMap(decoded.id);
      const unitsMap = await getUnitsMap(decoded.id);

      let samples = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        samples.push(enrichSample(entity, locsMap, unitsMap));
      }

      // Apply filters
      if (search) {
        const s = search.toLowerCase();
        samples = samples.filter(r =>
          (r.name || '').toLowerCase().includes(s) ||
          (r.experiment || '').toLowerCase().includes(s) ||
          (r.organism_strain || '').toLowerCase().includes(s) ||
          (r.notes || '').toLowerCase().includes(s)
        );
      }

      if (unitId) {
        const unitLocIds = new Set(
          Object.entries(locsMap)
            .filter(([_, l]) => l.storageUnitId === unitId)
            .map(([id]) => id)
        );
        samples = samples.filter(r => unitLocIds.has(r.storage_location_id));
      }

      if (status) {
        samples = samples.filter(r => r.status === status);
      }

      samples.sort((a, b) => (b.date_collected || '').localeCompare(a.date_collected || '') || (a.name || '').localeCompare(b.name || ''));
      return jsonResponse(200, samples);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/samples
app.http('samplesCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'samples',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      if (!body.name) return jsonResponse(400, { error: 'Name is required' });

      // Verify storage location if provided
      if (body.storage_location_id) {
        const locsTable = await getTable('storagelocations');
        try {
          await locsTable.getEntity(decoded.id, body.storage_location_id);
        } catch (e) {
          return jsonResponse(400, { error: 'Invalid storage location' });
        }
      }

      const table = await getTable('samples');
      const id = uuidv4();
      const now = new Date().toISOString();

      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        name: body.name,
        dateCollected: body.date_collected || '',
        experiment: body.experiment || '',
        organismStrain: body.organism_strain || '',
        storageLocationId: body.storage_location_id || '',
        quantity: body.quantity ?? null,
        quantityUnit: body.quantity_unit || '',
        notes: body.notes || '',
        status: body.status || 'stored',
        createdAt: now,
        updatedAt: now
      };
      if (body.experiment_id) entity.experimentId = body.experiment_id;

      await table.createEntity(entity);

      const locsMap = await getLocationsMap(decoded.id);
      const unitsMap = await getUnitsMap(decoded.id);

      return jsonResponse(201, enrichSample(entity, locsMap, unitsMap));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/samples/{id}
app.http('samplesUpdate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'samples/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const body = await req.json();
      const table = await getTable('samples');

      let entity;
      try {
        entity = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Sample not found' });
      }

      const fieldMap = {
        name: 'name',
        date_collected: 'dateCollected',
        experiment: 'experiment',
        experiment_id: 'experimentId',
        organism_strain: 'organismStrain',
        storage_location_id: 'storageLocationId',
        quantity: 'quantity',
        quantity_unit: 'quantityUnit',
        notes: 'notes',
        status: 'status'
      };

      let updated = false;
      for (const [apiField, entityField] of Object.entries(fieldMap)) {
        if (body[apiField] !== undefined) {
          entity[entityField] = body[apiField];
          updated = true;
        }
      }

      if (!updated) return jsonResponse(400, { error: 'No fields to update' });

      entity.updatedAt = new Date().toISOString();
      await table.updateEntity(entity, 'Merge');

      const locsMap = await getLocationsMap(decoded.id);
      const unitsMap = await getUnitsMap(decoded.id);

      return jsonResponse(200, enrichSample(entity, locsMap, unitsMap));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/samples/{id}
app.http('samplesDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'samples/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('samples');

      try {
        await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Sample not found' });
      }

      await table.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/samples/{id}/references — returns notebook entries mentioning this sample + linked experiment info
app.http('sampleReferences', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'samples/{id}/references',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const sampleId = req.params.id;

      // Verify sample exists and belongs to user
      const samplesTable = await getTable('samples');
      let sample;
      try {
        sample = await samplesTable.getEntity(decoded.id, sampleId);
      } catch (e) {
        return jsonResponse(404, { error: 'Sample not found' });
      }

      // Get linked experiment info if experiment_id exists
      let experiment = null;
      if (sample.experimentId) {
        try {
          const expTable = await getTable('experiments');
          const exp = await expTable.getEntity(decoded.id, sample.experimentId);
          experiment = {
            id: exp.rowKey,
            title: exp.title || '',
            status: exp.status || 'active'
          };
        } catch (e) { /* experiment may have been deleted */ }
      }

      // Find notebook entries that mention this sample in their linked_items
      const entriesTable = await getTable('notebookentries');
      const mentioningEntries = [];
      const entities = entriesTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        const linkedItems = entity.linkedItems ? JSON.parse(entity.linkedItems) : [];
        const mentions = linkedItems.some(li => li.id === sampleId && li.type === 'sample');
        if (mentions) {
          mentioningEntries.push({
            id: entity.rowKey,
            experiment_id: entity.experimentId || null,
            title: entity.title || '',
            entry_date: entity.entryDate || '',
            entry_type: entity.entryType || 'note',
            created_at: entity.createdAt
          });
        }
      }

      mentioningEntries.sort((a, b) => (b.entry_date || '').localeCompare(a.entry_date || ''));

      return jsonResponse(200, {
        experiment,
        notebook_entries: mentioningEntries
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
