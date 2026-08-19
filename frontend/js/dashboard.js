let callTimerInterval = null;
let secondsElapsed = 0;
let currentLeadId = null;
let currentUser = null;
let currentOutcome = null;

document.addEventListener('DOMContentLoaded', async () => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  if (!token) { window.location.href = 'login.html'; return; }

  await loadUserProfile();
  initSidebarNavigation();
  initDialpad();
  initCallActions();
  initSmsActions();
  initEmailActions();
  initUploadActions();
  initCampaignActions();
  await refreshDashboard();
  setInterval(refreshDashboard, 30000);
});

async function loadUserProfile() {
  try {
    const res = await API.getMe();
    currentUser = res.data;
    document.getElementById('user-name-display').textContent = currentUser.name;
    document.getElementById('user-email-display').textContent = currentUser.email;
    document.getElementById('user-avatar-initial').textContent = currentUser.name.charAt(0).toUpperCase();

    if (['admin', 'owner', 'manager'].includes(currentUser.role)) {
      document.getElementById('nav-team').style.display = 'flex';
      document.getElementById('nav-admin').style.display = 'flex';
    }
  } catch (err) { console.error('Profile error:', err); }
}

function initSidebarNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const titles = {
    overview: ['Overview', 'Sales dashboard and metrics'],
    queue: ['Daily Queue', 'Your assigned leads for today'],
    caller: ['Dialer', 'Click-to-call station'],
    sms: ['SMS Station', 'Send SMS messages'],
    email: ['Email Station', 'Send emails to leads'],
    leads: ['All Leads', 'Manage your leads'],
    campaigns: ['Campaigns', 'Manage campaigns'],
    activity: ['Activity Log', 'Recent actions'],
    team: ['Team Dashboard', 'Manager metrics'],
    admin: ['User Management', 'Approve and manage users']
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const section = item.getAttribute('data-section');
      document.querySelectorAll('.app-main .panel-card, .app-main .metrics-row').forEach(el => {
        if (el.closest('.panel-card')) el.closest('.panel-card').style.display = 'none';
      });
      const panel = document.getElementById(`section-${section}`);
      if (panel) panel.style.display = 'block';
      const [t, s] = titles[section] || ['', ''];
      document.getElementById('page-title').textContent = t;
      document.getElementById('page-subtitle').textContent = s;
      if (section === 'queue') fetchQueue();
      if (section === 'leads') fetchLeads();
      if (section === 'campaigns') fetchCampaigns();
      if (section === 'activity') fetchActivity();
      if (section === 'team') fetchTeamMetrics();
      if (section === 'admin') fetchPendingUsers();
    });
  });
}

async function refreshDashboard() {
  try {
    const res = await API.getMetrics();
    const m = res.data;
    document.getElementById('m-total').textContent = m.total || 0;
    document.getElementById('m-contacted').textContent = m.contacted || 0;
    document.getElementById('m-interested').textContent = m.interested || 0;
    document.getElementById('m-booked').textContent = m.booked || 0;
    document.getElementById('m-calls-today').textContent = m.callsToday || 0;
    document.getElementById('m-emails-today').textContent = m.emailsToday || 0;
    document.getElementById('m-sms-today').textContent = m.smsToday || 0;
    document.getElementById('m-overdue').textContent = m.callbacksOverdue || 0;

    const alertsRes = await API.getAlerts();
    if (alertsRes.data && alertsRes.data.length > 0) {
      document.getElementById('alerts-pill').style.display = 'inline-flex';
      document.getElementById('alerts-text').textContent = `${alertsRes.data.length} alert(s)`;
    }
  } catch (err) { console.error('Metrics error:', err); }
}

