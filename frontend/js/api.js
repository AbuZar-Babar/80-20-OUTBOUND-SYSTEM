/**
 * Frontend API helper module for Caller App
 * Communicates exclusively with the Express backend API endpoints.
 */

const API_BASE_URL = '/api';

/**
 * Toast Notification Helper
 */
const showToast = (message, type = 'info') => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span style="font-weight:bold;">${icon}</span> <span>${message}</span>`;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

/**
 * Fetch wrapper handling headers, session token, and error responses.
 */
const apiRequest = async (endpoint, method = 'GET', data = null) => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const result = await response.json();

    if (!response.ok || !result.success) {
      const errorMessage = result.message || 'An error occurred during request.';
      
      // If unauthorized, redirect to login
      if (response.status === 401 && !window.location.pathname.endsWith('login.html')) {
        sessionStorage.clear();
        localStorage.clear();
        window.location.href = 'login.html';
      }

      throw new Error(errorMessage);
    }

    return result;
  } catch (error) {
    console.error(`[API Error] ${method} ${endpoint}:`, error.message);
    throw error;
  }
};

const API = {
  // Auth
  register: (name, email, password) => apiRequest('/auth/register', 'POST', { name, email, password }),
  login: (email, password) => apiRequest('/auth/login', 'POST', { email, password }),
  getMe: () => apiRequest('/auth/me', 'GET'),

  // Calls
  makeCall: (to) => apiRequest('/calls', 'POST', { to }),
  getCalls: () => apiRequest('/calls', 'GET'),

  // SMS Messages
  sendMessage: (to, body) => apiRequest('/messages', 'POST', { to, body }),
  getMessages: () => apiRequest('/messages', 'GET'),

  // Contacts
  getContacts: () => apiRequest('/contacts', 'GET'),
  createContact: (name, phone) => apiRequest('/contacts', 'POST', { name, phone }),
  updateContact: (id, name, phone) => apiRequest(`/contacts/${id}`, 'PUT', { name, phone }),
  deleteContact: (id) => apiRequest(`/contacts/${id}`, 'DELETE')
};
