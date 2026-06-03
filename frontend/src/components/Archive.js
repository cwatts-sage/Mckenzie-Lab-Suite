import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { archiveAPI, projectAPI } from '../api';

const STATUS_BADGE = {
  abandoned: { label: '🚫 Abandoned', bg: '#ecf0f1', fg: '#7f8c8d' },
  failed: { label: '❌ Failed', bg: '#fdedec', fg: '#e74c3c' },
  archived: { label: '🗄️ Archived', bg: '#eef2f7', fg: '#5d6d7e' },
};

function Archive() {
  const [projects, setProjects] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      const res = await archiveAPI.getAll();
      setProjects(res.data.projects || []);
      setExperiments(res.data.experiments || []);
    } catch (err) {
      setError('Failed to load archive: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const restoreProject = async (proj) => {
    if (!window.confirm(`Restore project "${proj.title}" to Active?`)) return;
    setBusy(true);
    try {
      await projectAPI.update(proj.id, { status: 'active' });
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to restore'); }
    setBusy(false);
  };

  const restoreExperiment = async (exp) => {
    if (!window.confirm(`Restore experiment "${exp.title}" to Active?`)) return;
    setBusy(true);
    try {
      await projectAPI.updateExperiment(exp.project_id, exp.id, { status: 'active' });
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to restore'); }
    setBusy(false);
  };

  const reasonText = (item) => item.abandon_reason || item.failed_reason || '';

  const badge = (status) => {
    const b = STATUS_BADGE[status] || { label: status, bg: '#f0f0f0', fg: '#888' };
    return <span style={{ background: b.bg, color: b.fg, padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{b.label}</span>;
  };

  if (loading) return <div className="loading">Loading archive...</div>;
  if (error) return <div className="card"><div style={{ color: '#e74c3c', padding: 20 }}>{error}</div></div>;

  const empty = projects.length === 0 && experiments.length === 0;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>🗄️ Archive ({projects.length + experiments.length})</h2>
        </div>
        <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: 16 }}>
          Abandoned, failed, and archived projects & experiments live here. They're hidden from your active views but kept for your records. Restore anything to bring it back as Active.
        </p>

        {empty ? (
          <div className="empty-state">
            <div className="emoji">🗄️</div>
            <p>Nothing archived. Abandoned or failed items will show up here.</p>
          </div>
        ) : (
          <>
            {projects.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: '1rem', color: '#2c3e50', marginBottom: 8 }}>📁 Projects ({projects.length})</h3>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Status</th><th>Reason</th><th>Modified</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {projects.map(p => (
                        <tr key={p.id}>
                          <td><strong>{p.title}</strong></td>
                          <td>{badge(p.status)}</td>
                          <td style={{ fontSize: '0.85rem', color: '#666' }}>{reasonText(p) || '—'}</td>
                          <td style={{ fontSize: '0.85rem', color: '#888' }}>{new Date(p.updated_at || p.created_at).toLocaleDateString()}</td>
                          <td>
                            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => restoreProject(p)}>↩️ Restore</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {experiments.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', color: '#2c3e50', marginBottom: 8 }}>🧪 Experiments ({experiments.length})</h3>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Project</th><th>Status</th><th>Reason</th><th>Modified</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {experiments.map(e => (
                        <tr key={e.id}>
                          <td><strong>{e.title}</strong></td>
                          <td style={{ fontSize: '0.85rem' }}>
                            {e.project_id ? (
                              <span style={{ color: '#3498db', cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={() => navigate(`/notebook/projects/${e.project_id}`)}>
                                {e.project_title || 'View'}
                              </span>
                            ) : '—'}
                          </td>
                          <td>{badge(e.status)}</td>
                          <td style={{ fontSize: '0.85rem', color: '#666' }}>{reasonText(e) || '—'}</td>
                          <td style={{ fontSize: '0.85rem', color: '#888' }}>{new Date(e.updated_at || e.created_at).toLocaleDateString()}</td>
                          <td>
                            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => restoreExperiment(e)}>↩️ Restore</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Archive;
