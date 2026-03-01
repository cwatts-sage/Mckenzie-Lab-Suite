const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../auth');
const db = require('../database');

router.use(authMiddleware);

// GET /api/reagents
router.get('/', (req, res) => {
  let query = `
    SELECT r.*,
      sl.rack, sl.box, sl.position,
      su.name as unit_name, su.temperature as unit_temperature, su.type as unit_type
    FROM reagents r
    LEFT JOIN storage_locations sl ON r.storage_location_id = sl.id
    LEFT JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE r.user_id = ?
  `;
  const params = [req.user.id];

  // Filter by storage unit
  if (req.query.unit_id) {
    query += ' AND su.id = ?';
    params.push(req.query.unit_id);
  }

  // Filter by low stock
  if (req.query.low_stock === 'true') {
    query += ' AND r.is_low_stock = 1';
  }

  // Filter by expiring (within N days)
  if (req.query.expiring_within) {
    const days = parseInt(req.query.expiring_within);
    query += " AND r.expiration_date IS NOT NULL AND r.expiration_date <= date('now', '+' || ? || ' days')";
    params.push(days);
  }

  // Search
  if (req.query.search) {
    query += ' AND (r.name LIKE ? OR r.catalog_number LIKE ? OR r.vendor LIKE ?)';
    const s = `%${req.query.search}%`;
    params.push(s, s, s);
  }

  query += ' ORDER BY r.name';

  const reagents = db.prepare(query).all(...params);
  res.json(reagents);
});

// GET /api/reagents/notifications
router.get('/notifications', (req, res) => {
  // Get user's default alert days
  const user = db.prepare('SELECT default_alert_days FROM users WHERE id = ?').get(req.user.id);
  const defaultDays = user?.default_alert_days || 30;

  // Low stock items
  const lowStock = db.prepare(`
    SELECT r.*, su.name as unit_name, su.temperature as unit_temperature
    FROM reagents r
    LEFT JOIN storage_locations sl ON r.storage_location_id = sl.id
    LEFT JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE r.user_id = ? AND r.is_low_stock = 1
    ORDER BY r.is_ordered ASC, r.name
  `).all(req.user.id);

  // Expiring items (using per-reagent or default alert days)
  const expiring = db.prepare(`
    SELECT r.*, su.name as unit_name, su.temperature as unit_temperature,
      COALESCE(r.alert_days_before, ?) as effective_alert_days
    FROM reagents r
    LEFT JOIN storage_locations sl ON r.storage_location_id = sl.id
    LEFT JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE r.user_id = ?
      AND r.expiration_date IS NOT NULL
      AND r.expiration_date <= date('now', '+' || COALESCE(r.alert_days_before, ?) || ' days')
    ORDER BY r.expiration_date ASC
  `).all(defaultDays, req.user.id, defaultDays);

  // Expired items
  const expired = db.prepare(`
    SELECT r.*, su.name as unit_name, su.temperature as unit_temperature
    FROM reagents r
    LEFT JOIN storage_locations sl ON r.storage_location_id = sl.id
    LEFT JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE r.user_id = ?
      AND r.expiration_date IS NOT NULL
      AND r.expiration_date < date('now')
    ORDER BY r.expiration_date ASC
  `).all(req.user.id);

  res.json({ lowStock, expiring, expired });
});

// GET /api/reagents/export
router.get('/export', (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',') : [];

  let query = `
    SELECT r.name, r.catalog_number, r.lot_number, r.vendor, r.source_url
    FROM reagents r
    WHERE r.user_id = ?
  `;
  const params = [req.user.id];

  if (ids.length > 0) {
    query += ` AND r.id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }

  query += ' ORDER BY r.vendor, r.name';

  const reagents = db.prepare(query).all(...params);

  // Format for Materials section
  const lines = reagents.map(r => {
    let line = r.name;
    if (r.catalog_number) line += ` (Cat# ${r.catalog_number}`;
    if (r.lot_number) line += `, Lot# ${r.lot_number}`;
    if (r.catalog_number) line += ')';
    if (r.vendor) line += `, ${r.vendor}`;
    return line;
  });

  res.json({
    reagents,
    formatted: lines.join('\n'),
    count: reagents.length
  });
});

// POST /api/reagents
router.post('/', (req, res) => {
  const {
    name, catalog_number, lot_number, vendor, source_url,
    storage_location_id, special_conditions,
    quantity, quantity_unit, expiration_date, alert_days_before
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Name is required' });

  // Verify storage location ownership if provided
  if (storage_location_id) {
    const loc = db.prepare(`
      SELECT sl.* FROM storage_locations sl
      JOIN storage_units su ON sl.storage_unit_id = su.id
      WHERE sl.id = ? AND su.user_id = ?
    `).get(storage_location_id, req.user.id);
    if (!loc) return res.status(400).json({ error: 'Invalid storage location' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO reagents (id, user_id, name, catalog_number, lot_number, vendor, source_url,
      storage_location_id, special_conditions, quantity, quantity_unit, expiration_date, alert_days_before)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.id, name,
    catalog_number || null, lot_number || null, vendor || null, source_url || null,
    storage_location_id || null, special_conditions || null,
    quantity ?? null, quantity_unit || null, expiration_date || null, alert_days_before ?? null
  );

  const reagent = db.prepare(`
    SELECT r.*, sl.rack, sl.box, sl.position,
      su.name as unit_name, su.temperature as unit_temperature
    FROM reagents r
    LEFT JOIN storage_locations sl ON r.storage_location_id = sl.id
    LEFT JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE r.id = ?
  `).get(id);

  res.status(201).json(reagent);
});

// PUT /api/reagents/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM reagents WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Reagent not found' });

  const fields = [
    'name', 'catalog_number', 'lot_number', 'vendor', 'source_url',
    'storage_location_id', 'special_conditions',
    'quantity', 'quantity_unit', 'expiration_date', 'alert_days_before',
    'is_low_stock', 'is_ordered'
  ];

  const updates = [];
  const params = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE reagents SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const reagent = db.prepare(`
    SELECT r.*, sl.rack, sl.box, sl.position,
      su.name as unit_name, su.temperature as unit_temperature
    FROM reagents r
    LEFT JOIN storage_locations sl ON r.storage_location_id = sl.id
    LEFT JOIN storage_units su ON sl.storage_unit_id = su.id
    WHERE r.id = ?
  `).get(req.params.id);

  res.json(reagent);
});

// DELETE /api/reagents/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM reagents WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Reagent not found' });

  db.prepare('DELETE FROM reagents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
