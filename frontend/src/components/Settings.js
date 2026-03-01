import React, { useState } from 'react';
import { authAPI } from '../api';

function Settings({ user, setUser }) {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [defaultAlertDays, setDefaultAlertDays] = useState(user.default_alert_days || 30);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    try {
      setError('');
      const res = await authAPI.updateSettings({
        display_name: displayName,
        default_alert_days: parseInt(defaultAlertDays),
      });
      const updatedUser = res.data;
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>⚙️ Settings</h2>
        </div>

        {error && <div style={{background:'#fde8e8',color:'#e74c3c',padding:'10px 14px',borderRadius:8,marginBottom:16}}>{error}</div>}
        {saved && <div style={{background:'#d4edda',color:'#27ae60',padding:'10px 14px',borderRadius:8,marginBottom:16}}>✅ Settings saved!</div>}

        <div className="form-group">
          <label>Display Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div className="form-group">
          <label>Default Expiration Alert (days before)</label>
          <input
            type="number"
            value={defaultAlertDays}
            onChange={(e) => setDefaultAlertDays(e.target.value)}
            min="1"
            max="365"
          />
          <p style={{fontSize:'0.85rem', color:'#888', marginTop:4}}>
            This is the default number of days before expiration to receive an alert.
            You can override this per reagent.
          </p>
        </div>

        <div className="form-group">
          <label>Email</label>
          <input value={user.email} disabled style={{background:'#f5f5f5'}} />
          <p style={{fontSize:'0.85rem', color:'#888', marginTop:4}}>Email cannot be changed.</p>
        </div>

        <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
      </div>
    </div>
  );
}

export default Settings;
