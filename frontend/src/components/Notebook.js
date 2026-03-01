import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { notebookAPI, experimentAPI, reagentAPI, sampleAPI } from '../api';

const ENTRY_TYPES = [
  { value: 'protocol', label: '📋 Protocol', desc: 'Steps followed' },
  { value: 'observation', label: '👁️ Observation', desc: 'What was seen/measured' },
  { value: 'result', label: '📊 Result', desc: 'Data & conclusions' },
  { value: 'note', label: '📝 Note', desc: 'General notes' },
];

function Notebook() {
  const [entries, setEntries] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [reagents, setReagents] = useState([]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showHistory, setShowHistory] = useState(null);
  const [history, setHistory] = useState([]);
  const [expandedEntry, setExpandedEntry] = useState(null);

  // Filters
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterExperiment, setFilterExperiment] = useState(searchParams.get('experiment') || '');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('chronological'); // chronological | weekly

  // Form
  const emptyForm = { title: '', content: '', experiment_id: '', entry_date: new Date().toISOString().split('T')[0], entry_type: 'note', linked_items: [] };
  const [form, setForm] = useState(emptyForm);

  // @-mention
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
  const contentRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (filterExperiment) params.experiment_id = filterExperiment;
      if (filterType) params.type = filterType;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      if (search) params.search = search;

      const [entriesRes, expRes, reagentsRes, samplesRes] = await Promise.all([
        notebookAPI.getAll(params),
        experimentAPI.getAll(),
        reagentAPI.getAll(),
        sampleAPI.getAll(),
      ]);
      setEntries(entriesRes.data);
      setExperiments(expRes.data);
      setReagents(reagentsRes.data);
      setSamples(samplesRes.data);
    } catch (err) {
      setError('Failed to load notebook: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [filterExperiment, filterType, filterDateFrom, filterDateTo, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => {
    setForm({ ...emptyForm, experiment_id: filterExperiment || '', entry_date: new Date().toISOString().split('T')[0] });
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (entry) => {
    setForm({
      title: entry.title, content: entry.content,
      experiment_id: entry.experiment_id || '',
      entry_date: entry.entry_date,
      entry_type: entry.entry_type,
      linked_items: entry.linked_items || []
    });
    setEditing(entry);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title) { alert('Title is required'); return; }
    try {
      if (editing) {
        await notebookAPI.update(editing.id, form);
      } else {
        await notebookAPI.create(form);
      }
      setShowModal(false);
      setLoading(true);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (entry) => {
    if (!window.confirm('Delete this notebook entry?')) return;
    try {
      await notebookAPI.delete(entry.id);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const viewHistory = async (entry) => {
    try {
      const res = await notebookAPI.getHistory(entry.id);
      setHistory(res.data);
      setShowHistory(entry);
    } catch (err) {
      alert('Failed to load history');
    }
  };

  // @-mention handling
  const handleContentChange = (e) => {
    const val = e.target.value;
    setForm({ ...form, content: val });

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionSearch(atMatch[1].toLowerCase());
      setMentionOpen(true);
      // Position the dropdown near the textarea cursor
      const textarea = contentRef.current;
      if (textarea) {
        const rect = textarea.getBoundingClientRect();
        setMentionPos({ top: rect.bottom + 4, left: rect.left });
      }
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (type, item) => {
    const name = item.name;
    const id = item.id;

    // Replace @search with the mention text
    const textarea = contentRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = form.content.substring(0, cursorPos);
    const textAfterCursor = form.content.substring(cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      const newBefore = textBeforeCursor.substring(0, atMatch.index) + `@[${name}]`;
      setForm({
        ...form,
        content: newBefore + textAfterCursor,
        linked_items: [...form.linked_items.filter(li => !(li.id === id && li.type === type)), { type, id, name }]
      });
    }

    setMentionOpen(false);

    // Refocus textarea
    setTimeout(() => textarea && textarea.focus(), 50);
  };

  const getMentionResults = () => {
    const s = mentionSearch;
    const results = [];
    reagents.filter(r => (r.name || '').toLowerCase().includes(s) || (r.catalog_number || '').toLowerCase().includes(s))
      .slice(0, 5).forEach(r => results.push({ type: 'reagent', item: r, label: `📦 ${r.name}${r.catalog_number ? ` (${r.catalog_number})` : ''}` }));
    samples.filter(r => (r.name || '').toLowerCase().includes(s))
      .slice(0, 5).forEach(r => results.push({ type: 'sample', item: r, label: `🧫 ${r.name}` }));
    return results;
  };

  const getExperimentName = (id) => {
    const exp = experiments.find(e => e.id === id);
    return exp ? exp.title : 'Unknown';
  };

  const typeInfo = (t) => ENTRY_TYPES.find(et => et.value === t) || ENTRY_TYPES[3];

  // Render content with @mentions highlighted
  const renderContent = (content, linkedItems) => {
    if (!content) return null;
    const parts = content.split(/(@\[[^\]]+\])/g);
    return parts.map((part, i) => {
      const mentionMatch = part.match(/^@\[(.+)\]$/);
      if (mentionMatch) {
        const name = mentionMatch[1];
        const linked = (linkedItems || []).find(li => li.name === name);
        return (
          <span key={i} style={{
            background: linked?.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
            padding: '1px 6px', borderRadius: 4, fontWeight: 500,
            fontSize: '0.9em', cursor: 'default'
          }} title={linked ? `${linked.type}: ${linked.name}` : name}>
            @{name}
          </span>
        );
      }
      // Render newlines
      return part.split('\n').map((line, j) => (
        <React.Fragment key={`${i}-${j}`}>
          {j > 0 && <br />}
          {line}
        </React.Fragment>
      ));
    });
  };

  // Group by date for weekly view
  const groupByDate = () => {
    const groups = {};
    entries.forEach(e => {
      const d = e.entry_date || 'No date';
      if (!groups[d]) groups[d] = [];
      groups[d].push(e);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  if (loading) return <div className="loading">Loading notebook...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div></div>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>📓 Lab Notebook ({entries.length} entries)</h2>
          <button className="btn btn-primary" onClick={openAdd}>+ New Entry</button>
        </div>

        {/* Filters */}
        <div className="search-bar" style={{flexWrap:'wrap'}}>
          <input type="text" placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} style={{minWidth:150}} />
          <select value={filterExperiment} onChange={(e) => { setFilterExperiment(e.target.value); setSearchParams(e.target.value ? {experiment: e.target.value} : {}); }}>
            <option value="">All Experiments</option>
            {experiments.map(exp => <option key={exp.id} value={exp.id}>{exp.title}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} title="From date" />
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} title="To date" />
          <div style={{display:'flex', gap:4}}>
            <button className={`btn btn-sm ${viewMode === 'chronological' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('chronological')}>📅 List</button>
            <button className={`btn btn-sm ${viewMode === 'weekly' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('weekly')}>📆 By Date</button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📓</div>
            <p>No notebook entries yet. Start recording your research!</p>
          </div>
        ) : viewMode === 'weekly' ? (
          // Grouped by date view
          groupByDate().map(([date, dateEntries]) => (
            <div key={date} style={{marginBottom:20}}>
              <h3 style={{fontSize:'1rem', color:'#2c3e50', marginBottom:8, borderBottom:'1px solid #eee', paddingBottom:6}}>
                📅 {date === 'No date' ? date : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                <span style={{color:'#999', fontWeight:400, marginLeft:8}}>({dateEntries.length})</span>
              </h3>
              {dateEntries.map(entry => renderEntryCard(entry))}
            </div>
          ))
        ) : (
          // Chronological list
          entries.map(entry => renderEntryCard(entry))
        )}
      </div>

      {/* Entry Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setMentionOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:700}}>
            <h2>{editing ? 'Edit Entry' : 'New Notebook Entry'}</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Title *</label>
                <input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} autoFocus />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.entry_date} onChange={(e) => setForm({...form, entry_date: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Experiment</label>
                <select value={form.experiment_id} onChange={(e) => setForm({...form, experiment_id: e.target.value})}>
                  <option value="">— No experiment —</option>
                  {experiments.filter(e => e.status === 'active' || e.id === form.experiment_id).map(exp => (
                    <option key={exp.id} value={exp.id}>{exp.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={form.entry_type} onChange={(e) => setForm({...form, entry_type: e.target.value})}>
                  {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{position:'relative'}}>
              <label>Content <span style={{fontWeight:400, color:'#999', fontSize:'0.8rem'}}>— type @ to link a reagent or sample</span></label>
              <textarea
                ref={contentRef}
                value={form.content}
                onChange={handleContentChange}
                rows={10}
                style={{resize:'vertical', fontFamily:'inherit', lineHeight:1.6}}
                placeholder="Record your observations, protocol steps, results...&#10;&#10;Type @ to link a reagent or sample from your inventory."
              />
              {/* @-mention dropdown */}
              {mentionOpen && (
                <div style={{
                  position:'absolute', bottom:'calc(100% - 40px)', left:0, right:0,
                  background:'white', border:'1px solid #ddd', borderRadius:8,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.1)', maxHeight:200, overflowY:'auto', zIndex:200
                }}>
                  {getMentionResults().length === 0 ? (
                    <div style={{padding:12, color:'#999', fontSize:'0.9rem'}}>No matches found</div>
                  ) : getMentionResults().map((r, i) => (
                    <div key={i} style={{padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #f0f0f0', fontSize:'0.9rem'}}
                      onClick={() => insertMention(r.type, r.item)}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                    >
                      {r.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {form.linked_items.length > 0 && (
              <div style={{marginBottom:12}}>
                <label style={{fontSize:'0.85rem', color:'#666', marginBottom:4, display:'block'}}>Linked Items:</label>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {form.linked_items.map((li, i) => (
                    <span key={i} style={{
                      background: li.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                      padding:'4px 10px', borderRadius:12, fontSize:'0.8rem', display:'flex', alignItems:'center', gap:4
                    }}>
                      {li.type === 'reagent' ? '📦' : '🧫'} {li.name}
                      <span style={{cursor:'pointer', marginLeft:4, color:'#e74c3c'}} onClick={() =>
                        setForm({...form, linked_items: form.linked_items.filter((_, j) => j !== i)})
                      }>×</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowModal(false); setMentionOpen(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Create Entry'}</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:700}}>
            <h2>📜 Edit History — {showHistory.title}</h2>
            {history.length === 0 ? (
              <div className="empty-state">
                <p>No edit history for this entry yet.</p>
              </div>
            ) : (
              <div style={{maxHeight:400, overflowY:'auto'}}>
                {history.map((h, i) => (
                  <div key={h.id} style={{borderBottom:'1px solid #eee', padding:12, marginBottom:8}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                      <span style={{fontSize:'0.85rem', fontWeight:600}}>Version {history.length - i}</span>
                      <span style={{fontSize:'0.8rem', color:'#888'}}>{new Date(h.edited_at).toLocaleString()}</span>
                    </div>
                    {h.edit_reason && <div style={{fontSize:'0.85rem', color:'#666', marginBottom:4}}>Reason: {h.edit_reason}</div>}
                    <div style={{background:'#f8f9fa', padding:10, borderRadius:6, fontSize:'0.85rem', whiteSpace:'pre-wrap', maxHeight:150, overflowY:'auto'}}>
                      {h.title_snapshot && <div style={{fontWeight:600, marginBottom:4}}>Title: {h.title_snapshot}</div>}
                      {h.content_snapshot || '(empty)'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowHistory(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderEntryCard(entry) {
    const ti = typeInfo(entry.entry_type);
    const isExpanded = expandedEntry === entry.id;
    const contentPreview = (entry.content || '').substring(0, 200);
    const hasMore = (entry.content || '').length > 200;

    return (
      <div key={entry.id} style={{
        border:'1px solid #eee', borderRadius:12, padding:16, marginBottom:10,
        borderLeft:`4px solid ${entry.entry_type === 'protocol' ? '#3498db' : entry.entry_type === 'observation' ? '#9b59b6' : entry.entry_type === 'result' ? '#27ae60' : '#95a5a6'}`
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
          <div style={{flex:1}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
              <h3 style={{fontSize:'1rem', margin:0}}>{entry.title}</h3>
              <span className="badge badge-info" style={{fontSize:'0.7rem'}}>{ti.label}</span>
            </div>
            <div style={{fontSize:'0.8rem', color:'#888', display:'flex', gap:12, flexWrap:'wrap'}}>
              <span>📅 {entry.entry_date}</span>
              {entry.experiment_id && <span>🧪 {getExperimentName(entry.experiment_id)}</span>}
              <span style={{color:'#bbb'}}>Created {new Date(entry.created_at).toLocaleString()}</span>
              {entry.updated_at !== entry.created_at && <span style={{color:'#bbb'}}>• Edited {new Date(entry.updated_at).toLocaleString()}</span>}
            </div>
          </div>
          <div style={{display:'flex', gap:4}}>
            <button className="btn btn-sm btn-secondary" onClick={() => viewHistory(entry)} title="View history">📜</button>
            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(entry)}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(entry)}>🗑️</button>
          </div>
        </div>

        {/* Content */}
        {entry.content && (
          <div style={{background:'#fafafa', padding:12, borderRadius:8, fontSize:'0.9rem', lineHeight:1.6, marginBottom:8}}>
            {isExpanded
              ? renderContent(entry.content, entry.linked_items)
              : renderContent(contentPreview + (hasMore ? '...' : ''), entry.linked_items)
            }
            {hasMore && (
              <button className="btn btn-sm btn-secondary" style={{marginTop:8}}
                onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}>
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* Linked items chips */}
        {entry.linked_items && entry.linked_items.length > 0 && (
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {entry.linked_items.map((li, i) => (
              <span key={i} style={{
                background: li.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                padding:'3px 8px', borderRadius:10, fontSize:'0.75rem', fontWeight:500
              }}>
                {li.type === 'reagent' ? '📦' : '🧫'} {li.name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
}

export default Notebook;
