import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Expenses.css';
import './TableHead.css';
import { useModal } from '../contexts/ModalContext';
import websocketService from '../services/websocketService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';
const API_BASE = API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

function Expenses({ showToast, userRole }) {
  const { showConfirm, showAlert } = useModal();
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedForApproval, setSelectedForApproval] = useState(null);
  const [approvalAction, setApprovalAction] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const undoTimersRef = useRef({});
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    label: '',
    itemDescription: '',
    amount: '',
    tag: ''
  });

  const fetchExpenses = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_PREFIX}/expenses/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Only handle auth errors - don't clear data on other errors
      if (response.status === 401 || response.status === 403) {
        console.warn('Authentication error - token may be expired');
        // Don't clear expenses - let App.js handle logout
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        const formatted = Array.isArray(data) ? data.map(e => ({
          id: e.id,
          date: e.date ? e.date.split('T')[0] : '',
          description: e.label || '',
          category: e.category || 'Other',
          amount: e.amount || 0,
          status: e.status || 'pending',
          item: e.item || ''
        })) : [];
        setExpenses(formatted);
      }
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
      // Network errors - don't clear existing data, keep showing what we have
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
    
    // Subscribe to global WebSocket service for expense updates
    const unsubscribe = websocketService.on('expense_updated', (data) => {
          // Refresh expenses when update is received
          fetchExpenses();
    });
    
    return () => {
      unsubscribe();
    };
  }, [fetchExpenses]);

  useEffect(() => {
    if (undoStack.length === 0) return undefined;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [undoStack.length]);

  useEffect(() => {
    return () => {
      Object.values(undoTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      undoTimersRef.current = {};
    };
  }, []);

  const getStatusColor = (status) => {
    switch(status) {
      case 'approved': return 'badge-approved';
      case 'pending': return 'badge-pending';
      case 'rejected': return 'badge-rejected';
      default: return 'badge-pending';
    }
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleDelete = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const response = await fetch(`${API_PREFIX}/expenses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        await fetchExpenses();
        if (showToast) {
          showToast({ message: 'Expense deleted successfully', type: 'success', duration: 3000 });
        }
      }
    } catch (err) {
      if (showToast) {
        showToast({ message: 'Failed to delete expense', type: 'error', duration: 3000 });
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveExpense = async () => {
    if (!formData.label || !formData.amount) {
      await showAlert({
        title: 'Validation Error',
        message: 'Please fill in Label and Amount fields'
      });
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const normalizedDate = formData.date ? `${formData.date}T00:00:00` : new Date().toISOString();
      const expenseData = {
        date: normalizedDate,
        label: formData.label,
        item: formData.itemDescription || formData.label,
        category: formData.tag || 'Other',
        amount: parseFloat(formData.amount),
        description: formData.itemDescription || ''
      };

      const response = await fetch(`${API_PREFIX}/expenses/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(expenseData)
      });

      if (response.ok) {
        await fetchExpenses();
        setShowModal(false);
        setFormData({
          date: new Date().toISOString().split('T')[0],
          label: '',
          itemDescription: '',
          amount: '',
          tag: ''
        });
        if (showToast) {
          showToast({ message: 'Expense added successfully', type: 'success', duration: 3000 });
        }
      } else {
        const error = await response.json().catch(() => ({}));
        await showAlert({
          title: 'Error',
          message: error.detail || 'Failed to add expense'
        });
      }
    } catch (err) {
      await showAlert({
        title: 'Error',
        message: 'Failed to add expense'
      });
    }
  };

  const handleCancel = () => {
    setShowModal(false);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      label: '',
      itemDescription: '',
      amount: '',
      tag: ''
    });
  };

  const handleEditClick = (expense) => {
    setEditingId(expense.id);
    setFormData({
      date: expense.date,
      label: expense.description,
      itemDescription: expense.item || '',
      amount: expense.amount.toString(),
      tag: expense.category
    });
    setShowEditModal(true);
  };

  const handleUpdateExpense = async () => {
    if (!formData.label || !formData.amount) {
      await showAlert({
        title: 'Validation Error',
        message: 'Please fill in Label and Amount fields'
      });
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const normalizedDate = formData.date ? `${formData.date}T00:00:00` : new Date().toISOString();
      const expense = expenses.find(e => e.id === editingId);
      if (!expense) return;

      const expenseData = {
        date: normalizedDate,
        label: formData.label,
        item: formData.itemDescription || formData.label,
        category: formData.tag || 'Other',
        amount: parseFloat(formData.amount),
        description: formData.itemDescription || ''
      };

      const deleteResponse = await fetch(`${API_PREFIX}/expenses/${editingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (deleteResponse.ok) {
        const createResponse = await fetch(`${API_PREFIX}/expenses/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(expenseData)
        });

        if (createResponse.ok) {
          await fetchExpenses();
          setShowEditModal(false);
          setEditingId(null);
          setFormData({
            date: new Date().toISOString().split('T')[0],
            label: '',
            itemDescription: '',
            amount: '',
            tag: ''
          });
          if (showToast) {
            showToast({ message: 'Expense updated successfully', type: 'success', duration: 3000 });
          }
        } else {
          await showAlert({
            title: 'Error',
            message: 'Failed to recreate expense'
          });
        }
      } else {
        await showAlert({
          title: 'Error',
          message: 'Failed to delete old expense'
        });
      }
    } catch (err) {
      await showAlert({
        title: 'Error',
        message: 'Failed to update expense'
      });
    }
  };

  const handleEditCancel = () => {
    setShowEditModal(false);
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      label: '',
      itemDescription: '',
      amount: '',
      tag: ''
    });
  };

  const handleApprovalClick = (expense, action) => {
    setSelectedForApproval(expense);
    setApprovalAction(action);
    setShowApprovalModal(true);
  };

  const handleConfirmApproval = async () => {
    const previousStatus = selectedForApproval.status;
    const newStatus = approvalAction === 'approve' ? 'approved' : 'rejected';
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${API_PREFIX}/expenses/${selectedForApproval.id}?status=${newStatus}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchExpenses();
        if (approvalAction === 'approve') {
          scheduleUndoWindow(selectedForApproval.id, previousStatus);
        } else if (showToast) {
          showToast({
            message: 'Expense rejected successfully',
            type: 'success',
            duration: 4000
          });
        }
        setShowApprovalModal(false);
        setSelectedForApproval(null);
        setApprovalAction(null);
      } else {
        await showAlert({
          title: 'Error',
          message: 'Failed to update expense status'
        });
      }
    } catch (err) {
      await showAlert({
        title: 'Error',
        message: 'Failed to update expense status'
      });
    }
  };

  const handleUndoApproval = async (expenseId) => {
    const entry = undoStack.find(item => item.id === expenseId);
    if (!entry) {
      if (showToast) {
        showToast({
          message: 'Undo window expired',
          type: 'error',
          duration: 4000
        });
      }
      return;
    }

    if (Date.now() > entry.expiresAt) {
      setUndoStack(prev => prev.filter(item => item.id !== expenseId));
      if (undoTimersRef.current[expenseId]) {
        clearTimeout(undoTimersRef.current[expenseId]);
        delete undoTimersRef.current[expenseId];
      }
      if (showToast) {
        showToast({
          message: 'Undo window expired',
          type: 'error',
          duration: 4000
        });
      }
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${API_PREFIX}/expenses/${expenseId}?status=${entry.previousStatus}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchExpenses();
        if (showToast) {
          showToast({
            message: 'Expense approval undone',
            type: 'info',
            duration: 4000
          });
        }
      } else {
        const error = await response.json().catch(() => ({}));
        if (showToast) {
          showToast({
            message: error.detail || 'Failed to undo approval',
            type: 'error',
            duration: 5000
          });
        }
      }
    } catch (err) {
      if (showToast) {
        showToast({
          message: 'Failed to undo approval',
          type: 'error',
          duration: 5000
        });
      }
    } finally {
      setUndoStack(prev => prev.filter(item => item.id !== expenseId));
      if (undoTimersRef.current[expenseId]) {
        clearTimeout(undoTimersRef.current[expenseId]);
        delete undoTimersRef.current[expenseId];
      }
    }
  };

  const scheduleUndoWindow = (expenseId, previousStatus) => {
    const expiresAt = Date.now() + 60000;

    if (undoTimersRef.current[expenseId]) {
      clearTimeout(undoTimersRef.current[expenseId]);
    }

    undoTimersRef.current[expenseId] = setTimeout(() => {
      setUndoStack(prev => prev.filter(entry => entry.id !== expenseId));
      delete undoTimersRef.current[expenseId];
    }, 60000);

    setUndoStack(prev => {
      const filtered = prev.filter(entry => entry.id !== expenseId);
      return [...filtered, { id: expenseId, previousStatus, expiresAt }];
    });
  };

  const toggleExpenseSelection = (expenseId) => {
    setSelectedExpenses(prev =>
      prev.includes(expenseId)
        ? prev.filter(id => id !== expenseId)
        : [...prev, expenseId]
    );
  };

  const toggleAllExpenses = () => {
    if (selectedExpenses.length === expenses.length) {
      setSelectedExpenses([]);
    } else {
      setSelectedExpenses(expenses.map(e => e.id));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedExpenses.length === 0) {
      await showAlert({
        title: 'Selection Required',
        message: 'Please select expenses first'
      });
      return;
    }
    const confirmed = await showConfirm({
      title: 'Approve Expenses',
      message: `Approve ${selectedExpenses.length} expenses?`,
      confirmText: 'Approve',
      cancelText: 'Cancel',
      confirmButtonClass: 'btn-primary'
    });
    
    if (confirmed) {
      const token = localStorage.getItem('token');
      if (!token) return;

      const idsToApprove = [...selectedExpenses];
      const previousStates = idsToApprove.reduce((acc, id) => {
        const expense = expenses.find(e => e.id === id);
        acc[id] = expense ? expense.status : 'pending';
        return acc;
      }, {});

      try {
        await Promise.all(idsToApprove.map(id =>
          fetch(`${API_PREFIX}/expenses/${id}?status=approved`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          })
        ));
        await fetchExpenses();
        idsToApprove.forEach(id => {
          scheduleUndoWindow(id, previousStates[id] || 'pending');
        });
        setSelectedExpenses([]);
        if (showToast) {
          showToast({
            message: `${idsToApprove.length} expense(s) approved. Undo available for 60s.`,
            type: 'success',
            duration: 5000
          });
        }
      } catch (err) {
        await showAlert({
          title: 'Error',
          message: 'Failed to approve expenses'
        });
      }
    }
  };

  const handleBulkReject = async () => {
    if (selectedExpenses.length === 0) {
      await showAlert({
        title: 'Selection Required',
        message: 'Please select expenses first'
      });
      return;
    }
    const confirmed = await showConfirm({
      title: 'Reject Expenses',
      message: `Reject ${selectedExpenses.length} expenses?`,
      confirmText: 'Reject',
      cancelText: 'Cancel',
      confirmButtonClass: 'btn-danger'
    });
    
    if (confirmed) {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        await Promise.all(selectedExpenses.map(id =>
          fetch(`${API_PREFIX}/expenses/${id}?status=rejected`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          })
        ));
        await fetchExpenses();
        setSelectedExpenses([]);
        if (showToast) {
          showToast({
            message: `${selectedExpenses.length} expense(s) rejected`,
            type: 'success',
            duration: 3000
          });
        }
      } catch (err) {
        await showAlert({
          title: 'Error',
          message: 'Failed to reject expenses'
        });
      }
    }
  };

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h3>Expense Management</h3>
          <p className="section-subtitle">Track and manage your business expenses</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} title="Add a new expense">
          Add Expense
        </button>
      </div>

      {undoStack.length > 0 && (
        <div className="undo-popup-container">
          {undoStack.slice(0, 3).map((entry) => {
            const secondsLeft = Math.max(0, Math.ceil((entry.expiresAt - currentTime) / 1000));
            return (
              <div key={entry.id} className="undo-popup">
                <div className="undo-popup-body">
                  <div className="undo-popup-title">Expense #{entry.id} approved</div>
                  <div className="undo-popup-subtitle">You can undo this approval within 1 minute.</div>
                </div>
                <div className="undo-popup-footer">
                  <span className="undo-popup-timer">{secondsLeft}s left</span>
                  <button className="btn btn-secondary" onClick={() => handleUndoApproval(entry.id)}>
                    Undo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Expense</h2>
              <button className="modal-close" onClick={handleCancel}>&times;</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="date">Date</label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="label">Label</label>
                <input
                  type="text"
                  id="label"
                  name="label"
                  placeholder="e.g., Petrol"
                  value={formData.label}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="itemDescription">Item Description</label>
                <input
                  type="text"
                  id="itemDescription"
                  name="itemDescription"
                  placeholder="e.g., Fuel for company car"
                  value={formData.itemDescription}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="amount">Amount (₹)</label>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={handleInputChange}
                  className="form-input"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label htmlFor="tag">Tag</label>
                <select
                  id="tag"
                  name="tag"
                  value={formData.tag}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="">Select a tag</option>
                  <option value="Travel">Travel</option>
                  <option value="Food">Food</option>
                  <option value="Supplies">Supplies</option>
                  <option value="Software">Software</option>
                  <option value="Other">Other</option>
                </select>
              </div>

            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveExpense}>Save Expense</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={handleEditCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Expense</h2>
              <button className="modal-close" onClick={handleEditCancel}>&times;</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="edit-date">Date</label>
                <input
                  type="date"
                  id="edit-date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-label">Label</label>
                <input
                  type="text"
                  id="edit-label"
                  name="label"
                  placeholder="e.g., Petrol"
                  value={formData.label}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-itemDescription">Item Description</label>
                <input
                  type="text"
                  id="edit-itemDescription"
                  name="itemDescription"
                  placeholder="e.g., Fuel for company car"
                  value={formData.itemDescription}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-amount">Amount (₹)</label>
                <input
                  type="number"
                  id="edit-amount"
                  name="amount"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={handleInputChange}
                  className="form-input"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-tag">Tag</label>
                <select
                  id="edit-tag"
                  name="tag"
                  value={formData.tag}
                  onChange={handleInputChange}
                  className="form-input"
                >
                  <option value="">Select a tag</option>
                  <option value="Travel">Travel</option>
                  <option value="Food">Food</option>
                  <option value="Supplies">Supplies</option>
                  <option value="Software">Software</option>
                  <option value="Other">Other</option>
                </select>
              </div>

            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleEditCancel}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpdateExpense}>Update Expense</button>
            </div>
          </div>
        </div>
      )}

      {showApprovalModal && (
        <div className="modal-overlay" onClick={() => setShowApprovalModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{approvalAction === 'approve' ? 'Approve' : 'Reject'} Expense</h2>
              <button className="modal-close" onClick={() => setShowApprovalModal(false)}>&times;</button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>
                Are you sure you want to <strong>{approvalAction === 'approve' ? 'approve' : 'reject'}</strong> this expense?
              </p>
              <div className="approval-detail">
                <div className="detail-row">
                  <span className="detail-label">Description:</span>
                  <span className="detail-value">{selectedForApproval?.description}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Amount:</span>
                  <span className="detail-value">₹{selectedForApproval?.amount.toLocaleString()}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Category:</span>
                  <span className="detail-value">{selectedForApproval?.category}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className={`btn ${approvalAction === 'approve' ? 'btn-primary' : 'btn-danger'}`}
                onClick={handleConfirmApproval}
              >
                {approvalAction === 'approve' ? 'Approve' : 'Reject'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowApprovalModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <p>Loading expenses...</p>
        </div>
      )}

      {!isLoading && (
      <div className="card">
        {selectedExpenses.length > 0 && userRole === 'Super Admin' && (
          <div className="bulk-actions">
            <div className="selected-info">
              {selectedExpenses.length} expense(s) selected
            </div>
            <div className="bulk-actions-buttons">
              <button className="btn btn-secondary" onClick={handleBulkApprove}>
                Approve All
              </button>
              <button className="btn btn-secondary" onClick={handleBulkReject}>
                Reject All
              </button>
            </div>
          </div>
        )}

        <div className="table-responsive">
          <table className="expenses-table">
            <thead className="table-head">
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedExpenses.length === expenses.length && expenses.length > 0}
                    onChange={toggleAllExpenses}
                  />
                </th>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th style={{textAlign: 'center', width: '360px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="expense-row">
                  <td style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedExpenses.includes(expense.id)}
                      onChange={() => toggleExpenseSelection(expense.id)}
                    />
                  </td>
                  <td data-label="Date">
                    <span className="date-badge">{expense.date}</span>
                  </td>
                  <td data-label="Description">{expense.description}</td>
                  <td data-label="Category">
                    <span className="category-badge">{expense.category}</span>
                  </td>
                  <td data-label="Amount" className="amount">
                    ₹{expense.amount.toLocaleString()}
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${getStatusColor(expense.status)}`}>
                      {getStatusLabel(expense.status)}
                    </span>
                  </td>
                  <td data-label="Actions" className="actions-cell" style={{ borderBottom:"0px solid red"}}>
                    {expense.status === 'pending' && userRole === 'Super Admin' && (
                      <>
                        <button 
                          className="action-icon-btn approve-btn" 
                          title="Approve" 
                          onClick={() => handleApprovalClick(expense, 'approve')}
                        >
                          Approve
                        </button>
                        <button 
                          className="action-icon-btn reject-btn" 
                          title="Reject" 
                          onClick={() => handleApprovalClick(expense, 'reject')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button className="action-icon-btn edit-btn" title="Edit" onClick={() => handleEditClick(expense)}>Edit</button>
                    <button className="action-icon-btn delete-btn" title="Delete" onClick={async () => {
                      const confirmed = await showConfirm({
                        title: 'Delete Expense',
                        message: 'Are you sure you want to delete this expense?',
                        confirmText: 'Delete',
                        cancelText: 'Cancel',
                        confirmButtonClass: 'btn-danger'
                      });
                      if (confirmed) handleDelete(expense.id);
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <p>Total Expenses: {expenses.length} | Total Amount: ₹{totalAmount.toLocaleString()}</p>
        </div>
      </div>
      )}
    </div>
  );
}

export default Expenses;
