import React, { useState, useEffect, useCallback } from 'react';
import { trashAPI } from '../api';
import DeleteConfirmModal from './DeleteConfirmModal';

const TYPE_ICON = { reagent: '📦', sample: '🧫', entry: '📝' };

function Trash() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await trashAPI.getAll();
      setItems(res.data);
    } catch (err) {
      setError('Failed to load trash: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRestore = async (item) => {
    setBusy(true);
    try {
      await trashAPI.restore(item.type, item.id);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to restore');
    }
    setBusy(false);
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    setBusy(true);
    try {
      await trashAPI.purge(purgeTarget.type, purgeTarget.id);
      setPurgeTarget(null);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
    setBusy(false);
  };

  if (loading) return <div className="loading">Loading trash...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div></div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>🗑️ Trash ({items.length})</h2>
        </div>
        <p style={{color:'#888', fontSize:'0.9rem', marginBottom:16}}>
          Deleted reagents, samples, and notebook entries are held here for 7 days, then permanently removed. Restore anything you deleted by accident.
        </p>

        {items.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">✨</div>
            <p>Trash is empty — nothing waiting to be purged.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Deleted</th>
                  <th>Auto-purges in</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>{TYPE_ICON[item.type] || '•'} {item.type_label}</td>
                    <td><strong>{item.name}</strong></td>
                    <td style={{fontSize:'0.85rem', color:'#888'}}>
                      {item.deleted_at ? new Date(item.deleted_at).toLocaleString() : '—'}
                    </td>
                    <td>
                      <span className={`badge ${item.days_remaining <= 1 ? 'badge-danger' : item.days_remaining <= 3 ? 'badge-warning' : 'badge-info'}`}>
                        {item.days_remaining} day{item.days_remaining === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => handleRestore(item)} style={{marginRight:4}}>↩️ Restore</button>
                      <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => setPurgeTarget(item)}>Delete forever</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {purgeTarget && (
        <DeleteConfirmModal
          itemName={`"${purgeTarget.name}" permanently (this cannot be undone)`}
          onConfirm={handlePurge}
          onCancel={() => setPurgeTarget(null)}
        />
      )}
    </div>
  );
}

export default Trash;
