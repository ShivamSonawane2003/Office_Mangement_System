import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import Expenses from './components/Expenses';
import GST from './components/GST';
import SignUp from './components/SignUp';
import AdminPanel from './components/AdminPanel';
import EmployeeAssets from './components/EmployeeAssets';
import ExperienceLetter from './components/Documents';
import OfferLetter from './components/OfferLetter';
import InternshipLetter from './components/InternshipLetter';
import RelievingLetter from './components/RelievingLetter';
import Toast from './components/Toast';
import ChatbotWidget from './components/ChatbotWidget';
import { ModalProvider } from './contexts/ModalContext';
import Logo from './assets/Infomanav.svg';
import LogoutIcon from './assets/logout.svg';
import websocketService from './services/websocketService';


const DOCUMENT_TABS = [
  { key: 'documents-offer', label: 'Offer Letter' },
  { key: 'documents-internship', label: 'Internship Letter' },
  { key: 'documents-experience', label: 'Experience Letter' },
  { key: 'documents-relieving', label: 'Relieving Letter' },
];

const DOCUMENT_TITLES = {
  'documents-offer': 'Offer Letter Generator',
  'documents-internship': 'Internship Certificate Generator',
  'documents-experience': 'Experience Letter Generator',
  'documents-relieving': 'Relieving Letter Generator',
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('Employee');
  const [username, setUsername] = useState('User');
  const [toast, setToast] = useState(null);
  const [documentsMenuOpen, setDocumentsMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [activeAdminSubTab, setActiveAdminSubTab] = useState('expenses-manager');

  useEffect(() => {
    // Validate token on app start
    const validateToken = async () => {
      const token = localStorage.getItem('token');
      const storedRole = localStorage.getItem('role');
      const storedUsername = localStorage.getItem('username');
      
      if (!token || !storedRole || !storedUsername) {
        // Clear any partial data
        localStorage.removeItem('token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        localStorage.removeItem('role');
        localStorage.removeItem('chatbot_messages'); // Clear chatbot history on page refresh if not logged in
        setIsLoggedIn(false);
        return;
      }

      // Verify token is valid by making a test API call
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';
      const API_BASE = API_URL.replace(/\/+$/, '');
      const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

      try {
        const response = await fetch(`${API_PREFIX}/dashboard/?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Only log out on actual authentication errors (401/403), not network errors
        if (response.status === 401 || response.status === 403) {
          // Token is invalid or expired, clear storage
          console.log('Authentication failed - logging out');
          localStorage.removeItem('token');
          localStorage.removeItem('user_id');
          localStorage.removeItem('username');
          localStorage.removeItem('role');
          localStorage.removeItem('chatbot_messages'); // Clear chatbot history on auth failure
          setIsLoggedIn(false);
          websocketService.disconnect();
        } else if (response.ok || response.status === 200) {
          setIsLoggedIn(true);
          setUserRole(storedRole);
          setUsername(storedUsername);
          // Connect WebSocket when user is logged in
          websocketService.connect(API_URL);
        } else {
          // Other errors (500, etc.) - keep user logged in but don't connect WebSocket yet
          // User might have valid token but server is having issues
          console.warn('Dashboard API returned non-200 status:', response.status);
          setIsLoggedIn(true);
          setUserRole(storedRole);
          setUsername(storedUsername);
          // Still try to connect WebSocket
          websocketService.connect(API_URL);
        }
      } catch (err) {
        // Network error - don't log out, keep user logged in
        // This could be temporary network issues
        console.warn('Network error during token validation:', err);
        // Keep user logged in if we have token and credentials
        if (token && storedRole && storedUsername) {
          setIsLoggedIn(true);
          setUserRole(storedRole);
          setUsername(storedUsername);
          // Try to connect WebSocket
          websocketService.connect(API_URL);
        } else {
          // No valid credentials, log out
          localStorage.removeItem('token');
          localStorage.removeItem('user_id');
          localStorage.removeItem('username');
          localStorage.removeItem('role');
          localStorage.removeItem('chatbot_messages'); // Clear chatbot history when no credentials
          setIsLoggedIn(false);
          websocketService.disconnect();
        }
      }
    };

    validateToken();
  }, []);

  // Separate effect to handle visibility changes when logged in
  useEffect(() => {
    if (!isLoggedIn) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        websocketService.ensureConnected();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLoggedIn]);

  // Periodic token validation to ensure session stays alive
  useEffect(() => {
    if (!isLoggedIn) return;

    const validateTokenPeriodically = async () => {
      const token = localStorage.getItem('token');
      const storedRole = localStorage.getItem('role');
      const storedUsername = localStorage.getItem('username');
      
      if (!token || !storedRole || !storedUsername) {
        return;
      }

      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';
      const API_BASE = API_URL.replace(/\/+$/, '');
      const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

      try {
        const response = await fetch(`${API_PREFIX}/dashboard/?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Only log out on actual authentication errors (401/403)
        if (response.status === 401 || response.status === 403) {
          console.log('Token expired - logging out');
          handleLogout();
        }
        // For other errors or network issues, keep user logged in
      } catch (err) {
        // Network errors - don't log out, just log the error
        console.warn('Periodic token validation network error (non-critical):', err);
        // Keep user logged in - this is likely a temporary network issue
      }
    };

    // Validate token every 5 minutes
    const interval = setInterval(validateTokenPeriodically, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [darkMode]);

  const handleSignUpSuccess = (user, role) => {
    setIsLoggedIn(true);
    setUserRole(role);
    setUsername(user);
    // Connect WebSocket when user logs in
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';
    websocketService.connect(API_URL);
  };

  const isDocumentsTab = DOCUMENT_TABS.some((tab) => tab.key === activeTab);
  const isAdminTab = activeTab === 'admin';
  
  // Update activeAdminSubTab when admin tab changes externally
  useEffect(() => {
    if (activeTab === 'admin') {
      // Listen for adminTabChange events to sync the active sub tab
      const handleAdminTabChange = (event) => {
        if (event.detail) {
          setActiveAdminSubTab(event.detail);
        }
      };
      window.addEventListener('adminTabChange', handleAdminTabChange);
      return () => {
        window.removeEventListener('adminTabChange', handleAdminTabChange);
      };
    }
  }, [activeTab]);

  useEffect(() => {
    if (isDocumentsTab) {
      setDocumentsMenuOpen(true);
    }
  }, [isDocumentsTab]);

  useEffect(() => {
    if (isAdminTab) {
      setAdminMenuOpen(true);
    }
  }, [isAdminTab]);

  const handleLogout = () => {
    // Disconnect WebSocket when user logs out
    websocketService.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    localStorage.removeItem('chatbot_messages'); // Clear chatbot history on logout
    setIsLoggedIn(false);
    setUserRole('Employee');
    setUsername('User');
  };

  const handleDocumentNav = (tabKey) => {
    setActiveTab(tabKey);
    setDocumentsMenuOpen(true);
    setShowMobileMenu(false);
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'expenses':
        return 'Expense Management';
      case 'gst':
        return 'GST Management';
      case 'admin':
        return 'Admin Panel';
      default:
        return DOCUMENT_TITLES[activeTab] || 'Documents';
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'expenses':
        return <Expenses showToast={setToast} userRole={userRole} />;
      case 'gst':
        return <GST showToast={setToast} userRole={userRole} />;
      case 'admin':
        return <AdminPanel />;
      case 'employee-assets':
        return <EmployeeAssets userRole={userRole} />;
      case 'documents-offer':
        return <OfferLetter showToast={setToast} />;
      case 'documents-internship':
        return <InternshipLetter showToast={setToast} />;
      case 'documents-relieving':
        return <RelievingLetter showToast={setToast} />;
      case 'documents-experience':
        return <ExperienceLetter showToast={setToast} />;
      default:
        return <Dashboard />;
    }
  };

  // Effect to restore session if we have credentials but isLoggedIn is false
  // This prevents blank screens on network errors during validation
  useEffect(() => {
    if (!isLoggedIn) {
      const hasToken = localStorage.getItem('token');
      const hasRole = localStorage.getItem('role');
      const hasUsername = localStorage.getItem('username');
      
      // If we have credentials but isLoggedIn is false, it might be a validation error
      // Try to restore session instead of showing blank
      if (hasToken && hasRole && hasUsername) {
        console.log('Restoring session from localStorage');
        setIsLoggedIn(true);
        setUserRole(hasRole);
        setUsername(hasUsername);
        const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';
        websocketService.connect(API_URL);
      }
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    // Check one more time before showing SignUp
    const hasToken = localStorage.getItem('token');
    const hasRole = localStorage.getItem('role');
    const hasUsername = localStorage.getItem('username');
    
    // If we have credentials, wait for the effect to restore session
    if (hasToken && hasRole && hasUsername) {
      // Show loading state instead of SignUp
      return (
        <ModalProvider>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <div>Loading...</div>
          </div>
        </ModalProvider>
      );
    }
    
    // No credentials at all, show SignUp
    return (
      <ModalProvider>
        <SignUp onSignUpSuccess={handleSignUpSuccess} />
      </ModalProvider>
    );
  }

  return (
    <ModalProvider>
      <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <aside className={`sidebar ${showMobileMenu ? 'active' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-text">
             <img src={Logo} alt="Infomanav Logo" className="logo-img"  />
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('dashboard');
              setShowMobileMenu(false);
              setDocumentsMenuOpen(false);
            }}
          >
            <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="nav-label">Dashboard</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('expenses');
              setShowMobileMenu(false);
              setDocumentsMenuOpen(false);
            }}
          >
            <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2V22M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="nav-label">Expenses</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'gst' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('gst');
              setShowMobileMenu(false);
              setDocumentsMenuOpen(false);
            }}
          >
            <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 9H9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="nav-label">GST</span>
          </button>
          {userRole === 'Super Admin' && (
            <>
              <div className="nav-item-group">
                <button
                  className={`nav-item has-children ${isAdminTab ? 'active' : ''}`}
                  onClick={() => {
                    setAdminMenuOpen((prev) => !prev);
                  }}
                  type="button"
                >
                  <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 21V19C6 17.9391 6.42143 16.9217 7.17157 16.1716C7.92172 15.4214 8.93913 15 10 15H14C15.0609 15 16.0783 15.4214 16.8284 16.1716C17.5786 16.9217 18 17.9391 18 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 3"/>
                    <path d="M12 1V3M12 21V23M23 12H21M3 12H1M20.364 3.636L18.95 5.05M5.05 18.95L3.636 20.364M20.364 20.364L18.95 18.95M5.05 5.05L3.636 3.636" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="nav-label">Admin Panel</span>
                  <svg className={`nav-chevron ${adminMenuOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 10L12 15L17 10H7Z" fill="currentColor"/>
                  </svg>
                </button>
                <div className={`nav-submenu ${adminMenuOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className={`nav-subitem ${activeTab === 'admin' && activeAdminSubTab === 'expenses-manager' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('admin');
                      setActiveAdminSubTab('expenses-manager');
                      setShowMobileMenu(false);
                      setDocumentsMenuOpen(false);
                      // Set the active tab in AdminPanel to expenses-manager
                      setTimeout(() => {
                        const event = new CustomEvent('adminTabChange', { detail: 'expenses-manager' });
                        window.dispatchEvent(event);
                      }, 100);
                    }}
                  >
                    Expenses Excel Tables
                  </button>
                  <button
                    type="button"
                    className={`nav-subitem ${activeTab === 'admin' && activeAdminSubTab === 'users' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('admin');
                      setActiveAdminSubTab('users');
                      setShowMobileMenu(false);
                      setDocumentsMenuOpen(false);
                      // Set the active tab in AdminPanel to users
                      setTimeout(() => {
                        const event = new CustomEvent('adminTabChange', { detail: 'users' });
                        window.dispatchEvent(event);
                      }, 100);
                    }}
                  >
                    User Management
                  </button>
                  <button
                    type="button"
                    className={`nav-subitem ${activeTab === 'admin' && activeAdminSubTab === 'audit' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('admin');
                      setActiveAdminSubTab('audit');
                      setShowMobileMenu(false);
                      setDocumentsMenuOpen(false);
                      // Set the active tab in AdminPanel to audit
                      setTimeout(() => {
                        const event = new CustomEvent('adminTabChange', { detail: 'audit' });
                        window.dispatchEvent(event);
                      }, 100);
                    }}
                  >
                    Audit Log
                  </button>
                </div>
              </div>
            </>
          )}
          <button
            className={`nav-item ${activeTab === 'employee-assets' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('employee-assets');
              setShowMobileMenu(false);
              setDocumentsMenuOpen(false);
              setAdminMenuOpen(false);
            }}
          >
            <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 9H15M9 15H15M9 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="nav-label">Employee Assets</span>
          </button>
          {userRole === 'Super Admin' && (
            <>
              <div className="nav-item-group">
                <button
                  className={`nav-item has-children ${isDocumentsTab ? 'active' : ''}`}
                  onClick={() => setDocumentsMenuOpen((prev) => !prev)}
                  type="button"
                >
                  <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="nav-label">Documents</span>
                  <svg className={`nav-chevron ${documentsMenuOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 10L12 15L17 10H7Z" fill="currentColor"/>
                  </svg>
                </button>
                <div className={`nav-submenu ${documentsMenuOpen ? 'open' : ''}`}>
                  {DOCUMENT_TABS.map((docTab) => (
                    <button
                      key={docTab.key}
                      type="button"
                      className={`nav-subitem ${activeTab === docTab.key ? 'active' : ''}`}
                      onClick={() => handleDocumentNav(docTab.key)}
                    >
                      {docTab.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <button 
            className="logout-item"
            onClick={handleLogout}
            title="Logout"
          >
            <img src={LogoutIcon} alt="Logout" />
            <span className="logout-label">Log Out</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <div className="header-left">
            <button className="mobile-menu-toggle" onClick={() => setShowMobileMenu(!showMobileMenu)}>
              Menu
            </button>
            <h2>{getHeaderTitle()}</h2>
          </div>
          <div className="header-right">
            <button 
              className="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
            >
              {darkMode ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 2V4M12 20V22M4.93 4.93L6.34 6.34M17.66 17.66L19.07 19.07M2 12H4M20 12H22M6.34 17.66L4.93 19.07M19.07 4.93L17.66 6.34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <div className="user-info">
              <div className="user-avatar">
                {username ? username.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="user-details">
                <p className="user-name">{username}</p>
                <p className="user-role">{userRole}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="content">{renderContent()}</div>
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type || 'info'}
          duration={toast.duration || 3000}
          actions={toast.actions}
          onClose={() => setToast(null)}
        />
      )}

      {(userRole === 'Admin' || userRole === 'Super Admin') && <ChatbotWidget />}
      </div>
    </ModalProvider>
  );
}

export default App;
