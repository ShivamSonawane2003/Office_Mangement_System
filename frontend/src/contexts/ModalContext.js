import React, { createContext, useContext, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';

const ModalContext = createContext();

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
};

export const ModalProvider = ({ children }) => {
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: 'confirm', // 'confirm' or 'alert'
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
    confirmButtonClass: 'btn-primary',
    onConfirm: null,
    onCancel: null,
  });

  const showConfirm = ({ title, message, confirmText = 'OK', cancelText = 'Cancel', confirmButtonClass = 'btn-primary', onConfirm, onCancel }) => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        confirmButtonClass,
        onConfirm: () => {
          setModalState({ ...modalState, isOpen: false });
          if (onConfirm) onConfirm();
          resolve(true);
        },
        onCancel: () => {
          setModalState({ ...modalState, isOpen: false });
          if (onCancel) onCancel();
          resolve(false);
        },
      });
    });
  };

  const showAlert = ({ title, message, confirmText = 'OK', onConfirm }) => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        type: 'alert',
        title,
        message,
        confirmText,
        confirmButtonClass: 'btn-primary',
        onConfirm: () => {
          setModalState({ ...modalState, isOpen: false });
          if (onConfirm) onConfirm();
          resolve(true);
        },
        onCancel: () => {
          setModalState({ ...modalState, isOpen: false });
          resolve(false);
        },
      });
    });
  };

  const closeModal = () => {
    setModalState({ ...modalState, isOpen: false });
  };

  return (
    <ModalContext.Provider value={{ showConfirm, showAlert, closeModal }}>
      {children}
      <ConfirmModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        confirmButtonClass={modalState.confirmButtonClass}
        onConfirm={modalState.onConfirm}
        onCancel={modalState.onCancel}
      />
    </ModalContext.Provider>
  );
};

