import React, { useState } from 'react';
import { authAPI } from '../api';

function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [pendingMessage, setPendingMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPendingMessage('');
    setLoading(true);

    try {
      let res;
      if (isRegister) {
        res = await authAPI.register({ email, password, displayName });
        if (res.data.pending) {
          setPendingMessage(res.data.message);
          setLoading(false);
          return;
        }
      } else {
        res = await authAPI.login({ email, password });
      }
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>🔬 Lab Suite</h1>
        <p className="subtitle">{isRegister ? 'Create your account' : 'Sign in to continue'}</p>

        {error && <div className="error">{error}</div>}
        {pendingMessage && <div style={{background:'#d6eaf8',color:'#2c3e50',padding:'12px 14px',borderRadius:8,marginBottom:16,fontSize:'0.9rem'}}>⏳ {pendingMessage}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label>Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="toggle">
          {isRegister ? (
            <>Already have an account? <a onClick={() => { setIsRegister(false); setError(''); }}>Sign in</a></>
          ) : (
            <>Need an account? <a onClick={() => { setIsRegister(true); setError(''); }}>Register</a></>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
