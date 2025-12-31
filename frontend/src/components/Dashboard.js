import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Pie, Doughnut, Bar, Line } from 'react-chartjs-2';
import Chart from 'chart.js/auto';
import './Dashboard.css';
import websocketService from '../services/websocketService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';
const API_BASE = API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;
const STORAGE_KEY = 'dashboard-selected-period';

const getStoredPeriod = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (
      parsed &&
      Number.isInteger(parsed.month) &&
      parsed.month >= 1 &&
      parsed.month <= 12 &&
      Number.isInteger(parsed.year)
    ) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to parse stored dashboard period', err);
  }
  return null;
};

function Dashboard() {
  const currentDate = new Date();
  const storedPeriod = getStoredPeriod();
  const [selectedMonth, setSelectedMonth] = useState(storedPeriod?.month || currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(storedPeriod?.year || currentDate.getFullYear());
  const [chartsLoading, setChartsLoading] = useState(true);
  const [stats, setStats] = useState({
    total_expenses: 0,
    pending_expenses: 0,
    approved_expenses: 0,
    pending_payments: 0,
    total_gst_due: 0
  });

  const [expenses, setExpenses] = useState([]);
  const [gstBills, setGstBills] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Monitor dark mode changes
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.getAttribute('data-theme') === 'dark');
    };
    
    checkDarkMode();
    
    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    
    return () => observer.disconnect();
  }, []);

  const selectedPeriodKey = useMemo(() => {
    return `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  }, [selectedMonth, selectedYear]);

  const activePeriodRef = useRef(selectedPeriodKey);

  useEffect(() => {
    activePeriodRef.current = selectedPeriodKey;
  }, [selectedPeriodKey]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        month: selectedMonth,
        year: selectedYear
      }));
    }
  }, [selectedMonth, selectedYear]);

  const fetchDashboardData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const requestKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const isActiveRequest = requestKey === activePeriodRef.current;
    if (isActiveRequest) {
      setChartsLoading(true);
    }
    try {
      const [statsResponse, expensesResponse, gstResponse] = await Promise.all([
        fetch(`${API_PREFIX}/dashboard/?month=${selectedMonth}&year=${selectedYear}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_PREFIX}/expenses/?month=${selectedMonth}&year=${selectedYear}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_PREFIX}/gst/claims`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (activePeriodRef.current !== requestKey) {
        return;
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats({
          total_expenses: statsData.total_expenses || 0,
          pending_expenses: statsData.pending_expenses || 0,
          approved_expenses: statsData.approved_expenses || 0,
          pending_payments: statsData.pending_payments || 0,
          total_gst_due: statsData.total_gst_due || 0
        });
      } else {
        const errorData = await statsResponse.json().catch(() => ({}));
        console.error('Dashboard stats error:', statsResponse.status, errorData);
      }

      if (expensesResponse.ok) {
        const expensesData = await expensesResponse.json();
        // Debug: Log first expense to see user data
        if (expensesData.length > 0) {
          console.log('Sample expense data:', expensesData[0]);
          console.log('User fields:', { username: expensesData[0].username, full_name: expensesData[0].full_name });
        }
        const formatted = expensesData.map(e => ({
          id: e.id,
          date: e.date ? e.date.split('T')[0] : '',
          label: e.label || '',
          amount: e.amount || 0,
          status: e.status || 'pending',
          category: e.category || 'Other',
          gst_eligible: e.gst_eligible || false,
          username: e.username || '',
          full_name: e.full_name || ''
        }));
        setExpenses(formatted);
      } else {
        const errorData = await expensesResponse.json().catch(() => ({}));
        console.error('Dashboard expenses error:', expensesResponse.status, errorData);
      }

      if (gstResponse.ok) {
        const gstData = await gstResponse.json();
        const formatted = gstData.map(c => ({
          id: c.id,
          date: c.created_at ? c.created_at.split('T')[0] : '',
          vendor: c.vendor || '',
          amount: c.amount || 0,
          status: c.status || 'pending',
          payment: c.payment_status === 'paid' ? 'Paid' : 'Unpaid',
          gst_amount: c.gst_amount || 0,
          username: c.username || '',
          full_name: c.full_name || ''
        }));
        setGstBills(formatted);
      } else {
        const errorData = await gstResponse.json().catch(() => ({}));
        console.error('Dashboard GST error:', gstResponse.status, errorData);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      // Don't clear data on error - keep showing existing data
      // This prevents blank screens on temporary network issues
    } finally {
      if (isActiveRequest && activePeriodRef.current === requestKey) {
        setChartsLoading(false);
      }
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchDashboardData();
    
    // Subscribe to global WebSocket service for dashboard updates
    const unsubscribeExpense = websocketService.on('expense_updated', (data) => {
          fetchDashboardData();
    });
    
    const unsubscribeGST = websocketService.on('gst_updated', (data) => {
          fetchDashboardData();
    });
    
    return () => {
      unsubscribeExpense();
      unsubscribeGST();
    };
  }, [fetchDashboardData]);

  // Category distribution for Pie chart
  const filteredExpenses = useMemo(() => (
    expenses.filter(exp => exp.date && exp.date.startsWith(selectedPeriodKey))
  ), [expenses, selectedPeriodKey]);

  const categoryDistribution = filteredExpenses.reduce((acc, exp) => {
    const existing = acc.find(item => item.category === exp.category);
    if (existing) {
      existing.amount += exp.amount;
    } else {
      acc.push({ category: exp.category, amount: exp.amount });
    }
    return acc;
  }, []);

  const pieChartData = {
    labels: categoryDistribution.map(item => item.category),
    datasets: [{
      data: categoryDistribution.map(item => item.amount),
      backgroundColor: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b'],
      borderColor: 'white',
      borderWidth: 2
    }]
  };

  // Status distribution for Doughnut chart
  const statusExpenses = filteredExpenses.reduce((acc, exp) => {
    if (exp.status === 'approved') {
      acc.approved += exp.amount;
    } else if (exp.status === 'pending') {
      acc.pending += exp.amount;
    }
    return acc;
  }, { approved: 0, pending: 0 });

  const doughnutChartData = {
    labels: ['Approved', 'Pending'],
    datasets: [{
      data: [statusExpenses.approved, statusExpenses.pending],
      backgroundColor: ['#4caf50', '#ff9800'],
      borderColor: 'white',
      borderWidth: 2
    }]
  };

  // Daily trends for Line chart
  const dailyTrends = filteredExpenses.reduce((acc, exp) => {
    const [, , dayPart] = exp.date.split('-');
    const day = parseInt(dayPart, 10);
    if (!Number.isNaN(day)) {
      acc[day] = (acc[day] || 0) + exp.amount;
    }
    return acc;
  }, {});

  const trendDays = Object.keys(dailyTrends).map(Number).sort((a, b) => a - b);

  const lineChartData = {
    labels: trendDays,
    datasets: [{
      label: 'Daily Expenses (₹)',
      data: trendDays.map(day => dailyTrends[day]),
      borderColor: '#667eea',
      backgroundColor: 'rgba(102, 126, 234, 0.1)',
      fill: true,
      tension: 0.4,
      borderWidth: 2
    }]
  };

  // Category bar chart
  const barChartData = {
    labels: categoryDistribution.map(item => item.category),
    datasets: [{
      label: 'Amount by Category (₹)',
      data: categoryDistribution.map(item => item.amount),
      backgroundColor: '#667eea',
      borderColor: '#764ba2',
      borderWidth: 1,
      borderRadius: 8
    }]
  };

  // Chart options with dark mode support (recalculates when isDarkMode changes)
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: isDarkMode ? '#ffffff' : '#333',
          font: { size: 12 },
          padding: 12,
          usePointStyle: true
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: isDarkMode ? '#666' : '#333',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: {
          display: false
        },
        grid: {
          display: false
        },
        border: {
          display: false
        },
        title: {
          display: false
        }
      },
      y: {
        ticks: {
          display: false
        },
        grid: {
          display: false
        },
        border: {
          display: false
        },
        title: {
          display: false
        }
      }
    }
  }), [isDarkMode]);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const years = Array.from({ length: 13 }, (_, i) => 2023 + i);

  // Get pending GST bills (all unpaid bills, not just approved)
  // Filter by selected month/year to match the dashboard period
  const pendingGstBills = gstBills.filter(bill => {
    if (bill.payment !== 'Unpaid') return false;
    // Filter by selected month/year
    if (bill.date && bill.date.startsWith(selectedPeriodKey)) {
      return true;
    }
    return false;
  });

  // Get pending expense payments (pending expenses)
  const pendingExpensePayments = filteredExpenses.filter(exp => 
    exp.status === 'pending'
  );

  const StatCard = ({ color, title, value, label }) => (
    <div className={`stat-card ${color}`}>
      <div className="stat-card-content">
        <div className="stat-text">
          <h3>{title}</h3>
          <p className="stat-value">₹{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          <span className="stat-label">{label}</span>
        </div>
      </div>
      <div className="stat-trend"></div>
    </div>
  );

  return (
    <div className="dashboard">
      {/* Month/Year Selector */}
      <div className="date-selector">
        <span className="selected-period">{months[selectedMonth - 1]} {selectedYear}</span>
        <div className="selector-inputs-group">
          <div className="selector-group">
            <label>Month:</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="selector-input">
              {months.map((month, index) => (
                <option key={index} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>
          <div className="selector-group">
            <label>Year:</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="selector-input">
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <StatCard 
          color="blue" 
          title="Total Expenses" 
          value={stats.total_expenses}
          label="This Month"
        />
        <StatCard 
          color="orange" 
          title="Pending" 
          value={stats.pending_expenses}
          label="Awaiting Approval"
        />
        <StatCard 
          color="green" 
          title="Approved" 
          value={stats.approved_expenses}
          label="This Month"
        />
        <StatCard 
          color="cyan" 
          title="Total GST Pending Payments" 
          value={stats.pending_payments}
          label={`Unpaid - ${months[selectedMonth - 1]} ${selectedYear}`}
        />
      </div>

      {/* Pending Payments Section */}
      {/* Expenses Pending Payments - Commented out */}
      {/* {(pendingExpensePayments.length > 0 || pendingGstBills.length > 0) && (
        <div className="pending-payments-section">
          <h3>Pending Payments</h3>
          <div className="pending-payments-container">
            <div className="pending-payments-column">
              <h4>Expenses Pending Payments</h4>
              {pendingExpensePayments.length > 0 ? (
                <div className="payments-list">
                  {pendingExpensePayments.map((expense) => (
                    <div key={expense.id} className="payment-card-medium">
                      <div className="payment-header">
                        <span className="payment-title">{expense.label || 'Expense'}</span>
                        <span className="payment-status">Pending</span>
                      </div>
                      <div className="payment-details">
                        <div className="detail-row">
                          <span className="label">User:</span>
                          <span className="value">{expense.full_name || expense.username || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Date:</span>
                          <span className="value">{expense.date}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Category:</span>
                          <span className="value">{expense.category}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Amount:</span>
                          <span className="value highlight">₹{expense.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-pending">No pending expense payments</p>
              )}
            </div>
          </div>
        </div>
      )} */}

      {/* GST Pending Payments */}
      {pendingGstBills.length > 0 && (
        <div className="pending-payments-section">
          <h3>Pending Payments</h3>
          <div className="pending-payments-container">
            {/* GST Pending Payments */}
            <div className="pending-payments-column">
              <h4>GST Pending Payments</h4>
              {pendingGstBills.length > 0 ? (
                <div className="payments-list">
                  {pendingGstBills.map((bill) => (
                    <div key={bill.id} className="payment-card-medium">
                      <div className="payment-header">
                        <span className="payment-title">{bill.vendor}</span>
                        <span className="payment-status">Unpaid</span>
                      </div>
                      <div className="payment-details">
                        <div className="detail-row">
                          <span className="label">User:</span>
                          <span className="value">{bill.full_name || bill.username || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Date:</span>
                          <span className="value">{bill.date}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">GST Due:</span>
                          <span className="value highlight">₹{bill.gst_amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-pending">No pending GST payments</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="charts-section">
        <div className="chart-card">
          <h3>Category Distribution (Pie)</h3>
          <div className="chart-container">
            {chartsLoading ? (
              <div className="chart-loading">
                <div className="chart-spinner"></div>
              </div>
            ) : categoryDistribution.length > 0 ? (
              <Pie data={pieChartData} options={chartOptions} />
            ) : (
              <p className="no-data">No data available for selected period</p>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3>Status Overview (Doughnut)</h3>
          <div className="chart-container">
            {chartsLoading ? (
              <div className="chart-loading">
                <div className="chart-spinner"></div>
              </div>
            ) : Object.values(statusExpenses).some(val => val > 0) ? (
              <Doughnut data={doughnutChartData} options={chartOptions} />
            ) : (
              <p className="no-data">No data available for selected period</p>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3>Daily Expense Trends (Line)</h3>
          <div className="chart-container-large">
            {chartsLoading ? (
              <div className="chart-loading">
                <div className="chart-spinner"></div>
              </div>
            ) : trendDays.length > 0 ? (
              <Line 
                data={lineChartData}
                options={chartOptions} 
              />
            ) : (
              <p className="no-data">No data available for selected period</p>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3>Expenses by Category (Bar)</h3>
          <div className="chart-container-large">
            {chartsLoading ? (
              <div className="chart-loading">
                <div className="chart-spinner"></div>
              </div>
            ) : categoryDistribution.length > 0 ? (
              <Bar data={barChartData} options={chartOptions} />
            ) : (
              <p className="no-data">No data available for selected period</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
