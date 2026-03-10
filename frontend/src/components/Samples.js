import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { sampleAPI, storageAPI, experimentAPI } from '../api';
import DeleteConfirmModal from './DeleteConfirmModal';

function Samples() {
  const [samples, setSamples] = useState([]);
  const [storageUnits, setStorageUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterExperiment, setFilterExperiment] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSample, setEditingSample] = useState(null);
  const [form, setForm] = useState(getEmptyForm());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate = useNavigate();

  // Experiment dropdown state
  const [expDropdownOpen, setExpDropdownOpen] = useState(false);
  const [expSearch, setExpSearch] = useState('');

  // Cross-reference expand
  const [expandedSample, setExpandedSample] = useState(null);
  const [sampleRefs, setSampleRefs] = useState(null);
  const [loadingRefs, setLoadingRefs] = useState(false);

  function getEmptyForm() {
    return {
      name: '', date_collected: '', experiment: '', experiment_id: null, organism_strain: '',
      storage_location_id: '', quantity: '', quantity_unit: '',
      notes: '', status: 'stored'
    };
  }

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (filterUnit) params.unit_id = filterUnit;
      if (filterStatus) params.status = filterStatus;
      if (filterExperiment) params.experiment_id = filterExperiment;

      const [samplesRes, unitsRes, locsRes, expsRes] = await Promise.all([
        sampleAPI.getAll(params),
        storageAPI.getUnits(),
        storageAPI.getLocations(),
        experimentAPI.getAll(),
      ]);
      setSamples(samplesRes.data);
      setStorageUnits(unitsRes.data);
      setLocations(locsRes.data);
      setExperiments(expsRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load samples: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [search, filterUnit, filterStatus, filterExperiment]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAdd = () => {
    setEditingSample(null);
    setForm({
      ...getEmptyForm(),
      date_collected: new Date().toISOString().split('T')[0]
    });
    setExpSearch('');
    setExpDropdownOpen(false);
    setShowModal(true);
  };

  const openEdit = (sample) => {
    setEditingSample(sample);
    setForm({
      name: sample.name || '',
      date_collected: sample.date_collected || '',
      experiment: sample.experiment || '',
      experiment_id: sample.experiment_id || null,
      organism_strain: sample.organism_strain || '',
      storage_location_id: sample.storage_location_id || '',
      quantity: sample.quantity ?? '',
      quantity_unit: sample.quantity_unit || '',
      notes: sample.notes || '',
      status: sample.status || 'stored',
    });
    setExpSearch(sample.experiment || '');
    setExpDropdownOpen(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        ...form,
        quantity: form.quantity !== '' ? parseFloat(form.quantity) : null,
        storage_location_id: form.storage_location_id || null,
        experiment_id: form.experiment_id || null,
      };

      if (editingSample) {
        await sampleAPI.update(editingSample.id, data);
      } else {
        await sampleAPI.create(data);
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await sampleAPI.delete(deleteTarget.id);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  // Experiment combo box helpers
  const handleExpSearchChange = (val) => {
    setExpSearch(val);
    setForm({ ...form, experiment: val, experiment_id: null });
    setExpDropdownOpen(true);
  };

  const selectExperiment = (exp) => {
    setForm({ ...form, experiment: exp.title, experiment_id: exp.id });
    setExpSearch(exp.title);
    setExpDropdownOpen(false);
  };

  const filteredExperiments = experiments.filter(e =>
    !expSearch || (e.title || '').toLowerCase().includes(expSearch.toLowerCase())
  );

  // Cross-reference view
  const toggleExpandSample = async (sample) => {
    if (expandedSample === sample.id) {
      setExpandedSample(null);
      setSampleRefs(null);
      return;
    }
    setExpandedSample(sample.id);
    setLoadingRefs(true);
    try {
      const res = await sampleAPI.getReferences(sample.id);
      setSampleRefs(res.data);
    } catch (err) {
      setSampleRefs({ experiment: null, notebook_entries: [] });
    }
    setLoadingRefs(false);
  };

  const formatLocation = (s) => {
    const parts = [];
    if (s.unit_name) parts.push(s.unit_name);
    if (s.rack) parts.push(`Rack ${s.rack}`);
    if (s.box) parts.push(`Box ${s.box}`);
    if (s.position) parts.push(`Pos ${s.position}`);
    return parts.join(' → ') || '—';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'stored': return { class: 'badge-success', text: 'Stored' };
      case 'in use': return { class: 'badge-info', text: 'In Use' };
      case 'depleted': return { class: 'badge-danger', text: 'Depleted' };
      default: return { class: 'badge-secondary', text: status };
    }
  };

  if (loading) return <div className="loading">Loading samples...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div><button className="btn btn-primary" onClick={() => { setError(''); setLoading(true); fetchData(); }}>Retry</button></div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>📦 Experimental Samples ({samples.length})</h2>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Sample</button>
        </div>

        <div className="search-bar">
          <input
            type="text"
            placeholder="Search by name, experiment, strain, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
            <option value="">All Storage</option>
            {storageUnits.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.temperature})</option>
            ))}
          </select>
          <select value={filterExperiment} onChange={(e) => setFilterExperiment(e.target.value)}>
            <option value="">All Experiments</option>
            {experiments.map(exp => (
              <option key={exp.id} value={exp.id}>{exp.title}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="stored">Stored</option>
            <option value="in use">In Use</option>
            <option value="depleted">Depleted</option>
          </select>
        </div>

        {samples.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🧫</div>
            <p>No samples yet. Add your first experimental sample!</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Experiment</th>
                  <th>Strain</th>
                  <th>Location</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {samples.map(s => {
                  const statusBadge = getStatusBadge(s.status);
                  const isExpanded = expandedSample === s.id;
                  return (
                    <React.Fragment key={s.id}>
                      <tr style={{cursor:'pointer'}} onClick={() => toggleExpandSample(s)}>
                        <td>
                          <strong>{s.name}</strong>
                          {s.notes && (
                            <div style={{fontSize:'0.8rem', color:'#888', marginTop:2}}>{s.notes.substring(0, 50)}{s.notes.length > 50 ? '...' : ''}</div>
                          )}
                        </td>
                        <td>{s.date_collected || '—'}</td>
                        <td>
                          {s.experiment_id ? (
                            <span style={{color:'#3498db',cursor:'pointer',textDecoration:'underline'}}
                              onClick={(e) => { e.stopPropagation(); navigate(`/notebook/experiments/${s.experiment_id}`); }}>
                              {s.experiment || 'View'}
                            </span>
                          ) : (s.experiment || '—')}
                        </td>
                        <td>{s.organism_strain || '—'}</td>
                        <td style={{fontSize:'0.85rem'}}>{formatLocation(s)}</td>
                        <td>{s.quantity != null ? `${s.quantity} ${s.quantity_unit || ''}` : '—'}</td>
                        <td><span className={`badge ${statusBadge.class}`}>{statusBadge.text}</span></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-sm btn-secondary" onClick={() => openEdit(s)} style={{marginRight:4}}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(s)}>🗑️</button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{background:'#f8f9fa',padding:16}}>
                            {loadingRefs ? (
                              <div style={{color:'#888',fontSize:'0.9rem'}}>Loading references...</div>
                            ) : sampleRefs ? (
                              <div>
                                {sampleRefs.experiment && (
                                  <div style={{marginBottom:12}}>
                                    <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase'}}>Linked Experiment</label>
                                    <div style={{marginTop:4}}>
                                      <span style={{color:'#3498db',cursor:'pointer',textDecoration:'underline',fontWeight:500}}
                                        onClick={() => navigate(`/notebook/experiments/${sampleRefs.experiment.id}`)}>
                                        🧪 {sampleRefs.experiment.title}
                                      </span>
                                      <span className={`badge badge-${sampleRefs.experiment.status === 'active' ? 'success' : 'info'}`} style={{marginLeft:8}}>
                                        {sampleRefs.experiment.status}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase'}}>Notebook Mentions ({sampleRefs.notebook_entries.length})</label>
                                  {sampleRefs.notebook_entries.length === 0 ? (
                                    <div style={{color:'#999',fontSize:'0.85rem',marginTop:4}}>No notebook entries mention this sample.</div>
                                  ) : (
                                    <div style={{marginTop:4,display:'flex',flexDirection:'column',gap:6}}>
                                      {sampleRefs.notebook_entries.map(ne => (
                                        <div key={ne.id} style={{
                                          padding:'8px 12px',background:'white',borderRadius:8,
                                          border:'1px solid #eee',cursor:'pointer',fontSize:'0.85rem'
                                        }}
                                          onClick={() => ne.experiment_id && navigate(`/notebook/experiments/${ne.experiment_id}`)}
                                        >
                                          <span style={{fontWeight:500}}>{ne.title}</span>
                                          <span style={{color:'#888',marginLeft:8}}>📅 {ne.entry_date}</span>
                                          <span className="badge badge-info" style={{marginLeft:8,fontSize:'0.7rem'}}>{ne.entry_type}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setExpDropdownOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSample ? 'Edit Sample' : 'Add Sample'}</h2>

            <div className="form-group">
              <label>Sample Name *</label>
              <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g., Mouse brain - frontal cortex" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date Collected</label>
                <input type="date" value={form.date_collected} onChange={(e) => setForm({...form, date_collected: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>
                  <option value="stored">Stored</option>
                  <option value="in use">In Use</option>
                  <option value="depleted">Depleted</option>
                </select>
              </div>
            </div>

            {/* Experiment combo box */}
            <div className="form-group" style={{position:'relative'}}>
              <label>Experiment</label>
              <input
                value={expSearch}
                onChange={(e) => handleExpSearchChange(e.target.value)}
                onFocus={() => setExpDropdownOpen(true)}
                placeholder="Search experiments or type custom..."
              />
              {form.experiment_id && (
                <div style={{fontSize:'0.8rem',color:'#27ae60',marginTop:4}}>
                  ✓ Linked to experiment
                  <span style={{cursor:'pointer',color:'#e74c3c',marginLeft:8}} onClick={() => {
                    setForm({...form, experiment_id: null});
                  }}>× Unlink</span>
                </div>
              )}
              {expDropdownOpen && (
                <div style={{
                  position:'absolute',left:0,right:0,top:'100%',
                  background:'white',border:'1px solid #ddd',borderRadius:8,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.1)',maxHeight:200,overflowY:'auto',zIndex:200
                }}>
                  {filteredExperiments.length === 0 ? (
                    <div style={{padding:12,color:'#999',fontSize:'0.9rem'}}>No matching experiments</div>
                  ) : (
                    filteredExperiments.map(exp => (
                      <div key={exp.id} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0f0f0',fontSize:'0.9rem'}}
                        onClick={() => selectExperiment(exp)}
                        onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                      >
                        🧪 {exp.title}
                        <span className={`badge badge-${exp.status === 'active' ? 'success' : 'info'}`} style={{marginLeft:8,fontSize:'0.7rem'}}>{exp.status}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Organism Strain</label>
              <input value={form.organism_strain} onChange={(e) => setForm({...form, organism_strain: e.target.value})} placeholder="e.g., C57BL/6J" />
            </div>

            <div className="form-group">
              <label>Storage Location</label>
              <select value={form.storage_location_id} onChange={(e) => setForm({...form, storage_location_id: e.target.value})}>
                <option value="">— Select location —</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.unit_name} → {l.rack ? `Rack ${l.rack}` : ''}{l.box ? ` → Box ${l.box}` : ''}{l.position ? ` → Pos ${l.position}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" step="any" value={form.quantity} onChange={(e) => setForm({...form, quantity: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Unit</label>
                <input value={form.quantity_unit} onChange={(e) => setForm({...form, quantity_unit: e.target.value})} placeholder="e.g., sections, vials, µL" />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({...form, notes: e.target.value})}
                placeholder="Additional details about this sample..."
                rows={3}
                style={{resize:'vertical'}}
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowModal(false); setExpDropdownOpen(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingSample ? 'Save Changes' : 'Add Sample'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <DeleteConfirmModal
          itemName={`sample "${deleteTarget.name}"`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default Samples;
