import React, { useState, useEffect } from 'react';
import { reagentAPI } from '../api';

function Notifications() {
  const [data, setData] = useState({ lowStock: [], expiring: [], expired: [] });
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const res = await reagentAPI.getNotifications();
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markOrdered = async (id) => {
    try {
      await reagentAPI.update(id, { is_ordered: 1 });
      fetchNotifications();
    } catch (err) {
      alert('Failed to update');
    }
  };

  const clearLowStock = async (id) => {
    try {
      await reagentAPI.update(id, { is_low_stock: 0, is_ordered: 0 });
      fetchNotifications();
    } catch (err) {
      alert('Failed to update');
    }
  };

  const daysUntil = (dateStr) => {
    const now = new Date();
    const d = new Date(dateStr);
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  };

  if (loading) return <div className="loading">Loading notifications...</div>;

  const totalAlerts = data.lowStock.length + data.expiring.length + data.expired.length;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>🔔 Notifications</h2>
          {totalAlerts > 0 && <span className="notification-count" style={{fontSize:'1rem',width:'auto',padding:'4px 12px',borderRadius:12}}>{totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}</span>}
        </div>

        {totalAlerts === 0 && (
          <div className="empty-state">
            <div className="emoji">✅</div>
            <p>No alerts! All reagents are stocked and within expiration dates.</p>
          </div>
        )}

        {/* Expired */}
        {data.expired.length > 0 && (
          <div className="notification-section">
            <h3>🚨 Expired <span className="notification-count">{data.expired.length}</span></h3>
            {data.expired.map(r => (
              <div key={r.id} className="notification-item" style={{borderLeft:'4px solid #e74c3c'}}>
                <div className="reagent-info">
                  <div className="reagent-name">{r.name}</div>
                  <div className="reagent-detail">
                    Expired {Math.abs(daysUntil(r.expiration_date))} days ago
                    {r.vendor && ` • ${r.vendor}`}
                    {r.unit_name && ` • ${r.unit_name}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Expiring Soon */}
        {data.expiring.length > 0 && (
          <div className="notification-section">
            <h3>⏰ Expiring Soon <span className="notification-count">{data.expiring.length}</span></h3>
            {data.expiring.filter(r => daysUntil(r.expiration_date) >= 0).map(r => (
              <div key={r.id} className="notification-item" style={{borderLeft:'4px solid #f39c12'}}>
                <div className="reagent-info">
                  <div className="reagent-name">{r.name}</div>
                  <div className="reagent-detail">
                    Expires in {daysUntil(r.expiration_date)} days ({r.expiration_date})
                    {r.vendor && ` • ${r.vendor}`}
                    {r.unit_name && ` • ${r.unit_name}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Low Stock */}
        {data.lowStock.length > 0 && (
          <div className="notification-section">
            <h3>⚠️ Low Stock <span className="notification-count">{data.lowStock.length}</span></h3>
            {data.lowStock.map(r => (
              <div key={r.id} className="notification-item" style={{borderLeft: r.is_ordered ? '4px solid #3498db' : '4px solid #f39c12'}}>
                <div className="reagent-info">
                  <div className="reagent-name">
                    {r.name}
                    {r.is_ordered && <span className="badge badge-info" style={{marginLeft:8}}>Ordered</span>}
                  </div>
                  <div className="reagent-detail">
                    {r.vendor && `${r.vendor} • `}
                    {r.quantity != null ? `${r.quantity} ${r.quantity_unit || ''} remaining` : 'Quantity unknown'}
                  </div>
                </div>
                <div style={{display:'flex', gap:6}}>
                  {!r.is_ordered && (
                    <button className="btn btn-sm btn-info" style={{background:'#3498db',color:'white'}} onClick={() => markOrdered(r.id)}>
                      Mark Ordered
                    </button>
                  )}
                  <button className="btn btn-sm btn-success" onClick={() => clearLowStock(r.id)}>
                    ✓ Restocked
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Notifications;
