import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { experimentAPI } from '../api';

const STATUS_OPTIONS = [
  { value: 'active', label: '🟢 Active', color: '#27ae60' },
  { value: 'paused', label: '⏸️ Paused', color: '#f39c12' },
  { value: 'completed', label: '✅ Completed', color: '#3498db' },
  { value: 'abandoned', label: '🚫 Abandoned', color: '#95a5a6' },
];

function Experiments() {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', status: 'active', tags: '' });
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const res = await experimentAPI.getAll();
      setExperiments(res.data);
    } catch (err) {
      setError('Failed to load experiments: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => {
    setForm({ title: '', description: '', status: 'active', tags: '' });
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (exp) => {
    setForm({ title: exp.title, description: exp.description, status: exp.status, tags: exp.tags });
    setEditing(exp);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title) { alert('Title is required'); return; }
    try {
      if (editing) {
        await experimentAPI.update(editing.id, form);
      } else {
        await experimentAPI.create(form);
      }
      setShowModal(false);
      setLoading(true);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (exp) => {
    if (!window.confirm(`Delete "${exp.title}" and all its notebook entries?`)) return;
    try {
      await experimentAPI.delete(exp.id);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const filtered = filter === 'all' ? experiments : experiments.filter(e => e.status === filter);
  const statusInfo = (s) => STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];

  if (loading) return <div className="loading">Loading experiments...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div></div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>🧪 Experiments ({filtered.length})</h2>
          <button className="btn btn-primary" onClick={openAdd}>+ New Experiment</button>
        </div>

        <div className="search-bar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Status</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🧪</div>
            <p>{filter === 'all' ? 'No experiments yet. Create your first one!' : 'No experiments with this status.'}</p>
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {filtered.map(exp => {
              const si = statusInfo(exp.status);
              return (
                <div key={exp.id} style={{
                  border:'1px solid #eee', borderRadius:12, padding:16,
                  borderLeft:`4px solid ${si.color}`, cursor:'pointer', transition:'background 0.15s'
                }}
                  onClick={() => navigate(`/notebook?experiment=${exp.id}`)}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                >
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <h3 style={{fontSize:'1.1rem', marginBottom:4}}>{exp.title}</h3>
                      {exp.description && <p style={{color:'#666', fontSize:'0.9rem', marginBottom:6}}>{exp.description}</p>}
                      <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                        <span className={`badge badge-${exp.status === 'active' ? 'success' : exp.status === 'completed' ? 'info' : exp.status === 'paused' ? 'warning' : 'danger'}`}>
                          {si.label}
                        </span>
                        {exp.tags && exp.tags.split(',').map((tag, i) => (
                          <span key={i} style={{background:'#ecf0f1', padding:'2px 8px', borderRadius:10, fontSize:'0.75rem', color:'#555'}}>
                            {tag.trim()}
                          </span>
                        ))}
                        <span style={{fontSize:'0.8rem', color:'#999'}}>
                          Created {new Date(exp.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div style={{display:'flex', gap:6}} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(exp)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(exp)}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? 'Edit Experiment' : 'New Experiment'}</h2>
            <div className="form-group">
              <label>Title *</label>
              <input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} autoFocus />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={3} style={{resize:'vertical'}} placeholder="Brief purpose or hypothesis..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tags</label>
                <input value={form.tags} onChange={(e) => setForm({...form, tags: e.target.value})} placeholder="comma, separated, tags" />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Experiments;
