const { app } = require('@azure/functions');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');
const { isDeleted, isExpired, restore, daysRemaining } = require('../shared/softDelete');

// Entity types that support soft-delete / Trash.
const TRASH_TABLES = {
  reagent: { table: 'reagents', label: 'Reagent', nameField: 'name' },
  sample: { table: 'samples', label: 'Sample', nameField: 'name' },
  entry: { table: 'notebookentries', label: 'Notebook Entry', nameField: 'title' },
};

// Purge any expired (>7 day) soft-deleted rows for this user across all trash tables.
async function purgeExpired(userId) {
  const now = Date.now();
  let purged = 0;
  for (const cfg of Object.values(TRASH_TABLES)) {
    const table = await getTable(cfg.table);
    const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } });
    for await (const e of entities) {
      if (isExpired(e, now)) {
        try { await table.deleteEntity(e.partitionKey, e.rowKey); purged++; } catch (err) { /* ignore */ }
      }
    }
  }
  return purged;
}

// GET /api/trash — list all soft-deleted items (auto-purges expired first)
app.http('trashGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'trash',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      await purgeExpired(decoded.id);

      const items = [];
      const now = Date.now();
      for (const [type, cfg] of Object.entries(TRASH_TABLES)) {
        const table = await getTable(cfg.table);
        const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
        for await (const e of entities) {
          if (!isDeleted(e)) continue;
          items.push({
            type,
            type_label: cfg.label,
            id: e.rowKey,
            name: e[cfg.nameField] || '(untitled)',
            deleted_at: e.deletedAt || null,
            days_remaining: daysRemaining(e, now),
          });
        }
      }
      items.sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''));
      return jsonResponse(200, items);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/trash/restore — body: { type, id }
app.http('trashRestore', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'trash/restore',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      const cfg = TRASH_TABLES[body.type];
      if (!cfg) return jsonResponse(400, { error: 'Invalid type' });

      const table = await getTable(cfg.table);
      let entity;
      try {
        entity = await table.getEntity(decoded.id, body.id);
      } catch (e) {
        return jsonResponse(404, { error: 'Item not found' });
      }

      await restore(table, entity);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/trash/{type}/{id} — permanently delete one item now
app.http('trashPurgeOne', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'trash/{type}/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const { type, id } = req.params;
      const cfg = TRASH_TABLES[type];
      if (!cfg) return jsonResponse(400, { error: 'Invalid type' });

      const table = await getTable(cfg.table);
      let entity;
      try {
        entity = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Item not found' });
      }
      if (!isDeleted(entity)) {
        return jsonResponse(400, { error: 'Item is not in trash' });
      }

      // Clean up notebook entry history on permanent delete.
      if (type === 'entry') {
        try {
          const historyTable = await getTable('entryhistory');
          const history = historyTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${id}'` } });
          for await (const h of history) {
            await historyTable.deleteEntity(h.partitionKey, h.rowKey);
          }
        } catch (e) { /* ok */ }
      }

      await table.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
