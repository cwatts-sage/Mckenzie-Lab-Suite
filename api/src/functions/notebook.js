const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// GET /api/notebook — list entries with filters
app.http('notebookGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'notebook',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const experimentId = req.query.get('experiment_id');
      const dateFrom = req.query.get('date_from');
      const dateTo = req.query.get('date_to');
      const entryType = req.query.get('type');
      const search = req.query.get('search');

      const table = await getTable('notebookentries');
      let items = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        const item = {
          id: entity.rowKey,
          experiment_id: entity.experimentId || null,
          title: entity.title || '',
          content: entity.content || '',
          entry_date: entity.entryDate || '',
          entry_type: entity.entryType || 'note',
          linked_items: entity.linkedItems ? JSON.parse(entity.linkedItems) : [],
          media: entity.media ? JSON.parse(entity.media) : [],
          created_at: entity.createdAt,
          updated_at: entity.updatedAt
        };
        items.push(item);
      }

      // Apply filters
      if (experimentId) {
        items = items.filter(i => i.experiment_id === experimentId);
      }
      if (dateFrom) {
        items = items.filter(i => i.entry_date >= dateFrom);
      }
      if (dateTo) {
        items = items.filter(i => i.entry_date <= dateTo);
      }
      if (entryType) {
        items = items.filter(i => i.entry_type === entryType);
      }
      if (search) {
        const s = search.toLowerCase();
        items = items.filter(i =>
          (i.title || '').toLowerCase().includes(s) ||
          (i.content || '').toLowerCase().includes(s)
        );
      }

      // Sort by entry_date desc, then created_at desc
      items.sort((a, b) => (b.entry_date || '').localeCompare(a.entry_date || '') || (b.created_at || '').localeCompare(a.created_at || ''));

      return jsonResponse(200, items);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/notebook
app.http('notebookCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'notebook',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      if (!body.title) return jsonResponse(400, { error: 'Title is required' });

      const table = await getTable('notebookentries');
      const id = uuidv4();
      const now = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];

      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        title: body.title,
        entryDate: body.entry_date || today,
        entryType: body.entry_type || 'note',
        linkedItems: JSON.stringify(body.linked_items || []),
        media: JSON.stringify(body.media || []),
        createdAt: now,
        updatedAt: now
      };
      if (body.experiment_id) entity.experimentId = body.experiment_id;
      if (body.content) entity.content = body.content;

      await table.createEntity(entity);

      return jsonResponse(201, {
        id, experiment_id: entity.experimentId || null,
        title: entity.title, content: entity.content,
        entry_date: entity.entryDate, entry_type: entity.entryType,
        linked_items: body.linked_items || [], media: body.media || [],
        created_at: now, updated_at: now
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/notebook/{id}
app.http('notebookUpdate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'notebook/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const body = await req.json();
      const table = await getTable('notebookentries');

      let existing;
      try {
        existing = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Entry not found' });
      }

      // Save history snapshot before updating
      try {
        const historyTable = await getTable('entryhistory');
        await historyTable.createEntity({
          partitionKey: id,
          rowKey: uuidv4(),
          contentSnapshot: existing.content || '',
          titleSnapshot: existing.title || '',
          linkedItemsSnapshot: existing.linkedItems || '[]',
          editedAt: new Date().toISOString(),
          editReason: body.edit_reason || ''
        });
      } catch (e) {
        // History table creation failed — continue anyway
        console.error('Failed to save history:', e.message);
      }

      const now = new Date().toISOString();
      const updated = {
        partitionKey: decoded.id,
        rowKey: id,
        title: (body.title !== undefined ? body.title : existing.title) || 'Untitled',
        entryDate: (body.entry_date !== undefined ? body.entry_date : existing.entryDate) || now.split('T')[0],
        entryType: (body.entry_type !== undefined ? body.entry_type : existing.entryType) || 'note',
        linkedItems: body.linked_items !== undefined ? JSON.stringify(body.linked_items) : (existing.linkedItems || '[]'),
        media: body.media !== undefined ? JSON.stringify(body.media) : (existing.media || '[]'),
        createdAt: existing.createdAt || now,
        updatedAt: now
      };
      const expId = body.experiment_id !== undefined ? body.experiment_id : (existing.experimentId || '');
      const content = body.content !== undefined ? body.content : (existing.content || '');
      if (expId) updated.experimentId = expId;
      if (content) updated.content = content;

      await table.updateEntity(updated, 'Replace');

      return jsonResponse(200, {
        id, experiment_id: updated.experimentId || null,
        title: updated.title, content: updated.content,
        entry_date: updated.entryDate, entry_type: updated.entryType,
        linked_items: JSON.parse(updated.linkedItems),
        media: JSON.parse(updated.media),
        created_at: updated.createdAt, updated_at: now
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/notebook/{id}
app.http('notebookDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'notebook/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('notebookentries');

      try {
        await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Entry not found' });
      }

      // Delete history
      try {
        const historyTable = await getTable('entryhistory');
        const history = historyTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${id}'` } });
        for await (const h of history) {
          await historyTable.deleteEntity(h.partitionKey, h.rowKey);
        }
      } catch (e) { /* ok */ }

      await table.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/notebook/{id}/history
app.http('notebookHistory', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'notebook/{id}/history',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;

      // Verify ownership
      const entriesTable = await getTable('notebookentries');
      try {
        await entriesTable.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Entry not found' });
      }

      const historyTable = await getTable('entryhistory');
      const items = [];
      const entities = historyTable.listEntities({ queryOptions: { filter: `PartitionKey eq '${id}'` } });
      for await (const entity of entities) {
        items.push({
          id: entity.rowKey,
          content_snapshot: entity.contentSnapshot || '',
          title_snapshot: entity.titleSnapshot || '',
          linked_items_snapshot: entity.linkedItemsSnapshot ? JSON.parse(entity.linkedItemsSnapshot) : [],
          edited_at: entity.editedAt,
          edit_reason: entity.editReason || ''
        });
      }

      items.sort((a, b) => (b.edited_at || '').localeCompare(a.edited_at || ''));
      return jsonResponse(200, items);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
