const express = require('express');
const router = express.Router();
const { register, login, authMiddleware } = require('../auth');
const db = require('../database');

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const result = register(email, password, displayName);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = login(email, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare(
    'SELECT id, email, display_name, default_alert_days FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// PUT /api/auth/settings
router.put('/settings', authMiddleware, (req, res) => {
  const { default_alert_days, display_name } = req.body;
  const updates = [];
  const params = [];

  if (default_alert_days !== undefined) {
    updates.push('default_alert_days = ?');
    params.push(default_alert_days);
  }
  if (display_name !== undefined) {
    updates.push('display_name = ?');
    params.push(display_name);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.user.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const user = db.prepare(
    'SELECT id, email, display_name, default_alert_days FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json(user);
});

module.exports = router;
