const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// Helper: get units map for a user
async function getUnitsMap(userId) {
  const unitsTable = await getTable('storageunits');
  const map = {};
  const entities = unitsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
  for await (const u of entities) {
    map[u.rowKey] = { name: u.name, temperature: u.temperature, type: u.unitType };
  }
  return map;
}

// Helper: get locations map for a user
async function getLocationsMap(userId) {
  const locsTable = await getTable('storagelocations');
  const map = {};
  const entities = locsTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
  for await (const l of entities) {
    map[l.rowKey] = { storageUnitId: l.storageUnitId, rack: l.rack, box: l.box, position: l.position };
  }
  return map;
}

// Helper: enrich reagent with location info
function enrichReagent(r, locsMap, unitsMap) {
  const loc = locsMap[r.storageLocationId] || {};
  const unit = unitsMap[loc.storageUnitId] || {};
  return {
    id: r.rowKey,
    user_id: r.partitionKey,
    name: r.name,
    catalog_number: r.catalogNumber || null,
    lot_number: r.lotNumber || null,
    vendor: r.vendor || null,
    source_url: r.sourceUrl || null,
    storage_location_id: r.storageLocationId || null,
    special_conditions: r.specialConditions || null,
    quantity: r.quantity ?? null,
    quantity_unit: r.quantityUnit || null,
    expiration_date: r.expirationDate || null,
    alert_days_before: r.alertDaysBefore ?? null,
    is_low_stock: r.isLowStock ? 1 : 0,
    is_ordered: r.isOrdered ? 1 : 0,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    rack: loc.rack || null,
    box: loc.box || null,
    position: loc.position || null,
    unit_name: unit.name || null,
    unit_temperature: unit.temperature || null,
    unit_type: unit.type || null
  };
}

// GET /api/reagents
app.http('reagentsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reagents',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const search = req.query.get('search');
      const unitId = req.query.get('unit_id');
      const lowStock = req.query.get('low_stock');

      const table = await getTable('reagents');
      const locsMap = await getLocationsMap(decoded.id);
      const unitsMap = await getUnitsMap(decoded.id);

      let reagents = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        reagents.push(enrichReagent(entity, locsMap, unitsMap));
      }

      // Apply filters
      if (search) {
        const s = search.toLowerCase();
        reagents = reagents.filter(r =>
          (r.name || '').toLowerCase().includes(s) ||
          (r.catalog_number || '').toLowerCase().includes(s) ||
          (r.vendor || '').toLowerCase().includes(s)
        );
      }

      if (unitId) {
        const unitLocIds = new Set(
          Object.entries(locsMap)
            .filter(([_, l]) => l.storageUnitId === unitId)
            .map(([id]) => id)
        );
        reagents = reagents.filter(r => unitLocIds.has(r.storage_location_id));
      }

      if (lowStock === 'true') {
        reagents = reagents.filter(r => r.is_low_stock);
      }

      reagents.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return jsonResponse(200, reagents);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/reagents/notifications
app.http('reagentsNotifications', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reagents/notifications',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      // Get user's default alert days
      const usersTable = await getTable('users');
      let defaultDays = 30;
      try {
        const user = await usersTable.getEntity('user', decoded.id);
        defaultDays = user.defaultAlertDays || 30;
      } catch (e) { /* use default */ }

      const table = await getTable('reagents');
      const locsMap = await getLocationsMap(decoded.id);
      const unitsMap = await getUnitsMap(decoded.id);

      const now = new Date();
      const lowStock = [];
      const expiring = [];
      const expired = [];

      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        const r = enrichReagent(entity, locsMap, unitsMap);

        if (r.is_low_stock) {
          lowStock.push(r);
        }

        if (r.expiration_date) {
          const expDate = new Date(r.expiration_date);
          const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
          const alertDays = r.alert_days_before || defaultDays;

          if (daysLeft < 0) {
            expired.push(r);
          } else if (daysLeft <= alertDays) {
            r.effective_alert_days = alertDays;
            expiring.push(r);
          }
        }
      }

      // Sort
      lowStock.sort((a, b) => (a.is_ordered ? 1 : 0) - (b.is_ordered ? 1 : 0) || a.name.localeCompare(b.name));
      expiring.sort((a, b) => (a.expiration_date || '').localeCompare(b.expiration_date || ''));
      expired.sort((a, b) => (a.expiration_date || '').localeCompare(b.expiration_date || ''));

      return jsonResponse(200, { lowStock, expiring, expired });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/reagents/export
