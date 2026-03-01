const { app } = require('@azure/functions');
const { getTable } = require('../shared/db');
const { verifyToken, jsonResponse } = require('../shared/auth');

// Middleware: verify admin
async function requireAdmin(req) {
  const decoded = verifyToken(req);
  if (!decoded) return { error: jsonResponse(401, { error: 'Unauthorized' }) };

  const usersTable = await getTable('users');
  let user;
  try {
    user = await usersTable.getEntity('user', decoded.id);
  } catch (e) {
    return { error: jsonResponse(404, { error: 'User not found' }) };
  }

  if (!user.isAdmin) {
    return { error: jsonResponse(403, { error: 'Admin access required' }) };
  }

  return { decoded, user };
}

// GET /api/admin/users — list all users
app.http('adminUsersGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/users',
  handler: async (req) => {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    try {
      const usersTable = await getTable('users');
      const users = [];
      const entities = usersTable.listEntities();
      for await (const entity of entities) {
        users.push({
          id: entity.rowKey,
          email: entity.email,
          display_name: entity.displayName || '',
          is_admin: !!entity.isAdmin,
          is_approved: entity.isApproved !== false, // default true for legacy users
          is_disabled: !!entity.isDisabled,
          created_at: entity.createdAt || null
        });
      }

      users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      return jsonResponse(200, users);
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/admin/users/{id}/approve
app.http('adminUserApprove', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'manage/users/{id}/approve',
  handler: async (req) => {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    try {
      const targetId = req.params.id;
      const usersTable = await getTable('users');

      let entity;
      try {
        entity = await usersTable.getEntity('user', targetId);
      } catch (e) {
        return jsonResponse(404, { error: 'User not found' });
      }

      entity.isApproved = true;
      entity.isDisabled = false;
      await usersTable.updateEntity(entity, 'Merge');

      return jsonResponse(200, {
        id: entity.rowKey,
        email: entity.email,
        display_name: entity.displayName || '',
        is_admin: !!entity.isAdmin,
        is_approved: true,
        is_disabled: false,
        message: `User ${entity.email} has been approved`
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/admin/users/{id}/disable
app.http('adminUserDisable', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'manage/users/{id}/disable',
  handler: async (req) => {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    try {
      const targetId = req.params.id;

      // Prevent disabling yourself
      if (targetId === auth.decoded.id) {
        return jsonResponse(400, { error: 'You cannot disable your own account' });
      }

      const usersTable = await getTable('users');

      let entity;
      try {
        entity = await usersTable.getEntity('user', targetId);
      } catch (e) {
        return jsonResponse(404, { error: 'User not found' });
      }

      entity.isDisabled = true;
      await usersTable.updateEntity(entity, 'Merge');

      return jsonResponse(200, {
        id: entity.rowKey,
        email: entity.email,
        is_disabled: true,
        message: `User ${entity.email} has been disabled`
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// PUT /api/admin/users/{id}/enable
app.http('adminUserEnable', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'manage/users/{id}/enable',
  handler: async (req) => {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    try {
      const targetId = req.params.id;
      const usersTable = await getTable('users');

      let entity;
      try {
        entity = await usersTable.getEntity('user', targetId);
      } catch (e) {
        return jsonResponse(404, { error: 'User not found' });
      }

      entity.isDisabled = false;
      await usersTable.updateEntity(entity, 'Merge');

      return jsonResponse(200, {
        id: entity.rowKey,
        email: entity.email,
        is_disabled: false,
        message: `User ${entity.email} has been enabled`
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// DELETE /api/admin/users/{id}
app.http('adminUserDelete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'manage/users/{id}',
  handler: async (req) => {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    try {
      const targetId = req.params.id;

      // Prevent deleting yourself
      if (targetId === auth.decoded.id) {
        return jsonResponse(400, { error: 'You cannot delete your own account' });
      }

      const usersTable = await getTable('users');

      let entity;
      try {
        entity = await usersTable.getEntity('user', targetId);
      } catch (e) {
        return jsonResponse(404, { error: 'User not found' });
      }

      // Don't allow deleting other admins
      if (entity.isAdmin) {
        return jsonResponse(400, { error: 'Cannot delete an admin account' });
      }

      await usersTable.deleteEntity('user', targetId);

      // Also delete all their data (reagents, samples, storage)
      const tables = ['reagents', 'samples', 'storagelocations', 'storageunits'];
      for (const tableName of tables) {
        try {
          const table = await getTable(tableName);
          const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${targetId}'` } });
          for await (const e of entities) {
            await table.deleteEntity(e.partitionKey, e.rowKey);
          }
        } catch (e) { /* table might not exist */ }
      }

      return jsonResponse(200, { success: true, message: `User ${entity.email} and all their data have been deleted` });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
