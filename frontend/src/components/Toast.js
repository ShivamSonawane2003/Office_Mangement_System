import React, { useEffect } from 'react';
import './Toast.css';

function Toast({ message, type = 'success', duration = 3000, onClose, actions = null }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const handleUndo = () => {
    if (actions && actions.onUndo) {
      actions.onUndo();
    }
    onClose();
  };

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-content">
        <div className="toast-message">{message}</div>
        {actions && actions.onUndo && (
          <button className="toast-undo-btn" onClick={handleUndo}>
            Undo
          </button>
        )}
      </div>
      <div className="toast-close" onClick={onClose}>×</div>
    </div>
  );
}

export default Toast;