app.http('reagentsExport', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reagents/export',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const idsParam = req.query.get('ids');
      const ids = idsParam ? idsParam.split(',').filter(Boolean) : [];

      const table = await getTable('reagents');
      let reagents = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        reagents.push({
          id: entity.rowKey,
          name: entity.name,
          catalog_number: entity.catalogNumber || null,
          lot_number: entity.lotNumber || null,
          vendor: entity.vendor || null,
          source_url: entity.sourceUrl || null
        });
      }

      if (ids.length > 0) {
        const idSet = new Set(ids);
        reagents = reagents.filter(r => idSet.has(r.id));
      }

      reagents.sort((a, b) => (a.vendor || '').localeCompare(b.vendor || '') || a.name.localeCompare(b.name));

      const lines = reagents.map(r => {
        let line = r.name;
        if (r.catalog_number) line += ` (Cat# ${r.catalog_number}`;
        if (r.lot_number) line += `, Lot# ${r.lot_number}`;
        if (r.catalog_number) line += ')';
        if (r.vendor) line += `, ${r.vendor}`;
        return line;
      });

      return jsonResponse(200, { reagents, formatted: lines.join('\n'), count: reagents.length });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/reagents
app.http('reagentsCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reagents',
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

      const table = await getTable('reagents');
      const id = uuidv4();
      const now = new Date().toISOString();

      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        name: body.name,
        catalogNumber: body.catalog_number || '',
        lotNumber: body.lot_number || '',
        vendor: body.vendor || '',
        sourceUrl: body.source_url || '',
        storageLocationId: body.storage_location_id || '',
        specialConditions: body.special_conditions || '',
        quantity: body.quantity ?? null,
        quantityUnit: body.quantity_unit || '',
        expirationDate: body.expiration_date || '',
        alertDaysBefore: body.alert_days_before ?? null,
        isLowStock: false,
        isOrdered: false,
        createdAt: now,
        updatedAt: now
      };

      await table.createEntity(entity);

      const locsMap = await getLocationsMap(decoded.id);
      const unitsMap = await getUnitsMap(decoded.id);

      return jsonResponse(201, enrichReagent(entity, locsMap, unitsMap));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/reagents/{id}
app.http('reagentsUpdate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'reagents/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const body = await req.json();
      const table = await getTable('reagents');

      let entity;
      try {
        entity = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Reagent not found' });
      }

      const fieldMap = {
        name: 'name',
        catalog_number: 'catalogNumber',
        lot_number: 'lotNumber',
        vendor: 'vendor',
        source_url: 'sourceUrl',
        storage_location_id: 'storageLocationId',
        special_conditions: 'specialConditions',
        quantity: 'quantity',
        quantity_unit: 'quantityUnit',
        expiration_date: 'expirationDate',
        alert_days_before: 'alertDaysBefore',
        is_low_stock: 'isLowStock',
        is_ordered: 'isOrdered'
      };

      let updated = false;
      for (const [apiField, entityField] of Object.entries(fieldMap)) {
        if (body[apiField] !== undefined) {
          if (apiField === 'is_low_stock' || apiField === 'is_ordered') {
            entity[entityField] = !!body[apiField];
          } else {
            entity[entityField] = body[apiField];
          }
          updated = true;
        }
      }

      if (!updated) return jsonResponse(400, { error: 'No fields to update' });

      entity.updatedAt = new Date().toISOString();
      await table.updateEntity(entity, 'Merge');

      const locsMap = await getLocationsMap(decoded.id);
      const unitsMap = await getUnitsMap(decoded.id);

      return jsonResponse(200, enrichReagent(entity, locsMap, unitsMap));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/reagents/{id}
app.http('reagentsDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'reagents/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('reagents');

      try {
        await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Reagent not found' });
      }

      await table.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
