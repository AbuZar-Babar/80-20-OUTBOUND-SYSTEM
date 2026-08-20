const API_BASE_URL = '/api';

const showToast = (message, type = 'info') => {
  let container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span style="font-weight:bold">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 4000);
};

const apiRequest = async (endpoint, method = 'GET', data = null, isFormData = false) => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = isFormData ? data : JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const result = await response.json();
    if (!response.ok || !result.success) {
      const errorMessage = result.message || 'An error occurred.';
      if (response.status === 401 && !window.location.pathname.endsWith('login.html')) {
        sessionStorage.clear(); localStorage.clear();
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
  register: (name, email, password) => apiRequest('/auth/register', 'POST', { name, email, password }),
  login: (email, password) => apiRequest('/auth/login', 'POST', { email, password }),
  getMe: () => apiRequest('/auth/me', 'GET'),
  updateProfile: (data) => apiRequest('/auth/profile', 'PUT', data),

  makeCall: (to) => apiRequest('/calls', 'POST', { to }),
  getCalls: () => apiRequest('/calls', 'GET'),
  sendMessage: (to, body) => apiRequest('/messages', 'POST', { to, body }),
  getMessages: () => apiRequest('/messages', 'GET'),
  getContacts: () => apiRequest('/contacts', 'GET'),
  createContact: (name, phone) => apiRequest('/contacts', 'POST', { name, phone }),
  updateContact: (id, name, phone) => apiRequest(`/contacts/${id}`, 'PUT', { name, phone }),
  deleteContact: (id) => apiRequest(`/contacts/${id}`, 'DELETE'),

  getPendingUsers: () => apiRequest('/admin/users/pending', 'GET'),
  getAllUsers: () => apiRequest('/admin/users', 'GET'),
  getOnlineUsers: () => apiRequest('/admin/online-users', 'GET'),
  approveUser: (id, role) => apiRequest(`/admin/users/${id}/approve`, 'POST', role ? { role } : null),
  rejectUser: (id) => apiRequest(`/admin/users/${id}/reject`, 'DELETE'),
  updateUserRole: (id, role) => apiRequest(`/admin/users/${id}/role`, 'POST', { role }),

  uploadLeads: (formData) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    return fetch(`${API_BASE_URL}/leads/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    }).then(r => r.json());
  },
  getLeads: (params = '') => apiRequest(`/leads${params ? '?' + params : ''}`, 'GET'),
  getLeadById: (id) => apiRequest(`/leads/${id}`, 'GET'),
  updateLead: (id, data) => apiRequest(`/leads/${id}`, 'PUT', data),
  deleteLead: (id) => apiRequest(`/leads/${id}`, 'DELETE'),
  getDailyQueue: () => apiRequest('/leads/queue', 'GET'),
  workLead: (data) => apiRequest('/leads/work', 'POST', data),
  assignLeads: (leadIds, userId) => apiRequest('/leads/assign', 'POST', { leadIds, userId }),
  bulkAssign: (campaignId, userId) => apiRequest('/leads/bulk-assign', 'POST', { campaignId, userId }),
  addNote: (leadId, notes) => apiRequest('/leads/note', 'POST', { leadId, notes }),
  bookLead: (data) => apiRequest('/leads/book', 'POST', data),
  suppressLead: (leadId, channel) => apiRequest('/leads/suppress', 'POST', { leadId, channel }),

  getCampaigns: () => apiRequest('/campaigns', 'GET'),
  createCampaign: (data) => apiRequest('/campaigns', 'POST', data),
  toggleCampaign: (id) => apiRequest(`/campaigns/${id}/toggle`, 'POST'),
  exportCampaignLeads: (id) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    return fetch(`${API_BASE_URL}/campaigns/${id}/export`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.blob());
  },
  deleteCampaign: (id) => apiRequest(`/campaigns/${id}`, 'DELETE'),

  sendEmail: (data) => apiRequest('/email/send', 'POST', data),
  bulkEmail: (data) => apiRequest('/email/bulk', 'POST', data),
  getTemplates: () => apiRequest('/email/templates', 'GET'),
  createTemplate: (data) => apiRequest('/email/templates', 'POST', data),
  updateTemplate: (id, data) => apiRequest(`/email/templates/${id}`, 'PUT', data),
  deleteTemplate: (id) => apiRequest(`/email/templates/${id}`, 'DELETE'),
  sendTemplateEmail: (data) => apiRequest('/email/send-template', 'POST', data),
  getInboxHealth: () => apiRequest('/email/inbox-health', 'GET'),
  getInboxes: () => apiRequest('/email/inboxes', 'GET'),
  createInbox: (data) => apiRequest('/email/inboxes', 'POST', data),
  updateInbox: (id, data) => apiRequest(`/email/inboxes/${id}`, 'PUT', data),
  deleteInbox: (id) => apiRequest(`/email/inboxes/${id}`, 'DELETE'),

  reassignLead: (leadId, userId) => apiRequest('/leads/reassign', 'POST', { leadId, userId }),
  checkContactHours: (leadId) => apiRequest(`/leads/contact-hours?leadId=${leadId}`, 'GET'),
  exportBookedLeads: (format = 'json') => apiRequest(`/leads/export/booked?format=${format}`, 'GET'),
  crmHandoff: (leadIds) => apiRequest('/leads/crm-handoff', 'POST', { leadIds }),

  sendWhatsApp: (data) => apiRequest('/messages/whatsapp', 'POST', data),

  getWhatsAppTemplates: () => apiRequest('/whatsapp/templates', 'GET'),
  createWhatsAppTemplate: (data) => apiRequest('/whatsapp/templates', 'POST', data),
  updateWhatsAppTemplate: (id, data) => apiRequest(`/whatsapp/templates/${id}`, 'PUT', data),
  deleteWhatsAppTemplate: (id) => apiRequest(`/whatsapp/templates/${id}`, 'DELETE'),

  getSequences: () => apiRequest('/drip/sequences', 'GET'),
  createSequence: (data) => apiRequest('/drip/sequences', 'POST', data),
  updateSequence: (id, data) => apiRequest(`/drip/sequences/${id}`, 'PUT', data),
  deleteSequence: (id) => apiRequest(`/drip/sequences/${id}`, 'DELETE'),
  enrollLeadInSequence: (leadId, sequenceId) => apiRequest('/drip/enroll', 'POST', { leadId, sequenceId }),

  getMetrics: () => apiRequest('/manager/metrics', 'GET'),
  getActivity: (limit = 50) => apiRequest(`/manager/activity?limit=${limit}`, 'GET'),
  getAlerts: () => apiRequest('/manager/alerts', 'GET'),

  getClosers: () => apiRequest('/auth/closers', 'GET'),

  recordLogin: () => apiRequest('/session/login', 'POST'),
  heartbeat: () => apiRequest('/session/heartbeat', 'POST'),
  toggleBreak: () => apiRequest('/session/break/toggle', 'POST'),
  updateDialingTime: (seconds) => apiRequest('/session/dialing-time', 'POST', { seconds }),
  getSessionStats: (userId) => apiRequest(`/session/stats${userId ? '/' + userId : ''}`, 'GET')
};
