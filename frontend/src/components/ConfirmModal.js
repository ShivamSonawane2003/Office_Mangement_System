import React from 'react';
import './ConfirmModal.css';

function ConfirmModal({ isOpen, title, message, type = 'confirm', onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel', confirmButtonClass = 'btn-primary' }) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && type === 'alert') {
      // For alerts, clicking overlay should close
      handleCancel();
    } else if (e.target === e.currentTarget && type === 'confirm') {
      // For confirms, clicking overlay should cancel
      handleCancel();
    }
  };

  return (
    <div className="confirm-modal-overlay" onClick={handleOverlayClick}>
      <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-header">
          <h2>{title || (type === 'alert' ? 'Alert' : 'Confirm')}</h2>
          {type === 'alert' && (
            <button className="confirm-modal-close" onClick={handleCancel}>&times;</button>
          )}
        </div>
        <div className="confirm-modal-body">
          <p>{message}</p>
        </div>
        <div className="confirm-modal-footer">
          {type === 'confirm' && (
            <button className="btn btn-secondary" onClick={handleCancel}>
              {cancelText}
            </button>
          )}
          <button className={`btn ${confirmButtonClass}`} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;

