import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { notebookAPI, experimentAPI, reagentAPI, sampleAPI, storageAPI } from '../api';
import DeleteConfirmModal from './DeleteConfirmModal';

const ENTRY_TYPES = [
  { value: 'protocol', label: '📋 Protocol', desc: 'Steps followed' },
  { value: 'result', label: '📊 Result', desc: 'Data & conclusions' },
  { value: 'note', label: '📝 Note', desc: 'General notes' },
];

function Notebook() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [reagents, setReagents] = useState([]);
  const [samples, setSamples] = useState([]);
  const [storageLocations, setStorageLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showHistory, setShowHistory] = useState(null);
  const [history, setHistory] = useState([]);
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Filters
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterExperiment, setFilterExperiment] = useState(searchParams.get('experiment') || '');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [search, setSearch] = useState('');



  // Form
  const emptyForm = { title: '', content: '', experiment_id: '', entry_date: new Date().toISOString().split('T')[0], entry_type: 'note', linked_items: [] };
  const [form, setForm] = useState(emptyForm);

  // @-mention
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const contentRef = useRef(null);

  // Quick-create
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState('reagent');
  const [quickCreateForm, setQuickCreateForm] = useState({ name: '', extra: '', date_collected: '', experiment_id: '', storage_location_id: '', quantity: '', quantity_unit: '' });

  // Hyperlink popover
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (filterExperiment) params.experiment_id = filterExperiment;
      if (filterType) params.type = filterType;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      if (search) params.search = search;

      const [entriesRes, expRes, reagentsRes, samplesRes, locsRes] = await Promise.all([
        notebookAPI.getAll(params),
        experimentAPI.getAll(),
        reagentAPI.getAll(),
        sampleAPI.getAll(),
        storageAPI.getLocations(),
      ]);
      setEntries(entriesRes.data);
      setExperiments(expRes.data);
      setReagents(reagentsRes.data);
      setSamples(samplesRes.data);
      setStorageLocations(locsRes.data);
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

  const handleDelete = async () => {
    try {
      await notebookAPI.delete(deleteTarget.id);
      setDeleteTarget(null);
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
    const atMatch = textBeforeCursor.match(/@([\w.\-/]*)$/);

    if (atMatch) {
      setMentionSearch(atMatch[1].toLowerCase());
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  // Cmd+K handler
  const [linkSelectionRange, setLinkSelectionRange] = useState(null);
  const handleContentKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const textarea = contentRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = form.content.substring(start, end);
        setLinkText(selectedText || '');
        setLinkSelectionRange(start !== end ? { start, end } : null);
      } else {
        setLinkText('');
        setLinkSelectionRange(null);
      }
      setLinkUrl('');
      setShowLinkPopover(true);
    }
  };

  const insertHyperlink = () => {
    if (!linkText || !linkUrl) return;
    const textarea = contentRef.current;
    const linkMarkdown = `[${linkText}](${linkUrl})`;
    if (linkSelectionRange) {
      // Replace the selected text with the hyperlink
      const before = form.content.substring(0, linkSelectionRange.start);
      const after = form.content.substring(linkSelectionRange.end);
      setForm({ ...form, content: before + linkMarkdown + after });
    } else {
      // Insert at cursor position
      const cursorPos = textarea ? textarea.selectionStart : form.content.length;
      const before = form.content.substring(0, cursorPos);
      const after = form.content.substring(cursorPos);
      setForm({ ...form, content: before + linkMarkdown + after });
    }
    setShowLinkPopover(false);
    setLinkSelectionRange(null);
    setTimeout(() => textarea && textarea.focus(), 50);
  };

  const insertMention = (type, item) => {
    const name = item.name;
    const itemId = item.id;

    // Replace @search with the mention text
    const textarea = contentRef.current;
    const cursorPos = textarea ? textarea.selectionStart : (form.content || '').length;
    const textBeforeCursor = (form.content || '').substring(0, cursorPos);
    const textAfterCursor = (form.content || '').substring(cursorPos);
    const atMatch = textBeforeCursor.match(/@([\w.\-/]*)$/);

    if (atMatch) {
      const newBefore = textBeforeCursor.substring(0, atMatch.index) + `@[${name}]`;
      setForm(prev => ({
        ...prev,
        content: newBefore + textAfterCursor,
        linked_items: [...prev.linked_items.filter(li => !(li.id === itemId && li.type === type)), { type, id: itemId, name }]
      }));
    } else {
      // Fallback: append mention at end of content (used after quick-create when cursor is lost)
      setForm(prev => ({
        ...prev,
        content: (prev.content || '') + `@[${name}] `,
        linked_items: [...prev.linked_items.filter(li => !(li.id === itemId && li.type === type)), { type, id: itemId, name }]
      }));
    }

    setMentionOpen(false);

    // Refocus textarea
    setTimeout(() => textarea && textarea.focus(), 50);
  };

  const getMentionResults = () => {
    const s = mentionSearch;
    const currentExpId = form.experiment_id;

    const matchingReagents = reagents.filter(r => (r.name || '').toLowerCase().includes(s) || (r.catalog_number || '').toLowerCase().includes(s));
    const matchingSamples = samples.filter(r => (r.name || '').toLowerCase().includes(s));

    // Separate experiment-linked vs unlinked samples
    const linkedSamples = currentExpId ? matchingSamples.filter(sa => sa.experiment_id === currentExpId) : [];
    const unlinkedSamples = currentExpId ? matchingSamples.filter(sa => sa.experiment_id !== currentExpId) : matchingSamples;

    const results = [];

    // Linked samples first
    if (linkedSamples.length > 0) {
      results.push({ type: 'header', label: '🔗 Linked to this experiment' });
      linkedSamples.forEach(r => results.push({ type: 'sample', item: r, label: `🧫 ${r.name}` }));
    }

    // Then reagents and unlinked samples
    if (matchingReagents.length > 0 || unlinkedSamples.length > 0) {
      if (linkedSamples.length > 0) {
        results.push({ type: 'header', label: '📂 Other items' });
      }
      matchingReagents.forEach(r => results.push({ type: 'reagent', item: r, label: `📦 ${r.name}${r.catalog_number ? ` (${r.catalog_number})` : ''}` }));
      unlinkedSamples.forEach(r => results.push({ type: 'sample', item: r, label: `🧫 ${r.name}` }));
    }

    return results;
  };

  // Quick-create handler
  const handleQuickCreate = async () => {
    if (!quickCreateForm.name.trim()) return;
    try {
      let created;
      if (quickCreateType === 'reagent') {
        const res = await reagentAPI.create({ name: quickCreateForm.name, vendor: quickCreateForm.extra || undefined });
        created = res.data;
      } else {
        const sampleData = { name: quickCreateForm.name, organism_strain: quickCreateForm.extra || undefined };
        if (quickCreateForm.date_collected) sampleData.date_collected = quickCreateForm.date_collected;
        if (quickCreateForm.experiment_id) {
          sampleData.experiment_id = quickCreateForm.experiment_id;
          sampleData.experiment = quickCreateForm.experiment_name || '';
        }
        if (quickCreateForm.storage_location_id) sampleData.storage_location_id = quickCreateForm.storage_location_id;
        if (quickCreateForm.quantity !== '') sampleData.quantity = parseFloat(quickCreateForm.quantity);
        if (quickCreateForm.quantity_unit) sampleData.quantity_unit = quickCreateForm.quantity_unit;
        const res = await sampleAPI.create(sampleData);
        created = res.data;
      }
      const [reagentsRes, samplesRes] = await Promise.all([reagentAPI.getAll(), sampleAPI.getAll()]);
      setReagents(reagentsRes.data);
      setSamples(samplesRes.data);
      insertMention(quickCreateType, created);
      setShowQuickCreate(false);
      setQuickCreateForm({ name: '', extra: '', date_collected: '', experiment_id: '', storage_location_id: '', quantity: '', quantity_unit: '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create');
    }
  };

  const getExperimentName = (id) => {
    const exp = experiments.find(e => e.id === id);
    return exp ? exp.title : 'Unknown';
  };

  const typeInfo = (t) => ENTRY_TYPES.find(et => et.value === t) || ENTRY_TYPES[3];

  // Render content with @mentions and hyperlinks highlighted
  const renderContent = (content, linkedItems) => {
    if (!content) return null;
    const parts = content.split(/(@\[[^\]]+\]|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
      const mentionMatch = part.match(/^@\[(.+)\]$/);
      if (mentionMatch) {
        const name = mentionMatch[1];
        const linked = (linkedItems || []).find(li => li.name === name);
        return (
          <span key={i} style={{
            background: linked?.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
            padding: '1px 6px', borderRadius: 4, fontWeight: 500,
            fontSize: '0.9em', cursor: linked ? 'pointer' : 'default',
            textDecoration: linked ? 'none' : 'none'
          }} title={linked ? `Click to view ${linked.type}: ${linked.name}` : name}
            onClick={() => {
              if (linked) {
                navigate(linked.type === 'reagent' ? '/inventory/reagents' : '/inventory');
              }
            }}
            onMouseOver={(e) => { if (linked) e.currentTarget.style.opacity = '0.7'; }}
            onMouseOut={(e) => { if (linked) e.currentTarget.style.opacity = '1'; }}
          >
            @{name}
          </span>
        );
      }
      // Hyperlink
      const linkMatch = part.match(/^\[(.+)\]\((.+)\)$/);
      if (linkMatch) {
        return (
          <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
            style={{ color: '#3498db', textDecoration: 'underline' }}>
            {linkMatch[1]}
          </a>
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



  // Group by date view
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
        </div>

        {entries.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📓</div>
            <p>No notebook entries yet. Start recording your research!</p>
          </div>
        ) : (
          // Grouped by date view
          groupByDate().map(([date, dateEntries]) => (
            <div key={date} id={`date-group-${date}`} style={{marginBottom:20}}>
              <h3 style={{fontSize:'1rem', color:'#2c3e50', marginBottom:8, borderBottom:'1px solid #eee', paddingBottom:6}}>
                📅 {date === 'No date' ? date : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                <span style={{color:'#999', fontWeight:400, marginLeft:8}}>({dateEntries.length})</span>
              </h3>
              {dateEntries.map(entry => renderEntryCard(entry))}
            </div>
          ))
        )}
      </div>

      {/* Entry Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setMentionOpen(false); setShowLinkPopover(false); }}>
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
              <label>Content <span style={{fontWeight:400, color:'#999', fontSize:'0.8rem'}}>— type @ to link items, ⌘K to insert link</span></label>
              <textarea
                ref={contentRef}
                value={form.content}
                onChange={handleContentChange}
                onKeyDown={handleContentKeyDown}
                rows={10}
                style={{resize:'vertical', fontFamily:'inherit', lineHeight:1.6}}
                placeholder="Record your observations, protocol steps, results...&#10;&#10;Type @ to link a reagent or sample from your inventory."
              />
              {/* @-mention dropdown */}
              {mentionOpen && (
                <div style={{
                  position:'absolute', top:'100%', left:0, right:0, marginTop:4,
                  background:'white', border:'1px solid #ddd', borderRadius:8,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.1)', maxHeight:280, overflowY:'auto', zIndex:200
                }}>
                  {getMentionResults().filter(r => r.type !== 'header').length === 0 ? (
                    <div style={{padding:12}}>
                      <div style={{color:'#999', fontSize:'0.9rem', marginBottom:8}}>No matches found</div>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setMentionOpen(false);
                          setQuickCreateType('reagent');
                          setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: '', experiment_id: '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setShowQuickCreate(true);
                        }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setMentionOpen(false);
                          setQuickCreateType('sample');
                          const expId = form.experiment_id || '';
                          const expName = expId ? (experiments.find(e => e.id === expId)?.title || '') : '';
                          setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: expId, experiment_name: expName, storage_location_id: '', quantity: '', quantity_unit: '' });
                          setShowQuickCreate(true);
                        }}>+ New Sample</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {getMentionResults().map((r, i) => (
                        r.type === 'header' ? (
                          <div key={i} style={{padding:'6px 14px', fontSize:'0.75rem', fontWeight:600, color:'#888', textTransform:'uppercase', background:'#f8f9fa', borderBottom:'1px solid #eee'}}>
                            {r.label}
                          </div>
                        ) : (
                          <div key={i} style={{padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #f0f0f0', fontSize:'0.9rem'}}
                            onClick={() => insertMention(r.type, r.item)}
                            onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                          >
                            {r.label}
                          </div>
                        )
                      ))}
                      <div style={{padding:'8px 14px',borderTop:'1px solid #eee',display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setMentionOpen(false);
                          setQuickCreateType('reagent');
                          setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: '', experiment_id: '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setShowQuickCreate(true);
                        }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setMentionOpen(false);
                          setQuickCreateType('sample');
                          const expId = form.experiment_id || '';
                          const expName = expId ? (experiments.find(e => e.id === expId)?.title || '') : '';
                          setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: expId, experiment_name: expName, storage_location_id: '', quantity: '', quantity_unit: '' });
                          setShowQuickCreate(true);
                        }}>+ New Sample</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* Link popover */}
              {showLinkPopover && (
                <div style={{
                  position:'absolute',bottom:'calc(100% - 40px)',left:'50%',transform:'translateX(-50%)',
                  background:'white',border:'1px solid #ddd',borderRadius:8,padding:16,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.15)',zIndex:300,width:300
                }} onClick={(e) => e.stopPropagation()}>
                  <div style={{fontWeight:600,fontSize:'0.9rem',marginBottom:8}}>🔗 Insert Link</div>
                  <div className="form-group" style={{marginBottom:8}}>
                    <input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Link text" style={{fontSize:'0.85rem',padding:8}} autoFocus={!linkText} />
                  </div>
                  <div className="form-group" style={{marginBottom:8}}>
                    <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." style={{fontSize:'0.85rem',padding:8}} autoFocus={!!linkText} />
                  </div>
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setShowLinkPopover(false)}>Cancel</button>
                    <button className="btn btn-sm btn-primary" onClick={insertHyperlink} disabled={!linkText || !linkUrl}>Insert</button>
                  </div>
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
              <button className="btn btn-secondary" onClick={() => { setShowModal(false); setMentionOpen(false); setShowLinkPopover(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Create Entry'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-Create Modal */}
      {showQuickCreate && (
        <div className="modal-overlay" onClick={() => setShowQuickCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:500}}>
            <h2>Quick Create {quickCreateType === 'reagent' ? '📦 Reagent' : '🧫 Sample'}</h2>
            <div className="form-group">
              <label>Name *</label>
              <input value={quickCreateForm.name} onChange={(e) => setQuickCreateForm({...quickCreateForm, name: e.target.value})} autoFocus />
            </div>
            <div className="form-group">
              <label>{quickCreateType === 'reagent' ? 'Vendor' : 'Organism/Strain'}</label>
              <input value={quickCreateForm.extra} onChange={(e) => setQuickCreateForm({...quickCreateForm, extra: e.target.value})}
                placeholder={quickCreateType === 'reagent' ? 'e.g., Thermo Fisher' : 'e.g., C57BL/6J'} />
            </div>
            {quickCreateType === 'sample' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date Collected</label>
                    <input type="date" value={quickCreateForm.date_collected} onChange={(e) => setQuickCreateForm({...quickCreateForm, date_collected: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Experiment</label>
                    <select value={quickCreateForm.experiment_id} onChange={(e) => {
                      const expId = e.target.value;
                      const expName = expId ? (experiments.find(ex => ex.id === expId)?.title || '') : '';
                      setQuickCreateForm({...quickCreateForm, experiment_id: expId, experiment_name: expName});
                    }}>
                      <option value="">— None —</option>
                      {experiments.map(exp => <option key={exp.id} value={exp.id}>{exp.title}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Storage Location</label>
                  <select value={quickCreateForm.storage_location_id} onChange={(e) => setQuickCreateForm({...quickCreateForm, storage_location_id: e.target.value})}>
                    <option value="">— None —</option>
                    {storageLocations.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.unit_name || ''}{l.rack ? ` → Rack ${l.rack}` : ''}{l.box ? ` → Box ${l.box}` : ''}{l.position ? ` → Pos ${l.position}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Quantity</label>
                    <input type="number" step="any" value={quickCreateForm.quantity} onChange={(e) => setQuickCreateForm({...quickCreateForm, quantity: e.target.value})} placeholder="e.g., 10" />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input value={quickCreateForm.quantity_unit} onChange={(e) => setQuickCreateForm({...quickCreateForm, quantity_unit: e.target.value})} placeholder="e.g., µL, vials" />
                  </div>
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowQuickCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleQuickCreate}>Create & Add</button>
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

      {/* Delete Confirm */}
      {deleteTarget && (
        <DeleteConfirmModal
          itemName={`notebook entry "${deleteTarget.title}"`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
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
        borderLeft:`4px solid ${entry.entry_type === 'protocol' ? '#3498db' : entry.entry_type === 'result' ? '#27ae60' : '#95a5a6'}`
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
            <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(entry)}>🗑️</button>
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
