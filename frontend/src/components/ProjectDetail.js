import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectAPI, notebookAPI, reagentAPI, sampleAPI, replicateAPI, storageAPI } from '../api';
import DeleteConfirmModal from './DeleteConfirmModal';

const STATUS_OPTIONS = [
  { value: 'active', label: '🟢 Active', color: '#27ae60' },
  { value: 'paused', label: '⏸️ Paused', color: '#f39c12' },
  { value: 'completed', label: '✅ Completed', color: '#3498db' },
  { value: 'abandoned', label: '🚫 Abandoned', color: '#95a5a6' },
];

const ENTRY_TYPES = [
  { value: 'protocol', label: '📋 Protocol', color: '#3498db' },
  { value: 'result', label: '📊 Result', color: '#27ae60' },
  { value: 'note', label: '📝 Note', color: '#95a5a6' },
];

function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [reagents, setReagents] = useState([]);
  const [samples, setSamples] = useState([]);
  const [storageLocations, setStorageLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // View mode: 'experiments' or 'all-entries'
  const [viewMode, setViewMode] = useState('experiments');

  // Edit project modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Scratch pad
  const [scratchPad, setScratchPad] = useState('');
  const scratchPadTimer = useRef(null);
  const [scratchSaving, setScratchSaving] = useState(false);

  // New experiment modal
  const [showExpModal, setShowExpModal] = useState(false);
  const [expForm, setExpForm] = useState({ title: '', description: '', tags: '' });
  const [editingExp, setEditingExp] = useState(null);

  // Entry modal
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const emptyEntryForm = { title: '', content: '', project_id: id, experiment_id: '', replicate_id: '', entry_date: new Date().toISOString().split('T')[0], entry_type: 'note', linked_items: [] };
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [originalLinkedItems, setOriginalLinkedItems] = useState([]);

  // @-mention
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const contentRef = useRef(null);

  // Status update prompt
  const [showStatusPrompt, setShowStatusPrompt] = useState(false);
  const [newlyLinkedSamples, setNewlyLinkedSamples] = useState([]);
  const [selectedForStatusUpdate, setSelectedForStatusUpdate] = useState(new Set());
  const [statusPromptMode, setStatusPromptMode] = useState('ask');

  // Hyperlink
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkSelectionRange, setLinkSelectionRange] = useState(null);

  // Collapsed experiments
  const [collapsedExps, setCollapsedExps] = useState(new Set());
  const [collapsedReps, setCollapsedReps] = useState(new Set());

  // Sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState('');

  // Calendar
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Quick-create
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState('reagent');
  const [quickCreateForm, setQuickCreateForm] = useState({ name: '', extra: '', date_collected: '', storage_location_id: '', quantity: '', quantity_unit: '' });

  const fetchData = useCallback(async () => {
    try {
      const [projRes, entriesRes, reagentsRes, samplesRes, locsRes] = await Promise.all([
        projectAPI.getOne(id),
        notebookAPI.getAll({ project_id: id }),
        reagentAPI.getAll(),
        sampleAPI.getAll(),
        storageAPI.getLocations(),
      ]);
      setProject(projRes.data);
      setEntries(entriesRes.data);
      setReagents(reagentsRes.data);
      setSamples(samplesRes.data);
      setStorageLocations(locsRes.data);
      setScratchPad(projRes.data.scratch_pad || '');
    } catch (err) {
      setError('Failed to load project: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Scratch pad auto-save
  const handleScratchPadChange = (val) => {
    setScratchPad(val);
    if (scratchPadTimer.current) clearTimeout(scratchPadTimer.current);
    scratchPadTimer.current = setTimeout(async () => {
      setScratchSaving(true);
      try { await projectAPI.update(id, { scratch_pad: val }); } catch (e) { /* silent */ }
      setScratchSaving(false);
    }, 1000);
  };

  // Edit project
  const openEditProject = () => {
    setEditForm({
      title: project.title, description: project.description || '',
      purpose: project.purpose || '', hypothesis: project.hypothesis || '',
      status: project.status, tags: project.tags || '',
      strains: project.strains || [], controls: project.controls || [],
    });
    setShowEditModal(true);
  };

  const handleSaveProject = async () => {
    if (!editForm.title) { alert('Title is required'); return; }
    try {
      await projectAPI.update(id, editForm);
      setShowEditModal(false);
      setLoading(true);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save'); }
  };

  // Experiments
  const openAddExperiment = () => {
    setExpForm({ title: '', description: '', tags: '' });
    setEditingExp(null);
    setShowExpModal(true);
  };

  const openEditExperiment = (exp) => {
    setExpForm({ title: exp.title, description: exp.description || '', tags: exp.tags || '' });
    setEditingExp(exp);
    setShowExpModal(true);
  };

  const handleSaveExperiment = async () => {
    if (!expForm.title) { alert('Title is required'); return; }
    try {
      if (editingExp) {
        await projectAPI.updateExperiment(id, editingExp.id, expForm);
      } else {
        await projectAPI.createExperiment(id, expForm);
      }
      setShowExpModal(false);
      setLoading(true);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save'); }
  };

  // Replicates
  const handleCreateReplicate = async (expId) => {
    try {
      await replicateAPI.create(expId);
      setLoading(true);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to create replicate'); }
  };

  // Entries
  const openAddEntry = (experimentId, replicateId) => {
    setEntryForm({
      ...emptyEntryForm,
      experiment_id: experimentId || '',
      replicate_id: replicateId || '',
      entry_date: new Date().toISOString().split('T')[0]
    });
    setOriginalLinkedItems([]);
    setEditingEntry(null);
    setShowEntryModal(true);
  };

  const openEditEntry = (entry) => {
    const items = entry.linked_items || [];
    setEntryForm({
      title: entry.title, content: entry.content,
      project_id: entry.project_id || id,
      experiment_id: entry.experiment_id || '',
      replicate_id: entry.replicate_id || '',
      entry_date: entry.entry_date, entry_type: entry.entry_type,
      linked_items: items
    });
    setOriginalLinkedItems(items);
    setEditingEntry(entry);
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    if (!entryForm.title) { alert('Title is required'); return; }
    try {
      const data = { ...entryForm, project_id: id };
      if (editingEntry) {
        await notebookAPI.update(editingEntry.id, data);
      } else {
        await notebookAPI.create(data);
      }
      setShowEntryModal(false);

      // Check for newly linked samples
      const originalIds = new Set(originalLinkedItems.filter(li => li.type === 'sample').map(li => li.id));
      const newSamples = entryForm.linked_items
        .filter(li => li.type === 'sample' && !originalIds.has(li.id))
        .map(li => {
          const sampleData = samples.find(s => s.id === li.id);
          return { ...li, status: sampleData?.status || 'stored' };
        })
        .filter(li => li.status !== 'in use' && li.status !== 'depleted');

      if (newSamples.length > 0) {
        setNewlyLinkedSamples(newSamples);
        setSelectedForStatusUpdate(new Set(newSamples.map(s => s.id)));
        setStatusPromptMode('ask');
        setShowStatusPrompt(true);
      } else {
        setLoading(true);
        fetchData();
      }
    } catch (err) { alert(err.response?.data?.error || 'Failed to save'); }
  };

  const handleStatusUpdate = async (action) => {
    if (action === 'yes') {
      try { await sampleAPI.batchUpdateStatus(newlyLinkedSamples.map(s => s.id), 'in use'); } catch (e) { /* ok */ }
    } else if (action === 'custom') {
      const ids = [...selectedForStatusUpdate];
      if (ids.length > 0) { try { await sampleAPI.batchUpdateStatus(ids, 'in use'); } catch (e) { /* ok */ } }
    }
    setShowStatusPrompt(false);
    setNewlyLinkedSamples([]);
    setLoading(true);
    fetchData();
  };

  // Delete handlers
  const handleDeleteProject = async () => {
    try { await projectAPI.delete(id); navigate('/notebook/projects'); } catch (e) { alert('Failed to delete'); }
    setDeleteTarget(null);
  };

  const handleDeleteExperiment = async () => {
    try { await projectAPI.deleteExperiment(id, deleteTarget.id); fetchData(); } catch (e) { alert('Failed to delete'); }
    setDeleteTarget(null);
  };

  const handleDeleteEntry = async () => {
    try { await notebookAPI.delete(deleteTarget.id); fetchData(); } catch (e) { alert('Failed to delete'); }
    setDeleteTarget(null);
  };

  // @-mention
  const handleContentChange = (e) => {
    const val = e.target.value;
    setEntryForm({ ...entryForm, content: val });
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([\w.\-/]*)$/);
    if (atMatch) { setMentionSearch(atMatch[1].toLowerCase()); setMentionOpen(true); }
    else { setMentionOpen(false); }
  };

  const insertMention = (type, item) => {
    const textarea = contentRef.current;
    const cursorPos = textarea ? textarea.selectionStart : (entryForm.content || '').length;
    const textBeforeCursor = (entryForm.content || '').substring(0, cursorPos);
    const textAfterCursor = (entryForm.content || '').substring(cursorPos);
    const atMatch = textBeforeCursor.match(/@([\w.\-/]*)$/);
    if (atMatch) {
      const newBefore = textBeforeCursor.substring(0, atMatch.index) + `@[${item.name}]`;
      setEntryForm(prev => ({
        ...prev, content: newBefore + textAfterCursor,
        linked_items: [...prev.linked_items.filter(li => !(li.id === item.id && li.type === type)), { type, id: item.id, name: item.name }]
      }));
    } else {
      setEntryForm(prev => ({
        ...prev, content: (prev.content || '') + `@[${item.name}] `,
        linked_items: [...prev.linked_items.filter(li => !(li.id === item.id && li.type === type)), { type, id: item.id, name: item.name }]
      }));
    }
    setMentionOpen(false);
    setTimeout(() => textarea && textarea.focus(), 50);
  };

  const getMentionResults = () => {
    const s = mentionSearch;
    const matchingReagents = reagents.filter(r => (r.name || '').toLowerCase().includes(s) || (r.catalog_number || '').toLowerCase().includes(s));
    const matchingSamples = samples.filter(r => (r.name || '').toLowerCase().includes(s));

    const linkedSamples = matchingSamples.filter(sa => sa.project_id === id);
    const unlinkedSamples = matchingSamples.filter(sa => sa.project_id !== id);

    const results = [];
    if (linkedSamples.length > 0) {
      results.push({ type: 'header', label: '🔗 Linked to this project' });
      linkedSamples.forEach(r => results.push({ type: 'sample', item: r, label: `🧫 ${r.name}` }));
    }
    if (matchingReagents.length > 0 || unlinkedSamples.length > 0) {
      if (linkedSamples.length > 0) results.push({ type: 'header', label: '📂 Other items' });
      matchingReagents.forEach(r => results.push({ type: 'reagent', item: r, label: `📦 ${r.name}${r.catalog_number ? ` (${r.catalog_number})` : ''}` }));
      unlinkedSamples.forEach(r => results.push({ type: 'sample', item: r, label: `🧫 ${r.name}` }));
    }
    return results;
  };

  // Hyperlink
  const handleContentKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const textarea = contentRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        setLinkText(entryForm.content.substring(start, end) || '');
        setLinkSelectionRange(start !== end ? { start, end } : null);
      } else { setLinkText(''); setLinkSelectionRange(null); }
      setLinkUrl('');
      setShowLinkPopover(true);
    }
  };

  const insertHyperlink = () => {
    if (!linkText || !linkUrl) return;
    const textarea = contentRef.current;
    const md = `[${linkText}](${linkUrl})`;
    if (linkSelectionRange) {
      const before = entryForm.content.substring(0, linkSelectionRange.start);
      const after = entryForm.content.substring(linkSelectionRange.end);
      setEntryForm({ ...entryForm, content: before + md + after });
    } else {
      const pos = textarea ? textarea.selectionStart : entryForm.content.length;
      setEntryForm({ ...entryForm, content: entryForm.content.substring(0, pos) + md + entryForm.content.substring(pos) });
    }
    setShowLinkPopover(false);
    setLinkSelectionRange(null);
    setTimeout(() => textarea && textarea.focus(), 50);
  };

  // Render content with mentions and links
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
            fontSize: '0.9em', cursor: linked ? 'pointer' : 'default'
          }} title={linked ? `Click to view ${linked.type}: ${linked.name}` : name}
            onClick={() => { if (linked) navigate(linked.type === 'reagent' ? '/inventory/reagents' : '/inventory'); }}
            onMouseOver={(e) => { if (linked) e.currentTarget.style.opacity = '0.7'; }}
            onMouseOut={(e) => { if (linked) e.currentTarget.style.opacity = '1'; }}
          >@{name}</span>
        );
      }
      const linkMatch = part.match(/^\[(.+)\]\((.+)\)$/);
      if (linkMatch) {
        return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#3498db', textDecoration: 'underline' }}>{linkMatch[1]}</a>;
      }
      return part.split('\n').map((line, j) => (<React.Fragment key={`${i}-${j}`}>{j > 0 && <br />}{line}</React.Fragment>));
    });
  };

  // Quick create
  const handleQuickCreate = async () => {
    if (!quickCreateForm.name.trim()) return;
    try {
      let created;
      if (quickCreateType === 'reagent') {
        const res = await reagentAPI.create({ name: quickCreateForm.name, vendor: quickCreateForm.extra || undefined });
        created = res.data;
      } else {
        const sampleData = { name: quickCreateForm.name, organism_strain: quickCreateForm.extra || undefined, project_id: id, project_name: project?.title || '' };
        if (quickCreateForm.date_collected) sampleData.date_collected = quickCreateForm.date_collected;
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
      setQuickCreateForm({ name: '', extra: '', date_collected: '', storage_location_id: '', quantity: '', quantity_unit: '' });
    } catch (err) { alert(err.response?.data?.error || 'Failed to create'); }
  };

  // Calendar helpers
  const calYear = calendarDate.getFullYear();
  const calMonth = calendarDate.getMonth();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
  const entryDatesMap = {};
  entries.forEach(e => { if (e.entry_date) { if (!entryDatesMap[e.entry_date]) entryDatesMap[e.entry_date] = new Set(); entryDatesMap[e.entry_date].add(e.entry_type); } });

  const typeInfo = (t) => ENTRY_TYPES.find(et => et.value === t) || ENTRY_TYPES[2];
  const statusInfo = (s) => STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];

  if (loading) return <div className="loading">Loading project...</div>;
  if (error) return <div className="card"><div style={{color:'#e74c3c',padding:20}}>{error}</div></div>;
  if (!project) return <div className="card"><div style={{padding:20}}>Project not found</div></div>;

  const si = statusInfo(project.status);
  const experiments = project.experiments || [];

  // Get entries for a specific experiment+replicate
  const getEntriesForReplicate = (expId, repId) => entries.filter(e => e.experiment_id === expId && e.replicate_id === repId);
  const getEntriesForExperiment = (expId) => entries.filter(e => e.experiment_id === expId);
  const getProjectLevelEntries = () => entries.filter(e => !e.experiment_id || e.project_id === id && !e.experiment_id);

  return (
    <div>
      {/* Project Header */}
      <div className="card">
        <div className="card-header">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/notebook/projects')} title="Back to projects">←</button>
            <h2 style={{margin:0}}>📁 {project.title}</h2>
            <span className={`badge badge-${project.status === 'active' ? 'success' : project.status === 'completed' ? 'info' : project.status === 'paused' ? 'warning' : 'danger'}`}>{si.label}</span>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-sm btn-secondary" onClick={openEditProject}>✏️ Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => { setDeleteTarget(project); setDeleteType('project'); }}>🗑️</button>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          {project.purpose && (<div><label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase'}}>Purpose</label><p style={{marginTop:4,color:'#333',lineHeight:1.5}}>{project.purpose}</p></div>)}
          {project.hypothesis && (<div><label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase'}}>Hypothesis</label><p style={{marginTop:4,color:'#333',lineHeight:1.5}}>{project.hypothesis}</p></div>)}
        </div>

        {project.description && (<div style={{marginBottom:16}}><label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase'}}>Description</label><p style={{marginTop:4,color:'#333',lineHeight:1.5}}>{project.description}</p></div>)}

        {project.strains && project.strains.length > 0 && (
          <div style={{marginBottom:12}}>
            <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase'}}>Strains</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {project.strains.map((s, i) => (
                <span key={i} style={{ background: s.type === 'reagent' ? '#d6eaf8' : '#d5f5e3', padding:'4px 10px', borderRadius:12, fontSize:'0.8rem', fontWeight:500, cursor:'pointer' }}
                  onClick={() => navigate(s.type === 'reagent' ? '/inventory/reagents' : '/inventory')}>{s.type === 'reagent' ? '📦' : '🧫'} {s.name}</span>
              ))}
            </div>
          </div>
        )}

        {project.controls && project.controls.length > 0 && (
          <div style={{marginBottom:12}}>
            <label style={{fontSize:'0.8rem',color:'#888',fontWeight:600,textTransform:'uppercase'}}>Controls</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {project.controls.map((c, i) => (
                <span key={i} style={{ background: c.type === 'reagent' ? '#d6eaf8' : '#d5f5e3', padding:'4px 10px', borderRadius:12, fontSize:'0.8rem', fontWeight:500, cursor:'pointer' }}
                  onClick={() => navigate(c.type === 'reagent' ? '/inventory/reagents' : '/inventory')}>{c.type === 'reagent' ? '📦' : '🧫'} {c.name}</span>
              ))}
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',fontSize:'0.85rem',color:'#888'}}>
          {project.tags && project.tags.split(',').map((tag, i) => (
            <span key={i} style={{background:'#ecf0f1',padding:'2px 8px',borderRadius:10,fontSize:'0.75rem',color:'#555'}}>{tag.trim()}</span>
          ))}
          <span>🧪 {experiments.length} experiment{experiments.length !== 1 ? 's' : ''}</span>
          <span>📓 {entries.length} entries</span>
        </div>
      </div>

      {/* View Toggle + Actions */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <button className={`btn btn-sm ${viewMode === 'experiments' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('experiments')}>🧪 Experiments</button>
        <button className={`btn btn-sm ${viewMode === 'all-entries' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('all-entries')}>📓 All Entries ({entries.length})</button>
        <div style={{flex:1}} />
        <button className="btn btn-sm btn-primary" onClick={openAddExperiment}>+ New Experiment</button>
        <button className="btn btn-sm btn-secondary" onClick={() => openAddEntry('', '')}>+ Project Entry</button>
      </div>

      {/* Main Content Area */}
      <div style={{display:'flex',gap:20,alignItems:'flex-start',flexWrap:'wrap'}}>
        {/* Sidebar Toggle */}
        <div style={{position:'relative'}}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              position: sidebarOpen ? 'static' : 'static',
              padding:'6px 10px', fontSize:'0.85rem', whiteSpace:'nowrap',
              display:'flex', alignItems:'center', gap:4
            }}
            title={sidebarOpen ? 'Hide sidebar' : 'Show calendar & scratch pad'}
          >
            {sidebarOpen ? '◀ Hide' : '📅 Tools ▶'}
          </button>

          {sidebarOpen && (
            <div style={{width:280,minWidth:280,flexShrink:0,marginTop:8}}>
              {/* Mini Calendar */}
              <div className="card" style={{padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <button className="btn btn-sm btn-secondary" onClick={() => setCalendarDate(new Date(calYear, calMonth - 1, 1))}>←</button>
                  <strong style={{fontSize:'0.9rem'}}>{calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
                  <button className="btn btn-sm btn-secondary" onClick={() => setCalendarDate(new Date(calYear, calMonth + 1, 1))}>→</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gap:2,textAlign:'center',fontSize:'0.75rem'}}>
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (<div key={d} style={{fontWeight:600,color:'#888',padding:4}}>{d}</div>))}
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const hasEntries = !!entryDatesMap[dateStr];
                    const isToday = dateStr === new Date().toISOString().split('T')[0];
                    return (
                      <div key={day} style={{ padding:4, borderRadius:6, cursor: hasEntries ? 'pointer' : 'default', background: isToday ? '#eef4fb' : 'transparent', fontWeight: isToday ? 700 : 400, position:'relative' }}
                        onClick={() => hasEntries && setViewMode('all-entries')}>
                        {day}
                        {hasEntries && (<div style={{display:'flex',gap:1,justifyContent:'center',marginTop:1}}>{[...entryDatesMap[dateStr]].slice(0,3).map((t, j) => { const ti = typeInfo(t); return <div key={j} style={{width:5,height:5,borderRadius:'50%',background:ti.color}} />; })}</div>)}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Scratch Pad */}
              <div className="card" style={{padding:16,marginTop:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <label style={{fontSize:'0.85rem',fontWeight:600,color:'#444'}}>📝 Scratch Pad</label>
                  {scratchSaving && <span style={{fontSize:'0.7rem',color:'#888'}}>Saving...</span>}
                </div>
                <textarea value={scratchPad} onChange={(e) => handleScratchPadChange(e.target.value)} placeholder="Quick notes, ideas, to-dos..." rows={6}
                  style={{ width:'100%',resize:'vertical',border:'1px solid #eee',borderRadius:8, padding:10,fontSize:'0.85rem',fontFamily:'inherit',lineHeight:1.5 }} />
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{flex:1,minWidth:0}}>
          {viewMode === 'experiments' ? (
            /* Experiments view */
            <div className="card">
              <div className="card-header">
                <h2 style={{fontSize:'1.1rem'}}>🧪 Experiments ({experiments.length})</h2>
              </div>

              {experiments.length === 0 ? (
                <div className="empty-state"><div className="emoji">🧪</div><p>No experiments yet. Create your first one!</p></div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  {experiments.map(exp => {
                    const expSi = statusInfo(exp.status);
                    const isCollapsed = collapsedExps.has(exp.id);
                    const expEntries = getEntriesForExperiment(exp.id);
                    const reps = exp.replicates || [];

                    return (
                      <div key={exp.id} style={{ border:'1px solid #eee', borderRadius:12, borderLeft:`4px solid ${expSi.color}`, overflow:'hidden' }}>
                        {/* Experiment Header */}
                        <div style={{ padding:16, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', background: isCollapsed ? 'white' : '#fafafa' }}
                          onClick={() => { const n = new Set(collapsedExps); isCollapsed ? n.delete(exp.id) : n.add(exp.id); setCollapsedExps(n); }}>
                          <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
                            <span style={{color:'#888',fontSize:'0.9rem',transition:'transform 0.2s',transform:isCollapsed?'rotate(-90deg)':'rotate(0deg)'}}>▼</span>
                            <h3 style={{fontSize:'1rem',margin:0}}>{exp.title}</h3>
                            <span className={`badge badge-${exp.status === 'active' ? 'success' : 'info'}`} style={{fontSize:'0.7rem'}}>{expSi.label}</span>
                            <span style={{fontSize:'0.8rem',color:'#888'}}>🔁 {reps.length} rep{reps.length !== 1 ? 's' : ''}</span>
                            <span style={{fontSize:'0.8rem',color:'#999'}}>📓 {expEntries.length}</span>
                          </div>
                          <div style={{display:'flex',gap:6}} onClick={(e) => e.stopPropagation()}>
                            <button className="btn btn-sm btn-secondary" onClick={() => handleCreateReplicate(exp.id)} title="New Replicate">+ Rep</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => openAddEntry(exp.id, reps.length > 0 ? reps[0].id : '')} title="New Entry">+ Entry</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => openEditExperiment(exp)}>✏️</button>
                            <button className="btn btn-sm btn-danger" onClick={() => { setDeleteTarget(exp); setDeleteType('experiment'); }}>🗑️</button>
                          </div>
                        </div>

                        {/* Experiment Content (replicates + entries) */}
                        {!isCollapsed && (
                          <div style={{padding:'0 16px 16px'}}>
                            {exp.description && <p style={{color:'#666',fontSize:'0.85rem',marginBottom:12}}>{exp.description}</p>}

                            {reps.length === 0 ? (
                              /* No replicates yet — show entries directly */
                              <div>
                                {expEntries.length === 0 ? (
                                  <div style={{color:'#999',fontSize:'0.85rem',padding:8,textAlign:'center'}}>No entries yet. Create a replicate or add an entry.</div>
                                ) : (
                                  expEntries.map(entry => renderEntryCard(entry))
                                )}
                              </div>
                            ) : (
                              /* Replicates */
                              reps.map(rep => {
                                const repEntries = getEntriesForReplicate(exp.id, rep.id);
                                const isRepCollapsed = collapsedReps.has(rep.id);
                                const repDates = repEntries.length > 0 ? repEntries.reduce((acc, e) => {
                                  const d = e.entry_date || e.created_at?.split('T')[0] || '';
                                  if (d && (!acc.oldest || d < acc.oldest)) acc.oldest = d;
                                  if (d && (!acc.newest || d > acc.newest)) acc.newest = d;
                                  return acc;
                                }, { oldest: null, newest: null }) : { oldest: null, newest: null };

                                return (
                                  <div key={rep.id} style={{marginBottom:12,border:'1px solid #eee',borderRadius:8,overflow:'hidden'}}>
                                    <div style={{ padding:'10px 14px', background:'#f0f4f8', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                                      onClick={() => { const n = new Set(collapsedReps); isRepCollapsed ? n.delete(rep.id) : n.add(rep.id); setCollapsedReps(n); }}>
                                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                                        <span style={{color:'#888',fontSize:'0.8rem',transition:'transform 0.2s',transform:isRepCollapsed?'rotate(-90deg)':'rotate(0deg)'}}>▼</span>
                                        <strong style={{fontSize:'0.9rem'}}>🔁 Replicate {rep.replicate_number}</strong>
                                        <span style={{fontSize:'0.75rem',color:'#888'}}>
                                          {repDates.oldest ? `${new Date(repDates.oldest + 'T12:00:00').toLocaleDateString()} – ${new Date(repDates.newest + 'T12:00:00').toLocaleDateString()}` : 'No entries yet'}
                                        </span>
                                        <span style={{fontSize:'0.75rem',color:'#999'}}>({repEntries.length} entries)</span>
                                      </div>
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <button className="btn btn-sm btn-secondary" onClick={() => openAddEntry(exp.id, rep.id)} style={{padding:'2px 8px',fontSize:'0.75rem'}}>+ Entry</button>
                                      </div>
                                    </div>
                                    {!isRepCollapsed && (
                                      <div style={{padding:'8px 14px'}}>
                                        {repEntries.length === 0 ? (
                                          <div style={{color:'#999',fontSize:'0.85rem',padding:8,textAlign:'center'}}>No entries for this replicate yet.</div>
                                        ) : (
                                          repEntries.map(entry => renderEntryCard(entry))
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}

                            {/* Entries not tied to any replicate */}
                            {reps.length > 0 && (() => {
                              const unassigned = expEntries.filter(e => !e.replicate_id || !reps.find(r => r.id === e.replicate_id));
                              if (unassigned.length === 0) return null;
                              return (
                                <div style={{marginTop:8,borderTop:'1px solid #eee',paddingTop:8}}>
                                  <div style={{fontSize:'0.8rem',color:'#888',fontWeight:600,marginBottom:4}}>Unassigned Entries ({unassigned.length})</div>
                                  {unassigned.map(entry => renderEntryCard(entry))}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Project-level entries */}
              {(() => {
                const projEntries = getProjectLevelEntries();
                if (projEntries.length === 0) return null;
                return (
                  <div style={{marginTop:20,borderTop:'2px solid #eee',paddingTop:16}}>
                    <h3 style={{fontSize:'1rem',color:'#2c3e50',marginBottom:12}}>📓 Project-Level Entries ({projEntries.length})</h3>
                    {projEntries.map(entry => renderEntryCard(entry))}
                  </div>
                );
              })()}
            </div>
          ) : (
            /* All Entries view */
            <div className="card">
              <div className="card-header">
                <h2 style={{fontSize:'1.1rem'}}>📓 All Entries ({entries.length})</h2>
                <button className="btn btn-primary" onClick={() => openAddEntry('', '')}>+ New Entry</button>
              </div>
              {entries.length === 0 ? (
                <div className="empty-state"><div className="emoji">📓</div><p>No entries yet.</p></div>
              ) : (
                groupByDate(entries).map(([date, dateEntries]) => (
                  <div key={date} style={{marginBottom:16}}>
                    <h3 style={{fontSize:'0.95rem',color:'#2c3e50',marginBottom:8,borderBottom:'1px solid #eee',paddingBottom:6}}>
                      📅 {date === 'No date' ? date : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      <span style={{color:'#999',fontWeight:400,marginLeft:8}}>({dateEntries.length})</span>
                    </h3>
                    {dateEntries.map(entry => renderEntryCard(entry))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Project Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:700}}>
            <h2>Edit Project</h2>
            <div className="form-group"><label>Title *</label><input value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})} autoFocus /></div>
            <div className="form-group"><label>Purpose</label><textarea value={editForm.purpose} onChange={(e) => setEditForm({...editForm, purpose: e.target.value})} rows={2} style={{resize:'vertical'}} /></div>
            <div className="form-group"><label>Hypothesis</label><textarea value={editForm.hypothesis} onChange={(e) => setEditForm({...editForm, hypothesis: e.target.value})} rows={2} style={{resize:'vertical'}} /></div>
            <div className="form-group"><label>Description</label><textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} rows={2} style={{resize:'vertical'}} /></div>
            <div className="form-row">
              <div className="form-group"><label>Status</label><select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})}>{STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              <div className="form-group"><label>Tags</label><input value={editForm.tags} onChange={(e) => setEditForm({...editForm, tags: e.target.value})} placeholder="comma, separated, tags" /></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveProject}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Experiment Modal */}
      {showExpModal && (
        <div className="modal-overlay" onClick={() => setShowExpModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:500}}>
            <h2>{editingExp ? 'Edit Experiment' : 'New Experiment'}</h2>
            <div className="form-group"><label>Title *</label><input value={expForm.title} onChange={(e) => setExpForm({...expForm, title: e.target.value})} autoFocus placeholder="e.g., Western Blot - GAPDH" /></div>
            <div className="form-group"><label>Description</label><textarea value={expForm.description} onChange={(e) => setExpForm({...expForm, description: e.target.value})} rows={2} style={{resize:'vertical'}} placeholder="Brief description of this experiment..." /></div>
            <div className="form-group"><label>Tags</label><input value={expForm.tags} onChange={(e) => setExpForm({...expForm, tags: e.target.value})} placeholder="comma, separated, tags" /></div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowExpModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveExperiment}>{editingExp ? 'Save Changes' : 'Create'}</button>
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
              <div className="form-group"><label>Title *</label><input value={entryForm.title} onChange={(e) => setEntryForm({...entryForm, title: e.target.value})} autoFocus /></div>
              <div className="form-group"><label>Date</label><input type="date" value={entryForm.entry_date} onChange={(e) => setEntryForm({...entryForm, entry_date: e.target.value})} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Experiment</label>
                <select value={entryForm.experiment_id} onChange={(e) => {
                  const expId = e.target.value;
                  const exp = experiments.find(ex => ex.id === expId);
                  const latestRep = exp && exp.replicates && exp.replicates.length > 0 ? exp.replicates[0].id : '';
                  setEntryForm({...entryForm, experiment_id: expId, replicate_id: latestRep});
                }}>
                  <option value="">— Project level —</option>
                  {experiments.map(exp => <option key={exp.id} value={exp.id}>{exp.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Replicate</label>
                <select value={entryForm.replicate_id} onChange={(e) => setEntryForm({...entryForm, replicate_id: e.target.value})}
                  disabled={!entryForm.experiment_id}>
                  <option value="">— None —</option>
                  {entryForm.experiment_id && (() => {
                    const exp = experiments.find(ex => ex.id === entryForm.experiment_id);
                    return (exp?.replicates || []).map(rep => (
                      <option key={rep.id} value={rep.id}>Replicate {rep.replicate_number}</option>
                    ));
                  })()}
                </select>
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
              <textarea ref={contentRef} value={entryForm.content} onChange={handleContentChange} onKeyDown={handleContentKeyDown}
                rows={10} style={{resize:'vertical',fontFamily:'inherit',lineHeight:1.6}} placeholder="Record your observations, protocol steps, results..." />
              {mentionOpen && (
                <div style={{ position:'absolute',top:'100%',left:0,right:0,marginTop:4, background:'white',border:'1px solid #ddd',borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.1)',maxHeight:280,overflowY:'auto',zIndex:200 }}>
                  {getMentionResults().filter(r => r.type !== 'header').length === 0 ? (
                    <div style={{padding:12}}>
                      <div style={{color:'#999',fontSize:'0.9rem',marginBottom:8}}>No matches found</div>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => { setMentionOpen(false); setQuickCreateType('reagent'); setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: '', storage_location_id: '', quantity: '', quantity_unit: '' }); setShowQuickCreate(true); }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => { setMentionOpen(false); setQuickCreateType('sample'); setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], storage_location_id: '', quantity: '', quantity_unit: '' }); setShowQuickCreate(true); }}>+ New Sample</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {getMentionResults().map((r, i) => (
                        r.type === 'header' ? (
                          <div key={i} style={{padding:'6px 14px',fontSize:'0.75rem',fontWeight:600,color:'#888',textTransform:'uppercase',background:'#f8f9fa',borderBottom:'1px solid #eee'}}>{r.label}</div>
                        ) : (
                          <div key={i} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0f0f0',fontSize:'0.9rem'}}
                            onClick={() => insertMention(r.type, r.item)}
                            onMouseOver={(e) => e.currentTarget.style.background = '#f0f7ff'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'white'}>{r.label}</div>
                        )
                      ))}
                      <div style={{padding:'8px 14px',borderTop:'1px solid #eee',display:'flex',gap:8}}>
                        <button className="btn btn-sm btn-secondary" onClick={() => { setMentionOpen(false); setQuickCreateType('reagent'); setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: '', storage_location_id: '', quantity: '', quantity_unit: '' }); setShowQuickCreate(true); }}>+ New Reagent</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => { setMentionOpen(false); setQuickCreateType('sample'); setQuickCreateForm({ name: mentionSearch, extra: '', date_collected: new Date().toISOString().split('T')[0], storage_location_id: '', quantity: '', quantity_unit: '' }); setShowQuickCreate(true); }}>+ New Sample</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {showLinkPopover && (
                <div style={{ position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)', background:'white',border:'1px solid #ddd',borderRadius:8,padding:16, boxShadow:'0 4px 12px rgba(0,0,0,0.15)',zIndex:300,width:300 }} onClick={(e) => e.stopPropagation()}>
                  <div style={{fontWeight:600,fontSize:'0.9rem',marginBottom:8}}>🔗 Insert Link</div>
                  <div className="form-group" style={{marginBottom:8}}><input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Link text" style={{fontSize:'0.85rem',padding:8}} /></div>
                  <div className="form-group" style={{marginBottom:8}}><input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." style={{fontSize:'0.85rem',padding:8}} /></div>
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
                    <span key={i} style={{ background: li.type === 'reagent' ? '#d6eaf8' : '#d5f5e3', padding:'4px 10px',borderRadius:12,fontSize:'0.8rem',display:'flex',alignItems:'center',gap:4 }}>
                      {li.type === 'reagent' ? '📦' : '🧫'} {li.name}
                      <span style={{cursor:'pointer',marginLeft:4,color:'#e74c3c'}} onClick={() => setEntryForm({...entryForm, linked_items: entryForm.linked_items.filter((_, j) => j !== i)})}>×</span>
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
            <div className="form-group"><label>Name *</label><input value={quickCreateForm.name} onChange={(e) => setQuickCreateForm({...quickCreateForm, name: e.target.value})} autoFocus /></div>
            <div className="form-group"><label>{quickCreateType === 'reagent' ? 'Vendor' : 'Organism/Strain'}</label><input value={quickCreateForm.extra} onChange={(e) => setQuickCreateForm({...quickCreateForm, extra: e.target.value})} /></div>
            {quickCreateType === 'sample' && (
              <>
                <div className="form-row">
                  <div className="form-group"><label>Date Collected</label><input type="date" value={quickCreateForm.date_collected} onChange={(e) => setQuickCreateForm({...quickCreateForm, date_collected: e.target.value})} /></div>
                  <div className="form-group"><label>Storage Location</label>
                    <select value={quickCreateForm.storage_location_id} onChange={(e) => setQuickCreateForm({...quickCreateForm, storage_location_id: e.target.value})}>
                      <option value="">— None —</option>
                      {storageLocations.map(l => (<option key={l.id} value={l.id}>{l.unit_name || ''}{l.rack ? ` → Rack ${l.rack}` : ''}{l.box ? ` → Box ${l.box}` : ''}</option>))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Quantity</label><input type="number" step="any" value={quickCreateForm.quantity} onChange={(e) => setQuickCreateForm({...quickCreateForm, quantity: e.target.value})} /></div>
                  <div className="form-group"><label>Unit</label><input value={quickCreateForm.quantity_unit} onChange={(e) => setQuickCreateForm({...quickCreateForm, quantity_unit: e.target.value})} placeholder="e.g., µL, vials" /></div>
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

      {/* Status Update Prompt */}
      {showStatusPrompt && (
        <div className="modal-overlay" onClick={() => handleStatusUpdate('no')}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth:480}}>
            <h2>🧫 Update Sample Status?</h2>
            <p style={{color:'#555',marginBottom:16}}>{newlyLinkedSamples.length === 1 ? 'Change its status to "In Use"?' : `Change ${newlyLinkedSamples.length} samples to "In Use"?`}</p>
            {statusPromptMode === 'ask' ? (
              <>
                <div style={{marginBottom:16}}>{newlyLinkedSamples.map(s => (<div key={s.id} style={{padding:'6px 0',fontSize:'0.9rem',display:'flex',alignItems:'center',gap:8}}><span style={{background:'#d5f5e3',padding:'2px 8px',borderRadius:10,fontSize:'0.8rem'}}>🧫 {s.name}</span><span style={{color:'#888',fontSize:'0.8rem'}}>({s.status})</span></div>))}</div>
                <div className="modal-actions" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button className="btn btn-secondary" onClick={() => handleStatusUpdate('no')}>No</button>
                  {newlyLinkedSamples.length > 1 && <button className="btn btn-secondary" onClick={() => setStatusPromptMode('custom')}>Custom</button>}
                  <button className="btn btn-primary" onClick={() => handleStatusUpdate('yes')}>Yes{newlyLinkedSamples.length > 1 ? ', all' : ''}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{marginBottom:16}}>{newlyLinkedSamples.map(s => (
                  <label key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',cursor:'pointer',fontSize:'0.9rem'}}>
                    <input type="checkbox" checked={selectedForStatusUpdate.has(s.id)} onChange={(e) => { const n = new Set(selectedForStatusUpdate); e.target.checked ? n.add(s.id) : n.delete(s.id); setSelectedForStatusUpdate(n); }} />
                    <span style={{background:'#d5f5e3',padding:'2px 8px',borderRadius:10,fontSize:'0.8rem'}}>🧫 {s.name}</span>
                  </label>
                ))}</div>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setStatusPromptMode('ask')}>Back</button>
                  <button className="btn btn-primary" onClick={() => handleStatusUpdate('custom')} disabled={selectedForStatusUpdate.size === 0}>Update Selected ({selectedForStatusUpdate.size})</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <DeleteConfirmModal
          itemName={deleteType === 'project' ? `"${deleteTarget.title}" and all experiments & entries` : deleteType === 'experiment' ? `experiment "${deleteTarget.title}" and its entries` : `entry "${deleteTarget.title}"`}
          onConfirm={deleteType === 'project' ? handleDeleteProject : deleteType === 'experiment' ? handleDeleteExperiment : handleDeleteEntry}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );

  function renderEntryCard(entry) {
    const ti = typeInfo(entry.entry_type);
    return (
      <div key={entry.id} style={{ border:'1px solid #eee',borderRadius:8,padding:12,marginBottom:8, borderLeft:`3px solid ${ti.color}` }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <strong style={{fontSize:'0.9rem'}}>{entry.title}</strong>
              <span className="badge badge-info" style={{fontSize:'0.65rem'}}>{ti.label}</span>
              <span style={{fontSize:'0.75rem',color:'#999'}}>📅 {entry.entry_date}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:4}}>
            <button className="btn btn-sm btn-secondary" onClick={() => openEditEntry(entry)} style={{padding:'2px 8px',fontSize:'0.75rem'}}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => { setDeleteTarget(entry); setDeleteType('entry'); }} style={{padding:'2px 8px',fontSize:'0.75rem'}}>🗑️</button>
          </div>
        </div>
        {entry.content && (
          <div style={{background:'#fafafa',padding:8,borderRadius:6,fontSize:'0.85rem',lineHeight:1.5}}>
            {renderContent(entry.content, entry.linked_items)}
          </div>
        )}
        {entry.linked_items && entry.linked_items.length > 0 && (
          <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>
            {entry.linked_items.map((li, j) => (
              <span key={j} style={{ background: li.type === 'reagent' ? '#d6eaf8' : '#d5f5e3', padding:'2px 6px',borderRadius:8,fontSize:'0.7rem',fontWeight:500 }}>{li.type === 'reagent' ? '📦' : '🧫'} {li.name}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  function groupByDate(items) {
    const groups = {};
    items.forEach(e => { const d = e.entry_date || 'No date'; if (!groups[d]) groups[d] = []; groups[d].push(e); });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }
}

export default ProjectDetail;
