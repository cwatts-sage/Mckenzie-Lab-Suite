import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { experimentAPI, notebookAPI, reagentAPI, sampleAPI, storageAPI } from '../api';
import DeleteConfirmModal from './DeleteConfirmModal';

const STATUS_OPTIONS = [
  { value: 'active', label: '🟢 Active', color: '#27ae60' },
  { value: 'paused', label: '⏸️ Paused', color: '#f39c12' },
  { value: 'completed', label: '✅ Completed', color: '#3498db' },
  { value: 'abandoned', label: '🚫 Abandoned', color: '#95a5a6' },
];

const ENTRY_TYPES = [
  { value: 'protocol', label: '📋 Protocol', color: '#3498db' },
  { value: 'observation', label: '👁️ Observation', color: '#9b59b6' },
  { value: 'result', label: '📊 Result', color: '#27ae60' },
  { value: 'note', label: '📝 Note', color: '#95a5a6' },
];

function ExperimentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [experiment, setExperiment] = useState(null);
  const [entries, setEntries] = useState([]);
  const [reagents, setReagents] = useState([]);
  const [samples, setSamples] = useState([]);
  const [storageLocations, setStorageLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit experiment modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Scratch pad
  const [scratchPad, setScratchPad] = useState('');
  const scratchPadTimer = useRef(null);
  const [scratchSaving, setScratchSaving] = useState(false);

  // Entry modal
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const emptyEntryForm = { title: '', content: '', experiment_id: id, entry_date: new Date().toISOString().split('T')[0], entry_type: 'note', linked_items: [] };
  const [entryForm, setEntryForm] = useState(emptyEntryForm);

  // @-mention
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const contentRef = useRef(null);

  // Strains/controls mention picker for experiment edit
  const [strainMentionOpen, setStrainMentionOpen] = useState(false);
  const [strainMentionSearch, setStrainMentionSearch] = useState('');
  const [strainMentionTarget, setStrainMentionTarget] = useState('strains'); // 'strains' or 'controls'

  // Quick-create modal
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState('reagent');
  const [quickCreateForm, setQuickCreateForm] = useState({ name: '', extra: '', date_collected: '', experiment_id: '', experiment_name: '', storage_location_id: '', quantity: '', quantity_unit: '' });
  const [quickCreateCallback, setQuickCreateCallback] = useState(null);

  // Calendar
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Collapsed date groups
  const [collapsedDates, setCollapsedDates] = useState(new Set());

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState(''); // 'experiment' or 'entry'

  // Hyperlink popover
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [expRes, entriesRes, reagentsRes, samplesRes, locsRes] = await Promise.all([
        experimentAPI.getOne(id),
        notebookAPI.getAll({ experiment_id: id }),
        reagentAPI.getAll(),
        sampleAPI.getAll(),
        storageAPI.getLocations(),
      ]);
      setExperiment(expRes.data);
      setEntries(entriesRes.data);
      setReagents(reagentsRes.data);
      setSamples(samplesRes.data);
      setStorageLocations(locsRes.data);
      setScratchPad(expRes.data.scratch_pad || '');

      // Set initially collapsed dates (all except most recent 3)
      const dateGroups = groupByDate(entriesRes.data);
      const initialCollapsed = new Set();
      dateGroups.forEach(([date], index) => {
        if (index >= 3) initialCollapsed.add(date);
      });
      setCollapsedDates(initialCollapsed);
    } catch (err) {
      setError('Failed to load experiment: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group entries by date
  const groupByDate = (items) => {
    const groups = {};
    (items || entries).forEach(e => {
      const d = e.entry_date || 'No date';
      if (!groups[d]) groups[d] = [];
      groups[d].push(e);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  // Scratch pad auto-save
  const handleScratchPadChange = (val) => {
    setScratchPad(val);
    if (scratchPadTimer.current) clearTimeout(scratchPadTimer.current);
    scratchPadTimer.current = setTimeout(async () => {
      setScratchSaving(true);
      try {
        await experimentAPI.update(id, { scratch_pad: val });
      } catch (e) { /* silent fail */ }
      setScratchSaving(false);
    }, 1000);
  };

  const clearScratchPad = async () => {
    setScratchPad('');
    setScratchSaving(true);
    try {
      await experimentAPI.update(id, { scratch_pad: '' });
    } catch (e) { /* silent fail */ }
    setScratchSaving(false);
  };

  // Edit experiment
  const openEditExperiment = () => {
    setEditForm({
      title: experiment.title,
      description: experiment.description || '',
      purpose: experiment.purpose || '',
      hypothesis: experiment.hypothesis || '',
      status: experiment.status,
      tags: experiment.tags || '',
      strains: experiment.strains || [],
      controls: experiment.controls || [],
    });
    setShowEditModal(true);
  };

  const handleSaveExperiment = async () => {
    if (!editForm.title) { alert('Title is required'); return; }
    try {
      await experimentAPI.update(id, editForm);
      setShowEditModal(false);
      setLoading(true);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  // Delete experiment
  const handleDeleteExperiment = async () => {
    try {
      await experimentAPI.delete(id);
      navigate('/notebook/experiments');
    } catch (err) {
      alert('Failed to delete');
    }
    setDeleteTarget(null);
  };

  // Entry CRUD
  const openAddEntry = () => {
    setEntryForm({ ...emptyEntryForm, entry_date: new Date().toISOString().split('T')[0] });
    setEditingEntry(null);
    setShowEntryModal(true);
  };

  const openEditEntry = (entry) => {
    setEntryForm({
      title: entry.title,
      content: entry.content,
      experiment_id: entry.experiment_id || id,
      entry_date: entry.entry_date,
      entry_type: entry.entry_type,
      linked_items: entry.linked_items || []
    });
    setEditingEntry(entry);
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    if (!entryForm.title) { alert('Title is required'); return; }
    try {
      if (editingEntry) {
        await notebookAPI.update(editingEntry.id, entryForm);
      } else {
        await notebookAPI.create(entryForm);
      }
      setShowEntryModal(false);
      setLoading(true);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDeleteEntry = async () => {
    try {
      await notebookAPI.delete(deleteTarget.id);
      fetchData();
    } catch (err) {
      alert('Failed to delete');
    }
    setDeleteTarget(null);
  };

  // @-mention for entry editor
  const handleContentChange = (e) => {
    const val = e.target.value;
    setEntryForm({ ...entryForm, content: val });
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionSearch(atMatch[1].toLowerCase());
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (type, item) => {
    const textarea = contentRef.current;
    const cursorPos = textarea ? textarea.selectionStart : (entryForm.content || '').length;
    const textBeforeCursor = (entryForm.content || '').substring(0, cursorPos);
    const textAfterCursor = (entryForm.content || '').substring(cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      const newBefore = textBeforeCursor.substring(0, atMatch.index) + `@[${item.name}]`;
      setEntryForm(prev => ({
        ...prev,
        content: newBefore + textAfterCursor,
        linked_items: [...prev.linked_items.filter(li => !(li.id === item.id && li.type === type)), { type, id: item.id, name: item.name }]
      }));
    } else {
      // Fallback: append mention at end (used after quick-create when cursor is lost)
      setEntryForm(prev => ({
        ...prev,
        content: (prev.content || '') + `@[${item.name}] `,
        linked_items: [...prev.linked_items.filter(li => !(li.id === item.id && li.type === type)), { type, id: item.id, name: item.name }]
      }));
    }
    setMentionOpen(false);
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

  // Strains/Controls picker for experiment edit
  const getStrainMentionResults = () => {
    const s = strainMentionSearch.toLowerCase();
    const results = [];
    reagents.filter(r => (r.name || '').toLowerCase().includes(s) || (r.catalog_number || '').toLowerCase().includes(s))
      .slice(0, 5).forEach(r => results.push({ type: 'reagent', item: r, label: `📦 ${r.name}${r.catalog_number ? ` (${r.catalog_number})` : ''}` }));
    samples.filter(r => (r.name || '').toLowerCase().includes(s))
      .slice(0, 5).forEach(r => results.push({ type: 'sample', item: r, label: `🧫 ${r.name}` }));
    return results;
  };

  const addStrainOrControl = (type, item) => {
    const field = strainMentionTarget;
    const existing = editForm[field] || [];
    if (!existing.find(x => x.id === item.id && x.type === type)) {
      setEditForm({ ...editForm, [field]: [...existing, { type, id: item.id, name: item.name }] });
    }
    setStrainMentionOpen(false);
    setStrainMentionSearch('');
  };

  const removeStrainOrControl = (field, index) => {
    const items = [...(editForm[field] || [])];
    items.splice(index, 1);
    setEditForm({ ...editForm, [field]: items });
  };

  // Quick-create for @-mention
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
      // Refresh lists
      const [reagentsRes, samplesRes] = await Promise.all([reagentAPI.getAll(), sampleAPI.getAll()]);
      setReagents(reagentsRes.data);
      setSamples(samplesRes.data);

      // Invoke the callback with created item
      if (quickCreateCallback) {
        quickCreateCallback(quickCreateType, created);
      }
      setShowQuickCreate(false);
      setQuickCreateForm({ name: '', extra: '', date_collected: '', experiment_id: '', experiment_name: '', storage_location_id: '', quantity: '', quantity_unit: '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create');
    }
  };

  // Cmd+K hyperlink support
  const handleContentKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setLinkText('');
      setLinkUrl('');
      setShowLinkPopover(true);
    }
  };

  const insertHyperlink = () => {
    if (!linkText || !linkUrl) return;
    const textarea = contentRef.current;
    const cursorPos = textarea.selectionStart;
    const before = entryForm.content.substring(0, cursorPos);
    const after = entryForm.content.substring(cursorPos);
    const linkMarkdown = `[${linkText}](${linkUrl})`;
    setEntryForm({ ...entryForm, content: before + linkMarkdown + after });
    setShowLinkPopover(false);
    setTimeout(() => textarea && textarea.focus(), 50);
  };

  // Render content with @mentions and hyperlinks highlighted
  const renderContent = (content, linkedItems) => {
    if (!content) return null;
    // First split on hyperlinks and @mentions
    const parts = content.split(/(@\[[^\]]+\]|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
      // @mention
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
      // Plain text with newlines
      return part.split('\n').map((line, j) => (
        <React.Fragment key={`${i}-${j}`}>
          {j > 0 && <br />}
          {line}
        </React.Fragment>
      ));
    });
  };

  // Calendar helpers
  const calYear = calendarDate.getFullYear();
  const calMonth = calendarDate.getMonth();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();

  const getEntryDatesMap = () => {
    const map = {};
    entries.forEach(e => {
      if (e.entry_date) {
        if (!map[e.entry_date]) map[e.entry_date] = new Set();
        map[e.entry_date].add(e.entry_type);
      }
    });
    return map;
  };

  const entryDatesMap = getEntryDatesMap();

  const scrollToDate = (dateStr) => {
    const el = document.getElementById(`date-group-${dateStr}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Ensure group is expanded
      if (collapsedDates.has(dateStr)) {
        const newCollapsed = new Set(collapsedDates);
        newCollapsed.delete(dateStr);
        setCollapsedDates(newCollapsed);
      }
    }
  };

  const toggleDateCollapse = (date) => {
    const newCollapsed = new Set(collapsedDates);
    if (newCollapsed.has(date)) {
      newCollapsed.delete(date);
    } else {
      newCollapsed.add(date);
    }
    setCollapsedDates(newCollapsed);
  };

  const statusInfo = (s) => STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];
  const typeInfo = (t) => ENTRY_TYPES.find(et => et.value === t) || ENTRY_TYPES[3];

  if (loading) return <div className="loading">Loading experiment...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div></div>;
  if (!experiment) return <div className="card"><div style={{padding:20}}>Experiment not found</div></div>;

  const si = statusInfo(experiment.status);
  const dateGroups = groupByDate();

  return (
    <div>
      {/* Experiment Info Section */}
      <div className="card">
        <div className="card-header">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/notebook/experiments')} title="Back to experiments">←</button>
            <h2 style={{margin:0}}>{experiment.title}</h2>
            <span className={`badge badge-${experiment.status === 'active' ? 'success' : experiment.status === 'completed' ? 'info' : experiment.status === 'paused' ? 'warning' : 'danger'}`}>
              {si.label}
            </span>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-sm btn-secondary" onClick={openEditExperiment}>✏️ Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => { setDeleteTarget(experiment); setDeleteType('experiment'); }}>🗑️</button>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          {experiment.purpose && (
            <div>
              <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>Purpose</label>
              <p style={{marginTop:4,color:'#333',lineHeight:1.5}}>{experiment.purpose}</p>
            </div>
          )}
          {experiment.hypothesis && (
            <div>
              <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>Hypothesis</label>
              <p style={{marginTop:4,color:'#333',lineHeight:1.5}}>{experiment.hypothesis}</p>
            </div>
          )}
        </div>

        {experiment.description && (
          <div style={{marginBottom:16}}>
            <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>Description</label>
            <p style={{marginTop:4,color:'#333',lineHeight:1.5}}>{experiment.description}</p>
          </div>
        )}

        {/* Strains */}
        {experiment.strains && experiment.strains.length > 0 && (
          <div style={{marginBottom:12}}>
            <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>Strains</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {experiment.strains.map((s, i) => (
                <span key={i} style={{
                  background: s.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                  padding:'4px 10px', borderRadius:12, fontSize:'0.8rem', fontWeight:500, cursor:'pointer'
                }} onClick={() => navigate(s.type === 'reagent' ? '/inventory' : '/inventory/samples')}
                   title={`${s.type}: ${s.name}`}>
                  {s.type === 'reagent' ? '📦' : '🧫'} {s.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        {experiment.controls && experiment.controls.length > 0 && (
          <div style={{marginBottom:12}}>
            <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>Controls</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {experiment.controls.map((c, i) => (
                <span key={i} style={{
                  background: c.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                  padding:'4px 10px', borderRadius:12, fontSize:'0.8rem', fontWeight:500, cursor:'pointer'
                }} onClick={() => navigate(c.type === 'reagent' ? '/inventory' : '/inventory/samples')}
                   title={`${c.type}: ${c.name}`}>
                  {c.type === 'reagent' ? '📦' : '🧫'} {c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags & dates */}
        <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',fontSize:'0.85rem',color:'#888'}}>
          {experiment.tags && experiment.tags.split(',').map((tag, i) => (
            <span key={i} style={{background:'#ecf0f1',padding:'2px 8px',borderRadius:10,fontSize:'0.75rem',color:'#555'}}>
              {tag.trim()}
            </span>
          ))}
          <span>Created {new Date(experiment.created_at).toLocaleDateString()}</span>
          <span>Updated {new Date(experiment.updated_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Main content area: calendar sidebar + entries */}
      <div style={{display:'flex',gap:20,alignItems:'flex-start',flexWrap:'wrap'}}>
        {/* Calendar + Scratch Pad sidebar */}
        <div style={{width:280,minWidth:280,flexShrink:0}}>
          {/* Mini Calendar */}
          <div className="card" style={{padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <button className="btn btn-sm btn-secondary" onClick={() => setCalendarDate(new Date(calYear, calMonth - 1, 1))}>←</button>
              <strong style={{fontSize:'0.9rem'}}>
                {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </strong>
              <button className="btn btn-sm btn-secondary" onClick={() => setCalendarDate(new Date(calYear, calMonth + 1, 1))}>→</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gap:2,textAlign:'center',fontSize:'0.75rem'}}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} style={{fontWeight:600,color:'#888',padding:4}}>{d}</div>
              ))}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const entryTypes = entryDatesMap[dateStr];
                const hasEntries = !!entryTypes;
                const isToday = dateStr === new Date().toISOString().split('T')[0];

                return (
                  <div
                    key={day}
                    onClick={() => hasEntries && scrollToDate(dateStr)}
                    style={{
                      padding:4,
                      borderRadius:6,
                      cursor: hasEntries ? 'pointer' : 'default',
                      background: isToday ? '#eef4fb' : 'transparent',
                      fontWeight: isToday ? 700 : 400,
                      position:'relative'
                    }}
                  >
                    {day}
                    {hasEntries && (
                      <div style={{display:'flex',gap:1,justifyContent:'center',marginTop:1}}>
                        {[...entryTypes].slice(0,3).map((t, j) => {
                          const ti = typeInfo(t);
                          return <div key={j} style={{width:5,height:5,borderRadius:'50%',background:ti.color}} />;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scratch Pad */}
          <div className="card" style={{padding:16,marginTop:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <label style={{fontSize:'0.85rem',fontWeight:600,color:'#444'}}>📝 Scratch Pad</label>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                {scratchSaving && <span style={{fontSize:'0.7rem',color:'#888'}}>Saving...</span>}
                {scratchPad && (
                  <button className="btn btn-sm btn-secondary" onClick={clearScratchPad} style={{padding:'2px 8px',fontSize:'0.7rem'}}>Clear</button>
                )}
              </div>
            </div>
            <textarea
              value={scratchPad}
              onChange={(e) => handleScratchPadChange(e.target.value)}
              placeholder="Quick notes, ideas, to-dos..."
              rows={6}
              style={{
                width:'100%',resize:'vertical',border:'1px solid #eee',borderRadius:8,
                padding:10,fontSize:'0.85rem',fontFamily:'inherit',lineHeight:1.5
              }}
            />
          </div>
        </div>

        {/* Entries section */}
        <div style={{flex:1,minWidth:0}}>
          <div className="card">
            <div className="card-header">
              <h2 style={{fontSize:'1.1rem'}}>📓 Notebook Entries ({entries.length})</h2>
              <button className="btn btn-primary" onClick={openAddEntry}>+ New Entry</button>
            </div>

            {entries.length === 0 ? (
              <div className="empty-state">
                <div className="emoji">📓</div>
                <p>No entries yet for this experiment.</p>
              </div>
            ) : (
              dateGroups.map(([date, dateEntries]) => {
                const isCollapsed = collapsedDates.has(date);
                const formattedDate = date === 'No date' ? date : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                return (
                  <div key={date} id={`date-group-${date}`} style={{marginBottom:16}}>
                    <div
                      onClick={() => toggleDateCollapse(date)}
                      style={{
                        display:'flex',alignItems:'center',gap:8,cursor:'pointer',
                        padding:'8px 0',borderBottom:'1px solid #eee',marginBottom:8,
                        userSelect:'none'
                      }}
                    >
                      <span style={{color:'#888',fontSize:'0.9rem',transition:'transform 0.2s',transform:isCollapsed?'rotate(-90deg)':'rotate(0deg)'}}>▼</span>
                      <h3 style={{fontSize:'0.95rem',color:'#2c3e50',margin:0,flex:1}}>
                        📅 {formattedDate}
                        <span style={{color:'#999',fontWeight:400,marginLeft:8}}>({dateEntries.length})</span>
                      </h3>
                    </div>
                    {!isCollapsed && dateEntries.map(entry => {
                      const ti = typeInfo(entry.entry_type);
                      return (
                        <div key={entry.id} style={{
                          border:'1px solid #eee',borderRadius:12,padding:16,marginBottom:10,
                          borderLeft:`4px solid ${ti.color}`
                        }}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                            <div style={{flex:1}}>
                              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                                <h3 style={{fontSize:'1rem',margin:0}}>{entry.title}</h3>
                                <span className="badge badge-info" style={{fontSize:'0.7rem'}}>{ti.label}</span>
                              </div>
                              <div style={{fontSize:'0.8rem',color:'#888'}}>
                                <span>📅 {entry.entry_date}</span>
                                <span style={{marginLeft:12,color:'#bbb'}}>Created {new Date(entry.created_at).toLocaleString()}</span>
                              </div>
                            </div>
                            <div style={{display:'flex',gap:4}}>
                              <button className="btn btn-sm btn-secondary" onClick={() => openEditEntry(entry)}>Edit</button>
                              <button className="btn btn-sm btn-danger" onClick={() => { setDeleteTarget(entry); setDeleteType('entry'); }}>🗑️</button>
                            </div>
                          </div>
                          {entry.content && (
                            <div style={{background:'#fafafa',padding:12,borderRadius:8,fontSize:'0.9rem',lineHeight:1.6,marginBottom:8}}>
                              {renderContent(entry.content, entry.linked_items)}
                            </div>
                          )}
                          {entry.linked_items && entry.linked_items.length > 0 && (
                            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                              {entry.linked_items.map((li, j) => (
                                <span key={j} style={{
                                  background: li.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                                  padding:'3px 8px',borderRadius:10,fontSize:'0.75rem',fontWeight:500
                                }}>
                                  {li.type === 'reagent' ? '📦' : '🧫'} {li.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Edit Experiment Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => { setShowEditModal(false); setStrainMentionOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:700}}>
            <h2>Edit Experiment</h2>
            <div className="form-group">
              <label>Title *</label>
              <input value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})} autoFocus />
            </div>
            <div className="form-group">
              <label>Purpose</label>
              <textarea value={editForm.purpose} onChange={(e) => setEditForm({...editForm, purpose: e.target.value})} rows={2} style={{resize:'vertical'}} placeholder="What is this experiment trying to achieve?" />
            </div>
            <div className="form-group">
              <label>Hypothesis</label>
              <textarea value={editForm.hypothesis} onChange={(e) => setEditForm({...editForm, hypothesis: e.target.value})} rows={2} style={{resize:'vertical'}} placeholder="What do you expect to find?" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} rows={2} style={{resize:'vertical'}} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tags</label>
                <input value={editForm.tags} onChange={(e) => setEditForm({...editForm, tags: e.target.value})} placeholder="comma, separated, tags" />
              </div>
            </div>

            {/* Strains picker */}
            <div className="form-group" style={{position:'relative'}}>
              <label>Strains <span style={{fontWeight:400,color:'#999',fontSize:'0.8rem'}}>— search to add reagents or samples</span></label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                {(editForm.strains || []).map((s, i) => (
                  <span key={i} style={{
                    background: s.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                    padding:'4px 10px',borderRadius:12,fontSize:'0.8rem',display:'flex',alignItems:'center',gap:4
                  }}>
                    {s.type === 'reagent' ? '📦' : '🧫'} {s.name}
                    <span style={{cursor:'pointer',marginLeft:4,color:'#e74c3c'}} onClick={() => removeStrainOrControl('strains', i)}>×</span>
                  </span>
                ))}
              </div>
              <input
                value={strainMentionTarget === 'strains' ? strainMentionSearch : ''}
                onChange={(e) => {
                  setStrainMentionSearch(e.target.value);
                  setStrainMentionTarget('strains');
                  setStrainMentionOpen(e.target.value.length > 0);
                }}
                onFocus={() => setStrainMentionTarget('strains')}
                placeholder="Search reagents & samples..."
                style={{fontSize:'0.9rem'}}
              />
              {strainMentionOpen && strainMentionTarget === 'strains' && (
                <div style={{
                  position:'absolute',left:0,right:0,top:'100%',
                  background:'white',border:'1px solid #ddd',borderRadius:8,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.1)',maxHeight:200,overflowY:'auto',zIndex:200
                }}>
                  {getStrainMentionResults().length === 0 ? (
                    <div style={{padding:12}}>
                      <div style={{color:'#999',fontSize:'0.9rem',marginBottom:8}}>No matches found</div>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setStrainMentionOpen(false);
                          setQuickCreateType('reagent');
                          setQuickCreateForm({ name: strainMentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            addStrainOrControl(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setStrainMentionOpen(false);
                          setQuickCreateType('sample');
                          setQuickCreateForm({ name: strainMentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            addStrainOrControl(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Sample</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {getStrainMentionResults().map((r, i) => (
                        <div key={i} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0f0f0',fontSize:'0.9rem'}}
                          onClick={() => addStrainOrControl(r.type, r.item)}
                          onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                        >
                          {r.label}
                        </div>
                      ))}
                      <div style={{padding:'8px 14px',borderTop:'1px solid #eee',display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setStrainMentionOpen(false);
                          setQuickCreateType('reagent');
                          setQuickCreateForm({ name: strainMentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            addStrainOrControl(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setStrainMentionOpen(false);
                          setQuickCreateType('sample');
                          setQuickCreateForm({ name: strainMentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            addStrainOrControl(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Sample</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Controls picker */}
            <div className="form-group" style={{position:'relative'}}>
              <label>Controls <span style={{fontWeight:400,color:'#999',fontSize:'0.8rem'}}>— search to add reagents or samples</span></label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                {(editForm.controls || []).map((c, i) => (
                  <span key={i} style={{
                    background: c.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                    padding:'4px 10px',borderRadius:12,fontSize:'0.8rem',display:'flex',alignItems:'center',gap:4
                  }}>
                    {c.type === 'reagent' ? '📦' : '🧫'} {c.name}
                    <span style={{cursor:'pointer',marginLeft:4,color:'#e74c3c'}} onClick={() => removeStrainOrControl('controls', i)}>×</span>
                  </span>
                ))}
              </div>
              <input
                value={strainMentionTarget === 'controls' ? strainMentionSearch : ''}
                onChange={(e) => {
                  setStrainMentionSearch(e.target.value);
                  setStrainMentionTarget('controls');
                  setStrainMentionOpen(e.target.value.length > 0);
                }}
                onFocus={() => setStrainMentionTarget('controls')}
                placeholder="Search reagents & samples..."
                style={{fontSize:'0.9rem'}}
              />
              {strainMentionOpen && strainMentionTarget === 'controls' && (
                <div style={{
                  position:'absolute',left:0,right:0,top:'100%',
                  background:'white',border:'1px solid #ddd',borderRadius:8,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.1)',maxHeight:200,overflowY:'auto',zIndex:200
                }}>
                  {getStrainMentionResults().length === 0 ? (
                    <div style={{padding:12}}>
                      <div style={{color:'#999',fontSize:'0.9rem',marginBottom:8}}>No matches found</div>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setStrainMentionOpen(false);
                          setQuickCreateType('reagent');
                          setQuickCreateForm({ name: strainMentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            addStrainOrControl(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setStrainMentionOpen(false);
                          setQuickCreateType('sample');
                          setQuickCreateForm({ name: strainMentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            addStrainOrControl(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Sample</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {getStrainMentionResults().map((r, i) => (
                        <div key={i} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0f0f0',fontSize:'0.9rem'}}
                          onClick={() => addStrainOrControl(r.type, r.item)}
                          onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                        >
                          {r.label}
                        </div>
                      ))}
                      <div style={{padding:'8px 14px',borderTop:'1px solid #eee',display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setStrainMentionOpen(false);
                          setQuickCreateType('reagent');
                          setQuickCreateForm({ name: strainMentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            addStrainOrControl(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setStrainMentionOpen(false);
                          setQuickCreateType('sample');
                          setQuickCreateForm({ name: strainMentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            addStrainOrControl(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Sample</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowEditModal(false); setStrainMentionOpen(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveExperiment}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Entry Modal */}
      {showEntryModal && (
        <div className="modal-overlay" onClick={() => { setShowEntryModal(false); setMentionOpen(false); setShowLinkPopover(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:700}}>
            <h2>{editingEntry ? 'Edit Entry' : 'New Notebook Entry'}</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Title *</label>
                <input value={entryForm.title} onChange={(e) => setEntryForm({...entryForm, title: e.target.value})} autoFocus />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={entryForm.entry_date} onChange={(e) => setEntryForm({...entryForm, entry_date: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={entryForm.entry_type} onChange={(e) => setEntryForm({...entryForm, entry_type: e.target.value})}>
                {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{position:'relative'}}>
              <label>Content <span style={{fontWeight:400,color:'#999',fontSize:'0.8rem'}}>— type @ to link items, ⌘K to insert link</span></label>
              <textarea
                ref={contentRef}
                value={entryForm.content}
                onChange={handleContentChange}
                onKeyDown={handleContentKeyDown}
                rows={10}
                style={{resize:'vertical',fontFamily:'inherit',lineHeight:1.6}}
                placeholder="Record your observations, protocol steps, results..."
              />
              {/* @-mention dropdown */}
              {mentionOpen && (
                <div style={{
                  position:'absolute',bottom:'calc(100% - 40px)',left:0,right:0,
                  background:'white',border:'1px solid #ddd',borderRadius:8,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.1)',maxHeight:200,overflowY:'auto',zIndex:200
                }}>
                  {getMentionResults().length === 0 ? (
                    <div style={{padding:12}}>
                      <div style={{color:'#999',fontSize:'0.9rem',marginBottom:8}}>No matches found</div>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setMentionOpen(false);
                          setQuickCreateType('reagent');
                          setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            insertMention(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setMentionOpen(false);
                          setQuickCreateType('sample');
                          setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            insertMention(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Sample</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {getMentionResults().map((r, i) => (
                        <div key={i} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0f0f0',fontSize:'0.9rem'}}
                          onClick={() => insertMention(r.type, r.item)}
                          onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                        >
                          {r.label}
                        </div>
                      ))}
                      <div style={{padding:'8px 14px',borderTop:'1px solid #eee',display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setMentionOpen(false);
                          setQuickCreateType('reagent');
                          setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            insertMention(type, item);
                          });
                          setShowQuickCreate(true);
                        }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                          setMentionOpen(false);
                          setQuickCreateType('sample');
                          setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], experiment_id: id, experiment_name: experiment?.title || '', storage_location_id: '', quantity: '', quantity_unit: '' });
                          setQuickCreateCallback(() => (type, item) => {
                            insertMention(type, item);
                          });
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
                    <input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Link text" style={{fontSize:'0.85rem',padding:8}} autoFocus />
                  </div>
                  <div className="form-group" style={{marginBottom:8}}>
                    <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." style={{fontSize:'0.85rem',padding:8}} />
                  </div>
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setShowLinkPopover(false)}>Cancel</button>
                    <button className="btn btn-sm btn-primary" onClick={insertHyperlink} disabled={!linkText || !linkUrl}>Insert</button>
                  </div>
                </div>
              )}
            </div>
            {entryForm.linked_items.length > 0 && (
              <div style={{marginBottom:12}}>
                <label style={{fontSize:'0.85rem',color:'#666',marginBottom:4,display:'block'}}>Linked Items:</label>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {entryForm.linked_items.map((li, i) => (
                    <span key={i} style={{
                      background: li.type === 'reagent' ? '#d6eaf8' : '#d5f5e3',
                      padding:'4px 10px',borderRadius:12,fontSize:'0.8rem',display:'flex',alignItems:'center',gap:4
                    }}>
                      {li.type === 'reagent' ? '📦' : '🧫'} {li.name}
                      <span style={{cursor:'pointer',marginLeft:4,color:'#e74c3c'}} onClick={() =>
                        setEntryForm({...entryForm, linked_items: entryForm.linked_items.filter((_, j) => j !== i)})
                      }>×</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowEntryModal(false); setMentionOpen(false); setShowLinkPopover(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEntry}>{editingEntry ? 'Save Changes' : 'Create Entry'}</button>
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
                      const expName = expId ? (experiment && experiment.id === expId ? experiment.title : expId) : '';
                      setQuickCreateForm({...quickCreateForm, experiment_id: expId, experiment_name: expName});
                    }}>
                      <option value="">— None —</option>
                      {experiment && <option value={experiment.id}>{experiment.title}</option>}
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

      {/* Delete Confirm */}
      {deleteTarget && (
        <DeleteConfirmModal
          itemName={deleteType === 'experiment' ? `"${deleteTarget.title}" and all its notebook entries` : `entry "${deleteTarget.title}"`}
          onConfirm={deleteType === 'experiment' ? handleDeleteExperiment : handleDeleteEntry}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default ExperimentDetail;
