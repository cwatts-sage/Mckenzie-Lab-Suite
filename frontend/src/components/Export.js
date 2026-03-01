import React, { useState, useEffect } from 'react';
import { reagentAPI } from '../api';

function Export() {
  const [reagents, setReagents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [formatted, setFormatted] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReagents = async () => {
      try {
        const res = await reagentAPI.getAll();
        setReagents(res.data);
      } catch (err) {
        console.error('Failed to fetch:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReagents();
  }, []);

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === reagents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(reagents.map(r => r.id)));
    }
  };

  const generateExport = async () => {
    try {
      const ids = Array.from(selected);
      const res = await reagentAPI.export(ids.length > 0 ? ids : undefined);
      setFormatted(res.data.formatted);
    } catch (err) {
      alert('Failed to generate export');
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = formatted;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>📄 Materials Export</h2>
          <button className="btn btn-primary" onClick={generateExport}>
            Generate Export
          </button>
        </div>

        <p style={{color:'#666', marginBottom:16, fontSize:'0.9rem'}}>
          Select reagents to include in your Materials & Methods section, then click "Generate Export".
        </p>

        {reagents.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📋</div>
            <p>No reagents in inventory yet.</p>
          </div>
        ) : (
          <>
            <div style={{marginBottom:12}}>
              <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:'0.9rem'}}>
                <input
                  type="checkbox"
                  checked={selected.size === reagents.length}
                  onChange={selectAll}
                />
                Select All ({selected.size} of {reagents.length} selected)
              </label>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{width:40}}></th>
                    <th>Name</th>
                    <th>Catalog #</th>
                    <th>Vendor</th>
                    <th>Lot #</th>
                  </tr>
                </thead>
                <tbody>
                  {reagents.map(r => (
                    <tr key={r.id} onClick={() => toggleSelect(r.id)} style={{cursor:'pointer'}}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td><strong>{r.name}</strong></td>
                      <td>{r.catalog_number || '—'}</td>
                      <td>{r.vendor || '—'}</td>
                      <td>{r.lot_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Export Output */}
      {formatted && (
        <div className="card">
          <div className="card-header">
            <h2>Formatted Output</h2>
            <button className="btn btn-success" onClick={copyToClipboard}>
              {copied ? '✅ Copied!' : '📋 Copy to Clipboard'}
            </button>
          </div>
          <pre style={{
            background:'#f8f9fa',
            padding:16,
            borderRadius:8,
            whiteSpace:'pre-wrap',
            wordBreak:'break-word',
            fontSize:'0.9rem',
            lineHeight:1.6,
            border:'1px solid #eee'
          }}>
            {formatted}
          </pre>
        </div>
      )}
    </div>
  );
}

export default Export;
