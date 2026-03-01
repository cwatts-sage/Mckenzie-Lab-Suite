import React, { useState, useEffect } from 'react';
import { storageAPI } from '../api';

function Storage() {
  const [units, setUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [unitForm, setUnitForm] = useState({ name: '', temperature: '', type: 'freezer' });
  const [locationForm, setLocationForm] = useState({ storage_unit_id: '', rack: '', box: '', position: '' });

  const fetchData = async () => {
    try {
      const [unitsRes, locsRes] = await Promise.all([
        storageAPI.getUnits(),
        storageAPI.getLocations(),
      ]);
      setUnits(unitsRes.data);
      setLocations(locsRes.data);
    } catch (err) {
      console.error('Failed to fetch storage data:', err);
      setError('Failed to load storage data: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Storage Unit handlers
  const openAddUnit = () => {
    setEditingUnit(null);
    setUnitForm({ name: '', temperature: '', type: 'freezer' });
    setShowUnitModal(true);
  };

  const openEditUnit = (unit) => {
    setEditingUnit(unit);
    setUnitForm({ name: unit.name, temperature: unit.temperature || '', type: unit.type || 'other' });
    setShowUnitModal(true);
  };

  const saveUnit = async () => {
    try {
      if (editingUnit) {
        await storageAPI.updateUnit(editingUnit.id, unitForm);
      } else {
        await storageAPI.createUnit(unitForm);
      }
      setShowUnitModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  const deleteUnit = async (id) => {
    if (!window.confirm('Delete this storage unit and all its locations?')) return;
    try {
      await storageAPI.deleteUnit(id);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  // Location handlers
  const openAddLocation = (unitId) => {
    setLocationForm({ storage_unit_id: unitId || '', rack: '', box: '', position: '' });
    setShowLocationModal(true);
  };

  const saveLocation = async () => {
    try {
      await storageAPI.createLocation(locationForm);
      setShowLocationModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  const deleteLocation = async (id) => {
    if (!window.confirm('Delete this location?')) return;
    try {
      await storageAPI.deleteLocation(id);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  if (loading) return <div className="loading">Loading storage...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div><button className="btn btn-primary" onClick={() => { setError(''); setLoading(true); fetchData(); }}>Retry</button></div>;

  // Group locations by unit
  const locationsByUnit = {};
  locations.forEach(l => {
    if (!locationsByUnit[l.storage_unit_id]) locationsByUnit[l.storage_unit_id] = [];
    locationsByUnit[l.storage_unit_id].push(l);
  });

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>🗄️ Storage Management</h2>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-primary" onClick={openAddUnit}>+ Add Storage Unit</button>
            <button className="btn btn-secondary" onClick={() => openAddLocation()}>+ Add Location</button>
          </div>
        </div>

        {units.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🗄️</div>
            <p>No storage units defined yet. Add your freezers, fridges, and shelves!</p>
          </div>
        ) : (
          units.map(unit => (
            <div key={unit.id} style={{border:'1px solid #eee', borderRadius:8, padding:16, marginBottom:12}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                <div>
                  <strong style={{fontSize:'1.1rem'}}>{unit.name}</strong>
                  {unit.temperature && <span className="badge badge-info" style={{marginLeft:8}}>{unit.temperature}</span>}
                  <span className="badge badge-success" style={{marginLeft:8}}>{unit.type}</span>
                </div>
                <div style={{display:'flex', gap:6}}>
                  <button className="btn btn-sm btn-secondary" onClick={() => openAddLocation(unit.id)}>+ Location</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEditUnit(unit)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteUnit(unit.id)}>🗑️</button>
                </div>
              </div>

              {locationsByUnit[unit.id]?.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Rack</th>
                      <th>Box</th>
                      <th>Position</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locationsByUnit[unit.id].map(loc => (
                      <tr key={loc.id}>
                        <td>{loc.rack || '—'}</td>
                        <td>{loc.box || '—'}</td>
                        <td>{loc.position || '—'}</td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteLocation(loc.id)}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{color:'#999', fontSize:'0.9rem'}}>No locations defined for this unit yet.</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Unit Modal */}
      {showUnitModal && (
        <div className="modal-overlay" onClick={() => setShowUnitModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingUnit ? 'Edit Storage Unit' : 'Add Storage Unit'}</h2>
            <div className="form-group">
              <label>Name *</label>
              <input value={unitForm.name} onChange={(e) => setUnitForm({...unitForm, name: e.target.value})} placeholder="e.g., -80°C Freezer #2" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Temperature</label>
                <input value={unitForm.temperature} onChange={(e) => setUnitForm({...unitForm, temperature: e.target.value})} placeholder="e.g., -80°C" />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={unitForm.type} onChange={(e) => setUnitForm({...unitForm, type: e.target.value})}>
                  <option value="freezer">Freezer</option>
                  <option value="fridge">Fridge</option>
                  <option value="shelf">Shelf</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowUnitModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveUnit}>{editingUnit ? 'Save' : 'Add Unit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <div className="modal-overlay" onClick={() => setShowLocationModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Storage Location</h2>
            <div className="form-group">
              <label>Storage Unit *</label>
              <select value={locationForm.storage_unit_id} onChange={(e) => setLocationForm({...locationForm, storage_unit_id: e.target.value})}>
                <option value="">— Select unit —</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.temperature})</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Rack</label>
                <input value={locationForm.rack} onChange={(e) => setLocationForm({...locationForm, rack: e.target.value})} placeholder="e.g., 3" />
              </div>
              <div className="form-group">
                <label>Box</label>
                <input value={locationForm.box} onChange={(e) => setLocationForm({...locationForm, box: e.target.value})} placeholder="e.g., B" />
              </div>
            </div>
            <div className="form-group">
              <label>Position</label>
              <input value={locationForm.position} onChange={(e) => setLocationForm({...locationForm, position: e.target.value})} placeholder="e.g., 12 (optional)" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowLocationModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveLocation}>Add Location</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Storage;
