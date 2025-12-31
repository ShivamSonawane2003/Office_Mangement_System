import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import './EmployeeAssets.css';
import { useModal } from '../contexts/ModalContext';

// Dropdown Menu Component
const DropdownMenu = ({ children, triggerRef, onClose }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) &&
          triggerRef && !triggerRef.contains(event.target)) {
        onClose();
      }
    };

    const updatePosition = () => {
      if (menuRef.current && triggerRef) {
        const trigger = triggerRef.querySelector('.category-dropdown-trigger');
        if (trigger) {
          const rect = trigger.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          menuRef.current.style.position = 'fixed';
          menuRef.current.style.left = `${rect.left}px`;
          menuRef.current.style.width = `${Math.max(rect.width, 200)}px`;
          menuRef.current.style.right = 'auto';
          
          // Check if dropdown would go below viewport, if so, show above
          const spaceBelow = viewportHeight - rect.bottom;
          const spaceAbove = rect.top;
          const dropdownHeight = 300; // maxHeight
          
          if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
            // Show above the trigger
            menuRef.current.style.bottom = `${viewportHeight - rect.top + 4}px`;
            menuRef.current.style.top = 'auto';
          } else {
            // Show below the trigger
            menuRef.current.style.top = `${rect.bottom + 4}px`;
            menuRef.current.style.bottom = 'auto';
          }
          
          // Ensure dropdown doesn't go off right edge
          const dropdownRight = rect.left + Math.max(rect.width, 200);
          if (dropdownRight > viewportWidth) {
            menuRef.current.style.left = `${viewportWidth - Math.max(rect.width, 200) - 10}px`;
          }
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      updatePosition();
    }, 0);

    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [triggerRef, onClose]);

  // Render dropdown in a portal to avoid overflow clipping
  return createPortal(
    <div
      ref={menuRef}
      className="category-dropdown-menu"
      onClick={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 10000,
        maxHeight: '300px',
        overflowY: 'auto',
        minWidth: '200px',
        position: 'fixed',
        pointerEvents: 'auto'
      }}
    >
      {children}
    </div>,
    document.body
  );
};

const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.4:8002';
const API_BASE = RAW_API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

const CONDITION_OPTIONS = [
  "Excellent",
  "Outstanding",
  "Good",
  "So So but woking",
  "Worst"
];

// Predefined categories that cannot be deleted
const PREDEFINED_CATEGORIES = [
  "Mac book Air",
  "MAC",
  "MAC Air",
  "Mac mini",
  "Laptop",
  "iPhone 11 Pro",
  "iPhone 14 Pro",
  "Mobile",
  "Mobile 2",
  "Charger",
  "Mouse",
  "Monitor",
  "24\" Monitor",
  "SATA HDD/SSD Case",
  "RAM (Installed)",
  "MacBook Pro",
  "MacBook (General)",
  "Desktop PC",
  "Windows Laptop",
  "Linux Workstation",
  "All-in-One PC",
  "Chromebook",
  "Android Phone",
  "iPhone (General)",
  "iPad",
  "Tablet",
  "SIM Card",
  "eSIM",
  "27\" Monitor",
  "32\" Monitor",
  "UltraWide Monitor",
  "Secondary Monitor",
  "Display Adapter",
  "HDMI Adapter",
  "USB-C to HDMI Adapter",
  "Projector",
  "TV Display",
  "Keyboard",
  "Mechanical Keyboard",
  "Wireless Keyboard",
  "Trackpad",
  "Touchpad",
  "Headphones",
  "Bluetooth Headphones",
  "Headset (with mic)",
  "External HDD",
  "External SSD",
  "USB Drive",
  "Pen Drive",
  "SD Card",
  "Micro SD Card",
  "NVMe External Case",
  "Internal SSD",
  "Internal HDD",
  "USB-C Cable",
  "Lightning Cable",
  "Type-C Charger",
  "Laptop Charger",
  "Phone Charger",
  "HDMI Cable",
  "DisplayPort Cable",
  "VGA Cable",
  "Docking Station",
  "USB Hub",
  "Power Adapter",
  "Power Bank",
  "Router",
  "Wi-Fi Router",
  "Wi-Fi Adapter",
  "Ethernet Cable",
  "Ethernet Switch",
  "Network Card",
  "Access Card",
  "RFID Tag",
  "Security Key (YubiKey)",
  "Biometric Scanner",
  "Printer",
  "Scanner",
  "All-in-One Printer",
  "Web Camera",
  "Speakers",
  "Conference Mic",
  "Label Printer",
  "Laptop Stand",
  "Monitor Stand",
  "Desk Lamp",
  "Backrest / Ergonomic Support",
  "Tools",
  "Testing Devices",
  "Packaging Material",
  "Spare Parts",
  "Protection Case",
  "Laptop Bag",
  "Phone Case",
  "Screen Guard"
];

