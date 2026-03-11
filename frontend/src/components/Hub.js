import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hubAPI } from '../api';

function Hub({ user }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    hubAPI.getSummary()
      .then(res => setSummary(res.data))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = user?.display_name || user?.email?.split('@')[0] || 'Researcher';

  return (
    <div className="hub-container">
      <div className="hub-welcome">
        <h2>{greeting()}, {displayName}! 👩‍🔬</h2>
        <p className="hub-subtitle">What would you like to work on?</p>
      </div>

      <div className="hub-grid">
        {/* Inventory Card */}
        <div className="hub-card" onClick={() => navigate('/inventory')}>
          <div className="hub-card-icon">📦</div>
          <h3>Inventory</h3>
          <p className="hub-card-desc">Manage reagents, samples, and storage</p>
          {loading ? (
            <div className="hub-card-stats">Loading...</div>
          ) : summary ? (
            <div className="hub-card-stats">
              <span>{summary.inventory.reagent_count} reagent{summary.inventory.reagent_count !== 1 ? 's' : ''}</span>
              <span>{summary.inventory.sample_count} sample{summary.inventory.sample_count !== 1 ? 's' : ''}</span>
              {summary.inventory.low_stock_count > 0 && (
                <span className="hub-stat-alert">⚠️ {summary.inventory.low_stock_count} low stock</span>
              )}
              {summary.inventory.expiring_count > 0 && (
                <span className="hub-stat-alert">⏰ {summary.inventory.expiring_count} expiring</span>
              )}
            </div>
          ) : (
            <div className="hub-card-stats">—</div>
          )}
          <div className="hub-card-action">Open →</div>
        </div>

        {/* Notebook Card */}
        <div className="hub-card" onClick={() => navigate('/notebook')}>
          <div className="hub-card-icon">📓</div>
          <h3>Notebook</h3>
          <p className="hub-card-desc">Lab notebook with project tracking</p>
          {loading ? (
            <div className="hub-card-stats">Loading...</div>
          ) : summary ? (
            <div className="hub-card-stats">
              <span>📁 {summary.notebook.project_count || 0} project{(summary.notebook.project_count || 0) !== 1 ? 's' : ''}</span>
              <span>🧪 {summary.notebook.experiment_count} experiment{summary.notebook.experiment_count !== 1 ? 's' : ''}</span>
              {summary.notebook.recent_entry_count > 0 && (
                <span>📝 {summary.notebook.recent_entry_count} entries this week</span>
              )}
            </div>
          ) : (
            <div className="hub-card-stats">—</div>
          )}
          <div className="hub-card-action">Open →</div>
        </div>
      </div>
    </div>
  );
}

export default Hub;
