const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../auth');
const db = require('../database');

router.use(authMiddleware);

// ============ Storage Units ============

// GET /api/storage/units
router.get('/units', (req, res) => {
  const units = db.prepare(
    'SELECT * FROM storage_units WHERE user_id = ? ORDER BY name'
  ).all(req.user.id);
  res.json(units);
});

// POST /api/storage/units
router.post('/units', (req, res) => {
  const { name, temperature, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const id = uuidv4();
  db.prepare(
    'INSERT INTO storage_units (id, user_id, name, temperature, type) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, name, temperature || null, type || 'other');

  const unit = db.prepare('SELECT * FROM storage_units WHERE id = ?').get(id);
  res.status(201).json(unit);
});

// PUT /api/storage/units/:id
router.put('/units/:id', (req, res) => {
  const unit = db.prepare(
    'SELECT * FROM storage_units WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!unit) return res.status(404).json({ error: 'Storage unit not found' });

  const { name, temperature, type } = req.body;
  db.prepare(
    'UPDATE storage_units SET name = COALESCE(?, name), temperature = COALESCE(?, temperature), type = COALESCE(?, type) WHERE id = ?'
  ).run(name || null, temperature || null, type || null, req.params.id);

  const updated = db.prepare('SELECT * FROM storage_units WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/storage/units/:id
router.delete('/units/:id', (req, res) => {
  const unit = db.prepare(
    'SELECT * FROM storage_units WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!unit) return res.status(404).json({ error: 'Storage unit not found' });

  db.prepare('DELETE FROM storage_units WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ Storage Locations ============

// GET /api/storage/locations?unit_id=...
router.get('/locations', (req, res) => {
  let query = `
    SELECT sl.*, su.name as unit_name, su.temperature as unit_temperature
    FROM storage_locations sl
    JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE su.user_id = ?
  `;
  const params = [req.user.id];

  if (req.query.unit_id) {
    query += ' AND sl.storage_unit_id = ?';
    params.push(req.query.unit_id);
  }

  query += ' ORDER BY su.name, sl.rack, sl.box, sl.position';

  const locations = db.prepare(query).all(...params);
  res.json(locations);
});

// POST /api/storage/locations
router.post('/locations', (req, res) => {
  const { storage_unit_id, rack, box, position } = req.body;
  if (!storage_unit_id) return res.status(400).json({ error: 'storage_unit_id is required' });

  // Verify ownership
  const unit = db.prepare(
    'SELECT * FROM storage_units WHERE id = ? AND user_id = ?'
  ).get(storage_unit_id, req.user.id);
  if (!unit) return res.status(404).json({ error: 'Storage unit not found' });

  const id = uuidv4();
  db.prepare(
    'INSERT INTO storage_locations (id, storage_unit_id, rack, box, position) VALUES (?, ?, ?, ?, ?)'
  ).run(id, storage_unit_id, rack || null, box || null, position || null);

  const location = db.prepare(`
    SELECT sl.*, su.name as unit_name, su.temperature as unit_temperature
    FROM storage_locations sl
    JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE sl.id = ?
  `).get(id);
  res.status(201).json(location);
});

// DELETE /api/storage/locations/:id
router.delete('/locations/:id', (req, res) => {
  const location = db.prepare(`
    SELECT sl.* FROM storage_locations sl
    JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE sl.id = ? AND su.user_id = ?
  `).get(req.params.id, req.user.id);
  if (!location) return res.status(404).json({ error: 'Location not found' });

  db.prepare('DELETE FROM storage_locations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
