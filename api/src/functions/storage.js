const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// GET /api/storage/units
app.http('storageUnitsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'storage/units',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const table = await getTable('storageunits');
      const units = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        units.push({
          id: entity.rowKey,
          name: entity.name,
          temperature: entity.temperature || null,
          type: entity.unitType || 'other',
          created_at: entity.createdAt
        });
      }
      units.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return jsonResponse(200, units);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/storage/units
app.http('storageUnitsCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'storage/units',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      if (!body.name) return jsonResponse(400, { error: 'Name is required' });

      const table = await getTable('storageunits');
      const id = uuidv4();
      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        name: body.name,
        temperature: body.temperature || '',
        unitType: body.type || 'other',
        createdAt: new Date().toISOString()
      };

      await table.createEntity(entity);

      return jsonResponse(201, {
        id, name: entity.name, temperature: entity.temperature,
        type: entity.unitType, created_at: entity.createdAt
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/storage/units/{id}
app.http('storageUnitsUpdate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'storage/units/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const body = await req.json();
      const table = await getTable('storageunits');

      let entity;
      try {
        entity = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Storage unit not found' });
      }

      if (body.name !== undefined) entity.name = body.name;
      if (body.temperature !== undefined) entity.temperature = body.temperature;
      if (body.type !== undefined) entity.unitType = body.type;

      await table.updateEntity(entity, 'Merge');

      return jsonResponse(200, {
        id: entity.rowKey, name: entity.name,
        temperature: entity.temperature, type: entity.unitType
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/storage/units/{id}
app.http('storageUnitsDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'storage/units/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('storageunits');

      // Verify ownership
      try {
        await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Storage unit not found' });
      }

      // Delete associated locations
      const locsTable = await getTable('storagelocations');
      const locs = locsTable.listEntities({ queryOptions: { filter: `storageUnitId eq '${id}'` } });
      for await (const loc of locs) {
        await locsTable.deleteEntity(loc.partitionKey, loc.rowKey);
      }

      await table.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/storage/locations
app.http('storageLocationsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'storage/locations',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const unitId = req.query.get('unit_id');

      // Get user's units first
      const unitsTable = await getTable('storageunits');
      const unitsMap = {};
      const unitEntities = unitsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const u of unitEntities) {
        unitsMap[u.rowKey] = { name: u.name, temperature: u.temperature };
      }

      // Get locations
      const locsTable = await getTable('storagelocations');
      const locations = [];
      let filter = `PartitionKey eq '${decoded.id}'`;
      if (unitId) filter += ` and storageUnitId eq '${unitId}'`;

      const locEntities = locsTable.listEntities({ queryOptions: { filter } });
      for await (const loc of locEntities) {
        const unit = unitsMap[loc.storageUnitId] || {};
        locations.push({
          id: loc.rowKey,
          storage_unit_id: loc.storageUnitId,
          rack: loc.rack || null,
          box: loc.box || null,
          position: loc.position || null,
          unit_name: unit.name || '',
          unit_temperature: unit.temperature || ''
        });
      }

      return jsonResponse(200, locations);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/storage/locations
app.http('storageLocationsCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'storage/locations',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      if (!body.storage_unit_id) return jsonResponse(400, { error: 'storage_unit_id is required' });

      // Verify unit ownership
      const unitsTable = await getTable('storageunits');
      let unit;
      try {
        unit = await unitsTable.getEntity(decoded.id, body.storage_unit_id);
      } catch (e) {
        return jsonResponse(404, { error: 'Storage unit not found' });
      }

      const locsTable = await getTable('storagelocations');
      const id = uuidv4();
      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        storageUnitId: body.storage_unit_id,
        rack: body.rack || '',
        box: body.box || '',
        position: body.position || '',
        createdAt: new Date().toISOString()
      };

      await locsTable.createEntity(entity);

      return jsonResponse(201, {
        id, storage_unit_id: entity.storageUnitId,
        rack: entity.rack || null, box: entity.box || null,
        position: entity.position || null,
        unit_name: unit.name, unit_temperature: unit.temperature
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/storage/locations/{id}
app.http('storageLocationsDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'storage/locations/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const locsTable = await getTable('storagelocations');

      try {
        await locsTable.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Location not found' });
      }

      await locsTable.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