function EmployeeAssets({ userRole }) {
  const { showConfirm, showAlert } = useModal();
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingCell, setEditingCell] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Filters
  const [filterEmployeeName, setFilterEmployeeName] = useState('');
  const [filterMachineDevice, setFilterMachineDevice] = useState('');
  const [filterCondition, setFilterCondition] = useState('');
  const [filterEmployeeDropdown, setFilterEmployeeDropdown] = useState('');
  
  // Employee grouping state
  const [expandedEmployees, setExpandedEmployees] = useState({});
  
  // Add category modal
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [pendingAssetId, setPendingAssetId] = useState(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState({});
  const dropdownRefs = useRef({});
  
  // Reassign modal state
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassigningAsset, setReassigningAsset] = useState(null);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.keys(categoryDropdownOpen).forEach(assetId => {
        if (categoryDropdownOpen[assetId] && dropdownRefs.current[assetId]) {
          if (!dropdownRefs.current[assetId].contains(event.target)) {
            setCategoryDropdownOpen(prev => ({
              ...prev,
              [assetId]: false
            }));
          }
        }
      });
    };

    // Use a small delay to avoid closing immediately when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [categoryDropdownOpen]);
  
  // Fetch users list for dropdown (Super Admin only)
  const fetchUsers = useCallback(async () => {
    if (userRole !== 'Super Admin') {
      return;
    }
    
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }
    
    try {
      const response = await fetch(`${API_PREFIX}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const formatted = data.map((u) => ({
          id: u.id,
          username: u.username,
          fullName: u.full_name || u.fullName || u.username,
          email: u.email,
          role: u.role || 'Employee'
        }));
        setUsers(formatted);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  }, [userRole]);

  const fetchAssets = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterMachineDevice) params.append('machine_device', filterMachineDevice);
      if (filterCondition) params.append('condition', filterCondition);
      
      const [assetsResponse, categoriesResponse] = await Promise.all([
        fetch(`${API_PREFIX}/admin/employee-assets?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_PREFIX}/admin/employee-assets/categories`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!assetsResponse.ok) {
        let errorMessage = 'Failed to load employee assets';
        try {
          const errData = await assetsResponse.json();
          if (typeof errData === 'string') {
            errorMessage = errData;
          } else if (errData && typeof errData === 'object') {
            errorMessage = errData.detail || errData.message || JSON.stringify(errData);
          }
        } catch (parseError) {
          errorMessage = `Server error: ${assetsResponse.status} ${assetsResponse.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      if (!categoriesResponse.ok) {
        let errorMessage = 'Failed to load categories';
        try {
          const errData = await categoriesResponse.json();
          if (typeof errData === 'string') {
            errorMessage = errData;
          } else if (errData && typeof errData === 'object') {
            errorMessage = errData.detail || errData.message || JSON.stringify(errData);
          }
        } catch (parseError) {
          errorMessage = `Server error: ${categoriesResponse.status} ${categoriesResponse.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const assetsData = await assetsResponse.json();
      const categoriesData = await categoriesResponse.json();

      // Format assets - same date handling as Expenses Manager
      let formattedAssets = assetsData.map(asset => ({
        id: asset.id,
        employeeName: asset.employee_name || '',
        machineDevice: asset.machine_device || '',
        companyBrand: asset.company_brand || '',
        model: asset.model || '',
        configuration: asset.configuration || '',
        issueDate: asset.issue_date ? asset.issue_date.split('T')[0] : '',
        retirementDate: asset.retirement_date ? asset.retirement_date.split('T')[0] : '',
        serialNumber: asset.serial_number && !asset.serial_number.startsWith('__EMPTY_') ? asset.serial_number : '',
        condition: asset.condition || '',
        anyIssues: asset.any_issues || '',
      }));

      // For Employee role, ensure they only see their own assets (defense in depth)
      if (userRole === 'Employee' && formattedAssets.length > 0) {
        // Get the employee name from the first asset (all should belong to the same employee)
        const employeeName = formattedAssets[0].employeeName;
        if (employeeName) {
          // Filter to only show assets that match this employee name (case-insensitive)
          formattedAssets = formattedAssets.filter(asset => 
            asset.employeeName && 
            asset.employeeName.toLowerCase().trim() === employeeName.toLowerCase().trim()
          );
        } else {
          // If no employee name, show no assets for Employee role
          formattedAssets = [];
        }
      }

      setAssets(formattedAssets);

      if (categoriesData.categories) {
        setCategories(categoriesData.categories);
      }
    } catch (err) {
      let errorMessage = 'An error occurred while loading data';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.detail || err.toString() || JSON.stringify(err);
      }
      
      console.error('Error loading assets:', err);
      setError(String(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [filterMachineDevice, filterCondition, userRole]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Helper function to format date for Excel (returns Date object or empty string)
  const formatDateForExcel = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString; // Return original if invalid
      return date; // Return Date object for Excel to recognize
    } catch (e) {
      return dateString; // Return original if parsing fails
    }
  };

  // Export employee assets to Excel with proper formatting
  const handleExportToCSV = async () => {
    if (assets.length === 0) {
      await showAlert({
        title: 'Export Error',
        message: 'No employee assets data to export'
      });
      return;
    }

    const headers = [
      'Employee Name',
      'Machine / Device',
      'Company / Brand',
      'Model',
      'Configuration',
      'Issue Date',
      'Retirement Date',
      'Serial Number',
      'Condition',
      'Any Issues'
    ];

    // Prepare data with proper date formatting
    const excelData = [
      headers, // Header row
      ...assets.map(asset => [
        asset.employeeName || '',
        asset.machineDevice || '',
        asset.companyBrand || '',
        asset.model || '',
        asset.configuration || '',
        formatDateForExcel(asset.issueDate),
        formatDateForExcel(asset.retirementDate),
        asset.serialNumber || '',
        asset.condition || '',
        asset.anyIssues || ''
      ])
    ];

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);

    // Set column widths to 150 pixels (approximately 18.75 characters, using 20 for better readability)
    // 150px / 8px per character ≈ 18.75, rounded to 20
    const colWidths = headers.map(() => ({ wch: 20 }));
    ws['!cols'] = colWidths;

    // Format header row cells (make them bold and larger)
    const headerRange = XLSX.utils.decode_range(ws['!ref']);
    for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellAddress]) continue;
      
      // Set header cell style (XLSX supports basic styling)
      ws[cellAddress].s = {
        font: { bold: true, sz: 12, color: { rgb: "000000" } },
        fill: { fgColor: { rgb: "E0E0E0" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };
    }

    // Set date format for date columns (Issue Date and Retirement Date)
    const issueDateCol = 5; // Column F (0-indexed: 5)
    const retirementDateCol = 6; // Column G (0-indexed: 6)
    
    for (let row = 1; row <= assets.length; row++) {
      const issueDateCell = XLSX.utils.encode_cell({ r: row, c: issueDateCol });
      const retirementDateCell = XLSX.utils.encode_cell({ r: row, c: retirementDateCol });
      
      if (ws[issueDateCell] && ws[issueDateCell].v instanceof Date) {
        ws[issueDateCell].z = 'dd/mm/yyyy'; // Date format
        ws[issueDateCell].t = 'd'; // Date type
      }
      if (ws[retirementDateCell] && ws[retirementDateCell].v instanceof Date) {
        ws[retirementDateCell].z = 'dd/mm/yyyy'; // Date format
        ws[retirementDateCell].t = 'd'; // Date type
      }
    }

    // Set row height for header row (make it bigger - 30 points)
    if (!ws['!rows']) ws['!rows'] = [];
    ws['!rows'][0] = { hpt: 30 }; // Set first row height to 30 points

    // Append worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Assets');

    // Generate Excel file with cell styles
    const excelBuffer = XLSX.write(wb, { 
      bookType: 'xlsx', 
      type: 'array',
      cellStyles: true 
    });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Download file
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Employee_Assets_${new Date().toISOString().split('T')[0]}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke URL after a short delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };
  
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddRow = async (specificEmployeeName = null) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    // Ensure categories are loaded
    if (!categories || categories.length === 0) {
      await showAlert({
        title: 'Error',
        message: 'Categories are not loaded yet. Please wait a moment and try again.'
      });
      return;
    }

    // For Employee role, auto-fill employee_name
    let employeeName = '';
    if (specificEmployeeName) {
      // Use the specific employee name if provided (from the + button)
      employeeName = specificEmployeeName;
    } else if (userRole === 'Employee' && currentUser) {
      employeeName = currentUser.fullName || currentUser.username || '';
    }
    
    // If still empty and not Employee, use a placeholder (Admin/Super Admin can edit it)
    if (!employeeName) {
      employeeName = 'New Employee';
    }

    const newAsset = {
      employee_name: employeeName,
      machine_device: categories[0] || 'Laptop',
      company_brand: '',
      model: '',
      configuration: '',
      issue_date: '',
      retirement_date: '',
      serial_number: '',
      condition: '',
      any_issues: '',
    };

    try {
      const formData = new FormData();
      // Always append required fields with valid values (non-empty)
      formData.append('employee_name', employeeName);
      formData.append('machine_device', categories[0] || 'Laptop');
      formData.append('serial_number', '');
      // Append optional fields - send empty strings for dates so backend can handle them
      if (newAsset.company_brand) formData.append('company_brand', newAsset.company_brand);
      if (newAsset.model) formData.append('model', newAsset.model);
      if (newAsset.configuration) formData.append('configuration', newAsset.configuration);
      // Always send date fields (even if empty) so backend can process them correctly
      formData.append('issue_date', newAsset.issue_date || '');
      formData.append('retirement_date', newAsset.retirement_date || '');
      if (newAsset.condition) formData.append('condition', newAsset.condition);
      if (newAsset.any_issues) formData.append('any_issues', newAsset.any_issues);

      const response = await fetch(`${API_PREFIX}/admin/employee-assets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        let errorMessage = 'Failed to create asset';
        try {
          const errData = await response.json();
          
          // Handle FastAPI validation errors (422)
          if (errData && typeof errData === 'object') {
            if (Array.isArray(errData.detail)) {
              // Format validation errors
              const errors = errData.detail.map(err => {
                const field = err.loc ? err.loc.join('.') : 'field';
                return `${field}: ${err.msg || 'validation error'}`;
              });
              errorMessage = errors.join('\n');
            } else if (typeof errData.detail === 'string') {
              errorMessage = errData.detail;
            } else if (errData.message) {
              errorMessage = errData.message;
            } else {
              errorMessage = JSON.stringify(errData);
            }
          } else if (typeof errData === 'string') {
            errorMessage = errData;
          }
        } catch (parseError) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json(); // Consume the response
      console.log('Asset created successfully:', result);
      await fetchAssets();
    } catch (err) {
      let errorMessage = 'An error occurred while creating the asset';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.detail || err.toString() || JSON.stringify(err);
      }
      
      console.error('Error creating asset:', err);
      setError(errorMessage);
      
      await showAlert({
        title: 'Error',
        message: String(errorMessage)
      });
    }
  };

  const handleCellChange = async (id, field, value) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    // For date fields, normalize empty values
    if (field === 'issueDate' || field === 'retirementDate') {
      // If value is empty or just whitespace, treat as empty string
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        value = '';
        console.log(`Normalized ${field} to empty string for clearing`);
      } else {
        // Validate date format
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          await showAlert({
            title: 'Validation Error',
            message: 'Please enter a valid date'
          });
          return;
        }
      }
    }

    // Validate serial number uniqueness (client-side check)
    // Skip validation for empty serial numbers (allow multiple empty serial numbers)
    if (field === 'serialNumber' && value && value.trim() !== '') {
      const existing = assets.find(a => a.id !== id && a.serialNumber && a.serialNumber.trim() !== '' && a.serialNumber === value);
      if (existing) {
        await showAlert({
          title: 'Validation Error',
          message: `Serial number "${value}" already exists`
        });
        return;
      }
    }

    const fieldMap = {
      'employeeName': 'employee_name',
      'machineDevice': 'machine_device',
      'companyBrand': 'company_brand',
      'model': 'model',
      'configuration': 'configuration',
      'issueDate': 'issue_date',
      'retirementDate': 'retirement_date',
      'serialNumber': 'serial_number',
      'condition': 'condition',
      'anyIssues': 'any_issues'
    };

    const backendField = fieldMap[field];
    if (!backendField) {
      return;
    }

    try {
      const formData = new FormData();
      
      // Handle date fields - always send both date fields to preserve the other one
      if (field === 'issueDate' || field === 'retirementDate') {
        // Find the current asset to get both date values
        const currentAsset = assets.find(a => a.id === id);
        
        // Handle the field being updated
        const valueStr = value ? String(value).trim() : '';
        if (valueStr !== '') {
          const isoString = new Date(valueStr).toISOString();
          formData.append(backendField, isoString);
          console.log(`Sending ${field} as ISO string:`, isoString);
        } else {
          formData.append(backendField, '');
          console.log(`Sending ${field} as empty string to clear date`);
        }
        
        // Always send the other date field to preserve it
        if (field === 'issueDate') {
          // Preserve retirement_date
          const otherDateValue = currentAsset?.retirementDate || '';
          if (otherDateValue && otherDateValue.trim() !== '') {
            const otherIsoString = new Date(otherDateValue).toISOString();
            formData.append('retirement_date', otherIsoString);
            console.log('Preserving retirement_date:', otherIsoString);
          } else {
            formData.append('retirement_date', '');
          }
        } else if (field === 'retirementDate') {
          // Preserve issue_date
          const otherDateValue = currentAsset?.issueDate || '';
          if (otherDateValue && otherDateValue.trim() !== '') {
            const otherIsoString = new Date(otherDateValue).toISOString();
            formData.append('issue_date', otherIsoString);
            console.log('Preserving issue_date:', otherIsoString);
          } else {
            formData.append('issue_date', '');
          }
        }
        
        // Preserve configuration and any_issues when updating date fields
        if (currentAsset) {
          const configValue = currentAsset?.configuration || '';
          formData.append('configuration', configValue !== null && configValue !== undefined ? String(configValue) : '');
          
          const anyIssuesValue = currentAsset?.anyIssues || '';
          formData.append('any_issues', anyIssuesValue !== null && anyIssuesValue !== undefined ? String(anyIssuesValue) : '');
        }
      } else {
        // For non-date fields, send the value as string
        formData.append(backendField, value !== null && value !== undefined ? String(value) : '');
        
        // Always preserve date fields and text fields (configuration, any_issues) when updating any field
        const currentAsset = assets.find(a => a.id === id);
        if (currentAsset) {
          // Preserve issue_date
          const issueDateValue = currentAsset?.issueDate || '';
          if (issueDateValue && issueDateValue.trim() !== '') {
            const issueDateIso = new Date(issueDateValue).toISOString();
            formData.append('issue_date', issueDateIso);
          } else {
            formData.append('issue_date', '');
          }
          
          // Preserve retirement_date
          const retirementDateValue = currentAsset?.retirementDate || '';
          if (retirementDateValue && retirementDateValue.trim() !== '') {
            const retirementDateIso = new Date(retirementDateValue).toISOString();
            formData.append('retirement_date', retirementDateIso);
          } else {
            formData.append('retirement_date', '');
          }
          
          // Preserve configuration if not being updated
          if (field !== 'configuration') {
            const configValue = currentAsset?.configuration || '';
            formData.append('configuration', configValue !== null && configValue !== undefined ? String(configValue) : '');
          }
          
          // Preserve any_issues if not being updated
          if (field !== 'anyIssues') {
            const anyIssuesValue = currentAsset?.anyIssues || '';
            formData.append('any_issues', anyIssuesValue !== null && anyIssuesValue !== undefined ? String(anyIssuesValue) : '');
          }
        }
      }

      const response = await fetch(`${API_PREFIX}/admin/employee-assets/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errorMessage = errData.detail || errData.message || 'Failed to update asset';
        throw new Error(errorMessage);
      }

      const updatedAsset = await response.json();
      console.log('Updated asset from server:', updatedAsset);
      console.log('Issue date:', updatedAsset.issue_date, 'Type:', typeof updatedAsset.issue_date);
      console.log('Retirement date:', updatedAsset.retirement_date, 'Type:', typeof updatedAsset.retirement_date);

      // Refresh assets to get the updated data from server
      await fetchAssets();
    } catch (err) {
      let errorMessage = 'An error occurred while updating the asset';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.detail || err.toString() || JSON.stringify(err);
      }
      
      console.error('Error updating asset:', err);
      setError(errorMessage);
      await showAlert({
        title: 'Error',
        message: String(errorMessage)
      });
    }
  };

  const handleReassign = (asset) => {
    setReassigningAsset(asset);
    setNewEmployeeName(asset.employeeName || '');
    setShowReassignModal(true);
  };

  const handleReassignConfirm = async () => {
    if (!reassigningAsset || !newEmployeeName || !newEmployeeName.trim()) {
      await showAlert({
        title: 'Error',
        message: 'Please select a new employee name'
      });
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('new_employee_name', newEmployeeName.trim());

      const response = await fetch(`${API_PREFIX}/admin/employee-assets/${reassigningAsset.id}/reassign`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        let errorMessage = 'Failed to reassign asset';
        try {
          const errData = await response.json();
          if (typeof errData === 'string') {
            errorMessage = errData;
          } else if (errData && typeof errData === 'object') {
            errorMessage = errData.detail || errData.message || JSON.stringify(errData);
          }
        } catch (parseError) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      await showAlert({
        title: 'Success',
        message: `Asset reassigned from "${reassigningAsset.employeeName}" to "${newEmployeeName.trim()}"`
      });

      setShowReassignModal(false);
      setReassigningAsset(null);
      setNewEmployeeName('');
      await fetchAssets();
    } catch (err) {
      console.error('Error reassigning asset:', err);
      await showAlert({
        title: 'Error',
        message: err.message || 'Failed to reassign asset'
      });
    }
  };

  const handleDeleteRow = async (id) => {
    const confirmed = await showConfirm({
      title: 'Delete Asset',
      message: 'Are you sure you want to delete this asset?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmButtonClass: 'btn-danger'
    });

    if (!confirmed) return;

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    try {
      const response = await fetch(`${API_PREFIX}/admin/employee-assets/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete asset';
        try {
          const errData = await response.json();
          if (typeof errData === 'string') {
            errorMessage = errData;
          } else if (errData && typeof errData === 'object') {
            errorMessage = errData.detail || errData.message || JSON.stringify(errData);
          }
        } catch (parseError) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      await fetchAssets();
    } catch (err) {
      let errorMessage = 'An error occurred while deleting the asset';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.detail || err.toString() || JSON.stringify(err);
      }
      
      console.error('Error deleting asset:', err);
      setError(errorMessage);
      await showAlert({
        title: 'Error',
        message: String(errorMessage)
      });
    }
  };

  const handleCategoryChange = async (id, value) => {
    await handleCellChange(id, 'machineDevice', value);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName || !newCategoryName.trim()) {
      await showAlert({
        title: 'Validation Error',
        message: 'Please enter a category name'
      });
      return;
    }

    const trimmedCategory = newCategoryName.trim();

    // Check if category already exists
    if (categories.includes(trimmedCategory)) {
      await showAlert({
        title: 'Category Exists',
        message: `Category "${trimmedCategory}" already exists`
      });
      return;
    }

    // Add to local categories
    setCategories(prev => {
      if (prev.includes(trimmedCategory)) {
        return prev;
      }
      return [...prev, trimmedCategory].sort();
    });

    // Update the asset with new category if we have a pending asset
    if (pendingAssetId) {
      await handleCellChange(pendingAssetId, 'machineDevice', trimmedCategory);
    }

    // Close modal
    setShowAddCategoryModal(false);
    setNewCategoryName('');
    setPendingAssetId(null);
  };

  const handleDeleteCategory = async (categoryName, e) => {
    e.stopPropagation();
    e.preventDefault();

    // Check if it's a predefined category
    if (PREDEFINED_CATEGORIES.includes(categoryName)) {
      await showAlert({
        title: 'Cannot Delete',
        message: 'Predefined categories cannot be deleted'
      });
      return;
    }

    // Check if category is being used by any assets
    const assetsUsingCategory = assets.filter(a => a.machineDevice === categoryName);
    const count = assetsUsingCategory.length;

    const confirmed = await showConfirm({
      title: 'Delete Category',
      message: count > 0 
        ? `This category is used by ${count} asset(s). All assets using this category will be updated to "${PREDEFINED_CATEGORIES[0] || 'Laptop'}". Do you want to continue?`
        : `Are you sure you want to delete the category "${categoryName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    try {
      const encodedCategoryName = encodeURIComponent(categoryName);
      const url = `${API_PREFIX}/admin/employee-assets/categories/${encodedCategoryName}`;
      console.log('Deleting category, URL:', url);
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      console.log('Delete category response status:', response.status);

      if (!response.ok) {
        let errorMessage = 'Failed to delete category';
        try {
          const errData = await response.json();
          errorMessage = errData.detail || errData.message || errorMessage;
        } catch (parseError) {
          if (response.status === 404) {
            errorMessage = `Category not found: "${categoryName}"`;
          } else {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      // Remove category from local state
      setCategories(prev => prev.filter(cat => cat !== categoryName));

      // Update assets that were using this category
      if (count > 0) {
        const defaultCategory = PREDEFINED_CATEGORIES[0] || 'Laptop';
        // Update assets in database via API
        for (const asset of assetsUsingCategory) {
          await handleCellChange(asset.id, 'machineDevice', defaultCategory);
        }
      }

      await showAlert({
        title: 'Success',
        message: result.message || `Category "${categoryName}" deleted successfully`
      });

      // Refresh assets to get updated data
      await fetchAssets();
    } catch (err) {
      console.error('Error deleting category:', err);
      await showAlert({
        title: 'Error',
        message: err.message || 'Failed to delete category'
      });
    }
  };


  const renderEditableCell = (asset, field, type = 'text') => {
    const isEditing = editingCell?.id === asset.id && editingCell?.field === field;
    const value = asset[field] || '';
    const isRetirementDate = field === 'retirementDate' && type === 'date';

    if (isEditing) {
      if (type === 'date') {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="date"
              value={value || ''}
              onChange={(e) => {
                // Same logic as Expenses Manager: immediately call handleCellChange on change
                const newValue = e.target.value || '';
                // Update local state immediately for better UX
                setAssets(prev => prev.map(a => 
                  a.id === asset.id ? { ...a, [field]: newValue } : a
                ));
                // Call handleCellChange immediately (same as Expenses Manager)
                handleCellChange(asset.id, field, newValue);
              }}
              onFocus={() => setEditingCell({ id: asset.id, field })}
              onBlur={(e) => {
                // Don't blur if clicking the clear button
                if (e.relatedTarget && e.relatedTarget.getAttribute('aria-label') === 'clear-retirement-date') {
                  return;
                }
                setEditingCell(null);
              }}
              className="editable-input"
              style={{ flex: 1 }}
            />
            {isRetirementDate && value && (
              <button
                type="button"
                aria-label="clear-retirement-date"
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const newValue = '';
                  // Update local state
                  setAssets(prev => prev.map(a => 
                    a.id === asset.id ? { ...a, [field]: newValue } : a
                  ));
                  // Call handleCellChange to save
                  handleCellChange(asset.id, field, newValue);
                  // Keep editing mode open
                  setEditingCell({ id: asset.id, field });
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '16px',
                  color: '#666',
                  lineHeight: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Clear retirement date"
              >
                ✖
              </button>
            )}
          </div>
        );
      } else if (type === 'textarea') {
        return (
          <textarea
            value={value}
            onChange={(e) => {
              setAssets(prev => prev.map(a =>
                a.id === asset.id ? { ...a, [field]: e.target.value } : a
              ));
            }}
            onBlur={(e) => {
              const newValue = e.target.value;
              // Always save on blur to ensure data is persisted
              handleCellChange(asset.id, field, newValue);
              setEditingCell(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const newValue = e.target.value;
                handleCellChange(asset.id, field, newValue);
                setEditingCell(null);
              } else if (e.key === 'Escape') {
                // Revert to original value
                setAssets(prev => prev.map(a =>
                  a.id === asset.id ? { ...a, [field]: value } : a
                ));
                setEditingCell(null);
              }
            }}
            autoFocus
            className="editable-input"
            rows={2}
            style={{ resize: 'vertical', minHeight: '40px' }}
          />
        );
      } else {
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setAssets(prev => prev.map(a => 
                a.id === asset.id ? { ...a, [field]: e.target.value } : a
              ));
            }}
            onBlur={(e) => {
              handleCellChange(asset.id, field, e.target.value);
              setEditingCell(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCellChange(asset.id, field, e.target.value);
                setEditingCell(null);
              } else if (e.key === 'Escape') {
                setEditingCell(null);
              }
            }}
            autoFocus
            className="editable-input"
          />
        );
      }
    }

    // For retirement date, show clear button even when not editing
    // Check if value exists and is not empty (handle both string and date formats)
    const hasRetirementDateValue = isRetirementDate && value && (
      (typeof value === 'string' && value.trim() !== '') ||
      (value instanceof Date)
    );
    
    if (hasRetirementDateValue) {
      const displayValue = typeof value === 'string' 
        ? (value.includes('T') ? value.split('T')[0] : value)
        : (value instanceof Date ? value.toISOString().split('T')[0] : '');
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
          <div
            onClick={() => setEditingCell({ id: asset.id, field })}
            style={{ cursor: 'pointer', minHeight: '20px', padding: '4px', flex: 1 }}
            title="Click to edit"
          >
            {displayValue}
          </div>
          <button
            type="button"
            aria-label="clear-retirement-date"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              const currentValue = asset[field] || '';
              console.log('Clear button clicked for asset:', asset.id, 'field:', field, 'current value:', currentValue);
              
              // Set to empty string explicitly
              const newValue = '';
              
              // Update local state immediately for better UX
              setAssets(prev => prev.map(a => 
                a.id === asset.id ? { ...a, [field]: newValue } : a
              ));
              
              // Call handleCellChange to save to backend
              try {
                console.log('Calling handleCellChange with empty string for', field);
                await handleCellChange(asset.id, field, newValue);
                console.log('Retirement date cleared successfully - refreshing assets');
              } catch (err) {
                console.error('Error clearing retirement date:', err);
                // Revert on error
                setAssets(prev => prev.map(a => 
                  a.id === asset.id ? { ...a, [field]: currentValue } : a
                ));
                await showAlert({
                  title: 'Error',
                  message: err.message || 'Failed to clear retirement date. Please try again.'
                });
              }
            }}
            style={{
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid rgba(255, 107, 107, 0.3)',
              borderRadius: '3px',
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: '14px',
              color: '#ff6b6b',
              lineHeight: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              minWidth: '20px',
              height: '20px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.3)';
            }}
            title="Clear retirement date"
          >
            ✖
          </button>
        </div>
      );
    }

    return (
      <div
        onClick={() => setEditingCell({ id: asset.id, field })}
        style={{ cursor: 'pointer', minHeight: '20px', padding: '4px' }}
        title="Click to edit"
      >
        {value || <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>}
      </div>
    );
  };

  if (isLoading) {
    return <div className="loading-state">Loading employee assets...</div>;
  }

  return (
    <div className="employee-assets">
      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {/* Filters - Only visible to Super Admin and Admin */}
      {(userRole === 'Super Admin' || userRole === 'Admin') && (
        <div className="filters-section">
          <div className="filter-group">
            <label>Machine / Device:</label>
            <input
              type="text"
              value={filterMachineDevice}
              onChange={(e) => setFilterMachineDevice(e.target.value)}
              placeholder="Filter by device..."
              className="filter-input"
            />
          </div>
          <div className="filter-group">
            <label>Condition:</label>
            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="filter-input"
            >
              <option value="">All Conditions</option>
              {CONDITION_OPTIONS.map(cond => (
                <option key={cond} value={cond}>{cond}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Employee (Group):</label>
            <select
              value={filterEmployeeDropdown}
              onChange={(e) => setFilterEmployeeDropdown(e.target.value)}
              className="filter-input"
            >
              <option value="">All Employees</option>
              {Array.from(new Set(assets.map(a => a.employeeName).filter(Boolean))).sort().map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="table-wrapper">
        <div className="table-header">
          <h3>Employee Assets</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* CSV Download Button */}
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handleExportToCSV}
              title="Download Employee Assets as CSV"
            >
              Download CSV
            </button>
            {/* Hide + ADD ROW button for Super Admin and Admin (they use the + button next to employee names) */}
            {userRole !== 'Super Admin' && userRole !== 'Admin' && (
              <button className="btn btn-primary btn-sm" onClick={handleAddRow}>
                + Add Assets
              </button>
            )}
          </div>
        </div>
        <div className="table-responsive">
          <table className="expenses-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Machine / Device</th>
                <th>Company / Brand</th>
                <th>Model</th>
                <th>Configuration</th>
                <th>Issue Date</th>
                <th>Retirement Date</th>
                <th>Serial Number</th>
                <th>Condition</th>
                <th>Any Issues</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan="11" className="empty-state">No assets. Click "Add Row" to start.</td>
                </tr>
              ) : (() => {
                // Group assets by employee (same order as they appear)
                const groups = {};
                assets.forEach(asset => {
                  const empName = asset.employeeName || 'Unknown';
                  if (!groups[empName]) {
                    groups[empName] = { employee: empName, items: [] };
                  }
                  groups[empName].items.push(asset);
                });
                
                // Filter by employee dropdown if selected
                const filteredGroups = filterEmployeeDropdown 
                  ? Object.values(groups).filter(g => g.employee === filterEmployeeDropdown)
                  : Object.values(groups);
                
                return filteredGroups.map((group, groupIndex) => {
                  // Default to expanded (true) if not explicitly set to false
                  const isExpanded = expandedEmployees[group.employee] !== false;
                  const groupRowIndex = groupIndex * 2;
                  
                  return (
                    <React.Fragment key={group.employee}>
                      {/* Group header row */}
                      <tr 
                        className={groupRowIndex % 2 === 0 ? 'even-row' : 'odd-row'}
                        style={{ 
                          backgroundColor: 'var(--bg-secondary, #f5f5f5)',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                        onClick={() => setExpandedEmployees(prev => ({
                          ...prev,
                          [group.employee]: !isExpanded
                        }))}
                        aria-expanded={isExpanded}
                      >
                        <td colSpan="11" style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                              display: 'inline-block',
                              transition: 'transform 0.2s',
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                            }}>
                              ▶
                            </span>
                            <span>{group.employee}</span>
                            <span style={{ color: '#666', fontSize: '0.9em', marginLeft: '8px' }}>
                              ({group.items.length} asset{group.items.length !== 1 ? 's' : ''})
                            </span>
                            {/* Add Row button for Super Admin and Admin only */}
                            {(userRole === 'Super Admin' || userRole === 'Admin') && (
                              <button
                                className="btn-add-row-small"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent row collapse/expand
                                  handleAddRow(group.employee);
                                }}
                                title={`Add row for ${group.employee}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Asset rows for this employee */}
                      {isExpanded && group.items.map((asset, itemIndex) => {
                        const absoluteIndex = assets.findIndex(a => a.id === asset.id);
                        return (
                          <tr key={asset.id} className={absoluteIndex % 2 === 0 ? 'even-row' : 'odd-row'}>
                    <td>
                      {(userRole === 'Admin' || userRole === 'Super Admin') 
                        ? renderEditableCell(asset, 'employeeName')
                        : <div style={{ padding: '4px' }}>{asset.employeeName || '—'}</div>
                      }
                    </td>
                    <td>
                      <div 
                        ref={(el) => { dropdownRefs.current[asset.id] = el; }}
                        className="custom-category-dropdown" 
                        style={{ position: 'relative', width: '100%' }}
                      >
                        <div
                          className="category-dropdown-trigger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCategoryDropdownOpen(prev => ({
                              ...prev,
                              [asset.id]: !prev[asset.id]
                            }));
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                          }}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            background: 'var(--bg-primary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            minHeight: '32px',
                            userSelect: 'none'
                          }}
                        >
                          <span>{asset.machineDevice || 'Select...'}</span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{
                              transform: categoryDropdownOpen[asset.id] ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease'
                            }}
                          >
                            <path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
                          </svg>
                        </div>
                        {categoryDropdownOpen[asset.id] && (
                          <DropdownMenu
                            triggerRef={dropdownRefs.current[asset.id]}
                            onClose={() => {
                              setCategoryDropdownOpen(prev => ({
                                ...prev,
                                [asset.id]: false
                              }));
                            }}
                          >
                            {categories.map(cat => {
                              const isCustom = !PREDEFINED_CATEGORIES.includes(cat);
                              return (
                                <div
                                  key={cat}
                                  className="category-dropdown-item"
                                  onClick={(e) => {
                                    if (e.target.closest('.category-delete-btn')) {
                                      return; // Don't select if clicking delete button
                                    }
                                    handleCategoryChange(asset.id, cat);
                                    setCategoryDropdownOpen(prev => ({
                                      ...prev,
                                      [asset.id]: false
                                    }));
                                  }}
                                  style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    borderBottom: '1px solid var(--border-color)',
                                    transition: 'background 0.2s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--bg-secondary)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'var(--bg-primary)';
                                  }}
                                >
                                  <span style={{ flex: 1 }}>{cat}</span>
                                  {isCustom && (
                                    <button
                                      type="button"
                                      className="category-delete-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCategory(cat, e);
                                        setCategoryDropdownOpen(prev => ({
                                          ...prev,
                                          [asset.id]: false
                                        }));
                                      }}
                                      title={`Delete category "${cat}"`}
                                      style={{
                                        background: 'rgba(255, 107, 107, 0.1)',
                                        border: '1px solid rgba(255, 107, 107, 0.3)',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        padding: '2px 6px',
                                        color: '#ff6b6b',
                                        fontSize: '14px',
                                        lineHeight: '1',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginLeft: '8px',
                                        width: '24px',
                                        height: '24px',
                                        flexShrink: 0
                                      }}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            <div
                              className="category-dropdown-item"
                              onClick={() => {
                                setPendingAssetId(asset.id);
                                setNewCategoryName('');
                                setShowAddCategoryModal(true);
                                setCategoryDropdownOpen(prev => ({
                                  ...prev,
                                  [asset.id]: false
                                }));
                              }}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#667eea',
                                fontWeight: '500',
                                borderTop: '1px solid var(--border-color)',
                                transition: 'background 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--bg-secondary)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'var(--bg-primary)';
                              }}
                            >
                              + Add new option
                            </div>
                          </DropdownMenu>
                        )}
                      </div>
                    </td>
                    <td>{renderEditableCell(asset, 'companyBrand')}</td>
                    <td>{renderEditableCell(asset, 'model')}</td>
                    <td>{renderEditableCell(asset, 'configuration', 'textarea')}</td>
                    <td>{renderEditableCell(asset, 'issueDate', 'date')}</td>
                    <td>{renderEditableCell(asset, 'retirementDate', 'date')}</td>
                    <td>{renderEditableCell(asset, 'serialNumber')}</td>
                    <td>
                      <select
                        value={asset.condition}
                        onChange={(e) => handleCellChange(asset.id, 'condition', e.target.value)}
                        className="editable-select"
                        style={{ minWidth: '120px' }}
                      >
                        <option value="">—</option>
                        {CONDITION_OPTIONS.map(cond => (
                          <option key={cond} value={cond}>{cond}</option>
                        ))}
                      </select>
                    </td>
                    <td>{renderEditableCell(asset, 'anyIssues', 'textarea')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {(userRole === 'Super Admin' || userRole === 'Admin') && (
                          <button
                            className="btn-icon reassign"
                            onClick={() => handleReassign(asset)}
                            title="Reassign Asset"
                          >
                            Reassign
                          </button>
                        )}
                        <button
                          className="btn-icon delete"
                          onClick={() => handleDeleteRow(asset.id)}
                          title="Delete"
                        >
                          ⨯
                        </button>
                      </div>
                    </td>
                  </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="modal-overlay" onClick={() => {
          setShowAddCategoryModal(false);
          setNewCategoryName('');
          setPendingAssetId(null);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Category</h2>
              <button 
                className="modal-close" 
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setNewCategoryName('');
                  setPendingAssetId(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Category Name</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCategory();
                    } else if (e.key === 'Escape') {
                      setShowAddCategoryModal(false);
                      setNewCategoryName('');
                      setPendingAssetId(null);
                    }
                  }}
                  placeholder="Enter new category name..."
                  className="form-input"
                  autoFocus
                />
                <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  This category will be added to the Machine / Device dropdown
                </small>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setNewCategoryName('');
                  setPendingAssetId(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddCategory}
                disabled={!newCategoryName || !newCategoryName.trim()}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && reassigningAsset && (
        <div className="modal-overlay" onClick={() => {
          setShowReassignModal(false);
          setReassigningAsset(null);
          setNewEmployeeName('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reassign Asset</h2>
              <button 
                className="modal-close" 
                onClick={() => {
                  setShowReassignModal(false);
                  setReassigningAsset(null);
                  setNewEmployeeName('');
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Current Employee:</label>
                <input
                  type="text"
                  value={reassigningAsset.employeeName || '—'}
                  disabled
                  className="form-input"
                  style={{ background: '#f5f5f5', cursor: 'not-allowed' }}
                />
              </div>
              <div className="form-group">
                <label>New Employee:</label>
                {userRole === 'Super Admin' ? (
                  <select
                    value={newEmployeeName}
                    onChange={(e) => setNewEmployeeName(e.target.value)}
                    className="form-input"
                    style={{ width: '100%' }}
                  >
                    <option value="">Select Employee</option>
                    {users.map(user => (
                      <option key={user.id} value={user.fullName}>
                        {user.fullName} ({user.role})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newEmployeeName}
                    onChange={(e) => setNewEmployeeName(e.target.value)}
                    placeholder="Enter new employee name..."
                    className="form-input"
                    style={{ width: '100%' }}
                  />
                )}
              </div>
              <div className="form-group">
                <label>Asset Details:</label>
                <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', fontSize: '14px' }}>
                  <div style={{ marginBottom: '4px' }}><strong>Device:</strong> {reassigningAsset.machineDevice || '—'}</div>
                  <div><strong>Serial Number:</strong> {reassigningAsset.serialNumber || '—'}</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowReassignModal(false);
                  setReassigningAsset(null);
                  setNewEmployeeName('');
                }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleReassignConfirm}
                disabled={!newEmployeeName.trim() || newEmployeeName.trim() === reassigningAsset.employeeName}
              >
                Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeAssets;

