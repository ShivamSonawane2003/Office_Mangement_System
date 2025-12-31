import React, { useState, useEffect, useCallback } from 'react';
import './GST.css';
import './TableHead.css';
import { useModal } from '../contexts/ModalContext';
import websocketService from '../services/websocketService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';
const API_BASE = API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;
const API_ORIGIN = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;

function GST({ showToast, userRole }) {
  const { showConfirm, showAlert } = useModal();
  const [claims, setClaims] = useState([]);
  const [allClaims, setAllClaims] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    amount: '',
    gstRate: '',
    gstAmount: '',
    billFile: null
  });
  const [billPreviewUrl, setBillPreviewUrl] = useState('');
  const [billPreviewType, setBillPreviewType] = useState('');
  const [billPreviewError, setBillPreviewError] = useState('');
  const [billPreviewLoading, setBillPreviewLoading] = useState(false);
  const [billZoom, setBillZoom] = useState(1);
  const [billOffset, setBillOffset] = useState({ x: 0, y: 0 });
  const [billPanOrigin, setBillPanOrigin] = useState({ x: 0, y: 0 });
  const [showBillModal, setShowBillModal] = useState(false);
  const [showPaymentCommentModal, setShowPaymentCommentModal] = useState(false);
  const [paymentComment, setPaymentComment] = useState('');
  const [pendingPaymentToggle, setPendingPaymentToggle] = useState(null);

  useEffect(() => {
    return () => {
      if (billPreviewUrl) {
        URL.revokeObjectURL(billPreviewUrl);
      }
    };
  }, [billPreviewUrl]);

  const fetchClaims = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_PREFIX}/gst/claims`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Only handle auth errors - don't clear data on other errors
      if (response.status === 401 || response.status === 403) {
        console.warn('Authentication error - token may be expired');
        // Don't clear claims - let App.js handle logout
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        const formatted = data.map(c => ({
            id: c.id,
            date: c.created_at ? c.created_at.split('T')[0] : '',
            vendor: c.vendor || '',
            amount: c.amount || 0,
            gstRate: c.gst_rate || 18,
            gstAmount: c.gst_amount || 0,
            status: c.status || 'pending',
            payment: c.payment_status === 'paid' ? 'Paid' : 'Unpaid',
            paymentStatus: c.payment_status,
            paymentComment: c.payment_comment || null,
            billUrl: c.bill_url || '',
            isVerified: c.is_verified !== undefined ? c.is_verified : null
        }));
        setAllClaims(formatted);
        setClaims(formatted);
      }
    } catch (err) {
      console.error('Failed to fetch GST claims:', err);
      // Network errors - don't clear existing data, keep showing what we have
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
    
    // Subscribe to global WebSocket service for GST updates
    const unsubscribe = websocketService.on('gst_updated', (data) => {
          // Refresh claims when update is received
          fetchClaims();
    });
    
    return () => {
      unsubscribe();
    };
  }, [fetchClaims]);

  useEffect(() => {
    if (paymentFilter === 'all') {
      setClaims(allClaims);
    } else if (paymentFilter === 'paid') {
      setClaims(allClaims.filter(c => c.paymentStatus === 'paid'));
    } else if (paymentFilter === 'unpaid') {
      setClaims(allClaims.filter(c => c.paymentStatus === 'unpaid'));
    }
  }, [paymentFilter, allClaims]);

  const getStatusColor = (status) => {
    switch(status) {
      case 'pending': return 'badge-pending';
      case 'approved': return 'badge-approved';
      case 'rejected': return 'badge-rejected';
      default: return 'badge-pending';
    }
  };

  // Commented out - Approve/Reject functionality disabled
  // const handleApprove = async (id) => {
  //   const token = localStorage.getItem('token');
  //   if (!token) return;

  //   try {
  //     const response = await fetch(`${API_PREFIX}/gst/claims/${id}/approve`, {
  //       method: 'PUT',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         Authorization: `Bearer ${token}`
  //       },
  //       body: JSON.stringify({ status: 'approved', approval_notes: '' })
  //     });

  //     if (response.ok) {
  //       await fetchClaims();
  //       if (showToast) {
  //         showToast({
  //           message: `GST Claim approved`,
  //           type: 'success',
  //           duration: 3000
  //         });
  //       }
  //     } else {
  //       await showAlert({
  //         title: 'Error',
  //         message: 'Failed to approve claim'
  //       });
  //     }
  //   } catch (err) {
  //     await showAlert({
  //       title: 'Error',
  //       message: 'Failed to approve claim'
  //     });
  //   }
  // };

  // const handleReject = async (id) => {
  //   const token = localStorage.getItem('token');
  //   if (!token) return;

  //   try {
  //     const response = await fetch(`${API_PREFIX}/gst/claims/${id}/reject`, {
  //       method: 'PUT',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         Authorization: `Bearer ${token}`
  //       },
  //       body: JSON.stringify({ status: 'rejected', approval_notes: '' })
  //     });

  //     if (response.ok) {
  //       await fetchClaims();
  //       if (showToast) {
  //         showToast({
  //           message: `GST Claim rejected`,
  //           type: 'success',
  //           duration: 3000
  //         });
  //       }
  //     } else {
  //       await showAlert({
  //         title: 'Error',
  //         message: 'Failed to reject claim'
  //       });
  //     }
  //   } catch (err) {
  //     await showAlert({
  //       title: 'Error',
  //       message: 'Failed to reject claim'
  //     });
  //   }
  // };

  const handleTogglePayment = async (id, currentStatus) => {
    // If changing from unpaid to paid, show comment modal
    if (currentStatus === 'unpaid') {
      setPendingPaymentToggle({ id, currentStatus });
      setPaymentComment('');
      setShowPaymentCommentModal(true);
    } else {
      // Changing from paid to unpaid, no comment needed
      await performTogglePayment(id, currentStatus, null);
    }
  };

  const performTogglePayment = async (id, currentStatus, comment) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const body = comment ? JSON.stringify({ payment_comment: comment }) : JSON.stringify({});
      const response = await fetch(`${API_PREFIX}/gst/claims/${id}/toggle-payment`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: body
      });

      if (response.ok) {
        await fetchClaims();
        const newStatus = currentStatus === 'paid' ? 'Unpaid' : 'Paid';
        if (showToast) {
          showToast({
            message: `Payment status changed to ${newStatus}`,
            type: 'success',
            duration: 3000
          });
        }
        setShowPaymentCommentModal(false);
        setPaymentComment('');
        setPendingPaymentToggle(null);
      } else {
        const error = await response.json().catch(() => ({}));
        await showAlert({
          title: 'Error',
          message: error.detail || 'Failed to toggle payment status'
        });
      }
    } catch (err) {
      await showAlert({
        title: 'Error',
        message: 'Failed to toggle payment status'
      });
    }
  };

  const handlePaymentCommentSubmit = () => {
    if (pendingPaymentToggle) {
      performTogglePayment(pendingPaymentToggle.id, pendingPaymentToggle.currentStatus, paymentComment);
    }
  };

  const handlePaymentCommentCancel = () => {
    setShowPaymentCommentModal(false);
    setPaymentComment('');
    setPendingPaymentToggle(null);
  };

  const handleEditClick = (claim) => {
    setEditingId(claim.id);
    setFormData({
      date: claim.date || new Date().toISOString().split('T')[0],
      vendor: claim.vendor || '',
      amount: claim.amount || '',
      gstRate: claim.gstRate?.toString() || '',
      gstAmount: claim.gstAmount || '',
      billFile: null
    });
    setShowEditModal(true);
  };

  const handleUpdateClaim = async () => {
    if (!formData.vendor || !formData.gstAmount) {
      if (showToast) {
        showToast({
          message: 'Please fill in all required fields',
          type: 'error',
          duration: 3000
        });
      }
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    const amount = parseFloat(formData.amount || formData.gstAmount || '0');
    const gstRate = parseFloat(formData.gstRate || '0');
    const gstAmount = parseFloat(formData.gstAmount);

    if ([gstAmount].some((value) => Number.isNaN(value) || value < 0)) {
      showToast?.({
        message: 'Please provide a valid GST amount.',
        type: 'error',
        duration: 3000
      });
      return;
    }

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('vendor', formData.vendor);
      formDataToSend.append('amount', amount.toString());
      if (!Number.isNaN(gstRate)) {
        formDataToSend.append('gst_rate', gstRate.toString());
      }
      if (!Number.isNaN(gstAmount)) {
        formDataToSend.append('gst_amount', gstAmount.toString());
      }
      if (formData.billFile) {
        formDataToSend.append('bill_file', formData.billFile);
      }

      const response = await fetch(`${API_PREFIX}/gst/claims/${editingId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formDataToSend
      });

      if (response.ok) {
        await fetchClaims();
        setShowEditModal(false);
        setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      vendor: '',
      amount: '',
      gstRate: '',
      gstAmount: '',
      billFile: null
    });
        if (showToast) {
          showToast({
            message: 'GST Claim updated successfully',
            type: 'success',
            duration: 3000
          });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || 'Failed to update GST claim';
        if (showToast) {
          showToast({
            message: errorMessage,
            type: 'error',
            duration: 5000
          });
        } else {
          await showAlert({
            title: 'Error',
            message: errorMessage
          });
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to update GST claim';
      if (showToast) {
        showToast({
          message: errorMessage,
          type: 'error',
          duration: 5000
        });
      } else {
        await showAlert({
          title: 'Error',
          message: errorMessage
        });
      }
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await showConfirm({
      title: 'Delete GST Claim',
      message: 'Are you sure you want to delete this GST claim?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmButtonClass: 'btn-danger'
    });
    
    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${API_PREFIX}/gst/claims/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchClaims();
        if (showToast) {
          showToast({
            message: 'GST Claim deleted successfully',
            type: 'success',
            duration: 3000
          });
        }
      } else {
        const error = await response.json().catch(() => ({}));
        await showAlert({
          title: 'Error',
          message: error.detail || 'Failed to delete GST claim'
        });
      }
    } catch (err) {
      await showAlert({
        title: 'Error',
        message: 'Failed to delete GST claim'
      });
    }
  };

  const handleAddCancel = () => {
    setShowAddModal(false);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      vendor: '',
      amount: '',
      gstRate: '',
      gstAmount: '',
      billFile: null
    });
  };

  const handleEditCancel = () => {
    setShowEditModal(false);
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      vendor: '',
      amount: '',
      gstRate: '',
      gstAmount: '',
      billFile: null
    });
  };

  const handleInputChange = (e) => {
    const { name, value, files } = e.target;
    if (files && files[0]) {
      setFormData({
        ...formData,
        [name]: files[0]
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleSubmitBill = async () => {
    if (!formData.date || !formData.vendor || !formData.gstAmount) {
      if (showToast) {
        showToast({
          message: 'Please fill in all required fields',
          type: 'error',
          duration: 3000
        });
      }
      return;
    }
    
    if (!formData.billFile) {
      if (showToast) {
        showToast({
          message: 'Please upload GST bill (required)',
          type: 'error',
          duration: 3000
        });
      }
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    const amount = parseFloat(formData.amount || formData.gstAmount || '0');
    const gstRate = parseFloat(formData.gstRate || '0');
    const gstAmount = parseFloat(formData.gstAmount);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('vendor', formData.vendor);
      formDataToSend.append('amount', amount.toString());
      formDataToSend.append('gst_rate', gstRate.toString());
      formDataToSend.append('gst_amount', gstAmount.toString());
      formDataToSend.append('bill_file', formData.billFile);

      const response = await fetch(`${API_PREFIX}/gst/claims`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formDataToSend
      });

      if (response.ok) {
        await fetchClaims();
        setShowAddModal(false);
        setFormData({
          date: new Date().toISOString().split('T')[0],
          vendor: '',
          amount: '',
          gstRate: '',
          gstAmount: '',
          billFile: null
        });
        if (showToast) {
          showToast({
            message: 'GST Bill submitted successfully',
            type: 'success',
            duration: 3000
          });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || 'Failed to submit GST bill';
        if (showToast) {
          showToast({
            message: errorMessage,
            type: 'error',
            duration: 5000
          });
        } else {
          await showAlert({
            title: 'Error',
            message: errorMessage
          });
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to submit GST bill';
      if (showToast) {
        showToast({
          message: errorMessage,
          type: 'error',
          duration: 5000
        });
      } else {
        await showAlert({
          title: 'Error',
          message: errorMessage
        });
      }
    }
  };

  const totalGST = claims.reduce((sum, c) => sum + (c.gstAmount || 0), 0);
  // Pending Amount includes all unpaid claims (excluding rejected)
  const pendingGST = allClaims.filter(c => 
    c.paymentStatus === 'unpaid' && c.status !== 'rejected'
  ).reduce((sum, c) => sum + (c.gstAmount || 0), 0);

  const resolveBillUrl = (billPath = '') => {
    if (!billPath) return '';
    if (billPath.startsWith('http://') || billPath.startsWith('https://')) {
      return billPath;
    }
    const normalized = billPath.startsWith('/') ? billPath : `/${billPath}`;
    return `${API_ORIGIN}${normalized}`;
  };

  const revokeBillPreview = () => {
    if (billPreviewUrl) {
      URL.revokeObjectURL(billPreviewUrl);
    }
    setBillPreviewUrl('');
  };

  const handleViewBill = async (billPath) => {
    const url = resolveBillUrl(billPath);
    if (url) {
      setShowBillModal(true);
      setBillPreviewError('');
      setBillPreviewLoading(true);
      setBillZoom(1);
      revokeBillPreview();
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!response.ok) {
          throw new Error('Unable to load GST bill. Please download from the link instead.');
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setBillPreviewUrl(objectUrl);
        setBillPreviewType(blob.type || '');
      } catch (error) {
        setBillPreviewError(error.message || 'Failed to preview GST bill.');
      } finally {
        setBillPreviewLoading(false);
      }
    } else if (showToast) {
      showToast({
        message: 'No GST bill available for this claim',
        type: 'error',
        duration: 2500
      });
    }
  };

  const handleCloseBillModal = () => {
    revokeBillPreview();
    setBillPreviewType('');
    setBillPreviewError('');
    setBillPreviewLoading(false);
    setBillOffset({ x: 0, y: 0 });
    setBillPanOrigin({ x: 0, y: 0 });
    setBillZoom(1);
    setShowBillModal(false);
  };

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h3>GST Management</h3>
          <p className="section-subtitle">Submit and track GST bills</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {(userRole === 'Super Admin' || userRole === 'Admin') && (
            <select
              className="btn"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              style={{ padding: '8px 16px', cursor: 'pointer' }}
              title="Filter by payment status"
            >
              <option value="all">All Claims</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          )}
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)} title="Submit a new GST bill">
            + Add GST Bill
          </button>
        </div>
      </div>
      {isLoading && (
        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <p>Loading GST claims...</p>
        </div>
      )}

      {!isLoading && (
      <div className="card">
        <div className="table-responsive">
          <table className="gst-table">
            <thead className="table-head">
              <tr>
                <th style={{width: '140px'}}>Date</th>
                <th>Items Description</th>
                <th>GST Amount</th>
                <th style={{textAlign: 'center'}}>Verified</th>
                {/* <th>Status</th> */}
                <th>Payment</th>
                <th>GST Bill</th>
                <th style={{textAlign: 'center'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="gst-row">
                  <td data-label="Date">
                    <span className="date-badge">{claim.date}</span>
                  </td>
                  <td data-label="Items Description">{claim.vendor}</td>
                  <td data-label="GST Amount" className="gst-amount">₹{claim.gstAmount}</td>
                  <td data-label="Verified" style={{textAlign: 'center'}}>
                    {claim.isVerified === true ? (
                      <span style={{color: 'green', fontSize: '18px', fontWeight: 'bold'}}>✓</span>
                    ) : claim.isVerified === false ? (
                      <span style={{color: 'red', fontSize: '18px', fontWeight: 'bold'}}>✗</span>
                    ) : (
                      <span style={{color: 'gray'}}>-</span>
                    )}
                  </td>
                  {/* <td data-label="Status">
                    <span className={`badge ${getStatusColor(claim.status)}`}>
                      {claim.status}
                    </span>
                  </td> */}
                  <td data-label="Payment">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      <span
                        className={`payment-badge ${
                          claim.paymentStatus === 'paid' ? 'paid' : 'unpaid'
                        }`}
                        title={claim.paymentComment || undefined}
                      >
                        {claim.payment}
                      </span>
                      {claim.paymentStatus === 'paid' && claim.paymentComment && String(claim.paymentComment).trim() !== '' && (
                        <span style={{ 
                          fontSize: '13px',  
                          marginTop: '2px', 
                          display: 'block',
                          wordBreak: 'break-word',
                          maxWidth: '200px'
                        }}>
                           {claim.paymentComment}
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label="GST Bill">
                    {claim.billUrl ? (
                      <button
                        className="action-btn view-btn"
                        title="View GST Bill"
                        onClick={() => handleViewBill(claim.billUrl)}
                      >
                        View
                      </button>
                    ) : (
                      <span className="no-bill">Not available</span>
                    )}
                  </td>
                  <td data-label="Actions" className="actions-cell">
                    {(userRole === 'Super Admin' || userRole === 'Admin') && (
                      <>
                        {/* Commented out - Approve/Reject functionality disabled */}
                        {/* <button className="action-btn approve-btn" title="Approve" onClick={() => handleApprove(claim.id)}>Approve</button> */}
                        {/* <button className="action-btn reject-btn" title="Reject" onClick={() => handleReject(claim.id)}>Reject</button> */}
                        <button 
                          className="action-btn" 
                          title={claim.paymentStatus === 'paid' ? 'Mark as Unpaid' : 'Mark as Paid'} 
                          onClick={() => handleTogglePayment(claim.id, claim.paymentStatus)}
                          style={{ 
                            backgroundColor: claim.paymentStatus === 'paid' ? '#ff9800' : '#4caf50',
                            color: 'white',
                            marginLeft: '5px'
                          }}
                        >
                          {claim.paymentStatus === 'paid' ? 'Unpaid' : 'Paid'}
                        </button>
                      </>
                    )}
                    <button className="action-btn edit-btn" title="Edit" onClick={() => handleEditClick(claim)}>Edit</button>
                    <button className="action-btn delete-btn" title="Delete" onClick={() => handleDelete(claim.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gst-summary">
          <div className="summary-item">
            <span className="summary-label">Total GST Claims:</span>
            <span className="summary-value">{claims.length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total GST Amount:</span>
            <span className="summary-value">₹{totalGST}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Pending Amount:</span>
            <span className="summary-value warning">₹{pendingGST.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
      )}

      {showBillModal && (
        <div className="modal-overlay" onClick={handleCloseBillModal}>
          <div className="modal-content bill-preview" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>GST Bill Preview</h2>
              <div className="bill-preview-controls">
                <button
                  type="button"
                  onClick={() => {
                    setBillOffset({ x: 0, y: 0 });
                    setBillZoom(1);
                  }}
                  className="bill-preview-zoom-btn"
                  disabled={billPreviewLoading}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setBillZoom((prev) => Math.max(0.25, Number((prev - 0.25).toFixed(2))))}
                  className="bill-preview-zoom-btn"
                  disabled={billPreviewLoading}
                >
                  −
                </button>
                <span className="bill-preview-zoom-label">{Math.round(billZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setBillZoom((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))))}
                  className="bill-preview-zoom-btn"
                  disabled={billPreviewLoading}
                >
                  +
                </button>
              </div>
              <button className="modal-close" onClick={handleCloseBillModal}>&times;</button>
            </div>
            <div className="modal-body bill-preview-body">
              {billPreviewLoading && (
                <div className="bill-preview-loading">Loading GST bill…</div>
              )}
              {!billPreviewLoading && billPreviewError && (
                <p className="bill-preview-error">{billPreviewError}</p>
              )}
              {!billPreviewLoading && !billPreviewError && billPreviewUrl && (
                billPreviewType.includes('pdf') ? (
                  <iframe
                    src={`${billPreviewUrl}#zoom=${Math.round(billZoom * 100)}`}
                    title="GST Bill"
                    className="bill-preview-frame"
                  />
                ) : (
                  <div
                    className="bill-preview-image-wrapper"
                    onWheel={(event) => {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const cursorX = event.clientX - rect.left;
                      const cursorY = event.clientY - rect.top;
                      const prevZoom = billZoom;
                      const delta = event.deltaY < 0 ? 0.1 : -0.1;
                      const nextZoom = Number((prevZoom + delta).toFixed(2));
                      const clampedZoom = Math.min(4, Math.max(0.25, nextZoom));
                      if (clampedZoom !== prevZoom) {
                        const scaleChange = clampedZoom / prevZoom;
                        const newOffsetX = cursorX - (cursorX - billOffset.x) * scaleChange;
                        const newOffsetY = cursorY - (cursorY - billOffset.y) * scaleChange;
                        setBillOffset({ x: newOffsetX, y: newOffsetY });
                        setBillZoom(clampedZoom);
                      }
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const startX = event.clientX - billOffset.x;
                      const startY = event.clientY - billOffset.y;
                      setBillPanOrigin({ x: startX, y: startY });
                      const handleMove = (moveEvent) => {
                        moveEvent.preventDefault();
                        setBillOffset({
                          x: moveEvent.clientX - startX,
                          y: moveEvent.clientY - startY
                        });
                      };
                      const handleUp = () => {
                        window.removeEventListener('mousemove', handleMove);
                        window.removeEventListener('mouseup', handleUp);
                      };
                      window.addEventListener('mousemove', handleMove);
                      window.addEventListener('mouseup', handleUp);
                    }}
                  >
                    <img
                      src={billPreviewUrl}
                      alt="GST Bill"
                      className="bill-preview-image"
                      style={{
                        transform: `translate(${billOffset.x}px, ${billOffset.y}px) scale(${billZoom})`
                      }}
                    />
                  </div>
                )
              )}
          </div>
        </div>
      </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={handleAddCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add GST Bill</h2>
              <button className="modal-close" onClick={handleAddCancel}>&times;</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  placeholder="dd-mm-yyyy"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Items Description</label>
                <input
                  type="text"
                  name="vendor"
                  value={formData.vendor}
                  onChange={handleInputChange}
                  placeholder="e.g., Shell Petrol Pump"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>GST Amount (₹)</label>
                <input
                  type="number"
                  name="gstAmount"
                  value={formData.gstAmount}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="form-input"
                  step="0.01"
                />
              </div>

              <div className="form-group">
                <label>Upload GST Bill <span style={{ color: 'red' }}>*</span></label>
                <input
                  type="file"
                  name="billFile"
                  onChange={handleInputChange}
                  accept="image/*,.pdf"
                  className="form-input"
                  style={{ padding: '8px' }}
                  required
                />
                {formData.billFile && (
                  <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                    Selected: {formData.billFile.name}
                  </p>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleAddCancel}>
                Cancel
              </button>
              <button className="btn btn-submit" onClick={handleSubmitBill}>
                Submit Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={handleEditCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit GST Bill</h2>
              <button className="modal-close" onClick={handleEditCancel}>&times;</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  placeholder="dd-mm-yyyy"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Items Description</label>
                <input
                  type="text"
                  name="vendor"
                  value={formData.vendor}
                  onChange={handleInputChange}
                  placeholder="e.g., Shell Petrol Pump"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>GST Amount (₹)</label>
                <input
                  type="number"
                  name="gstAmount"
                  value={formData.gstAmount}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="form-input"
                  step="0.01"
                />
              </div>

              <div className="form-group">
                <label>Upload GST Bill</label>
                <input
                  type="file"
                  name="billFile"
                  onChange={handleInputChange}
                  accept="image/*,.pdf"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
                {formData.billFile && (
                  <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                    Selected: {formData.billFile.name}
                  </p>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleEditCancel}>
                Cancel
              </button>
              <button className="btn btn-submit" onClick={handleUpdateClaim}>
                Update Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentCommentModal && (
        <div className="modal-overlay" onClick={handlePaymentCommentCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Mark as Paid</h2>
              <button className="modal-close" onClick={handlePaymentCommentCancel}>&times;</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Payment Comment <span style={{ color: '#666', fontSize: '12px' }}>(Optional)</span></label>
                <textarea
                  value={paymentComment}
                  onChange={(e) => setPaymentComment(e.target.value)}
                  placeholder="e.g., Paid in cash, Paid via bank transfer, etc."
                  className="form-input"
                  rows="4"
                  style={{ resize: 'vertical' }}
                />
                <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  This comment will be visible to employees in the audit log.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handlePaymentCommentCancel}>
                Cancel
              </button>
              <button className="btn btn-submit" onClick={handlePaymentCommentSubmit}>
                Mark as Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GST;
