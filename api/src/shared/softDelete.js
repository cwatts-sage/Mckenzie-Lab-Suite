// Shared soft-delete helpers.
// Strategy: instead of hard-deleting an entity, we set `deleted = true` and
// `deletedAt = <ISO timestamp>`. List endpoints exclude deleted rows by default.
// A Trash view lists deleted rows; restore clears the flags; purge removes rows
// whose deletedAt is older than RETENTION_MS (7 days).

const RETENTION_DAYS = 7;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

// True if the entity is currently soft-deleted.
function isDeleted(entity) {
  return entity && (entity.deleted === true || entity.deleted === 'true');
}

// True if a soft-deleted entity is past its retention window.
function isExpired(entity, now = Date.now()) {
  if (!isDeleted(entity)) return false;
  if (!entity.deletedAt) return true; // no timestamp => treat as expired
  const t = Date.parse(entity.deletedAt);
  if (Number.isNaN(t)) return true;
  return now - t > RETENTION_MS;
}

// Mark an entity (in place) as soft-deleted, then persist with Merge.
async function softDelete(table, entity) {
  entity.deleted = true;
  entity.deletedAt = new Date().toISOString();
  await table.updateEntity(entity, 'Merge');
}

// Clear soft-delete flags (restore), then persist with Merge.
async function restore(table, entity) {
  entity.deleted = false;
  entity.deletedAt = '';
  await table.updateEntity(entity, 'Merge');
}

// Days remaining before permanent deletion (rounded up, min 0).
function daysRemaining(entity, now = Date.now()) {
  if (!entity || !entity.deletedAt) return 0;
  const t = Date.parse(entity.deletedAt);
  if (Number.isNaN(t)) return 0;
  const left = RETENTION_MS - (now - t);
  return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
}

module.exports = { RETENTION_DAYS, RETENTION_MS, isDeleted, isExpired, softDelete, restore, daysRemaining };