/* ======================== QUEUE ======================== */
async function fetchQueue() {
  try {
    const res = await API.getDailyQueue();
    const q = res.data;
    renderQueueSection('queue-overdue', '⚠️ Overdue Callbacks', q.overdue, '#f43f5e');
    renderQueueSection('queue-due-today', '📅 Due Today', q.dueToday, '#f59e0b');
    renderQueueSection('queue-interested', '🔥 Interested - Follow Up', q.interested, '#10b981');
    renderQueueSection('queue-new', '📋 New Leads', q.newLeads, '#6366f1');
  } catch (err) { console.error('Queue error:', err); }
}

function renderQueueSection(containerId, title, leads, color) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!leads || leads.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `<h4 style="color:${color};margin-bottom:0.5rem;font-size:0.95rem">${title} (${leads.length})</h4>` +
    leads.map(l => `<div class="contact-card-item" style="cursor:pointer" onclick="startWorkingLead('${l._id}')">
      <div style="display:flex;align-items:center;gap:0.85rem">
        <div class="avatar-initial" style="background:${color}">${(l.contact?.name || '?')[0].toUpperCase()}</div>
        <div><div style="font-weight:600;font-size:0.95rem">${escapeHtml(l.contact?.name || '')}</div>
        <div style="font-size:0.8rem;color:var(--text-muted)">${l.contact?.phone || ''} ${l.contact?.email ? '| ' + l.contact.email : ''}</div>
        ${l.callbackNote ? `<div style="font-size:0.75rem;color:${color}">📌 ${escapeHtml(l.callbackNote)}</div>` : ''}
        ${l.company?.name ? `<div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(l.company.name)}</div>` : ''}
        </div>
      </div>
      <button class="btn btn-sm btn-emerald" onclick="event.stopPropagation();loadLeadForCall('${l._id}','${l.contact?.phone || ''}')">📞 Call</button>
    </div>`).join('');
}

