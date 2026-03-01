import React, { useState, useEffect } from 'react';
import { catalogAPI } from '../api';

function Catalog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [form, setForm] = useState({ name: '', catalog_number: '', vendor: '', source_url: '', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      const res = await catalogAPI.getAll(params);
      setItems(res.data);
    } catch (err) {
      setError('Failed to load catalog: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search]);

  const openManualAdd = () => {
    setForm({ name: '', catalog_number: '', vendor: '', source_url: '', description: '' });
    setShowAddModal(true);
  };

  const openScrape = () => {
    setScrapeUrl('');
    setShowScrapeModal(true);
  };

  const handleScrape = async () => {
    if (!scrapeUrl) return;
    setScraping(true);
    try {
      const res = await catalogAPI.scrape(scrapeUrl);
      const d = res.data;
      setForm({
        name: d.name || '',
        catalog_number: d.catalog_number || '',
        vendor: d.vendor || '',
        source_url: d.source_url || scrapeUrl,
        description: d.description || ''
      });
      setShowScrapeModal(false);
      setShowAddModal(true);
    } catch (err) {
      alert('Failed to scrape URL: ' + (err.response?.data?.error || err.message));
    } finally {
      setScraping(false);
    }
  };

  const handleSave = async () => {
    if (!form.name) { alert('Name is required'); return; }
    setSaving(true);
    try {
      await catalogAPI.create(form);
      setShowAddModal(false);
      setLoading(true);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this item from the catalog?')) return;
    try {
      await catalogAPI.delete(id);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  if (loading) return <div className="loading">Loading catalog...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div><button className="btn btn-primary" onClick={() => { setError(''); setLoading(true); fetchData(); }}>Retry</button></div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>📚 Reagent Catalog ({items.length})</h2>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-primary" onClick={openScrape}>🔗 Add from URL</button>
            <button className="btn btn-secondary" onClick={openManualAdd}>✏️ Add Manually</button>
          </div>
        </div>

        <p style={{color:'#666', marginBottom:16, fontSize:'0.9rem'}}>
          Shared reagent library — paste a vendor URL to auto-fill product details, or add manually. When adding reagents to your inventory, you can pick from this catalog.
        </p>

        <div className="search-bar">
          <input
            type="text"
            placeholder="Search catalog by name, catalog #, or vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📚</div>
            <p>No items in the catalog yet. Add your first reagent!</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Catalog #</th>
                  <th>Vendor</th>
                  <th>Link</th>
                  <th>Added By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      {item.description && (
                        <div style={{fontSize:'0.8rem', color:'#888', marginTop:2}}>
                          {item.description.substring(0, 80)}{item.description.length > 80 ? '...' : ''}
                        </div>
                      )}
                    </td>
                    <td>{item.catalog_number || '—'}</td>
                    <td>{item.vendor || '—'}</td>
                    <td>
                      {item.source_url ? (
                        <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{fontSize:'0.85rem'}}>🔗 View</a>
                      ) : '—'}
                    </td>
                    <td style={{fontSize:'0.85rem'}}>{item.added_by || '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scrape Modal */}
      {showScrapeModal && (
        <div className="modal-overlay" onClick={() => setShowScrapeModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🔗 Add from Vendor URL</h2>
            <p style={{color:'#666', marginBottom:16, fontSize:'0.9rem'}}>
              Paste a product URL from Thermo Fisher, Sigma-Aldrich, Abcam, Cell Signaling, Bio-Rad, or other vendors.
            </p>
            <div className="form-group">
              <label>Product URL *</label>
              <input
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                placeholder="https://www.thermofisher.com/order/catalog/product/H3570"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowScrapeModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleScrape} disabled={scraping || !scrapeUrl}>
                {scraping ? 'Fetching...' : 'Fetch Product Info'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add to Catalog</h2>
            <div className="form-group">
              <label>Product Name *</label>
              <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Catalog #</label>
                <input value={form.catalog_number} onChange={(e) => setForm({...form, catalog_number: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Vendor</label>
                <input value={form.vendor} onChange={(e) => setForm({...form, vendor: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label>Source URL</label>
              <input value={form.source_url} onChange={(e) => setForm({...form, source_url: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({...form, description: e.target.value})}
                rows={3}
                style={{resize:'vertical'}}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Add to Catalog'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Catalog;
