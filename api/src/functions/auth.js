const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { getTable } = require('../shared/db');
const { hashPassword, verifyPassword, generateToken, verifyToken, jsonResponse } = require('../shared/auth');

// POST /api/auth/register
app.http('authRegister', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/register',
  handler: async (req) => {
    try {
      const body = await req.json();
      const { email, password, displayName } = body;

      if (!email || !password) return jsonResponse(400, { error: 'Email and password are required' });
      if (password.length < 6) return jsonResponse(400, { error: 'Password must be at least 6 characters' });

      const usersTable = await getTable('users');

      // Check if user exists
      const entities = usersTable.listEntities({ queryOptions: { filter: `email eq '${email}'` } });
      for await (const entity of entities) {
        return jsonResponse(400, { error: 'Email already registered' });
      }

      // Check if this is the first user (auto-approve as admin)
      let isFirstUser = true;
      const allUsers = usersTable.listEntities();
      for await (const _ of allUsers) {
        isFirstUser = false;
        break;
      }

      const id = uuidv4();
      const entity = {
        partitionKey: 'user',
        rowKey: id,
        email,
        passwordHash: hashPassword(password),
        displayName: displayName || '',
        defaultAlertDays: 30,
        isAdmin: isFirstUser,
        isApproved: isFirstUser, // First user auto-approved as admin
        isDisabled: false,
        createdAt: new Date().toISOString()
      };

      await usersTable.createEntity(entity);

      if (!isFirstUser) {
        // User needs approval
        return jsonResponse(201, {
          pending: true,
          message: 'Account created! Please wait for admin approval before logging in.'
        });
      }

      const user = {
        id, email, display_name: displayName || '',
        default_alert_days: 30, is_admin: true
      };
      const token = generateToken(user);
      return jsonResponse(201, { user, token });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// POST /api/auth/login
app.http('authLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (req) => {
    try {
      const body = await req.json();
      const { email, password } = body;

      if (!email || !password) return jsonResponse(400, { error: 'Email and password are required' });

      const usersTable = await getTable('users');
      let foundUser = null;

      const entities = usersTable.listEntities({ queryOptions: { filter: `email eq '${email}'` } });
      for await (const entity of entities) {
        foundUser = entity;
        break;
      }

      if (!foundUser || !verifyPassword(password, foundUser.passwordHash)) {
        return jsonResponse(401, { error: 'Invalid email or password' });
      }

      // Check if disabled
      if (foundUser.isDisabled) {
        return jsonResponse(403, { error: 'Your account has been disabled. Contact the administrator.' });
      }

      // Check if approved
      if (!foundUser.isApproved) {
        return jsonResponse(403, { error: 'Your account is pending approval. Please wait for the administrator to approve your access.' });
      }

      const user = {
        id: foundUser.rowKey,
        email: foundUser.email,
        display_name: foundUser.displayName || '',
        default_alert_days: foundUser.defaultAlertDays || 30,
        is_admin: !!foundUser.isAdmin
      };

      const token = generateToken(user);
      return jsonResponse(200, { user, token });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});

// GET /api/auth/me
app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const usersTable = await getTable('users');
      const entity = await usersTable.getEntity('user', decoded.id);

      return jsonResponse(200, {
        id: entity.rowKey,
        email: entity.email,
        display_name: entity.displayName || '',
        default_alert_days: entity.defaultAlertDays || 30,
        is_admin: !!entity.isAdmin
      });
    } catch (e) {
      return jsonResponse(404, { error: 'User not found' });
    }
  }
});

// PUT /api/auth/settings
app.http('authSettings', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'auth/settings',
  handler: async (req) => {
    const decoded = verifyToken(req);
    if (!decoded) return jsonResponse(401, { error: 'Unauthorized' });

    try {
      const body = await req.json();
      const usersTable = await getTable('users');
      const entity = await usersTable.getEntity('user', decoded.id);

      if (body.default_alert_days !== undefined) entity.defaultAlertDays = body.default_alert_days;
      if (body.display_name !== undefined) entity.displayName = body.display_name;

      await usersTable.updateEntity(entity, 'Merge');

      return jsonResponse(200, {
        id: entity.rowKey,
        email: entity.email,
        display_name: entity.displayName || '',
        default_alert_days: entity.defaultAlertDays || 30,
        is_admin: !!entity.isAdmin
      });
    } catch (e) {
      return jsonResponse(500, { error: e.message });
    }
  }
});