async function startWorkingLead(leadId) {
  try {
    const res = await API.getLeadById(leadId);
    const { lead, timeline } = res.data;
    currentLeadId = lead._id;
    document.getElementById('call-phone-input').value = lead.contact?.phone || '';
    document.getElementById('email-lead-id').value = lead._id;
    document.getElementById('email-to').value = lead.contact?.email || '';
    document.getElementById('sms-recipient-input').value = lead.contact?.phone || '';

    const content = document.getElementById('lead-detail-content');
    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;font-size:0.9rem">
        <div><strong>Name:</strong> ${escapeHtml(lead.contact?.name || '')}</div>
        <div><strong>Phone:</strong> ${lead.contact?.phone || 'N/A'}</div>
        <div><strong>Email:</strong> ${lead.contact?.email || 'N/A'}</div>
        <div><strong>Position:</strong> ${lead.contact?.position || 'N/A'}</div>
        <div><strong>Company:</strong> ${escapeHtml(lead.company?.name || 'N/A')}</div>
        <div><strong>Status:</strong> <span class="badge badge-${lead.status === 'new' ? 'queued' : lead.status === 'interested' ? 'completed' : 'ringing'}">${lead.status}</span></div>
        <div><strong>Last Action:</strong> ${lead.lastAction || 'None'}</div>
        <div><strong>Next Action:</strong> ${lead.nextAction || 'N/A'}</div>
      </div>`;

    const timelineEl = document.getElementById('lead-timeline');
    if (timeline && timeline.length > 0) {
      timelineEl.innerHTML = '<h4 style="margin-bottom:0.5rem">Timeline</h4>' + timeline.map(t =>
        `<div class="contact-card-item" style="padding:0.5rem 0.75rem;margin-bottom:0.4rem">
          <div style="font-size:0.8rem"><strong>${t.action}</strong> ${t.outcome ? `— ${t.outcome}` : ''} ${t.notes ? `<br>${escapeHtml(t.notes)}` : ''}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${new Date(t.timestamp).toLocaleString()}</div>
        </div>`
      ).join('');
    } else {
      timelineEl.innerHTML = '<div class="empty-placeholder">No activity yet</div>';
    }

    document.getElementById('lead-detail-modal').classList.add('show');

    switchTab('caller');
  } catch (err) { showToast(err.message, 'error'); }
}

function loadLeadForCall(leadId, phone) {
  currentLeadId = leadId;
  document.getElementById('call-phone-input').value = phone;
  switchTab('caller');
  showToast('Lead loaded into dialer', 'info');
}

function switchTab(section) {
  const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (navItem) navItem.click();
}

/* ======================== DIALPAD ======================== */
function initDialpad() {
  const phoneInput = document.getElementById('call-phone-input');
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', () => { phoneInput.value += btn.getAttribute('data-digit'); });
  });
  const clearBtn = document.getElementById('clear-phone-btn');
  if (clearBtn) clearBtn.addEventListener('click', () => { phoneInput.value = ''; });
}

function initCallActions() {
  const callBtn = document.getElementById('btn-make-call');
  const endCallBtn = document.getElementById('btn-end-call');

  if (callBtn) {
    callBtn.addEventListener('click', async () => {
      const phone = document.getElementById('call-phone-input').value.trim();
      if (!phone) { showToast('Enter a phone number.', 'error'); return; }
      try {
        updateCallStatus('Initiating...', 'ringing');
        callBtn.disabled = true;
        const res = await API.makeCall(phone);
        showToast(`Call initiated! SID: ${res.data.callSid.substring(0, 10)}...`, 'success');
        updateCallStatus('Connected', 'active');
        startCallTimer();
        document.getElementById('outcome-panel').style.display = 'block';
        document.getElementById('btn-submit-outcome').style.display = 'block';
        if (endCallBtn) endCallBtn.style.display = 'inline-flex';
      } catch (err) {
        updateCallStatus('Failed', 'failed');
        showToast(err.message, 'error');
        callBtn.disabled = false;
      }
    });
  }

  if (endCallBtn) {
    endCallBtn.addEventListener('click', () => {
      stopCallTimer();
      updateCallStatus('Call ended - Set outcome', 'ready');
      callBtn.disabled = false;
      endCallBtn.style.display = 'none';
    });
  }
}

function updateCallStatus(text, state) {
  const label = document.getElementById('call-status-label');
  const dot = document.getElementById('call-status-dot');
  if (label) label.textContent = text;
  if (dot) { dot.className = 'status-dot'; if (state) dot.classList.add(state); }
}

function startCallTimer() {
  stopCallTimer(); secondsElapsed = 0;
  callTimerInterval = setInterval(() => {
    secondsElapsed++;
    const m = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
    const s = String(secondsElapsed % 60).padStart(2, '0');
    document.getElementById('call-timer-display').textContent = `${m}:${s}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
}

function setOutcome(outcome) {
  currentOutcome = outcome;
  document.getElementById('callback-form').style.display = 'none';
  document.getElementById('booking-form').style.display = 'none';
  document.getElementById('btn-submit-outcome').style.display = 'inline-flex';
  showToast(`Outcome set: ${outcome}. Add notes and submit.`, 'info');
}

function showCallbackForm() {
  currentOutcome = 'callback';
  document.getElementById('callback-form').style.display = 'block';
  document.getElementById('booking-form').style.display = 'none';
  document.getElementById('btn-submit-outcome').style.display = 'inline-flex';
}

function showBookingForm() {
  currentOutcome = 'meeting-booked';
  document.getElementById('booking-form').style.display = 'block';
  document.getElementById('callback-form').style.display = 'none';
  document.getElementById('btn-submit-outcome').style.display = 'inline-flex';
}

async function submitOutcome() {
  if (!currentLeadId) { showToast('No lead selected.', 'error'); return; }
  if (!currentOutcome) { showToast('Select an outcome first.', 'error'); return; }

  const notes = document.getElementById('call-notes').value.trim();

  try {
    if (currentOutcome === 'meeting-booked') {
      await API.bookLead({
        leadId: currentLeadId,
        meetingDate: document.getElementById('booking-datetime').value,
        closer: document.getElementById('booking-closer').value,
        meetingLink: document.getElementById('booking-link').value
      });
    } else if (currentOutcome === 'callback') {
      await API.workLead({ leadId: currentLeadId, outcome: 'callback', notes, callbackDate: document.getElementById('callback-datetime').value, duration: secondsElapsed });
    } else {
      await API.workLead({ leadId: currentLeadId, outcome: currentOutcome, notes, duration: secondsElapsed });
    }

    showToast('Outcome saved!', 'success');
    resetCallPanel();
    refreshDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

function resetCallPanel() {
  currentLeadId = null;
  currentOutcome = null;
  secondsElapsed = 0;
  stopCallTimer();
  document.getElementById('call-phone-input').value = '';
  document.getElementById('call-notes').value = '';
  document.getElementById('call-timer-display').textContent = '00:00';
  document.getElementById('outcome-panel').style.display = 'none';
  document.getElementById('callback-form').style.display = 'none';
  document.getElementById('booking-form').style.display = 'none';
  document.getElementById('btn-submit-outcome').style.display = 'none';
  document.getElementById('btn-make-call').disabled = false;
  updateCallStatus('Ready', 'ready');
}

/* ======================== SMS ======================== */
function initSmsActions() {
  const smsForm = document.getElementById('form-send-sms');
  const smsBody = document.getElementById('sms-body-input');
  const counter = document.getElementById('sms-char-counter');
  if (smsBody && counter) smsBody.addEventListener('input', () => { counter.textContent = `${smsBody.value.length}/160`; });
  if (smsForm) smsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const to = document.getElementById('sms-recipient-input').value.trim();
    const body = smsBody.value.trim();
    if (!to || !body) { showToast('Fill in all fields.', 'error'); return; }
    try {
      await API.sendMessage(to, body);
      showToast('SMS sent!', 'success');
      smsBody.value = '';
      if (counter) counter.textContent = '0/160';
      refreshDashboard();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

/* ======================== EMAIL ======================== */
function initEmailActions() {
  const emailForm = document.getElementById('form-send-email');
  if (emailForm) emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const leadId = document.getElementById('email-lead-id').value.trim();
    const subject = document.getElementById('email-subject').value.trim();
    const body = document.getElementById('email-body').value.trim();
    if (!leadId || !subject || !body) { showToast('Fill in all fields.', 'error'); return; }
    try {
      await API.sendEmail({ leadId, subject, body });
      showToast('Email sent!', 'success');
      emailForm.reset();
      refreshDashboard();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

/* ======================== LEADS ======================== */
async function fetchLeads() {
  try {
    const res = await API.getLeads();
    const leads = res.data;
    const tbody = document.getElementById('leads-tbody');
    if (!leads || leads.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-placeholder">No leads yet. Upload a CSV to get started.</td></tr>'; return; }
    tbody.innerHTML = leads.map(l => `
      <tr>
        <td><strong>${escapeHtml(l.contact?.name || '')}</strong></td>
        <td>${l.contact?.phone || ''}</td>
        <td>${l.contact?.email || ''}</td>
        <td>${escapeHtml(l.company?.name || '')}</td>
        <td><span class="badge badge-${getStatusBadge(l.status)}">${l.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="startWorkingLead('${l._id}')" title="Open">Open</button>
          <button class="btn btn-sm btn-rose" onclick="deleteLead('${l._id}')" title="Delete">🗑️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) { console.error('Leads error:', err); }
}

function getStatusBadge(status) {
  if (['meeting-booked', 'interested'].includes(status)) return 'completed';
  if (['no-answer', 'busy', 'voicemail', 'callback'].includes(status)) return 'ringing';
  if (['not-interested', 'wrong-number', 'dnc', 'opted-out'].includes(status)) return 'failed';
  return 'queued';
}

async function deleteLead(id) {
  if (!confirm('Delete this lead?')) return;
  try { await API.deleteLead(id); showToast('Lead deleted.', 'info'); fetchLeads(); } catch (err) { showToast(err.message, 'error'); }
}

/* ======================== UPLOAD ======================== */
function initUploadActions() {
  const form = document.getElementById('form-upload-csv');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('csv-file-input');
    if (!fileInput.files.length) { showToast('Select a CSV file.', 'error'); return; }
    const formData = new FormData();
    formData.append('csv', fileInput.files[0]);
    const campaign = document.getElementById('upload-campaign').value;
    const assignTo = document.getElementById('upload-assign').value;
    if (campaign) formData.append('campaignId', campaign);
    if (assignTo) formData.append('userId', assignTo);
    try {
      await API.uploadLeads(formData);
      showToast('Leads imported!', 'success');
      closeModal('upload-modal');
      fetchLeads();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function showUploadModal() { document.getElementById('upload-modal').classList.add('show'); }

/* ======================== CAMPAIGNS ======================== */
function initCampaignActions() {
  const form = document.getElementById('form-create-campaign');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('campaign-name').value.trim();
    const desc = document.getElementById('campaign-desc').value.trim();
    try {
      await API.createCampaign({ name, description: desc });
      showToast('Campaign created!', 'success');
      closeModal('campaign-modal');
      fetchCampaigns();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function fetchCampaigns() {
  try {
    const res = await API.getCampaigns();
    const container = document.getElementById('campaigns-list');
    if (!res.data || res.data.length === 0) { container.innerHTML = '<div class="empty-placeholder">No campaigns yet.</div>'; return; }
    container.innerHTML = res.data.map(c => `
      <div class="contact-card-item">
        <div><div style="font-weight:600">${escapeHtml(c.name)}</div><div style="font-size:0.8rem;color:var(--text-muted)">${c.description || 'No description'}</div></div>
        <div style="display:flex;gap:0.4rem"><span class="badge badge-${c.status === 'active' ? 'completed' : 'queued'}">${c.status}</span>
        <button class="btn btn-sm btn-rose" onclick="deleteCampaign('${c._id}')">🗑️</button></div>
      </div>`).join('');
  } catch (err) { console.error('Campaigns error:', err); }
}

function showCampaignModal() { document.getElementById('campaign-modal').classList.add('show'); }

async function deleteCampaign(id) {
  if (!confirm('Delete this campaign?')) return;
  try { await API.deleteCampaign(id); showToast('Deleted.', 'info'); fetchCampaigns(); } catch (err) { showToast(err.message, 'error'); }
}

/* ======================== ACTIVITY ======================== */
async function fetchActivity() {
  try {
    const res = await API.getActivity(50);
    const container = document.getElementById('activity-list');
    if (!res.data || res.data.length === 0) { container.innerHTML = '<div class="empty-placeholder">No activity yet.</div>'; return; }
    container.innerHTML = res.data.map(a => `
      <div class="contact-card-item" style="align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between"><span style="font-weight:600;font-size:0.9rem">${a.action.toUpperCase()} ${a.direction ? `(${a.direction})` : ''}</span><span style="font-size:0.7rem;color:var(--text-muted)">${new Date(a.timestamp).toLocaleString()}</span></div>
          ${a.outcome ? `<div style="font-size:0.8rem;color:var(--accent-cyan)">Outcome: ${a.outcome}</div>` : ''}
          ${a.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">${escapeHtml(a.notes)}</div>` : ''}
          ${a.duration ? `<div style="font-size:0.75rem;color:var(--text-muted)">Duration: ${a.duration}s</div>` : ''}
        </div>
      </div>`).join('');
  } catch (err) { console.error('Activity error:', err); }
}

/* ======================== TEAM ======================== */
async function fetchTeamMetrics() {
  try {
    const res = await API.getMetrics();
    const container = document.getElementById('team-metrics');
    if (currentUser.role === 'salesperson') {
      container.innerHTML = '<div class="empty-placeholder">Team view is for managers only.</div>';
      return;
    }
    const data = res.data;
    const sp = data.salespeople || [];
    container.innerHTML = `
      <div class="metrics-row"><div class="metric-card"><div class="metric-data"><span>Total Leads</span><div class="metric-value">${data.overview?.totalLeads || 0}</div></div><div class="metric-icon icon-indigo">🎯</div></div>
      <div class="metric-card"><div class="metric-data"><span>Interested</span><div class="metric-value">${data.overview?.totalInterested || 0}</div></div><div class="metric-icon icon-cyan">🔥</div></div>
      <div class="metric-card"><div class="metric-data"><span>Booked</span><div class="metric-value">${data.overview?.totalBooked || 0}</div></div><div class="metric-icon icon-emerald">📅</div></div>
      <div class="metric-card"><div class="metric-data"><span>Overdue</span><div class="metric-value" style="color:var(--accent-rose)">${data.overview?.totalOverdue || 0}</div></div><div class="metric-icon icon-rose">⚠️</div></div></div>
      ${sp.map(s => `
        <div class="contact-card-item" style="flex-direction:column;align-items:flex-start;gap:0.75rem">
          <div style="display:flex;justify-content:space-between;width:100%"><strong>${escapeHtml(s.user.name)}</strong><span style="font-size:0.8rem;color:var(--text-muted)">${s.user.email}</span></div>
          <div style="display:flex;gap:1.5rem;font-size:0.85rem;flex-wrap:wrap">
            <span>Assigned: <strong>${s.metrics.total}</strong></span>
            <span>Contacted: <strong>${s.metrics.contacted}</strong></span>
            <span>Interested: <strong>${s.metrics.interested}</strong></span>
            <span>Booked: <strong>${s.metrics.booked}</strong></span>
            <span style="color:var(--accent-rose)">Overdue: <strong>${s.metrics.callbacksOverdue}</strong></span>
            <span>Calls today: <strong>${s.stats.callsToday}</strong></span>
          </div>
        </div>`).join('')}`;
  } catch (err) { console.error('Team error:', err); }
}

/* ======================== ADMIN ======================== */
async function fetchPendingUsers() {
  try {
    const res = await API.getPendingUsers();
    const container = document.getElementById('pending-users-list');
    if (!res.data || res.data.length === 0) { container.innerHTML = '<div class="empty-placeholder">No pending users.</div>'; return; }
    container.innerHTML = res.data.map(u => `
      <div class="contact-card-item">
        <div style="display:flex;align-items:center;gap:0.85rem">
          <div class="avatar-initial">${u.name.charAt(0).toUpperCase()}</div>
          <div><div style="font-weight:600">${escapeHtml(u.name)}</div><div style="font-size:0.8rem;color:var(--text-muted)">${u.email}</div></div>
        </div>
        <div style="display:flex;gap:0.4rem">
          <button class="btn btn-sm btn-emerald" onclick="approveUser('${u._id}')">Approve</button>
          <button class="btn btn-sm btn-rose" onclick="rejectUser('${u._id}')">Reject</button>
        </div>
      </div>`).join('');
  } catch (err) { console.error('Pending users error:', err); }
}

async function approveUser(id) {
  try { await API.approveUser(id); showToast('Approved!', 'success'); fetchPendingUsers(); } catch (err) { showToast(err.message, 'error'); }
}

async function rejectUser(id) {
  if (!confirm('Reject this user?')) return;
  try { await API.rejectUser(id); showToast('Rejected.', 'info'); fetchPendingUsers(); } catch (err) { showToast(err.message, 'error'); }
}

/* ======================== HELPERS ======================== */
function formatSeconds(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function escapeHtml(s) { return (s || '').replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t)); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
