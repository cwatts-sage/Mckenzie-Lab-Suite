import React, { useState } from 'react';

function DeleteConfirmModal({ itemName, onConfirm, onCancel }) {
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2 style={{ color: '#e74c3c', marginBottom: 12 }}>⚠️ Delete Confirmation</h2>
        <p style={{ marginBottom: 16, color: '#444', lineHeight: 1.5 }}>
          Are you sure you want to delete <strong>{itemName}</strong>? This action cannot be undone.
        </p>
        <div className="form-group">
          <label style={{ color: '#888', fontSize: '0.85rem' }}>Type <strong>DELETE</strong> to confirm</label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoFocus
            style={{
              borderColor: confirmText === 'DELETE' ? '#e74c3c' : '#ddd'
            }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={confirmText !== 'DELETE'}
            style={{
              opacity: confirmText !== 'DELETE' ? 0.5 : 1,
              cursor: confirmText !== 'DELETE' ? 'not-allowed' : 'pointer'
            }}
          >
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
