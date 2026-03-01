import React, { useState, useEffect } from 'react';
import { adminAPI } from '../api';

function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const fetchUsers = async () => {
    try {
      setError('');
      const res = await adminAPI.getUsers();
      setUsers(res.data);
    } catch (err) {
      if (err.response?.status === 403) {
        setError('You do not have admin access.');
      } else {
        setError('Failed to load users: ' + (err.response?.data?.error || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showMsg = (msg) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleApprove = async (id) => {
    try {
      const res = await adminAPI.approveUser(id);
      showMsg(res.data.message || 'User approved');
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve user');
    }
  };

  const handleDisable = async (id) => {
    if (!window.confirm('Disable this user? They will not be able to log in.')) return;
    try {
      const res = await adminAPI.disableUser(id);
      showMsg(res.data.message || 'User disabled');
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to disable user');
    }
  };

  const handleEnable = async (id) => {
    try {
      const res = await adminAPI.enableUser(id);
      showMsg(res.data.message || 'User enabled');
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to enable user');
    }
  };

  const handleDelete = async (id, email) => {
    if (!window.confirm(`Permanently delete ${email} and ALL their data? This cannot be undone.`)) return;
    try {
      const res = await adminAPI.deleteUser(id);
      showMsg(res.data.message || 'User deleted');
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  if (loading) return <div className="loading">Loading users...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div></div>;

  const pendingUsers = users.filter(u => !u.is_approved && !u.is_disabled);
  const activeUsers = users.filter(u => u.is_approved && !u.is_disabled);
  const disabledUsers = users.filter(u => u.is_disabled);

  return (
    <div>
      {actionMsg && (
        <div style={{background:'#d4edda',color:'#27ae60',padding:'10px 16px',borderRadius:8,marginBottom:16,fontWeight:500}}>
          ✅ {actionMsg}
        </div>
      )}

      {/* Pending Approval */}
      {pendingUsers.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>⏳ Pending Approval ({pendingUsers.length})</h2>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.display_name || '—'}</td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-success" onClick={() => handleApprove(u.id)} style={{marginRight:6}}>
                        ✅ Approve
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id, u.email)}>
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Users */}
      <div className="card">
        <div className="card-header">
          <h2>👥 Active Users ({activeUsers.length})</h2>
        </div>
        {activeUsers.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">👥</div>
            <p>No active users.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.display_name || '—'}</td>
                    <td>
                      {u.is_admin ? (
                        <span className="badge badge-warning">Admin</span>
                      ) : (
                        <span className="badge badge-info">User</span>
                      )}
                    </td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      {!u.is_admin && (
                        <>
                          <button className="btn btn-sm btn-warning" onClick={() => handleDisable(u.id)} style={{marginRight:6}}>
                            🚫 Disable
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id, u.email)}>
                            🗑️ Delete
                          </button>
                        </>
                      )}
                      {u.is_admin && <span style={{color:'#888', fontSize:'0.85rem'}}>Protected</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disabled Users */}
      {disabledUsers.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>🚫 Disabled Users ({disabledUsers.length})</h2>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {disabledUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.display_name || '—'}</td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-success" onClick={() => handleEnable(u.id)} style={{marginRight:6}}>
                        ✅ Enable
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id, u.email)}>
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
