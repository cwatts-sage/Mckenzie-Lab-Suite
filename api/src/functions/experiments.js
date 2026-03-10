const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// Helper: format experiment entity to API response
function formatExperiment(entity) {
  const result = {
    id: entity.rowKey,
    title: entity.title || '',
    description: entity.description || '',
    purpose: entity.purpose || '',
    hypothesis: entity.hypothesis || '',
    strains: entity.strains ? JSON.parse(entity.strains) : [],
    controls: entity.controls ? JSON.parse(entity.controls) : [],
    scratch_pad: entity.scratchPad || '',
    status: entity.status || 'active',
    tags: entity.tags || '',
    created_at: entity.createdAt,
    updated_at: entity.updatedAt
  };
  return result;
}

// GET /api/experiments
app.http('experimentsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'experiments',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const table = await getTable('experiments');
      const items = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        items.push(formatExperiment(entity));
      }
      items.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      return jsonResponse(200, items);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/experiments/{id}
app.http('experimentsGetOne', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'experiments/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('experiments');

      let entity;
      try {
        entity = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Experiment not found' });
      }

      return jsonResponse(200, formatExperiment(entity));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/experiments
app.http('experimentsCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'experiments',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      if (!body.title) return jsonResponse(400, { error: 'Title is required' });

      const table = await getTable('experiments');
      const id = uuidv4();
      const now = new Date().toISOString();

      // Build entity, omitting empty optional fields (Azure Table Storage rejects empty values)
      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        title: body.title,
        status: body.status || 'active',
        createdAt: now,
        updatedAt: now
      };
      if (body.description) entity.description = body.description;
      if (body.tags) entity.tags = body.tags;
      if (body.purpose) entity.purpose = body.purpose;
      if (body.hypothesis) entity.hypothesis = body.hypothesis;
      if (body.strains && body.strains.length > 0) entity.strains = JSON.stringify(body.strains);
      if (body.controls && body.controls.length > 0) entity.controls = JSON.stringify(body.controls);
      if (body.scratch_pad) entity.scratchPad = body.scratch_pad;

      await table.createEntity(entity);

      return jsonResponse(201, formatExperiment(entity));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/experiments/{id}
app.http('experimentsUpdate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'experiments/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const body = await req.json();
      const table = await getTable('experiments');

      let existing;
      try {
        existing = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Experiment not found' });
      }

      const now = new Date().toISOString();
      const updated = {
        partitionKey: decoded.id,
        rowKey: id,
        title: (body.title !== undefined ? body.title : existing.title) || '',
        status: (body.status !== undefined ? body.status : existing.status) || 'active',
        createdAt: existing.createdAt || now,
        updatedAt: now
      };

      // Handle optional string fields - omit if empty
      const desc = body.description !== undefined ? body.description : (existing.description || '');
      const tgs = body.tags !== undefined ? body.tags : (existing.tags || '');
      const purpose = body.purpose !== undefined ? body.purpose : (existing.purpose || '');
      const hypothesis = body.hypothesis !== undefined ? body.hypothesis : (existing.hypothesis || '');
      const scratchPad = body.scratch_pad !== undefined ? body.scratch_pad : (existing.scratchPad || '');

      if (desc) updated.description = desc;
      if (tgs) updated.tags = tgs;
      if (purpose) updated.purpose = purpose;
      if (hypothesis) updated.hypothesis = hypothesis;
      if (scratchPad) updated.scratchPad = scratchPad;

      // Handle JSON array fields
      if (body.strains !== undefined) {
        if (body.strains && body.strains.length > 0) updated.strains = JSON.stringify(body.strains);
      } else if (existing.strains) {
        updated.strains = existing.strains;
      }

      if (body.controls !== undefined) {
        if (body.controls && body.controls.length > 0) updated.controls = JSON.stringify(body.controls);
      } else if (existing.controls) {
        updated.controls = existing.controls;
      }

      await table.updateEntity(updated, 'Replace');

      return jsonResponse(200, formatExperiment(updated));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/experiments/{id}
app.http('experimentsDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'experiments/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('experiments');

      try {
        await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Experiment not found' });
      }

      // Also delete all notebook entries for this experiment
      try {
        const entriesTable = await getTable('notebookentries');
        const entries = entriesTable.listEntities({
          queryOptions: { filter: `PartitionKey eq '${decoded.id}'` }
        });
        for await (const entry of entries) {
          if (entry.experimentId === id) {
            // Delete entry history too
            try {
              const historyTable = await getTable('entryhistory');
              const history = historyTable.listEntities({
                queryOptions: { filter: `PartitionKey eq '${entry.rowKey}'` }
              });
              for await (const h of history) {
                await historyTable.deleteEntity(h.partitionKey, h.rowKey);
              }
            } catch (e) { /* history table may not exist yet */ }
            await entriesTable.deleteEntity(entry.partitionKey, entry.rowKey);
          }
        }
      } catch (e) { /* entries table may not exist yet */ }

      await table.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
