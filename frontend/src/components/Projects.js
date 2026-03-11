import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectAPI, reagentAPI, sampleAPI } from '../api';
import DeleteConfirmModal from './DeleteConfirmModal';

const STATUS_OPTIONS = [
  { value: 'active', label: '🟢 Active', color: '#27ae60' },
  { value: 'paused', label: '⏸️ Paused', color: '#f39c12' },
  { value: 'completed', label: '✅ Completed', color: '#3498db' },
  { value: 'abandoned', label: '🚫 Abandoned', color: '#95a5a6' },
];

function Projects() {
  const [projects, setProjects] = useState([]);
  const [reagents, setReagents] = useState([]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', purpose: '', hypothesis: '', status: 'active', tags: '', strains: [], controls: [] });
  const [filter, setFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate = useNavigate();

  // Strain/control picker state
  const [strainMentionOpen, setStrainMentionOpen] = useState(false);
  const [strainMentionSearch, setStrainMentionSearch] = useState('');
  const [strainMentionTarget, setStrainMentionTarget] = useState('strains');

  const fetchData = async () => {
    try {
      const [projRes, reagentsRes, samplesRes] = await Promise.all([
        projectAPI.getAll(),
        reagentAPI.getAll(),
        sampleAPI.getAll(),
      ]);
      setProjects(projRes.data);
      setReagents(reagentsRes.data);
      setSamples(samplesRes.data);
    } catch (err) {
      setError('Failed to load projects: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => {
    setForm({ title: '', description: '', purpose: '', hypothesis: '', status: 'active', tags: '', strains: [], controls: [] });
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (proj) => {
    setForm({
      title: proj.title,
      description: proj.description || '',
      purpose: proj.purpose || '',
      hypothesis: proj.hypothesis || '',
      status: proj.status,
      tags: proj.tags || '',
      strains: proj.strains || [],
      controls: proj.controls || [],
    });
    setEditing(proj);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title) { alert('Title is required'); return; }
    try {
      if (editing) {
        await projectAPI.update(editing.id, form);
      } else {
        await projectAPI.create(form);
      }
      setShowModal(false);
      setLoading(true);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await projectAPI.delete(deleteTarget.id);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  // Strain/control mention helpers
  const getStrainMentionResults = () => {
    const s = strainMentionSearch.toLowerCase();
    const results = [];
    reagents.filter(r => (r.name || '').toLowerCase().includes(s) || (r.catalog_number || '').toLowerCase().includes(s))
      .forEach(r => results.push({ type: 'reagent', item: r, label: `📦 ${r.name}${r.catalog_number ? ` (${r.catalog_number})` : ''}` }));
    samples.filter(r => (r.name || '').toLowerCase().includes(s))
      .forEach(r => results.push({ type: 'sample', item: r, label: `🧫 ${r.name}` }));
    return results;
  };

  const addStrainOrControl = (type, item) => {
    const field = strainMentionTarget;
    const existing = form[field] || [];
    if (!existing.find(x => x.id === item.id && x.type === type)) {
      setForm({ ...form, [field]: [...existing, { type, id: item.id, name: item.name }] });
    }
    setStrainMentionOpen(false);
    setStrainMentionSearch('');
  };

  const removeStrainOrControl = (field, index) => {
    const items = [...(form[field] || [])];
    items.splice(index, 1);
    setForm({ ...form, [field]: items });
  };

  const filtered = filter === 'all' ? projects : projects.filter(e => e.status === filter);
  const statusInfo = (s) => STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];

  if (loading) return <div className="loading">Loading projects...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div></div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>📁 Projects ({filtered.length})</h2>
          <button className="btn btn-primary" onClick={openAdd}>+ New Project</button>
        </div>

        <div className="search-bar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Status</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📁</div>
            <p>{filter === 'all' ? 'No projects yet. Create your first one!' : 'No projects with this status.'}</p>
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {filtered.map(proj => {
              const si = statusInfo(proj.status);
              return (
                <div key={proj.id} style={{
                  border:'1px solid #eee', borderRadius:12, padding:16,
                  borderLeft:`4px solid ${si.color}`, cursor:'pointer', transition:'background 0.15s'
                }}
                  onClick={() => navigate(`/notebook/projects/${proj.id}`)}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                >
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <h3 style={{fontSize:'1.1rem', marginBottom:4}}>{proj.title}</h3>
                      {proj.description && <p style={{color:'#666', fontSize:'0.9rem', marginBottom:6}}>{proj.description}</p>}
                      {proj.purpose && <p style={{color:'#888', fontSize:'0.85rem', marginBottom:6}}>Purpose: {proj.purpose}</p>}
                      <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                        <span className={`badge badge-${proj.status === 'active' ? 'success' : proj.status === 'completed' ? 'info' : proj.status === 'paused' ? 'warning' : 'danger'}`}>
                          {si.label}
                        </span>
                        <span style={{fontSize:'0.8rem', color:'#888'}}>🧪 {proj.experiment_count || 0} experiment{(proj.experiment_count || 0) !== 1 ? 's' : ''}</span>
                        {proj.tags && proj.tags.split(',').map((tag, i) => (
                          <span key={i} style={{background:'#ecf0f1', padding:'2px 8px', borderRadius:10, fontSize:'0.75rem', color:'#555'}}>
                            {tag.trim()}
                          </span>
                        ))}
                        {proj.strains && proj.strains.length > 0 && (
                          <span style={{fontSize:'0.8rem', color:'#888'}}>🧬 {proj.strains.length} strain{proj.strains.length !== 1 ? 's' : ''}</span>
                        )}
                        <span style={{fontSize:'0.8rem', color:'#999'}}>
                          Created {new Date(proj.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div style={{display:'flex', gap:6}} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(proj)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(proj)}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setStrainMentionOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:700}}>
            <h2>{editing ? 'Edit Project' : 'New Project'}</h2>
            <div className="form-group">
              <label>Title *</label>
              <input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} autoFocus />
            </div>
            <div className="form-group">
              <label>Purpose</label>
              <textarea value={form.purpose} onChange={(e) => setForm({...form, purpose: e.target.value})} rows={2} style={{resize:'vertical'}} placeholder="What is this project trying to achieve?" />
            </div>
            <div className="form-group">
              <label>Hypothesis</label>
              <textarea value={form.hypothesis} onChange={(e) => setForm({...form, hypothesis: e.target.value})} rows={2} style={{resize:'vertical'}} placeholder="What do you expect to find?" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={2} style={{resize:'vertical'}} placeholder="Brief description..." />
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

            {/* Strains picker */}
            <div className="form-group" style={{position:'relative'}}>
              <label>Strains <span style={{fontWeight:400,color:'#999',fontSize:'0.8rem'}}>— search to add</span></label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                {(form.strains || []).map((s, i) => (
                  <span key={i} style={{
                    background: s.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                    padding:'4px 10px',borderRadius:12,fontSize:'0.8rem',display:'flex',alignItems:'center',gap:4
                  }}>
                    {s.type === 'reagent' ? '📦' : '🧫'} {s.name}
                    <span style={{cursor:'pointer',marginLeft:4,color:'#e74c3c'}} onClick={() => removeStrainOrControl('strains', i)}>×</span>
                  </span>
                ))}
              </div>
              <input
                value={strainMentionTarget === 'strains' ? strainMentionSearch : ''}
                onChange={(e) => {
                  setStrainMentionSearch(e.target.value);
                  setStrainMentionTarget('strains');
                  setStrainMentionOpen(e.target.value.length > 0);
                }}
                onFocus={() => setStrainMentionTarget('strains')}
                placeholder="Search reagents & samples..."
                style={{fontSize:'0.9rem'}}
              />
              {strainMentionOpen && strainMentionTarget === 'strains' && (
                <div style={{
                  position:'absolute',left:0,right:0,top:'100%',
                  background:'white',border:'1px solid #ddd',borderRadius:8,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.1)',maxHeight:200,overflowY:'auto',zIndex:200
                }}>
                  {getStrainMentionResults().length === 0 ? (
                    <div style={{padding:12,color:'#999',fontSize:'0.9rem'}}>No matches found</div>
                  ) : (
                    getStrainMentionResults().slice(0, 10).map((r, i) => (
                      <div key={i} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0f0f0',fontSize:'0.9rem'}}
                        onClick={() => addStrainOrControl(r.type, r.item)}
                        onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                      >
                        {r.label}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Controls picker */}
            <div className="form-group" style={{position:'relative'}}>
              <label>Controls <span style={{fontWeight:400,color:'#999',fontSize:'0.8rem'}}>— search to add</span></label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                {(form.controls || []).map((c, i) => (
                  <span key={i} style={{
                    background: c.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                    padding:'4px 10px',borderRadius:12,fontSize:'0.8rem',display:'flex',alignItems:'center',gap:4
                  }}>
                    {c.type === 'reagent' ? '📦' : '🧫'} {c.name}
                    <span style={{cursor:'pointer',marginLeft:4,color:'#e74c3c'}} onClick={() => removeStrainOrControl('controls', i)}>×</span>
                  </span>
                ))}
              </div>
              <input
                value={strainMentionTarget === 'controls' ? strainMentionSearch : ''}
                onChange={(e) => {
                  setStrainMentionSearch(e.target.value);
                  setStrainMentionTarget('controls');
                  setStrainMentionOpen(e.target.value.length > 0);
                }}
                onFocus={() => setStrainMentionTarget('controls')}
                placeholder="Search reagents & samples..."
                style={{fontSize:'0.9rem'}}
              />
              {strainMentionOpen && strainMentionTarget === 'controls' && (
                <div style={{
                  position:'absolute',left:0,right:0,top:'100%',
                  background:'white',border:'1px solid #ddd',borderRadius:8,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.1)',maxHeight:200,overflowY:'auto',zIndex:200
                }}>
                  {getStrainMentionResults().length === 0 ? (
                    <div style={{padding:12,color:'#999',fontSize:'0.9rem'}}>No matches found</div>
                  ) : (
                    getStrainMentionResults().slice(0, 10).map((r, i) => (
                      <div key={i} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0f0f0',fontSize:'0.9rem'}}
                        onClick={() => addStrainOrControl(r.type, r.item)}
                        onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                      >
                        {r.label}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowModal(false); setStrainMentionOpen(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          itemName={`"${deleteTarget.title}" and all its experiments & notebook entries`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default Projects;
