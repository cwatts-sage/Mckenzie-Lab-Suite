const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'inventory.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    default_alert_days INTEGER DEFAULT 30,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS storage_units (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    temperature TEXT,
    type TEXT CHECK(type IN ('freezer', 'fridge', 'shelf', 'other')) DEFAULT 'other',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS storage_locations (
    id TEXT PRIMARY KEY,
    storage_unit_id TEXT NOT NULL REFERENCES storage_units(id) ON DELETE CASCADE,
    rack TEXT,
    box TEXT,
    position TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reagents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    catalog_number TEXT,
    lot_number TEXT,
    vendor TEXT,
    source_url TEXT,
    storage_location_id TEXT REFERENCES storage_locations(id) ON DELETE SET NULL,
    special_conditions TEXT,
    quantity REAL,
    quantity_unit TEXT,
    expiration_date TEXT,
    alert_days_before INTEGER,
    is_low_stock INTEGER DEFAULT 0,
    is_ordered INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
