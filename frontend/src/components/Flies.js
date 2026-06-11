import React, { useState, useEffect, useCallback } from 'react';
import { flyAPI } from '../api';
import DeleteConfirmModal from './DeleteConfirmModal';

const STAGES = [
  { value: 'new_tube', label: '🆕 New tube', short: 'New' },
  { value: 'L3', label: '🐛 L3', short: 'L3' },
  { value: 'wandering_L3', label: '🚶 Wandering L3', short: 'Wand. L3' },
  { value: 'pupa', label: '🛡️ Pupa', short: 'Pupa' },
  { value: 'new_adults', label: '🪰 New adults', short: 'Adults' },
];
const stageLabel = (v) => (STAGES.find(s => s.value === v) || {}).short || v;

const todayStr = () => new Date().toISOString().split('T')[0];
// Date-based "set" label: month.day, no year (e.g. "6.4"). Falls back to cohort number.
const setLabel = (v) => {
  if (v.start_date) {
    const d = new Date(v.start_date + 'T12:00:00');
    if (!isNaN(d.getTime())) return `${d.getMonth() + 1}.${d.getDate()}`;
  }
  return String(v.cohort_number || 1);
};

function Flies() {
  const [vials, setVials] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showVialModal, setShowVialModal] = useState(false);
  const [editingVial, setEditingVial] = useState(null);
  const [vialForm, setVialForm] = useState(emptyVialForm());

  const [showBoxModal, setShowBoxModal] = useState(false);
  const [editingBox, setEditingBox] = useState(null);
  const [boxForm, setBoxForm] = useState({ name: '', temperature: 22, notes: '' });

  const [obsVial, setObsVial] = useState(null); // vial we're logging an observation for
  const [obsDate, setObsDate] = useState(todayStr());
  const [obsStages, setObsStages] = useState([]); // multi-select: stages present today
  const [obsSaving, setObsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [expandedLineage, setExpandedLineage] = useState(null);
  const [attnOpen, setAttnOpen] = useState(true);     // attention detail list expanded?
  const [showTomorrow, setShowTomorrow] = useState(false); // quiet "preview tomorrow" peek
  const [transferEdit, setTransferEdit] = useState(null);  // vial whose transfer date we're editing
  const [transferDateInput, setTransferDateInput] = useState(todayStr());

  function emptyVialForm() {
    return { name: '', type: 'cross', genotype: '', box_id: '', target_stage: 'L3', start_date: todayStr(), flip_interval_days: 21 };
  }

  const fetchData = useCallback(async () => {
    try {
      const [vialsRes, boxesRes] = await Promise.all([flyAPI.getVials(), flyAPI.getBoxes()]);
      setVials(vialsRes.data);
      setBoxes(boxesRes.data);
    } catch (err) {
      setError('Failed to load: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ----- Vial CRUD -----
  const openAddVial = () => { setEditingVial(null); setVialForm({ ...emptyVialForm(), box_id: boxes[0]?.id || '' }); setShowVialModal(true); };
  const openEditVial = (v) => {
    setEditingVial(v);
    setVialForm({ name: v.name, type: v.type, genotype: v.genotype || '', box_id: v.box_id || '', target_stage: v.target_stage || 'L3', start_date: v.start_date || todayStr(), flip_interval_days: v.flip_interval_days || 21 });
    setShowVialModal(true);
  };
  const saveVial = async () => {
    if (!vialForm.name.trim()) { alert('Name is required'); return; }
    try {
      if (editingVial) await flyAPI.updateVial(editingVial.id, vialForm);
      else await flyAPI.createVial(vialForm);
      setShowVialModal(false); setLoading(true); fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save'); }
  };
  const doDeleteVial = async () => {
    try { await flyAPI.deleteVial(deleteTarget.id); setDeleteTarget(null); fetchData(); }
    catch (err) { alert('Failed to delete'); }
  };
  const archiveVial = async (v) => {
    if (!window.confirm(`Archive "${v.name}"? It'll disappear from the active view but its growth data is kept (and still helps predict future cohorts in this lineage). Use this when you've tossed the adults.`)) return;
    try { await flyAPI.updateVial(v.id, { status: 'archived' }); setLoading(true); fetchData(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to archive'); }
  };
  const flipStock = async (v) => {
    if (!window.confirm(`Flip "${v.name}" today? Next flip will be scheduled in ${v.flip_interval_days || 21} days.`)) return;
    try { await flyAPI.flipVial(v.id, { flip_date: todayStr() }); setLoading(true); fetchData(); }
    catch (err) { alert('Failed to flip'); }
  };
  const transferParents = async (v) => {
    if (!window.confirm(`Transfer the parents from "${v.name}" into a fresh tube today? This creates the next staggered cohort and leaves this tube to keep developing.`)) return;
    try { await flyAPI.transferVial(v.id, { transfer_date: todayStr() }); setLoading(true); fetchData(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to transfer'); }
  };
  // Snooze any attention item on a vial: hide it from Attention until +N days.
  const snoozeVial = async (v, days = 1) => {
    const until = new Date(); until.setDate(until.getDate() + days);
    const untilStr = until.toISOString().split('T')[0];
    try { await flyAPI.updateVial(v.id, { snooze_until: untilStr }); setLoading(true); fetchData(); }
    catch (err) { alert('Failed to snooze'); }
  };
  const openTransferEdit = (v) => { setTransferDateInput(v.transfer_date || todayStr()); setTransferEdit(v); };
  const saveTransferDate = async () => {
    try { await flyAPI.updateVial(transferEdit.id, { transfer_date: transferDateInput }); setTransferEdit(null); setLoading(true); fetchData(); }
    catch (err) { alert('Failed to set transfer date'); }
  };

  // ----- Observations -----
  const toggleObsStage = (stage) => {
    setObsStages(prev => prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]);
  };
  const openObs = (v) => { setObsDate(todayStr()); setObsStages([]); setObsVial(v); };
  const saveObservations = async () => {
    if (obsStages.length === 0) { alert('Pick at least one stage you see (or Cancel).'); return; }
    setObsSaving(true);
    try {
      // One observation row per stage present, all sharing today's date. The prediction
      // model already takes the most-advanced stage at the latest time, so logging the
      // full mix preserves the staggering signal without breaking ETA math.
      for (const stage of obsStages) {
        await flyAPI.addObservation(obsVial.id, { stage_seen: stage, observed_at: obsDate });
      }
      setObsVial(null); setObsDate(todayStr()); setObsStages([]); setLoading(true); fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to log');
    } finally {
      setObsSaving(false);
    }
  };

  // ----- Boxes -----
  const openAddBox = () => { setEditingBox(null); setBoxForm({ name: '', temperature: 22, notes: '' }); setShowBoxModal(true); };
  const openEditBox = (b) => { setEditingBox(b); setBoxForm({ name: b.name, temperature: b.temperature, notes: b.notes || '' }); setShowBoxModal(true); };
  const saveBox = async () => {
    if (!boxForm.name.trim()) { alert('Box name required'); return; }
    try {
      if (editingBox) await flyAPI.updateBox(editingBox.id, boxForm);
      else await flyAPI.createBox(boxForm);
      setShowBoxModal(false); setLoading(true); fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save box'); }
  };
  const deleteBox = async (b) => {
    const inUse = vials.filter(v => v.box_id === b.id).length;
    if (inUse > 0) { alert(`Can't delete "${b.name}" — ${inUse} tube(s) still in it. Move them first.`); return; }
    if (!window.confirm(`Delete box "${b.name}"?`)) return;
    try { await flyAPI.deleteBox(b.id); setLoading(true); fetchData(); }
    catch (err) { alert('Failed to delete box'); }
  };

  // ----- Attention helpers -----
  const flipDueInfo = (v) => {
    if (v.type !== 'stock' || !v.next_flip_date) return null;
    const days = Math.ceil((new Date(v.next_flip_date + 'T12:00:00') - new Date()) / 86400000);
    return { days, date: v.next_flip_date };
  };
  const predBadge = (p) => {
    if (!p) return null;
    const color = { high: '#27ae60', medium: '#e67e22', low: '#95a5a6' }[p.confidence] || '#95a5a6';
    return <span style={{ background: '#f4f6f8', color, border: `1px solid ${color}`, padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 600 }}>{stageLabel(p.predicted_stage)}</span>;
  };

  if (loading) return <div className="loading">Loading flies...</div>;
  if (error) return <div className="card"><div style={{ color: '#e74c3c', padding: 20 }}>{error}</div></div>;

  // Group vials by box
  const byBox = {};
  vials.forEach(v => { const k = v.box_id || 'unassigned'; (byBox[k] = byBox[k] || []).push(v); });

  // ---- Attention model (grouped by cross, tiered today/tomorrow, snooze-aware) ----
  // An item's `due` is days-from-now (<=0.5 => "now", <=1.5 => "tomorrow"). Anything
  // further out lives on the tube card, not here. Transfer only shows when OVERDUE.
  const todayISO = todayStr();
  const isSnoozed = (v) => v.snooze_until && v.snooze_until > todayISO;
  const rawItems = [];
  vials.forEach(v => {
    if (isSnoozed(v)) return;
    const fd = flipDueInfo(v);
    if (fd && fd.days <= 1) rawItems.push({ vial: v, kind: 'flip', due: fd.days,
      text: fd.days < 0 ? `Flip overdue ${-fd.days}d` : fd.days === 0 ? 'Flip due today' : 'Flip tomorrow' });
    if (v.type === 'cross' && v.prediction) {
      const p = v.prediction;
      if (p.eta_to_target_days != null && p.eta_to_target_days <= 1.5 && p.eta_to_target_days >= -2)
        rawItems.push({ vial: v, kind: 'target', due: Math.max(0, p.eta_to_target_days),
          text: p.eta_to_target_days <= 0.5 ? `${stageLabel(p.target_stage)} window open` : `${stageLabel(p.target_stage)} window tomorrow` });
      if (p.clear_parents_in_days != null && p.clear_parents_in_days <= 1.5 && p.clear_parents_in_days >= -3)
        rawItems.push({ vial: v, kind: 'parents', due: p.clear_parents_in_days,
          text: p.clear_parents_in_days <= 0.5 ? '⚠️ Clear parents' : 'Clear parents tomorrow' });
      // Transfer ONLY when overdue (negative days). Recurring on-schedule nudge stays off the alert list.
      if (v.holds_parents && p.transfer_due_in_days != null && p.transfer_due_in_days < 0)
        rawItems.push({ vial: v, kind: 'transfer', due: p.transfer_due_in_days,
          text: `Transfer parents (${-Math.round(p.transfer_due_in_days)}d overdue)` });
    }
  });
  // Split into today (due <= 0.5) and tomorrow (the rest, <= 1.5).
  // Tomorrow peek also pulls cross target/clear-parents/flip items landing within ~2 days
  // even if they didn't make the strict rawItems cut, so the peek is genuinely useful.
  const todayItems = rawItems.filter(i => i.due <= 0.5);
  const tomorrowItems = [];
  vials.forEach(v => {
    if (isSnoozed(v)) return;
    const fd = flipDueInfo(v);
    if (fd && fd.days === 1) tomorrowItems.push({ vial: v, kind: 'flip', due: 1, text: 'Flip tomorrow' });
    if (v.type === 'cross' && v.prediction) {
      const p = v.prediction;
      if (p.eta_to_target_days != null && p.eta_to_target_days > 0.5 && p.eta_to_target_days <= 2)
        tomorrowItems.push({ vial: v, kind: 'target', due: p.eta_to_target_days, text: `${stageLabel(p.target_stage)} window ~${p.eta_to_target_days}d` });
      if (p.clear_parents_in_days != null && p.clear_parents_in_days > 0.5 && p.clear_parents_in_days <= 2)
        tomorrowItems.push({ vial: v, kind: 'parents', due: p.clear_parents_in_days, text: `Clear parents ~${p.clear_parents_in_days}d` });
    }
  });
  tomorrowItems.sort((a, b) => a.due - b.due);
  // Summary counts (today only).
  const counts = { target: 0, transfer: 0, parents: 0, flip: 0 };
  todayItems.forEach(i => { counts[i.kind] = (counts[i.kind] || 0) + 1; });
  const summaryChips = [
    counts.target && `🎯 ${counts.target} window${counts.target > 1 ? 's' : ''} open`,
    counts.parents && `👪 ${counts.parents} clear-parents`,
    counts.transfer && `🔄 ${counts.transfer} transfer${counts.transfer > 1 ? 's' : ''} overdue`,
    counts.flip && `🧪 ${counts.flip} flip${counts.flip > 1 ? 's' : ''}`,
  ].filter(Boolean);
  // Group today's items by cross lineage (stocks group as themselves).
  const groupKey = (v) => (v.type === 'cross' ? (v.lineage_id || v.id) : `stock:${v.id}`);
  const groupName = (v) => (v.type === 'cross'
    ? (v.name || 'Cross').replace(/\s*[\u2014-]\s*set\s*[\d.]+\s*$/i, '').trim()
    : v.name);
  const attnGroups = {}; const attnOrder = [];
  todayItems.forEach(i => {
    const k = groupKey(i.vial);
    if (!attnGroups[k]) { attnGroups[k] = { name: groupName(i.vial), items: [] }; attnOrder.push(k); }
    attnGroups[k].items.push(i);
  });
  // Sort groups: most-urgent (lowest due) first.
  attnOrder.sort((a, b) => Math.min(...attnGroups[a].items.map(i => i.due)) - Math.min(...attnGroups[b].items.map(i => i.due)));
  const kindColor = (k) => ({ parents: '#c0392b', transfer: '#9b59b6', target: '#b9770e', flip: '#16a085' }[k] || '#555');

  return (
    <div>
      {/* Attention */}
      <div className="card">
        <div className="card-header">
          <h2>🪰 Drosophila Manager ({vials.length} tube{vials.length !== 1 ? 's' : ''})</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={openAddBox}>+ Box</button>
            <button className="btn btn-primary" onClick={openAddVial} disabled={boxes.length === 0}>+ Tube</button>
          </div>
        </div>
        {boxes.length === 0 && (
          <div className="empty-state"><div className="emoji">📦</div><p>Add a box first (with its temperature), then start adding tubes.</p></div>
        )}
        {boxes.length > 0 && (
          <div style={{ background: '#fff8e1', border: '1px solid #ffe0a3', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
            {/* Summary bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', cursor: todayItems.length ? 'pointer' : 'default' }}
              onClick={() => todayItems.length && setAttnOpen(o => !o)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b9770e', textTransform: 'uppercase' }}>⏰ Today</span>
                {summaryChips.length > 0 ? summaryChips.map((c, i) => (
                  <span key={i} style={{ fontSize: '0.78rem', background: '#fff', border: '1px solid #ffd98a', borderRadius: 12, padding: '2px 9px', color: '#8a5a00', fontWeight: 600 }}>{c}</span>
                )) : <span style={{ fontSize: '0.82rem', color: '#999' }}>Nothing due today 🎉</span>}
              </div>
              {todayItems.length > 0 && <span style={{ color: '#b9770e', fontSize: '0.8rem' }}>{attnOpen ? '▲' : '▼'}</span>}
            </div>

            {/* Grouped today detail */}
            {attnOpen && attnOrder.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attnOrder.map(k => {
                  const grp = attnGroups[k];
                  return (
                    <div key={k} style={{ background: '#fff', border: '1px solid #f0e3c2', borderRadius: 8, padding: '7px 10px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 3 }}>{grp.items[0].vial.type === 'cross' ? '⚗️' : '🧪'} {grp.name}</div>
                      {grp.items.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '0.85rem', padding: '2px 0' }}>
                          <span style={{ color: kindColor(a.kind) }}>
                            {a.vial.cohort_number > 1 || a.vial.lineage_id !== a.vial.id ? <span style={{ color: '#aaa' }}>set {setLabel(a.vial)} · </span> : null}
                            {a.text}
                          </span>
                          <span style={{ display: 'flex', gap: 4 }}>
                            {a.kind === 'transfer' && <button className="btn btn-sm btn-secondary" style={{ padding: '1px 7px', fontSize: '0.72rem' }} onClick={() => openTransferEdit(a.vial)} title="Edit the next transfer date">📅</button>}
                            <button className="btn btn-sm btn-secondary" style={{ padding: '1px 7px', fontSize: '0.72rem' }} onClick={() => snoozeVial(a.vial, 1)} title="Snooze 1 day">💤</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quiet tomorrow peek — always shown so the affordance is discoverable */}
            <div style={{ marginTop: 8, borderTop: '1px dashed #ffe0a3', paddingTop: 6 }}>
                <span style={{ fontSize: '0.76rem', color: tomorrowItems.length ? '#b08a3a' : '#bbb', cursor: tomorrowItems.length ? 'pointer' : 'default' }} onClick={() => tomorrowItems.length && setShowTomorrow(s => !s)}>
                  {tomorrowItems.length === 0 ? '○ nothing coming tomorrow' : showTomorrow ? '▲ hide tomorrow' : `▼ preview tomorrow (${tomorrowItems.length})`}
                </span>
                {showTomorrow && (
                  <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {tomorrowItems.map((a, i) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#999', display: 'flex', gap: 6 }}>
                        <strong style={{ color: '#888' }}>{groupName(a.vial)}{a.vial.cohort_number > 1 ? ` (set ${setLabel(a.vial)})` : ''}</strong>
                        <span>{a.text}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>

      {/* Boxes & tubes */}
      {boxes.map(box => {
        const tubes = byBox[box.id] || [];
        return (
          <div className="card" key={box.id}>
            <div className="card-header">
              <h3 style={{ fontSize: '1.05rem', margin: 0 }}>📦 {box.name} <span style={{ fontSize: '0.85rem', color: '#888', fontWeight: 400 }}>· {box.temperature}°C · {tubes.length} tube{tubes.length !== 1 ? 's' : ''}</span></h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => openEditBox(box)}>✏️</button>
                <button className="btn btn-sm btn-secondary" onClick={() => deleteBox(box)}>🗑️</button>
              </div>
            </div>
            {tubes.length === 0 ? (
              <div style={{ color: '#999', fontSize: '0.88rem', padding: 8 }}>No tubes in this box yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {renderTubeList(tubes)}
              </div>
            )}
          </div>
        );
      })}
      {(byBox.unassigned || []).length > 0 && (
        <div className="card">
          <div className="card-header"><h3 style={{ fontSize: '1.05rem', margin: 0 }}>❔ Unassigned</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{renderTubeList(byBox.unassigned)}</div>
        </div>
      )}

      {/* Vial Modal */}
      {showVialModal && (
        <div className="modal-overlay" onClick={() => setShowVialModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2>{editingVial ? 'Edit Tube' : 'New Tube'}</h2>
            <div className="form-row">
              <div className="form-group"><label>Name *</label><input value={vialForm.name} onChange={(e) => setVialForm({ ...vialForm, name: e.target.value })} autoFocus placeholder="e.g., w1118 × Arc1-GAL4" /></div>
              <div className="form-group"><label>Type</label>
                <select value={vialForm.type} onChange={(e) => setVialForm({ ...vialForm, type: e.target.value })}>
                  <option value="cross">⚗️ Cross</option>
                  <option value="stock">🧪 Stock</option>
                </select>
              </div>
            </div>
            <div className="form-group"><label>Genotype / strain</label><input value={vialForm.genotype} onChange={(e) => setVialForm({ ...vialForm, genotype: e.target.value })} placeholder="optional" /></div>
            <div className="form-row">
              <div className="form-group"><label>Box</label>
                <select value={vialForm.box_id} onChange={(e) => setVialForm({ ...vialForm, box_id: e.target.value })}>
                  <option value="">— Select box —</option>
                  {boxes.map(b => <option key={b.id} value={b.id}>{b.name} ({b.temperature}°C)</option>)}
                </select>
              </div>
              <div className="form-group"><label>{vialForm.type === 'cross' ? 'Parents set on' : 'Started on'}</label><input type="date" value={vialForm.start_date} onChange={(e) => setVialForm({ ...vialForm, start_date: e.target.value })} /></div>
            </div>
            {vialForm.type === 'cross' ? (
              <div className="form-group"><label>Target stage to catch</label>
                <select value={vialForm.target_stage} onChange={(e) => setVialForm({ ...vialForm, target_stage: e.target.value })}>
                  {STAGES.filter(s => s.value !== 'new_tube').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group"><label>Flip every (days)</label><input type="number" value={vialForm.flip_interval_days} onChange={(e) => setVialForm({ ...vialForm, flip_interval_days: e.target.value })} /></div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowVialModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveVial}>{editingVial ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Box Modal */}
      {showBoxModal && (
        <div className="modal-overlay" onClick={() => setShowBoxModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h2>{editingBox ? 'Edit Box' : 'New Box'}</h2>
            <div className="form-group"><label>Name *</label><input value={boxForm.name} onChange={(e) => setBoxForm({ ...boxForm, name: e.target.value })} autoFocus placeholder="e.g., Bench box 1" /></div>
            <div className="form-group"><label>Temperature (°C)</label><input type="number" step="any" value={boxForm.temperature} onChange={(e) => setBoxForm({ ...boxForm, temperature: e.target.value })} /><small style={{ color: '#999' }}>Room temp ≈ 22°C. Drives stage predictions.</small></div>
            <div className="form-group"><label>Notes</label><input value={boxForm.notes} onChange={(e) => setBoxForm({ ...boxForm, notes: e.target.value })} /></div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowBoxModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBox}>{editingBox ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Observation logger — multi-select: tick every stage present in the tube today */}
      {obsVial && (
        <div className="modal-overlay" onClick={() => setObsVial(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2>Log observation</h2>
            <p style={{ color: '#666', marginBottom: 12 }}><strong>{obsVial.name}</strong> — tick <em>every</em> stage you see today (mixed tubes are normal).</p>
            <div className="form-group"><label>Date</label><input type="date" value={obsDate} onChange={(e) => setObsDate(e.target.value)} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {STAGES.map(s => {
                const on = obsStages.includes(s.value);
                return (
                  <button
                    key={s.value}
                    className={`btn ${on ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ justifyContent: 'flex-start', fontSize: '1rem', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
                    onClick={() => toggleObsStage(s.value)}
                  >
                    <span style={{ width: 20, display: 'inline-block', textAlign: 'center' }}>{on ? '☑️' : '⬜️'}</span>
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#999', marginBottom: 10 }}>
              {obsStages.length === 0 ? 'Nothing selected yet.' : `Logging ${obsStages.length} stage${obsStages.length !== 1 ? 's' : ''} for ${obsDate}.`}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setObsVial(null)} disabled={obsSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveObservations} disabled={obsSaving || obsStages.length === 0}>{obsSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer-date override modal */}
      {transferEdit && (
        <div className="modal-overlay" onClick={() => setTransferEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h2>Next transfer date</h2>
            <p style={{ color: '#666', marginBottom: 12 }}><strong>{transferEdit.name}</strong> — set when you plan to move these parents to a fresh tube. The nudge will count down to this date.</p>
            <div className="form-group"><label>Transfer on</label><input type="date" value={transferDateInput} onChange={(e) => setTransferDateInput(e.target.value)} /></div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setTransferEdit(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTransferDate}>Save</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal itemName={`tube "${deleteTarget.name}" and its observations`} onConfirm={doDeleteVial} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );

  // Group cross cohorts (same lineage_id) under one collapsible header; stocks & single tubes render flat.
  function renderTubeList(tubes) {
    const groups = {};
    const order = [];
    tubes.forEach(v => {
      const key = (v.type === 'cross') ? (v.lineage_id || v.id) : `single:${v.id}`;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(v);
    });
    return order.map(key => {
      const g = groups[key].slice().sort((a, b) => (a.cohort_number || 1) - (b.cohort_number || 1));
      if (g.length === 1) return renderTube(g[0]);
      // Multi-cohort lineage group
      const base = (g[0].name || 'Cross').replace(/\s*[\u2014-]\s*set\s*[\d.]+\s*$/i, '').trim();
      const isOpen = expandedLineage === key;
      const needsAttn = g.some(v => v.prediction && (
        (v.prediction.eta_to_target_days != null && v.prediction.eta_to_target_days <= 1.5 && v.prediction.eta_to_target_days >= -2) ||
        (v.holds_parents && v.prediction.transfer_due_in_days != null && v.prediction.transfer_due_in_days <= 0.5)
      ));
      return (
        <div key={key} style={{ border: '1px solid #e6dcf0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#f5eefb', padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setExpandedLineage(isOpen ? null : key)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: '#888', fontSize: '0.8rem', transform: isOpen ? 'none' : 'rotate(-90deg)' }}>▼</span>
              <strong>⚗️ {base}</strong>
              <span style={{ fontSize: '0.78rem', color: '#7a5ea8' }}>{g.length} staggered cohorts</span>
              {needsAttn && <span style={{ fontSize: '0.72rem', color: '#c0392b' }}>⏰ action</span>}
            </div>
          </div>
          {isOpen && (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.map(v => renderTube(v, true))}
            </div>
          )}
        </div>
      );
    });
  }

  function renderTube(v, inGroup) {
    const isOpen = expanded === v.id;
    const p = v.prediction;
    const fd = flipDueInfo(v);
    return (
      <div key={v.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, borderLeft: `4px solid ${v.type === 'cross' ? '#9b59b6' : '#16a085'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{v.type === 'cross' ? '⚗️' : '🧪'} {inGroup ? `Set ${setLabel(v)}` : v.name}</strong>
              {inGroup && v.holds_parents && <span style={{ fontSize: '0.7rem', background: '#9b59b6', color: 'white', padding: '1px 6px', borderRadius: 8 }}>has parents</span>}
              {v.type === 'cross' && predBadge(p)}
              {v.type === 'stock' && fd && <span style={{ fontSize: '0.78rem', color: fd.days <= 0 ? '#c0392b' : fd.days <= 3 ? '#e67e22' : '#888' }}>🔄 {fd.days < 0 ? `overdue ${-fd.days}d` : fd.days === 0 ? 'flip today' : `flip in ${fd.days}d`}</span>}
              {v.snooze_until && v.snooze_until > todayStr() && <span style={{ fontSize: '0.72rem', color: '#9b59b6', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); flyAPI.updateVial(v.id, { snooze_until: '' }).then(() => { setLoading(true); fetchData(); }); }} title="Snoozed — click to un-snooze">💤 until {v.snooze_until} ✕</span>}
            </div>
            {v.genotype && <div style={{ fontSize: '0.8rem', color: '#888' }}>{v.genotype}</div>}
            {v.type === 'cross' && p && (
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: 2 }}>
                {p.eta_to_target_days != null && <span>🎯 {stageLabel(p.target_stage)} {p.eta_to_target_days <= 0 ? 'now' : `~${p.eta_to_target_days}d`}</span>}
                {p.clear_parents_in_days != null && <span style={{ marginLeft: 10, color: p.clear_parents_in_days <= 2 ? '#c0392b' : '#666' }}>👪 clear parents {p.clear_parents_in_days <= 0 ? 'now' : `~${p.clear_parents_in_days}d`}</span>}
                {v.holds_parents && p.transfer_due_in_days != null && <span style={{ marginLeft: 10, color: p.transfer_due_in_days <= 0.5 ? '#9b59b6' : '#999' }}>🔄 transfer {p.transfer_due_in_days <= 0 ? 'now' : `~${p.transfer_due_in_days}d`}</span>}
                {p.speed_vs_standard != null && <span style={{ marginLeft: 10, color: '#999' }}>· {p.speed_vs_standard}× standard</span>}
                <span style={{ marginLeft: 10, color: '#bbb' }}>({p.mode})</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {v.type === 'cross' && <button className="btn btn-sm btn-primary" onClick={() => openObs(v)}>👁️ Log</button>}
            {v.type === 'cross' && v.holds_parents && <button className="btn btn-sm btn-secondary" onClick={() => transferParents(v)} title="Move parents to a fresh staggered tube">🔄 Transfer</button>}
            {v.type === 'stock' && <button className="btn btn-sm btn-primary" onClick={() => flipStock(v)}>🔄 Flip</button>}
            <button className="btn btn-sm btn-secondary" onClick={() => setExpanded(isOpen ? null : v.id)}>{isOpen ? '▲' : '▼'}</button>
            <button className="btn btn-sm btn-secondary" onClick={() => openEditVial(v)}>✏️</button>
            <button className="btn btn-sm btn-secondary" onClick={() => archiveVial(v)} title="Hide but keep growth data (use when you toss the adults)">📦</button>
            <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(v)} title="Permanently delete tube AND its growth data">🗑️</button>
          </div>
        </div>
        {isOpen && (
          <div style={{ marginTop: 10, borderTop: '1px solid #f0f0f0', paddingTop: 10, fontSize: '0.85rem' }}>
            <div style={{ color: '#888' }}>{v.type === 'cross' ? 'Parents set' : 'Started'}: {v.start_date || '—'}{p && ` · ${p.elapsed_days}d elapsed`}</div>
            {v.type === 'cross' && (
              <ObservationsList vialId={v.id} onChanged={() => { setLoading(true); fetchData(); }} />
            )}
          </div>
        )}
      </div>
    );
  }
}

// Lazy-load observations on expand
function ObservationsList({ vialId, onChanged }) {
  const [obs, setObs] = useState(null);
  useEffect(() => {
    let active = true;
    flyAPI.getVial(vialId).then(res => { if (active) setObs(res.data.observations || []); }).catch(() => setObs([]));
    return () => { active = false; };
  }, [vialId]);
  const del = async (o) => {
    if (!window.confirm('Delete this observation?')) return;
    try { await flyAPI.deleteObservation(vialId, o.id); onChanged(); } catch (e) { alert('Failed'); }
  };
  if (obs === null) return <div style={{ color: '#aaa', marginTop: 6 }}>Loading observations…</div>;
  if (obs.length === 0) return <div style={{ color: '#aaa', marginTop: 6 }}>No observations logged yet.</div>;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontWeight: 600, color: '#666', marginBottom: 4 }}>Observations</div>
      {obs.map(o => (
        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span>{stageLabel(o.stage_seen)} <span style={{ color: '#999' }}>· {(o.observed_at || '').split('T')[0]}</span></span>
          <span style={{ color: '#e74c3c', cursor: 'pointer' }} onClick={() => del(o)}>×</span>
        </div>
      ))}
    </div>
  );
}

export default Flies;
