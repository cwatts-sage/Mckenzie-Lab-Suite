import React, { useState, useEffect, useCallback } from 'react';
import { reagentAPI, storageAPI, catalogAPI } from '../api';

function Inventory() {
  const [reagents, setReagents] = useState([]);
  const [storageUnits, setStorageUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [error, setError] = useState('');
  const [editingReagent, setEditingReagent] = useState(null);
  const [form, setForm] = useState(getEmptyForm());

  function getEmptyForm() {
    return {
      name: '', catalog_number: '', lot_number: '', vendor: '', source_url: '',
      storage_location_id: '', special_conditions: '',
      quantity: '', quantity_unit: '', expiration_date: '', alert_days_before: ''
    };
  }

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (filterUnit) params.unit_id = filterUnit;
      if (filterLowStock) params.low_stock = 'true';

      const [reagentsRes, unitsRes, locsRes, catalogRes] = await Promise.all([
        reagentAPI.getAll(params),
        storageAPI.getUnits(),
        storageAPI.getLocations(),
        catalogAPI.getAll(),
      ]);
      setReagents(reagentsRes.data);
      setStorageUnits(unitsRes.data);
      setLocations(locsRes.data);
      setCatalogItems(catalogRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load inventory: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [search, filterUnit, filterLowStock]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAdd = () => {
    setEditingReagent(null);
    setForm(getEmptyForm());
    setShowModal(true);
  };

  const openEdit = (reagent) => {
    setEditingReagent(reagent);
    setForm({
      name: reagent.name || '',
      catalog_number: reagent.catalog_number || '',
      lot_number: reagent.lot_number || '',
      vendor: reagent.vendor || '',
      source_url: reagent.source_url || '',
      storage_location_id: reagent.storage_location_id || '',
      special_conditions: reagent.special_conditions || '',
      quantity: reagent.quantity ?? '',
      quantity_unit: reagent.quantity_unit || '',
      expiration_date: reagent.expiration_date || '',
      alert_days_before: reagent.alert_days_before ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        ...form,
        quantity: form.quantity !== '' ? parseFloat(form.quantity) : null,
        alert_days_before: form.alert_days_before !== '' ? parseInt(form.alert_days_before) : null,
        storage_location_id: form.storage_location_id || null,
      };

      if (editingReagent) {
        await reagentAPI.update(editingReagent.id, data);
      } else {
        await reagentAPI.create(data);
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this reagent?')) return;
    try {
      await reagentAPI.delete(id);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const toggleLowStock = async (reagent) => {
    try {
      await reagentAPI.update(reagent.id, { is_low_stock: reagent.is_low_stock ? 0 : 1 });
      fetchData();
    } catch (err) {
      alert('Failed to update');
    }
  };

  const formatLocation = (r) => {
    const parts = [];
    if (r.unit_name) parts.push(r.unit_name);
    if (r.rack) parts.push(`Rack ${r.rack}`);
    if (r.box) parts.push(`Box ${r.box}`);
    if (r.position) parts.push(`Pos ${r.position}`);
    return parts.join(' → ') || '—';
  };

  const getExpirationStatus = (date) => {
    if (!date) return null;
    const now = new Date();
    const exp = new Date(date);
    const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { class: 'badge-danger', text: 'Expired' };
    if (daysLeft <= 30) return { class: 'badge-warning', text: `${daysLeft}d left` };
    return { class: 'badge-success', text: `${daysLeft}d left` };
  };

  if (loading) return <div className="loading">Loading inventory...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div><button className="btn btn-primary" onClick={() => { setError(''); setLoading(true); fetchData(); }}>Retry</button></div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>Reagent Inventory ({reagents.length})</h2>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Reagent</button>
            <button className="btn btn-secondary" onClick={() => { setShowCatalogPicker(true); setCatalogSearch(''); }}>📚 From Catalog</button>
          </div>
        </div>

        <div className="search-bar">
          <input
            type="text"
            placeholder="Search by name, catalog #, or vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
            <option value="">All Storage</option>
            {storageUnits.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.temperature})</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={filterLowStock} onChange={(e) => setFilterLowStock(e.target.checked)} />
            Low Stock Only
          </label>
        </div>

        {reagents.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🧪</div>
            <p>No reagents yet. Add your first one!</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Catalog #</th>
                  <th>Vendor</th>
                  <th>Location</th>
                  <th>Qty</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reagents.map(r => {
                  const expStatus = getExpirationStatus(r.expiration_date);
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        {r.source_url && (
                          <> <a href={r.source_url} target="_blank" rel="noopener noreferrer" style={{fontSize:'0.8rem'}}>🔗</a></>
                        )}
                      </td>
                      <td>{r.catalog_number || '—'}</td>
                      <td>{r.vendor || '—'}</td>
                      <td style={{fontSize:'0.85rem'}}>{formatLocation(r)}</td>
                      <td>{r.quantity != null ? `${r.quantity} ${r.quantity_unit || ''}` : '—'}</td>
                      <td>
                        {r.expiration_date ? (
                          <span>
                            {r.expiration_date}
                            {expStatus && <span className={`badge ${expStatus.class}`} style={{marginLeft:6}}>{expStatus.text}</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {r.is_low_stock ? <span className="badge badge-warning">Low Stock</span> : null}
                        {r.is_ordered ? <span className="badge badge-info" style={{marginLeft:4}}>Ordered</span> : null}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)} style={{marginRight:4}}>Edit</button>
                        <button className="btn btn-sm btn-warning" onClick={() => toggleLowStock(r)} style={{marginRight:4}}>
                          {r.is_low_stock ? '✓ Stocked' : '⚠️ Low'}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>🗑️</button>
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
            <h2>{editingReagent ? 'Edit Reagent' : 'Add Reagent'}</h2>

            <div className="form-group">
              <label>Name *</label>
              <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g., Anti-CD3 Antibody" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Catalog #</label>
                <input value={form.catalog_number} onChange={(e) => setForm({...form, catalog_number: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Lot #</label>
                <input value={form.lot_number} onChange={(e) => setForm({...form, lot_number: e.target.value})} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Vendor</label>
                <input value={form.vendor} onChange={(e) => setForm({...form, vendor: e.target.value})} placeholder="e.g., Thermo Fisher" />
              </div>
              <div className="form-group">
                <label>Source URL</label>
                <input value={form.source_url} onChange={(e) => setForm({...form, source_url: e.target.value})} placeholder="https://..." />
              </div>
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

            <div className="form-group">
              <label>Special Conditions</label>
              <input value={form.special_conditions} onChange={(e) => setForm({...form, special_conditions: e.target.value})} placeholder="e.g., Light-sensitive, keep desiccated" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" step="any" value={form.quantity} onChange={(e) => setForm({...form, quantity: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Unit</label>
                <input value={form.quantity_unit} onChange={(e) => setForm({...form, quantity_unit: e.target.value})} placeholder="e.g., µL, mg, vials" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Expiration Date</label>
                <input type="date" value={form.expiration_date} onChange={(e) => setForm({...form, expiration_date: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Alert Days Before</label>
                <input type="number" value={form.alert_days_before} onChange={(e) => setForm({...form, alert_days_before: e.target.value})} placeholder="Default from settings" />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingReagent ? 'Save Changes' : 'Add Reagent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Picker Modal */}
      {showCatalogPicker && (
        <div className="modal-overlay" onClick={() => setShowCatalogPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:700}}>
            <h2>📚 Pick from Catalog</h2>
            <div className="form-group">
              <input
                type="text"
                placeholder="Search catalog..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                autoFocus
              />
            </div>
            {catalogItems.length === 0 ? (
              <div className="empty-state">
                <div className="emoji">📚</div>
                <p>No items in the catalog yet. Add some from the Catalog tab first!</p>
              </div>
            ) : (
              <div style={{maxHeight:400, overflowY:'auto'}}>
                {catalogItems
                  .filter(c => {
                    if (!catalogSearch) return true;
                    const s = catalogSearch.toLowerCase();
                    return (c.name || '').toLowerCase().includes(s) ||
                           (c.catalog_number || '').toLowerCase().includes(s) ||
                           (c.vendor || '').toLowerCase().includes(s);
                  })
                  .map(c => (
                    <div
                      key={c.id}
                      style={{
                        padding:'12px 16px', border:'1px solid #eee', borderRadius:8,
                        marginBottom:8, cursor:'pointer', transition:'background 0.15s'
                      }}
                      onClick={() => {
                        setForm({
                          ...getEmptyForm(),
                          name: c.name || '',
                          catalog_number: c.catalog_number || '',
                          vendor: c.vendor || '',
                          source_url: c.source_url || '',
                        });
                        setEditingReagent(null);
                        setShowCatalogPicker(false);
                        setShowModal(true);
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                    >
                      <strong>{c.name}</strong>
                      <div style={{fontSize:'0.85rem', color:'#666'}}>
                        {c.catalog_number && `Cat# ${c.catalog_number}`}
                        {c.catalog_number && c.vendor && ' • '}
                        {c.vendor}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCatalogPicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory;
