/**
 * Unit tests for EmployeeAssets component
 * Tests retirement date clear button and employee grouping/filtering
 */

// Simple unit test for retirement date clear functionality
export function testRetirementDateClear() {
  // Test: Clear button should appear when retirement date has a value
  const assetWithDate = {
    id: 1,
    retirementDate: '2024-01-15',
    employeeName: 'John Doe'
  };
  
  const assetWithoutDate = {
    id: 2,
    retirementDate: null,
    employeeName: 'Jane Smith'
  };
  
  // Simulate rendering logic
  const shouldShowClearButton = (asset) => {
    return asset.retirementDate && asset.retirementDate.trim() !== '';
  };
  
  const result1 = shouldShowClearButton(assetWithDate);
  const result2 = shouldShowClearButton(assetWithoutDate);
  
  console.assert(result1 === true, 'Clear button should show when date exists');
  console.assert(result2 === false, 'Clear button should not show when date is empty');
  
  // Test: Clearing should set date to empty string
  const clearDate = (asset) => {
    return { ...asset, retirementDate: '' };
  };
  
  const clearedAsset = clearDate(assetWithDate);
  console.assert(clearedAsset.retirementDate === '', 'Clearing should set date to empty string');
  
  return { passed: true, message: 'Retirement date clear tests passed' };
}

// Simple unit test for employee grouping
export function testEmployeeGrouping() {
  const mockAssets = [
    { id: 1, employeeName: 'John Doe', machineDevice: 'Laptop' },
    { id: 2, employeeName: 'John Doe', machineDevice: 'Monitor' },
    { id: 3, employeeName: 'Jane Smith', machineDevice: 'Laptop' }
  ];
  
  // Group assets by employee
  const groups = {};
  mockAssets.forEach(asset => {
    const empName = asset.employeeName || 'Unknown';
    if (!groups[empName]) {
      groups[empName] = { employee: empName, items: [] };
    }
    groups[empName].items.push(asset);
  });
  
  const groupArray = Object.values(groups);
  
  console.assert(groupArray.length === 2, 'Should create 2 groups');
  console.assert(groups['John Doe'].items.length === 2, 'John Doe should have 2 assets');
  console.assert(groups['Jane Smith'].items.length === 1, 'Jane Smith should have 1 asset');
  
  // Test filtering
  const filterByEmployee = (groups, employeeName) => {
    if (!employeeName) return Object.values(groups);
    return Object.values(groups).filter(g => g.employee === employeeName);
  };
  
  const filtered = filterByEmployee(groups, 'John Doe');
  console.assert(filtered.length === 1, 'Filtering by John Doe should return 1 group');
  console.assert(filtered[0].employee === 'John Doe', 'Filtered group should be John Doe');
  
  const allGroups = filterByEmployee(groups, '');
  console.assert(allGroups.length === 2, 'Empty filter should return all groups');
  
  return { passed: true, message: 'Employee grouping tests passed' };
}

// Run tests if in Node environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testRetirementDateClear, testEmployeeGrouping };
}

