import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Hub from './components/Hub';
import Inventory from './components/Inventory';
import Samples from './components/Samples';
import Notifications from './components/Notifications';
import Storage from './components/Storage';
import Catalog from './components/Catalog';
import Export from './components/Export';
import Settings from './components/Settings';
import Admin from './components/Admin';
import Notebook from './components/Notebook';
import Experiments from './components/Experiments';
import ExperimentDetail from './components/ExperimentDetail';
import './App.css';

function SubNav() {
  const location = useLocation();

  if (location.pathname.startsWith('/inventory')) {
    return (
      <div className="sub-nav">
        <NavLink to="/inventory" end className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>📋 Reagents</NavLink>
        <NavLink to="/inventory/samples" className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>🧫 Samples</NavLink>
        <NavLink to="/inventory/notifications" className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>🔔 Alerts</NavLink>
        <NavLink to="/inventory/storage" className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>🗄️ Storage</NavLink>
        <NavLink to="/inventory/catalog" className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>📚 Catalog</NavLink>
        <NavLink to="/inventory/export" className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>📄 Export</NavLink>
      </div>
    );
  }

  if (location.pathname.startsWith('/notebook')) {
    return (
      <div className="sub-nav">
        <NavLink to="/notebook" end className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>📝 Entries</NavLink>
        <NavLink to="/notebook/experiments" end className={({ isActive }) => isActive ? 'sub-nav-link active' : 'sub-nav-link'}>🧪 Experiments</NavLink>
      </div>
    );
  }

  return null;
}

function AppContent({ user, setUser, handleLogout }) {
  const location = useLocation();
  return (
    <div className="app">
      <header className="app-header">
        <NavLink to="/" className="app-title-link">
          <h1>🔬 Lab Suite</h1>
        </NavLink>
        <div className="header-right">
          <span className="user-name">{user.display_name || user.email}</span>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </header>
      <nav className="app-nav">
        <div className="nav-left">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            🏠 Hub
          </NavLink>
          <NavLink to="/inventory" className={({ isActive }) => `nav-link ${isActive || location.pathname.startsWith('/inventory') ? 'active' : ''}`}>
            📦 Inventory
          </NavLink>
          <NavLink to="/notebook" className={({ isActive }) => `nav-link ${isActive || location.pathname.startsWith('/notebook') ? 'active' : ''}`}>
            📓 Notebook
          </NavLink>
        </div>
        <div className="nav-right">
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            ⚙️
          </NavLink>
          {user.is_admin && (
            <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              🔐
            </NavLink>
          )}
        </div>
      </nav>
      <SubNav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Hub user={user} />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory/samples" element={<Samples />} />
          <Route path="/inventory/notifications" element={<Notifications />} />
          <Route path="/inventory/storage" element={<Storage />} />
          <Route path="/inventory/catalog" element={<Catalog />} />
          <Route path="/inventory/export" element={<Export />} />
          <Route path="/notebook" element={<Notebook />} />
          <Route path="/notebook/experiments" element={<Experiments />} />
          <Route path="/notebook/experiments/:id" element={<ExperimentDetail />} />
          <Route path="/settings" element={<Settings user={user} setUser={setUser} />} />
          {user.is_admin && <Route path="/admin" element={<Admin />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <AppContent user={user} setUser={setUser} handleLogout={handleLogout} />
    </Router>
  );
}

export default App;
