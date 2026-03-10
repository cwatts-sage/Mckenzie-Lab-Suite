const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// Helper: format note entity to API response
function formatNote(entity) {
  return {
    id: entity.rowKey,
    title: entity.title || '',
    content: entity.content || '',
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  };
}

// GET /api/notes — list all user's misc notes
app.http('notesGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'notes',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const table = await getTable('usernotes');
      const items = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${decoded.id}'` } });
      for await (const entity of entities) {
        items.push(formatNote(entity));
      }
      items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return jsonResponse(200, items);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/notes — create a note
app.http('notesCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'notes',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      if (!body.title) return jsonResponse(400, { error: 'Title is required' });

      const table = await getTable('usernotes');
      const id = uuidv4();
      const now = new Date().toISOString();

      const entity = {
        partitionKey: decoded.id,
        rowKey: id,
        title: body.title,
        createdAt: now,
        updatedAt: now
      };
      if (body.content) entity.content = body.content;

      await table.createEntity(entity);

      return jsonResponse(201, formatNote(entity));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/notes/{id} — update a note
app.http('notesUpdate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'notes/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const body = await req.json();
      const table = await getTable('usernotes');

      let existing;
      try {
        existing = await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Note not found' });
      }

      const now = new Date().toISOString();
      const updated = {
        partitionKey: decoded.id,
        rowKey: id,
        title: (body.title !== undefined ? body.title : existing.title) || 'Untitled',
        createdAt: existing.createdAt || now,
        updatedAt: now
      };

      const content = body.content !== undefined ? body.content : (existing.content || '');
      if (content) updated.content = content;

      await table.updateEntity(updated, 'Replace');

      return jsonResponse(200, formatNote(updated));
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/notes/{id} — delete a note
app.http('notesDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'notes/{id}',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const id = req.params.id;
      const table = await getTable('usernotes');

      try {
        await table.getEntity(decoded.id, id);
      } catch (e) {
        return jsonResponse(404, { error: 'Note not found' });
      }

      await table.deleteEntity(decoded.id, id);
      return jsonResponse(200, { success: true });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
