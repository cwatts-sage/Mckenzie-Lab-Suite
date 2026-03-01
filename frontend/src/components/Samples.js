import React, { useState, useEffect, useCallback } from 'react';
import { sampleAPI, storageAPI } from '../api';

function Samples() {
  const [samples, setSamples] = useState([]);
  const [storageUnits, setStorageUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSample, setEditingSample] = useState(null);
  const [form, setForm] = useState(getEmptyForm());

  function getEmptyForm() {
    return {
      name: '', date_collected: '', experiment: '', organism_strain: '',
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

      const [samplesRes, unitsRes, locsRes] = await Promise.all([
        sampleAPI.getAll(params),
        storageAPI.getUnits(),
        storageAPI.getLocations(),
      ]);
      setSamples(samplesRes.data);
      setStorageUnits(unitsRes.data);
      setLocations(locsRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load samples: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [search, filterUnit, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAdd = () => {
    setEditingSample(null);
    setForm({
      ...getEmptyForm(),
      date_collected: new Date().toISOString().split('T')[0]
    });
    setShowModal(true);
  };

  const openEdit = (sample) => {
    setEditingSample(sample);
    setForm({
      name: sample.name || '',
      date_collected: sample.date_collected || '',
      experiment: sample.experiment || '',
      organism_strain: sample.organism_strain || '',
      storage_location_id: sample.storage_location_id || '',
      quantity: sample.quantity ?? '',
      quantity_unit: sample.quantity_unit || '',
      notes: sample.notes || '',
      status: sample.status || 'stored',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        ...form,
        quantity: form.quantity !== '' ? parseFloat(form.quantity) : null,
        storage_location_id: form.storage_location_id || null,
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

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this sample?')) return;
    try {
      await sampleAPI.delete(id);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
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
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.notes && (
                          <div style={{fontSize:'0.8rem', color:'#888', marginTop:2}}>{s.notes.substring(0, 50)}{s.notes.length > 50 ? '...' : ''}</div>
                        )}
                      </td>
                      <td>{s.date_collected || '—'}</td>
                      <td>{s.experiment || '—'}</td>
                      <td>{s.organism_strain || '—'}</td>
                      <td style={{fontSize:'0.85rem'}}>{formatLocation(s)}</td>
                      <td>{s.quantity != null ? `${s.quantity} ${s.quantity_unit || ''}` : '—'}</td>
                      <td><span className={`badge ${statusBadge.class}`}>{statusBadge.text}</span></td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(s)} style={{marginRight:4}}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
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

            <div className="form-group">
              <label>Experiment</label>
              <input value={form.experiment} onChange={(e) => setForm({...form, experiment: e.target.value})} placeholder="e.g., TBI Study Cohort 3" />
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
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingSample ? 'Save Changes' : 'Add Sample'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Samples;
