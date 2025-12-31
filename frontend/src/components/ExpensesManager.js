import React, { useState, useEffect, useCallback } from 'react';
import './ExpensesManager.css';
import { useModal } from '../contexts/ModalContext';
import * as XLSX from 'xlsx';

const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.4:8002';
const API_BASE = RAW_API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

const PREDEFINED_CATEGORIES = [
  "Tea/Coffee",
  "WIFI Recharge",
  "Phone Recharge",
  "Birthday",
  "Grocery",
  "Electronic items"
];

function ExpensesManager() {
  const { showConfirm, showAlert } = useModal();
  const [mainItems, setMainItems] = useState([]);
  const [miscItems, setMiscItems] = useState([]);
  const [categories, setCategories] = useState(PREDEFINED_CATEGORIES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCell, setEditingCell] = useState(null);

  const fetchItems = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const [mainResponse, miscResponse, categoriesResponse] = await Promise.all([
        fetch(`${API_PREFIX}/admin/expenses-manager/items?item_type=main`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_PREFIX}/admin/expenses-manager/items?item_type=miscellaneous`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_PREFIX}/admin/expenses-manager/categories`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!mainResponse.ok || !miscResponse.ok || !categoriesResponse.ok) {
        throw new Error('Failed to load expenses manager data');
      }

      const mainData = await mainResponse.json();
      const miscData = await miscResponse.json();
      const categoriesData = await categoriesResponse.json();

      const formattedMainItems = mainData.map(item => ({
        id: item.id,
        date: item.date ? item.date.split('T')[0] : new Date().toISOString().split('T')[0],
        itemName: item.item_name || '',
        amount: item.amount || 0,
        category: item.category || PREDEFINED_CATEGORIES[0]
      }));

      const formattedMiscItems = miscData.map(item => ({
        id: item.id,
        date: item.date ? item.date.split('T')[0] : new Date().toISOString().split('T')[0],
        itemName: item.item_name || '',
        amount: item.amount || 0,
        category: item.category || PREDEFINED_CATEGORIES[0]
      }));

      // Sort items by date in ascending order
      setMainItems(sortItemsByDate(formattedMainItems));
      setMiscItems(sortItemsByDate(formattedMiscItems));

      if (categoriesData.categories) {
        setCategories(categoriesData.categories);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const calculateTotal = (items) => {
    return items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  // Sort items by date in ascending order (oldest first), then by id for consistent ordering
  const sortItemsByDate = (items) => {
    return [...items].sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      // If dates are equal, sort by id (ascending)
      return (a.id || 0) - (b.id || 0);
    });
  };

  const handleAddRow = async (type) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    const newItem = {
      item_type: type,
      date: new Date().toISOString(),
      item_name: '',
      amount: 0,
      category: categories[0] || 'Tea/Coffee'
    };

    try {
      const response = await fetch(`${API_PREFIX}/admin/expenses-manager/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newItem)
      });

      if (!response.ok) {
        throw new Error('Failed to create item');
      }

      const createdItem = await response.json();
      const formattedItem = {
        id: createdItem.id,
        date: createdItem.date ? createdItem.date.split('T')[0] : new Date().toISOString().split('T')[0],
        itemName: createdItem.item_name || '',
        amount: createdItem.amount || 0,
        category: createdItem.category || categories[0]
      };

      if (type === 'main') {
        setMainItems(prevItems => sortItemsByDate([...prevItems, formattedItem]));
      } else {
        setMiscItems(prevItems => sortItemsByDate([...prevItems, formattedItem]));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteRow = async (id, type) => {
    const confirmed = await showConfirm({
      title: 'Delete Item',
      message: 'Are you sure you want to delete this item?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmButtonClass: 'btn-danger'
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
      const response = await fetch(`${API_PREFIX}/admin/expenses-manager/items/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to delete item');
      }

      if (type === 'main') {
        setMainItems(mainItems.filter(item => item.id !== id));
      } else {
        setMiscItems(miscItems.filter(item => item.id !== id));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCellChange = async (id, field, value, type) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    const updateData = {};
    if (field === 'date') {
      updateData.date = new Date(value).toISOString();
    } else if (field === 'itemName') {
      updateData.item_name = value;
    } else if (field === 'amount') {
      updateData.amount = parseFloat(value) || 0;
    } else if (field === 'category') {
      updateData.category = value;
    }

    try {
      const response = await fetch(`${API_PREFIX}/admin/expenses-manager/items/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update item');
      }

      // Update local state using functional updates to ensure we have the latest state
      if (type === 'main') {
        setMainItems(prevItems => {
          const updatedItems = prevItems.map(item => {
            if (item.id === id) {
              if (field === 'date') {
                return { ...item, date: value };
              } else if (field === 'itemName') {
                return { ...item, itemName: value };
              } else if (field === 'amount') {
                return { ...item, amount: parseFloat(value) || 0 };
              } else if (field === 'category') {
                return { ...item, category: value };
              }
            }
            return item;
          });
          return sortItemsByDate(updatedItems);
        });
      } else {
        setMiscItems(prevItems => {
          const updatedItems = prevItems.map(item => {
            if (item.id === id) {
              if (field === 'date') {
                return { ...item, date: value };
              } else if (field === 'itemName') {
                return { ...item, itemName: value };
              } else if (field === 'amount') {
                return { ...item, amount: parseFloat(value) || 0 };
              } else if (field === 'category') {
                return { ...item, category: value };
              }
            }
            return item;
          });
          return sortItemsByDate(updatedItems);
        });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      await showAlert({
        title: 'Validation Error',
        message: 'Please enter a category name'
      });
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please login again.');
      return;
    }

    try {
      const response = await fetch(`${API_PREFIX}/admin/expenses-manager/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ category: newCategoryName.trim() })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to add category');
      }

      const responseData = await response.json().catch(() => ({}));
      const newCategory = newCategoryName.trim();

      // Immediately add the category to local state so it appears in dropdown
      // The server won't return it until an item is created with this category,
      // so we add it locally to make it available immediately
      setCategories(prevCategories => {
        // Check if category already exists
        if (prevCategories.includes(newCategory)) {
          return prevCategories;
        }
        // Ensure all predefined categories are included
        const allPredefined = [...PREDEFINED_CATEGORIES];
        // Get custom categories (those not in predefined list)
        const custom = prevCategories.filter(cat => !PREDEFINED_CATEGORIES.includes(cat));
        // Add new category if not already in custom list
        if (!custom.includes(newCategory)) {
          custom.push(newCategory);
        }
        // Sort custom categories alphabetically
        custom.sort();
        // Return: all predefined (in order) + sorted custom categories
        return [...allPredefined, ...custom];
      });

      setShowAddCategoryModal(false);
      setNewCategoryName('');
      
      await showAlert({
        title: 'Success',
        message: `Category "${newCategory}" added successfully`
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteCategory = async (categoryToDelete) => {
    // Cannot delete predefined categories
    if (PREDEFINED_CATEGORIES.includes(categoryToDelete)) {
      await showAlert({
        title: 'Cannot Delete',
        message: 'Predefined categories cannot be deleted'
      });
      return;
    }

    // Check if category is being used
    const itemsUsingCategory = [...mainItems, ...miscItems].filter(item => item.category === categoryToDelete);
    const isUsed = itemsUsingCategory.length > 0;
    const defaultCategory = PREDEFINED_CATEGORIES[0] || 'Tea/Coffee';

    let confirmMessage = `Are you sure you want to delete the category "${categoryToDelete}"?`;
    if (isUsed) {
      confirmMessage += `\n\nThis category is currently used by ${itemsUsingCategory.length} item(s). All items using this category will be changed to "${defaultCategory}".`;
    }

    const confirmed = await showConfirm({
      title: 'Delete Category',
      message: confirmMessage,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmButtonClass: 'btn-danger'
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
      // URL encode the category name in case it has special characters
      const encodedCategory = encodeURIComponent(categoryToDelete);
      const response = await fetch(`${API_PREFIX}/admin/expenses-manager/categories/${encodedCategory}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responseData.detail || 'Failed to delete category');
      }

      // Backend has already updated items if category was in use
      // Refresh items to show updated categories
      await fetchItems();

      // Remove category from local state
      setCategories(prevCategories => prevCategories.filter(cat => cat !== categoryToDelete));

      const itemsUpdated = responseData.items_updated || 0;
      const defaultCategory = PREDEFINED_CATEGORIES[0] || 'Tea/Coffee';
      const successMessage = itemsUpdated > 0
        ? `Category "${categoryToDelete}" deleted successfully. ${itemsUpdated} item(s) were updated to use "${defaultCategory}".`
        : `Category "${categoryToDelete}" deleted successfully`;

      await showAlert({
        title: 'Success',
        message: successMessage
      });
    } catch (err) {
      setError(err.message);
      await showAlert({
        title: 'Error',
        message: err.message
      });
    }
  };

  // Helper function to format date for CSV (DD-MM-YYYY format for Excel compatibility)
  const formatDateForCSV = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString; // Return original if invalid
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      // Use DD/MM/YYYY format which Excel recognizes better
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString; // Return original if parsing fails
    }
  };

  // Helper function to escape CSV cell content
  const escapeCSVCell = (cell) => {
    if (cell === null || cell === undefined) return '';
    const cellStr = String(cell);
    // If cell contains comma, quote, or newline, wrap in quotes and escape quotes
    if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
      return `"${cellStr.replace(/"/g, '""')}"`;
    }
    return cellStr;
  };

  const exportToCSV = async (items, tableName) => {
    if (items.length === 0) {
      await showAlert({
        title: 'Export Error',
        message: 'No data to export'
      });
      return;
    }

    const headers = ['Date', 'Item Name', 'Amount', 'Category'];
    const rows = items.map(item => [
      formatDateForCSV(item.date),
      item.itemName || '',
      item.amount || 0,
      item.category || ''
    ]);

    // Add total row
    const total = calculateTotal(items);
    rows.push(['', 'TOTAL', total.toFixed(2), '']);

    const csvContent = [
      headers.map(h => escapeCSVCell(h)).join(','),
      ...rows.map(row => row.map(cell => escapeCSVCell(cell)).join(','))
    ].join('\n');

    // Add BOM (Byte Order Mark) for UTF-8 to ensure Excel opens it correctly
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${tableName}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke URL after a short delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const exportBothToCSV = async () => {
    if (mainItems.length === 0 && miscItems.length === 0) {
      await showAlert({
        title: 'Export Error',
        message: 'No data to export'
      });
      return;
    }

    // Prepare Main Items data with formatted dates
    const mainHeaders = ['Date', 'Item Name', 'Amount', 'Category'];
    const mainRows = mainItems.map(item => [
      formatDateForCSV(item.date),
      item.itemName || '',
      item.amount || 0,
      item.category || ''
    ]);
    if (mainItems.length > 0) {
      const mainTotal = calculateTotal(mainItems);
      mainRows.push(['', 'TOTAL', mainTotal.toFixed(2), '']);
    }

    // Prepare Miscellaneous Items data with formatted dates
    const miscHeaders = ['Date', 'Item Name', 'Amount', 'Category'];
    const miscRows = miscItems.map(item => [
      formatDateForCSV(item.date),
      item.itemName || '',
      item.amount || 0,
      item.category || ''
    ]);
    if (miscItems.length > 0) {
      const miscTotal = calculateTotal(miscItems);
      miscRows.push(['', 'TOTAL', miscTotal.toFixed(2), '']);
    }

    // Find the maximum number of rows to align both tables
    const maxRows = Math.max(mainRows.length, miscRows.length);

    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare data for Excel with side-by-side layout
    const excelData = [];
    
    // Title row
    const titleRow = ['MAIN ITEMS', '', '', '', '', '', '', 'MISCELLANEOUS ITEMS', '', '', ''];
    excelData.push(titleRow);
    
    // Header row: Main table headers, spacing columns, Miscellaneous table headers
    const headerRow = [
      ...mainHeaders,
      '', '', '', // Spacing columns between tables
      ...miscHeaders
    ];
    excelData.push(headerRow);
    
    // Data rows: align both tables side by side
    for (let i = 0; i < maxRows; i++) {
      const mainRow = i < mainRows.length ? mainRows[i] : ['', '', '', ''];
      const miscRow = i < miscRows.length ? miscRows[i] : ['', '', '', ''];
      
      const row = [
        ...mainRow,
        '', '', '', // Spacing columns between tables
        ...miscRow
      ];
      excelData.push(row);
    }
    
    // Create worksheet from data
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    
    // Set column widths (82px ≈ 10.25 Excel units, 1 Excel unit ≈ 8px)
    // Date columns are at index 0 and 8 (after 4 main columns + 3 spacing)
    const colWidths = [
      { wch: 10.25 }, // Date column (82px) - Main table
      { wch: 15 },    // Item Name - Main table
      { wch: 12 },    // Amount - Main table
      { wch: 15 },    // Category - Main table
      { wch: 2 },     // Spacing
      { wch: 2 },     // Spacing
      { wch: 2 },     // Spacing
      { wch: 10.25 }, // Date column (82px) - Miscellaneous table
      { wch: 15 },    // Item Name - Miscellaneous table
      { wch: 12 },    // Amount - Miscellaneous table
      { wch: 15 }     // Category - Miscellaneous table
    ];
    ws['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    
    // Generate Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Expenses_Manager_${new Date().toISOString().split('T')[0]}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke URL after a short delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const renderEditableCell = (item, field, type) => {
    const isEditing = editingCell?.id === item.id && editingCell?.field === field;

    if (field === 'date') {
      return (
        <input
          type="date"
          value={item.date}
          onChange={(e) => handleCellChange(item.id, field, e.target.value, type)}
          className="editable-input"
          onFocus={() => setEditingCell({ id: item.id, field })}
          onBlur={() => setEditingCell(null)}
        />
      );
    } else if (field === 'category') {
      return (
        <select
          value={item.category}
          onChange={(e) => handleCellChange(item.id, field, e.target.value, type)}
          className="editable-select"
          onFocus={() => setEditingCell({ id: item.id, field })}
          onBlur={() => setEditingCell(null)}
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
          <option value="__add_category__">+ Add Category</option>
        </select>
      );
    } else if (field === 'amount') {
      return (
        <input
          type="number"
          step="0.01"
          value={item.amount}
          onChange={(e) => handleCellChange(item.id, field, e.target.value, type)}
          className="editable-input"
          onFocus={() => setEditingCell({ id: item.id, field })}
          onBlur={() => setEditingCell(null)}
        />
      );
    } else {
      return (
        <input
          type="text"
          value={item.itemName}
          onChange={(e) => handleCellChange(item.id, field, e.target.value, type)}
          className="editable-input"
          onFocus={() => setEditingCell({ id: item.id, field })}
          onBlur={() => setEditingCell(null)}
        />
      );
    }
  };

  // Handle category dropdown change
  const handleCategoryChange = (itemId, value, type, currentCategory) => {
    if (value === '__add_category__') {
      setShowAddCategoryModal(true);
      // Reset select to current category
      setTimeout(() => {
        const select = document.querySelector(`select[data-item-id="${itemId}"]`);
        if (select) select.value = currentCategory;
      }, 0);
      return;
    }
    handleCellChange(itemId, 'category', value, type);
  };

  if (isLoading) {
    return <div className="loading-state">Loading expenses excel table...</div>;
  }

  return (
    <div className="expenses-manager">
      <div className="section-header">
        <h2>Expenses Excel Table</h2>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div className="tables-container">
        <div className="table-wrapper">
          <div className="table-header">
            <h3>Main Items</h3>
            <button className="btn btn-primary btn-sm" onClick={() => handleAddRow('main')}>
              + Add Row
            </button>
          </div>
          <div className="table-responsive">
            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item Name</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mainItems.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-state">No items. Click "Add Row" to start.</td>
                  </tr>
                ) : (
                  mainItems.map(item => (
                    <tr key={item.id}>
                      <td>{renderEditableCell(item, 'date', 'main')}</td>
                      <td>{renderEditableCell(item, 'itemName', 'main')}</td>
                      <td>{renderEditableCell(item, 'amount', 'main')}</td>
                      <td>
                        <select
                          data-item-id={item.id}
                          value={item.category}
                          onChange={(e) => handleCategoryChange(item.id, e.target.value, 'main', item.category)}
                          className="editable-select"
                        >
                          {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="__add_category__">+ Add Category</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn-icon delete"
                          onClick={() => handleDeleteRow(item.id, 'main')}
                          title="Delete"
                        >
                          ⨯
                        </button>
                      </td>
                    </tr>
                  ))
                )}
                <tr className="total-row">
                  <td colSpan="2"><strong>Total</strong></td>
                  <td><strong>{calculateTotal(mainItems).toFixed(2)}</strong></td>
                  <td colSpan="2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="table-wrapper">
          <div className="table-header">
            <h3>Miscellaneous Items</h3>
            <button className="btn btn-primary btn-sm" onClick={() => handleAddRow('miscellaneous')}>
              + Add Row
            </button>
          </div>
          <div className="table-responsive">
            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item Name</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {miscItems.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-state">No items. Click "Add Row" to start.</td>
                  </tr>
                ) : (
                  miscItems.map(item => (
                    <tr key={item.id}>
                      <td>{renderEditableCell(item, 'date', 'miscellaneous')}</td>
                      <td>{renderEditableCell(item, 'itemName', 'miscellaneous')}</td>
                      <td>{renderEditableCell(item, 'amount', 'miscellaneous')}</td>
                      <td>
                        <select
                          data-item-id={item.id}
                          value={item.category}
                          onChange={(e) => handleCategoryChange(item.id, e.target.value, 'miscellaneous', item.category)}
                          className="editable-select"
                        >
                          {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="__add_category__">+ Add Category</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn-icon delete"
                          onClick={() => handleDeleteRow(item.id, 'miscellaneous')}
                          title="Delete"
                        >
                          ⨯
                        </button>
                      </td>
                    </tr>
                  ))
                )}
                <tr className="total-row">
                  <td colSpan="2"><strong>Total</strong></td>
                  <td><strong>{calculateTotal(miscItems).toFixed(2)}</strong></td>
                  <td colSpan="2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="export-all-section">
        <button className="btn btn-primary" onClick={exportBothToCSV}>
          Download Both Tables as CSV
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={() => setShowManageCategoriesModal(true)}
          style={{ marginLeft: '10px' }}
        >
          Manage Categories
        </button>
      </div>

      {showAddCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowAddCategoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Category</h2>
              <button className="modal-close" onClick={() => setShowAddCategoryModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="categoryName">Category Name</label>
                <input
                  type="text"
                  id="categoryName"
                  placeholder="Enter category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="form-input"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCategory();
                    }
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddCategoryModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddCategory}>
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {showManageCategoriesModal && (
        <div className="modal-overlay" onClick={() => setShowManageCategoriesModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Manage Categories</h2>
              <button className="modal-close" onClick={() => setShowManageCategoriesModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '20px' }}>
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={() => {
                    setShowManageCategoriesModal(false);
                    setShowAddCategoryModal(true);
                  }}
                >
                  + Add New Category
                </button>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Category Name</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Type</th>
                      <th style={{ padding: '10px', textAlign: 'center', width: '100px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(category => {
                      const isPredefined = PREDEFINED_CATEGORIES.includes(category);
                      const isUsed = [...mainItems, ...miscItems].some(item => item.category === category);
                      return (
                        <tr key={category} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '10px' }}>{category}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ 
                              padding: '4px 8px', 
                              borderRadius: '4px',
                              fontSize: '12px',
                              backgroundColor: isPredefined ? '#e3f2fd' : '#f3e5f5',
                              color: isPredefined ? '#1976d2' : '#7b1fa2'
                            }}>
                              {isPredefined ? 'Predefined' : 'Custom'}
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            {!isPredefined && (
                              <button
                                className="btn-icon delete"
                                onClick={() => handleDeleteCategory(category)}
                                title={isUsed ? `Delete category (${[...mainItems, ...miscItems].filter(item => item.category === category).length} item(s) will be updated)` : 'Delete category'}
                                style={{ 
                                  minWidth: '32px',
                                  minHeight: '32px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '18px',
                                  fontWeight: 'bold',
                                  cursor: 'pointer'
                                }}
                              >
                                ⨯
                              </button>
                            )}
                            {isPredefined && (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Protected</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowManageCategoriesModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpensesManager;

