import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { experimentAPI, notesAPI } from '../api';
import DeleteConfirmModal from './DeleteConfirmModal';

const STATUS_OPTIONS = [
  { value: 'active', label: '🟢 Active', color: '#27ae60' },
  { value: 'paused', label: '⏸️ Paused', color: '#f39c12' },
  { value: 'completed', label: '✅ Completed', color: '#3498db' },
  { value: 'abandoned', label: '🚫 Abandoned', color: '#95a5a6' },
];

function Notes() {
  const navigate = useNavigate();
  const [experiments, setExperiments] = useState([]);
  const [miscNotes, setMiscNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Track scratch pad values and saving state per experiment
  const [scratchPads, setScratchPads] = useState({});
  const scratchTimers = useRef({});
  const [scratchSaving, setScratchSaving] = useState({});

  // Track misc note values and saving state
  const [noteValues, setNoteValues] = useState({});
  const noteTimers = useRef({});
  const [noteSaving, setNoteSaving] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [expRes, notesRes] = await Promise.all([
        experimentAPI.getAll(),
        notesAPI.getAll(),
      ]);
      const exps = expRes.data;
      setExperiments(exps);
      setMiscNotes(notesRes.data);

      // Initialize scratch pad values
      const pads = {};
      exps.forEach(exp => { pads[exp.id] = exp.scratch_pad || ''; });
      setScratchPads(pads);

      // Initialize note values
      const vals = {};
      notesRes.data.forEach(n => { vals[n.id] = { title: n.title, content: n.content }; });
      setNoteValues(vals);
    } catch (err) {
      setError('Failed to load notes: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter experiments: show active ones or ones with scratch pad content
  const visibleExperiments = experiments.filter(exp =>
    exp.status === 'active' || exp.status === 'paused' || (exp.scratch_pad && exp.scratch_pad.trim())
  );

  // Scratch pad auto-save
  const handleScratchPadChange = (expId, val) => {
    setScratchPads(prev => ({ ...prev, [expId]: val }));
    if (scratchTimers.current[expId]) clearTimeout(scratchTimers.current[expId]);
    scratchTimers.current[expId] = setTimeout(async () => {
      setScratchSaving(prev => ({ ...prev, [expId]: true }));
      try {
        await experimentAPI.update(expId, { scratch_pad: val });
      } catch (e) { /* silent fail */ }
      setScratchSaving(prev => ({ ...prev, [expId]: false }));
    }, 1000);
  };

  // Misc note auto-save
  const handleNoteChange = (noteId, field, val) => {
    setNoteValues(prev => ({
      ...prev,
      [noteId]: { ...prev[noteId], [field]: val }
    }));
    if (noteTimers.current[noteId]) clearTimeout(noteTimers.current[noteId]);
    noteTimers.current[noteId] = setTimeout(async () => {
      setNoteSaving(prev => ({ ...prev, [noteId]: true }));
      try {
        const current = { ...noteValues[noteId], [field]: val };
        await notesAPI.update(noteId, { title: current.title, content: current.content });
      } catch (e) { /* silent fail */ }
      setNoteSaving(prev => ({ ...prev, [noteId]: false }));
    }, 1000);
  };

  // Create new misc note
  const handleNewNote = async () => {
    try {
      const res = await notesAPI.create({ title: 'Untitled Note', content: '' });
      const newNote = res.data;
      setMiscNotes(prev => [newNote, ...prev]);
      setNoteValues(prev => ({ ...prev, [newNote.id]: { title: newNote.title, content: newNote.content } }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create note');
    }
  };

  // Delete misc note
  const handleDeleteNote = async () => {
    if (!deleteTarget) return;
    try {
      await notesAPI.delete(deleteTarget.id);
      setMiscNotes(prev => prev.filter(n => n.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      alert('Failed to delete note');
    }
  };

  const statusInfo = (s) => STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];

  if (loading) return <div className="loading">Loading notes...</div>;
  if (error) return <div className="card"><div style={{ color: '#e74c3c', padding: 20 }}>{error}</div></div>;

  return (
    <div>
      {/* Experiment Scratch Pads */}
      <div className="card">
        <div className="card-header">
          <h2>🧪 Experiment Scratch Pads</h2>
        </div>
        {visibleExperiments.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">🧪</div>
            <p>No active experiments with scratch pads.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {visibleExperiments.map(exp => {
              const si = statusInfo(exp.status);
              return (
                <div key={exp.id} style={{
                  border: '1px solid #eee', borderRadius: 12, padding: 16,
                  borderLeft: `4px solid ${si.color}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3
                        style={{ fontSize: '1rem', margin: 0, cursor: 'pointer', color: '#2980b9' }}
                        onClick={() => navigate(`/notebook/experiments/${exp.id}`)}
                        title="View experiment details"
                      >
                        {exp.title}
                      </h3>
                      <span className={`badge badge-${exp.status === 'active' ? 'success' : exp.status === 'completed' ? 'info' : exp.status === 'paused' ? 'warning' : 'danger'}`}
                        style={{ fontSize: '0.7rem' }}>
                        {si.label}
                      </span>
                    </div>
                    {scratchSaving[exp.id] && <span style={{ fontSize: '0.7rem', color: '#888' }}>Saving...</span>}
                  </div>
                  <textarea
                    value={scratchPads[exp.id] || ''}
                    onChange={(e) => handleScratchPadChange(exp.id, e.target.value)}
                    placeholder="Quick notes, ideas, to-dos for this experiment..."
                    rows={4}
                    style={{
                      width: '100%', resize: 'vertical', border: '1px solid #eee', borderRadius: 8,
                      padding: 10, fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.5
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Miscellaneous Notes */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>📌 Miscellaneous Notes</h2>
          <button className="btn btn-primary" onClick={handleNewNote}>+ New Note</button>
        </div>
        {miscNotes.length === 0 ? (
          <div className="empty-state">
            <div className="emoji">📌</div>
            <p>No miscellaneous notes yet. Create one!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {miscNotes.map(note => (
              <div key={note.id} style={{
                border: '1px solid #eee', borderRadius: 12, padding: 16,
                borderLeft: '4px solid #f39c12'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <input
                      value={(noteValues[note.id] && noteValues[note.id].title) || ''}
                      onChange={(e) => handleNoteChange(note.id, 'title', e.target.value)}
                      style={{
                        fontSize: '1rem', fontWeight: 600, border: 'none', borderBottom: '1px solid transparent',
                        padding: '2px 4px', background: 'transparent', flex: 1
                      }}
                      onFocus={(e) => e.target.style.borderBottomColor = '#3498db'}
                      onBlur={(e) => e.target.style.borderBottomColor = 'transparent'}
                      placeholder="Note title..."
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {noteSaving[note.id] && <span style={{ fontSize: '0.7rem', color: '#888' }}>Saving...</span>}
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(note)}>🗑️</button>
                  </div>
                </div>
                <textarea
                  value={(noteValues[note.id] && noteValues[note.id].content) || ''}
                  onChange={(e) => handleNoteChange(note.id, 'content', e.target.value)}
                  placeholder="Write your note..."
                  rows={4}
                  style={{
                    width: '100%', resize: 'vertical', border: '1px solid #eee', borderRadius: 8,
                    padding: 10, fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.5
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#bbb', marginTop: 4 }}>
                  Created {new Date(note.createdAt).toLocaleString()}
                  {note.updatedAt !== note.createdAt && <span> • Updated {new Date(note.updatedAt).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirm */}
      {deleteTarget && (
        <DeleteConfirmModal
          itemName={`note "${deleteTarget.title}"`}
          onConfirm={handleDeleteNote}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default Notes;
