import React, { useState, useEffect, useCallback, useRef } from 'react';
import './AdminPanel.css';
import './AuditTable.css';
import './TableHead.css';
import { useModal } from '../contexts/ModalContext';
import ExpensesManager from './ExpensesManager';
import websocketService from '../services/websocketService';

// Normalize API base so it works whether REACT_APP_API_URL is "http://localhost:8002"
// or "http://localhost:8002/api"
const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.4:8002';
const API_BASE = RAW_API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

function AdminPanel() {
  const { showConfirm, showAlert } = useModal();
  const [activeTab, setActiveTab] = useState('expenses-manager');
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    department: '',
    role: 'Employee',
    password: ''
  });

  const [auditLog, setAuditLog] = useState([]);
  const [isLoadingAuditLog, setIsLoadingAuditLog] = useState(false);
  const [auditLogError, setAuditLogError] = useState('');
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const handleAdminTabChange = (event) => {
      if (event.detail) {
        setActiveTab(event.detail);
      }
    };
    window.addEventListener('adminTabChange', handleAdminTabChange);
    return () => {
      window.removeEventListener('adminTabChange', handleAdminTabChange);
    };
  }, []);

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAllUsers = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(u => u.id));
    }
  };

  const handleAddUser = () => {
    setError('');
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      fullName: '',
      department: '',
      role: 'Employee',
      password: ''
    });
    setShowUserForm(true);
  };

  const handleEditUser = (user) => {
    setError('');
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email || '',
      fullName: user.fullName || '',
      department: user.department || '',
      role: user.role || 'Employee',
      password: ''
    });
    setShowUserForm(true);
  };

  const fetchUsers = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again to manage users.');
      return;
    }
    setIsLoadingUsers(true);
    setError('');
    try {
      const response = await fetch(`${API_PREFIX}/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      // Only handle auth errors - don't clear data on other errors
      if (response.status === 401 || response.status === 403) {
        setError('Authentication required. Please login again.');
        // Don't clear users - let App.js handle logout
        return;
      }
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError(errData.detail || 'Failed to load users');
        // Don't clear existing users on error
        return;
      }
      const data = await response.json();
      const formatted = data.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        fullName: u.full_name || u.fullName || '',
        department: u.department || '',
        role: u.role || 'Employee',
        active: typeof u.active === 'boolean' ? u.active : true,
        createdAt: u.created_at || u.createdAt,
      }));
      setUsers(formatted);
      setSelectedUsers([]);
    } catch (err) {
      // Network errors - don't clear existing data
      setError(err.message || 'Network error. Please try again.');
      console.error('Error fetching users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const fetchAuditLog = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setAuditLogError('Please login again to view audit log.');
      return;
    }
    setIsLoadingAuditLog(true);
    setAuditLogError('');
    try {
      const response = await fetch(`${API_PREFIX}/admin/audit-log?limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      // Only handle auth errors - don't clear data on other errors
      if (response.status === 401 || response.status === 403) {
        setAuditLogError('Authentication required. Please login again.');
        // Don't clear audit log - let App.js handle logout
        return;
      }
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setAuditLogError(errData.detail || 'Failed to load audit log');
        // Don't clear existing audit log on error
        return;
      }
      const data = await response.json();
      const formatted = (data.logs || []).map((log) => ({
        id: log.id,
        action: log.action,
        user: log.user || 'Unknown',
        target: log.target || 'N/A',
        timestamp: log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) : 'N/A',
        status: log.status || 'unknown',
        description: log.details || '',
      }));
      setAuditLog(formatted);
    } catch (err) {
      // Network errors - don't clear existing data
      setAuditLogError(err.message || 'Network error. Please try again.');
      console.error('Error fetching audit log:', err);
    } finally {
      setIsLoadingAuditLog(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLog();
    }
  }, [activeTab, fetchAuditLog]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    // Subscribe to global WebSocket service for audit log updates
    const unsubscribe = websocketService.on('audit_log_updated', (data) => {
      if (activeTabRef.current === 'audit') {
          fetchAuditLog();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchAuditLog]);

  const handleSaveUser = async () => {
    if (!formData.username || !formData.email) {
      await showAlert({
        title: 'Validation Error',
        message: 'Please fill in all required fields'
      });
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again to manage users.');
      return;
    }

    setIsSavingUser(true);
    setError('');
    try {
      if (editingUser) {
        const payload = {
          email: formData.email,
          full_name: formData.fullName,
          department: formData.department,
          role: formData.role,
        };
        
        // Remove undefined/null values from payload
        Object.keys(payload).forEach(key => {
          if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
            delete payload[key];
          }
        });
        
        const response = await fetch(`${API_PREFIX}/admin/users/${editingUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        
        const responseData = await response.json().catch(() => ({}));
        
        if (!response.ok) {
          const errorMsg = responseData.detail || responseData.message || `HTTP ${response.status}: ${response.statusText}`;
          throw new Error(errorMsg);
        }
        
        // Update the user in the local state immediately
        if (responseData && responseData.id) {
          setUsers(prevUsers => 
            prevUsers.map(u => 
              u.id === editingUser.id 
                ? {
                    id: responseData.id,
                    username: responseData.username,
                    email: responseData.email,
                    fullName: responseData.full_name || responseData.fullName || '',
                    department: responseData.department || '',
                    role: responseData.role || 'Employee',
                    active: typeof responseData.active === 'boolean' ? responseData.active : true,
                    createdAt: u.createdAt
                  }
                : u
            )
          );
        }
        
        // Show success message
        await showAlert({
          title: 'Success',
          message: 'User updated successfully'
        });
      } else {
        const response = await fetch(`${API_PREFIX}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            full_name: formData.fullName,
            department: formData.department,
          }),
        });
        const createdUser = await response.json().catch(() => null);
        if (!response.ok) {
          const detail = createdUser && createdUser.detail;
          throw new Error(detail || 'Failed to create user');
        }
        if (createdUser && formData.role && formData.role !== 'Employee') {
          const newUserId = createdUser.id || createdUser.user_id || (createdUser.user && createdUser.user.id);
          if (newUserId) {
            await fetch(`${API_PREFIX}/admin/users/${newUserId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ role: formData.role }),
            });
          }
        }
      }
      // Only fetch users if we didn't update locally (for new users)
      if (!editingUser) {
      await fetchUsers();
      }
      // Refresh audit log if on audit tab
      if (activeTab === 'audit') {
        await fetchAuditLog();
      }
      setShowUserForm(false);
      setEditingUser(null);
      setError('');
    } catch (err) {
      const errorMessage = err.message || 'An error occurred while updating the user';
      setError(errorMessage);
      await showAlert({
        title: 'Update Failed',
        message: errorMessage
      });
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    const confirmed = await showConfirm({
      title: 'Delete User',
      message: 'Are you sure you want to delete this user?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmButtonClass: 'btn-danger'
    });
    
    if (confirmed) {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please login again to manage users.');
        return;
      }
      setError(''); // Clear any previous errors
      try {
        const response = await fetch(`${API_PREFIX}/admin/users/${userId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        
        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
          setError('Authentication required. Please login again.');
          return;
        }
        
        if (!response.ok) {
          let errorMessage = 'Failed to delete user';
          try {
            const errData = await response.json();
            errorMessage = errData.detail || errData.message || errorMessage;
          } catch (parseError) {
            // If response is not JSON, use status text
            errorMessage = `HTTP ${response.status}: ${response.statusText || 'Failed to delete user'}`;
          }
          throw new Error(errorMessage);
        }
        
        // Parse response if available
        try {
          await response.json();
        } catch (parseError) {
          // Response might be empty, which is fine
        }
        
        // Show success message
        await showAlert({
          title: 'Success',
          message: 'User deleted successfully'
        });
        
        // Refresh the users list
        await fetchUsers();
        setError(''); // Clear any errors on success
      } catch (err) {
        // Handle network errors and other exceptions
        let errorMessage = err.message || 'Failed to delete user';
        if (errorMessage === 'Failed to fetch' || errorMessage.includes('NetworkError')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        }
        setError(errorMessage);
        console.error('Error deleting user:', err);
      }
    }
  };

  const handleToggleUserStatus = async (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again to manage users.');
      return;
    }
    try {
      const response = await fetch(`${API_PREFIX}/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !user.active }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update user status');
      }
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkChangeRole = async (newRole) => {
    if (selectedUsers.length === 0) {
      await showAlert({
        title: 'Selection Required',
        message: 'Please select users first'
      });
      return;
    }
    const confirmed = await showConfirm({
      title: 'Change Role',
      message: `Change role of ${selectedUsers.length} users to ${newRole}?`,
      confirmText: 'Change',
      cancelText: 'Cancel',
      confirmButtonClass: 'btn-primary'
    });
    
    if (confirmed) {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please login again to manage users.');
        return;
      }
      try {
        await Promise.all(selectedUsers.map(id =>
          fetch(`${API_PREFIX}/admin/users/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ role: newRole }),
          })
        ));
        await fetchUsers();
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const handleBulkToggleStatus = async () => {
    if (selectedUsers.length === 0) {
      await showAlert({
        title: 'Selection Required',
        message: 'Please select users first'
      });
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again to manage users.');
      return;
    }
    try {
      await Promise.all(selectedUsers.map(id => {
        const user = users.find(u => u.id === id);
        if (!user) return Promise.resolve();
        return fetch(`${API_PREFIX}/admin/users/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ active: !user.active }),
        });
      }));
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="admin-panel">
      {activeTab === 'expenses-manager' && (
        <ExpensesManager />
      )}

      {activeTab === 'users' && (
        <div className="admin-section users-section">
          <div className="section-header">
            <h2>User Management</h2>
            <button className="btn btn-primary" onClick={handleAddUser}>
              Add New User
            </button>
          </div>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          {isLoadingUsers ? (
            <div className="loading-state">Loading users...</div>
          ) : (
            <>

          {selectedUsers.length > 0 && (
            <div className="bulk-actions">
              <div className="selected-info">
                {selectedUsers.length} user(s) selected
              </div>
              <div className="bulk-actions-buttons">
                <button
                  className="btn btn-secondary"
                  onClick={() => handleBulkChangeRole('Employee')}
                >
                  Set as Employee
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleBulkChangeRole('Admin')}
                >
                  Set as Admin
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleBulkToggleStatus}
                >
                  Toggle Status
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="table-responsive">
              <table className="admin-table">
                <thead className="table-head">
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedUsers.length === users.length && users.length > 0}
                        onChange={toggleAllUsers}
                      />
                    </th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Full Name</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th style={{textAlign: 'center'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                        />
                      </td>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>{user.fullName}</td>
                      <td>{user.department}</td>
                      <td>
                        <span className={`role-badge role-${user.role.replace(' ', '-').toLowerCase()}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${user.active ? 'active' : 'inactive'}`}>
                          {user.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="action-buttons">
                        <button
                          className="btn-icon edit"
                          onClick={() => handleEditUser(user)}
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button
                          className="btn-icon toggle"
                          onClick={() => handleToggleUserStatus(user.id)}
                          title={user.active ? 'Deactivate' : 'Activate'}
                        >
                          {user.active ? '◯' : '●'}
                        </button>
                        <button
                          className="btn-icon delete"
                          onClick={() => handleDeleteUser(user.id)}
                          title="Delete"
                        >
                          ⨯
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="admin-section audit-section">
          <div className="section-header">
            <h2>Audit Log & Action History</h2>
          </div>

          {auditLogError && (
            <div className="error-banner">
              {auditLogError}
            </div>
          )}

          {isLoadingAuditLog ? (
            <div className="loading-state">Loading audit log...</div>
          ) : (
            <div className="card">
              <div className="table-responsive">
                <table className="audit-table">
                  <thead className="table-head">
                    <tr>
                      <th className="audit-action-col">Action</th>
                      <th className="audit-user-col">User</th>
                      <th className="audit-description-col">Description</th>
                      <th className="audit-target-col">Target</th>
                      <th className="audit-time-col">Timestamp</th>
                      <th className="audit-status-col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                          No audit log entries found.
                        </td>
                      </tr>
                    ) : (
                      auditLog.map(log => (
                        <tr key={log.id}>
                          <td>{log.action}</td>
                          <td>{log.user}</td>
                          <td>{log.description || '-'}</td>
                          <td>{log.target}</td>
                          <td>{log.timestamp}</td>
                          <td>
                            <span className={`audit-status ${log.status}`}>
                              {log.status.replace('-', ' ').toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showUserForm && (
        <div className="modal-overlay" onClick={() => setShowUserForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button className="modal-close" onClick={() => setShowUserForm(false)}>&times;</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  placeholder="Enter username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="form-input"
                  disabled={editingUser}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  placeholder="Enter email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  type="text"
                  id="fullName"
                  placeholder="Enter full name"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="department">Department</label>
                <input
                  type="text"
                  id="department"
                  placeholder="Enter department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="form-input"
                >
                  <option value="Employee">Employee</option>
                  <option value="Admin">Admin</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </div>

              {!editingUser && (
                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    type="password"
                    id="password"
                    placeholder="Enter password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="form-input"
                  />
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUserForm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveUser}>
                {isSavingUser ? 'Saving...' : (editingUser ? 'Update User' : 'Create User')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
