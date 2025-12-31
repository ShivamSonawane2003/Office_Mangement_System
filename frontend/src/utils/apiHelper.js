/**
 * API Helper Utilities
 * Provides helper functions for API calls and error handling
 */

/**
 * Check if an error response indicates authentication failure
 */
export const isAuthError = (response) => {
  return response && (response.status === 401 || response.status === 403);
};

/**
 * Handle API response with proper error checking
 * Returns { success: boolean, data: any, error: string }
 */
export const handleApiResponse = async (response) => {
  if (!response) {
    return { success: false, error: 'No response from server' };
  }

  // Check for authentication errors
  if (isAuthError(response)) {
    // Only clear session on actual auth errors, not network errors
    const token = localStorage.getItem('token');
    if (token) {
      // Token might be expired, but don't clear immediately
      // Let the App.js handle it on next validation
      return { success: false, error: 'Authentication required', authError: true };
    }
    return { success: false, error: 'Authentication required', authError: true };
  }

  if (response.ok) {
    try {
      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: 'Failed to parse response' };
    }
  }

  try {
    const errorData = await response.json();
    return { success: false, error: errorData.detail || errorData.message || 'Request failed' };
  } catch (err) {
    return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
  }
};

/**
 * Safe fetch wrapper that handles errors gracefully
 */
export const safeFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    return await handleApiResponse(response);
  } catch (err) {
    // Network errors should not cause logout
    console.error('Network error:', err);
    return { success: false, error: err.message || 'Network error', networkError: true };
  }
};

