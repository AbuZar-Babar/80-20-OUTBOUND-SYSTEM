let callTimerInterval = null;
let secondsElapsed = 0;
let currentLeadId = null;
let currentUser = null;
let currentOutcome = null;
let heartbeatInterval = null;
let currentLeadData = null;

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
  initTemplateActions();
  initWhatsAppActions();
  initWhatsAppTemplateActions();
  await refreshDashboard();
  setInterval(refreshDashboard, 30000);

  try { await API.recordLogin(); } catch (e) {}
  heartbeatInterval = setInterval(() => { API.heartbeat().catch(() => {}); }, 60000);
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
    whatsapp: ['WhatsApp Station', 'Send WhatsApp messages'],
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
      if (section === 'admin') fetchAdminData();
      if (section === 'whatsapp') fetchWhatsAppTemplates();
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
    document.getElementById('m-wa-today').textContent = m.whatsappToday || 0;
    document.getElementById('m-overdue').textContent = m.callbacksOverdue || 0;

    const cphEl = document.getElementById('m-calls-per-hour');
    if (cphEl) cphEl.textContent = m.callsPerHour || '0';

    const brEl = document.getElementById('m-booking-rate');
    if (brEl) brEl.textContent = m.bookingRate || (m.overview?.overallBookingRate || '0%');

    if (currentUser && currentUser.dailyLeadTarget) {
      const target = currentUser.dailyLeadTarget;
      const callsToday = m.callsToday || 0;
      const pct = target > 0 ? Math.min(100, Math.round((callsToday / target) * 100)) : 0;
      const el = document.getElementById('m-target-progress');
      if (el) el.innerHTML = `<span>${callsToday}/${target}</span><div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:4px"><div style="height:100%;width:${pct}%;background:${pct >= 100 ? 'var(--accent-emerald)' : 'var(--accent-primary)'};border-radius:2px"></div></div>`;
    }

    const ss = await API.getSessionStats().catch(() => null);
    if (ss && ss.data) {
      const atEl = document.getElementById('m-active-time');
      const dtEl = document.getElementById('m-dialing-time');
      const btEl = document.getElementById('m-break-time');
      if (atEl) atEl.textContent = formatSeconds(ss.data.activeTimeSeconds || 0);
      if (dtEl) dtEl.textContent = formatSeconds(ss.data.dialingTimeSeconds || 0);
      if (btEl) btEl.textContent = formatSeconds(ss.data.breakTimeSeconds || 0);

      const breakBtn = document.getElementById('btn-toggle-break');
      if (breakBtn) {
        if (ss.data.isOnBreak) {
          breakBtn.innerHTML = '▶ Resume Work';
          breakBtn.className = 'btn btn-sm btn-emerald';
        } else {
          breakBtn.innerHTML = '☕ Start Break';
          breakBtn.className = 'btn btn-sm btn-outline';
        }
      }
    }

    const alertsRes = await API.getAlerts();
    if (alertsRes.data && alertsRes.data.length > 0) {
      document.getElementById('alerts-pill').style.display = 'inline-flex';
      const dismissed = JSON.parse(localStorage.getItem('dismissedAlerts') || '[]');
      const activeAlerts = alertsRes.data.filter(a => !dismissed.includes(a.category));
      if (activeAlerts.length > 0) {
        document.getElementById('alerts-text').textContent = `${activeAlerts.length} alert(s)`;
        let alertsHtml = '<div class="alerts-list">';
        activeAlerts.forEach(a => {
          const icon = a.type === 'error' ? '🔴' : a.type === 'warning' ? '🟡' : '🔵';
          alertsHtml += `<div class="alert-item alert-${a.type}" data-category="${a.category}">
            <span>${icon} ${a.message}</span>
            <button class="alert-dismiss" onclick="dismissAlert('${a.category}')" title="Dismiss">×</button>
          </div>`;
        });
        alertsHtml += '</div>';
        document.getElementById('alerts-pill').insertAdjacentHTML('afterend', alertsHtml);
      } else {
        document.getElementById('alerts-pill').style.display = 'none';
        const existingAlerts = document.querySelector('.alerts-list');
        if (existingAlerts) existingAlerts.remove();
      }
    } else {
      document.getElementById('alerts-pill').style.display = 'none';
      const existingAlerts = document.querySelector('.alerts-list');
      if (existingAlerts) existingAlerts.remove();
    }

    if (document.getElementById('section-admin') && document.getElementById('section-admin').style.display !== 'none') {
      fetchAdminData().catch(() => {});
    }
  } catch (err) { console.error('Metrics error:', err); }
}

/* ======================== QUEUE ======================== */
async function fetchQueue() {
  try {
    const res = await API.getDailyQueue();
    const q = res.data;
    renderQueueSection('queue-replies', '💬 Inbound Replies Needing Action', q.replies, '#ec4899');
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
        <div>
          <div style="font-weight:600;font-size:0.95rem">${escapeHtml(l.contact?.name || '')}</div>
          <div style="font-size:0.8rem;color:var(--text-muted)">${l.contact?.phone || ''} ${l.contact?.email ? '| ' + l.contact.email : ''}</div>
          ${l.hasUnansweredReply ? `<div style="font-size:0.75rem;color:#ec4899;font-weight:600">💬 Reply (${l.lastReplyChannel || 'inbound'}): "${escapeHtml(l.lastReplyText || '')}"</div>` : ''}
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
    currentLeadData = lead;
    document.getElementById('call-phone-input').value = lead.contact?.phone || '';
    document.getElementById('email-lead-id').value = lead._id;
    document.getElementById('email-to').value = lead.contact?.email || '';
    document.getElementById('sms-recipient-input').value = lead.contact?.phone || '';

    const handoffBtn = document.getElementById('btn-lead-crm-handoff');
    if (handoffBtn) {
      handoffBtn.style.display = lead.status === 'meeting-booked' ? 'inline-flex' : 'none';
    }

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
      </div>
      ${lead.hasUnansweredReply ? `<div style="margin-top:0.75rem;padding:0.5rem;background:rgba(236,72,153,0.15);border-radius:6px;font-size:0.85rem;color:#f472b6"><strong>💬 Latest Inbound Reply (${lead.lastReplyChannel || 'reply'}):</strong> ${escapeHtml(lead.lastReplyText || '')}</div>` : ''}
      ${lead.booking?.booked ? `<div style="margin-top:0.75rem;padding:0.5rem;background:rgba(16,185,129,0.15);border-radius:6px;font-size:0.85rem;color:var(--accent-emerald)"><strong>📅 Meeting Booked:</strong> ${new Date(lead.booking.meetingDate).toLocaleString()} (Closer: ${escapeHtml(lead.booking.closer || 'N/A')}) ${lead.booking.meetingLink ? `<a href="${lead.booking.meetingLink}" target="_blank" style="color:var(--accent-cyan);margin-left:0.5rem">Link ↗</a>` : ''}</div>` : ''}`;

    const timelineEl = document.getElementById('lead-timeline');
    if (timeline && timeline.length > 0) {
      timelineEl.innerHTML = '<h4 style="margin-bottom:0.5rem">Timeline</h4>' + timeline.map(t => {
        const chIcon = t.channel === 'whatsapp' ? '📱' : t.channel === 'sms' ? '💬' : t.channel === 'email' ? '✉️' : t.channel === 'phone' ? '📞' : '';
        return `<div class="contact-card-item" style="padding:0.5rem 0.75rem;margin-bottom:0.4rem">
          <div style="font-size:0.8rem"><strong>${chIcon} ${t.action}</strong> ${t.outcome ? `— ${t.outcome}` : ''} ${t.notes ? `<br>${escapeHtml(t.notes)}` : ''}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${new Date(t.timestamp).toLocaleString()}</div>
        </div>`;
      }).join('');
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
  if (secondsElapsed > 0) {
    API.updateDialingTime(secondsElapsed).catch(() => {});
  }
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

let availableClosers = [];

async function loadClosers() {
  try {
    const res = await API.getClosers();
    availableClosers = res.data || [];
    const select = document.getElementById('booking-closer-select');
    if (select) {
      select.innerHTML = '<option value="">-- Select Closer --</option>' +
        availableClosers.map(c => `<option value="${c._id}" data-name="${escapeHtml(c.name)}" data-calendar="${escapeHtml(c.calendarLink || '')}">${escapeHtml(c.name)} (${c.role})</option>`).join('');
    }
  } catch (err) { console.error('Closers error:', err); }
}

function handleCloserSelect() {
  const select = document.getElementById('booking-closer-select');
  const selectedOpt = select?.options[select.selectedIndex];
  const calBtn = document.getElementById('closer-calendar-btn');
  const linkInput = document.getElementById('booking-link');
  if (!selectedOpt || !selectedOpt.value) {
    if (calBtn) calBtn.style.display = 'none';
    return;
  }
  const calLink = selectedOpt.getAttribute('data-calendar');
  if (calLink && calLink.trim() !== '') {
    if (calBtn) {
      calBtn.href = calLink;
      calBtn.style.display = 'inline-block';
    }
    if (linkInput && (!linkInput.value || linkInput.value.trim() === '')) {
      linkInput.value = calLink;
    }
  } else {
    if (calBtn) calBtn.style.display = 'none';
  }
}

function showBookingForm() {
  currentOutcome = 'meeting-booked';
  document.getElementById('booking-form').style.display = 'block';
  document.getElementById('callback-form').style.display = 'none';
  document.getElementById('btn-submit-outcome').style.display = 'inline-flex';
  loadClosers();
}

async function submitOutcome() {
  if (!currentLeadId) { showToast('No lead selected.', 'error'); return; }
  if (!currentOutcome) { showToast('Select an outcome first.', 'error'); return; }

  const notes = document.getElementById('call-notes').value.trim();

  try {
    if (currentOutcome === 'meeting-booked') {
      const closerSelect = document.getElementById('booking-closer-select');
      const selectedOpt = closerSelect?.options[closerSelect.selectedIndex];
      const closerName = selectedOpt?.getAttribute('data-name') || selectedOpt?.text || '';

      await API.bookLead({
        leadId: currentLeadId,
        meetingDate: document.getElementById('booking-datetime').value,
        closer: closerName,
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
  const calBtn = document.getElementById('closer-calendar-btn');
  if (calBtn) calBtn.style.display = 'none';
  const closerSelect = document.getElementById('booking-closer-select');
  if (closerSelect) closerSelect.value = '';
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
    const inboxId = document.getElementById('email-inbox-select')?.value || undefined;
    if (!leadId || !subject || !body) { showToast('Fill in all fields.', 'error'); return; }
    try {
      await API.sendEmail({ leadId, subject, body, inboxId });
      showToast('Email sent!', 'success');
      emailForm.reset();
      refreshDashboard();
      if (document.getElementById('email-inboxes-tab').style.display !== 'none') {
        fetchInboxes();
      }
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function showEmailTab(tab) {
  document.querySelectorAll('#section-email .tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('email-compose-tab').style.display = tab === 'compose' ? 'block' : 'none';
  document.getElementById('email-templates-tab').style.display = tab === 'templates' ? 'block' : 'none';
  document.getElementById('email-inboxes-tab').style.display = tab === 'inboxes' ? 'block' : 'none';
  if (tab === 'templates') fetchTemplates();
  if (tab === 'inboxes') fetchInboxes();
  if (tab === 'compose') {
    updateEmailLimitInfo();
    fetchInboxes();
  }
}

async function fetchInboxes() {
  try {
    const res = await API.getInboxes();
    const inboxes = res.data || [];
    const container = document.getElementById('inboxes-list');
    const select = document.getElementById('email-inbox-select');

    if (container) {
      if (inboxes.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No sending inboxes connected yet. Click "+ Add Inbox" to connect one.</div>';
      } else {
        container.innerHTML = inboxes.map(i => `
          <div class="contact-card-item">
            <div style="flex:1">
              <div style="font-weight:600">${escapeHtml(i.name)} <span style="font-size:0.8rem;color:var(--text-muted)">(${escapeHtml(i.fromEmail)})</span></div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
                Daily Limit: <strong>${i.dailyLimit}</strong> | Sent Today: <strong>${i.emailsSentToday || 0}</strong> | Remaining: <strong>${Math.max(0, i.dailyLimit - (i.emailsSentToday || 0))}</strong>
              </div>
              <div style="font-size:0.7rem;margin-top:4px">
                <span class="badge badge-${(i.emailsSentToday || 0) >= i.dailyLimit ? 'failed' : 'completed'}">${(i.emailsSentToday || 0) >= i.dailyLimit ? 'Throttled / Limit Reached' : 'Healthy'}</span>
              </div>
            </div>
            <div>
              <button class="btn btn-sm btn-rose" onclick="deleteInbox('${i._id}')">🗑️</button>
            </div>
          </div>`).join('');
      }
    }

    if (select) {
      select.innerHTML = '<option value="">Default (System SendGrid)</option>' +
        inboxes.map(i => `<option value="${i._id}">${escapeHtml(i.name)} (${i.fromEmail} - ${i.emailsSentToday || 0}/${i.dailyLimit} sent)</option>`).join('');
    }
  } catch (err) { console.error('Inboxes error:', err); }
}

function showCreateInboxModal() {
  document.getElementById('inbox-modal').classList.add('show');
}

async function handleCreateInbox(e) {
  e.preventDefault();
  const name = document.getElementById('inbox-name').value.trim();
  const fromEmail = document.getElementById('inbox-from-email').value.trim();
  const fromName = document.getElementById('inbox-from-name').value.trim();
  const dailyLimit = document.getElementById('inbox-daily-limit').value;

  try {
    await API.createInbox({ name, fromEmail, fromName, dailyLimit });
    showToast('Sending inbox created!', 'success');
    closeModal('inbox-modal');
    document.getElementById('form-create-inbox').reset();
    fetchInboxes();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteInbox(id) {
  if (!confirm('Remove this sending inbox?')) return;
  try {
    await API.deleteInbox(id);
    showToast('Inbox removed.', 'info');
    fetchInboxes();
  } catch (err) { showToast(err.message, 'error'); }
}

async function updateEmailLimitInfo() {
  try {
    const ss = await API.getSessionStats().catch(() => null);
    const el = document.getElementById('email-limit-info');
    if (!el) return;
    if (currentUser && currentUser.dailyEmailLimit) {
      const sentToday = ss?.data?.emailsToday || 0;
      const limit = currentUser.dailyEmailLimit;
      el.textContent = `${sentToday}/${limit} emails sent today`;
      if (sentToday >= limit) el.style.color = 'var(--accent-rose)';
    }
  } catch (e) {}
}

function initTemplateActions() {
  const form = document.getElementById('form-create-template');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.createTemplate({
        name: document.getElementById('tpl-name').value.trim(),
        subject: document.getElementById('tpl-subject').value.trim(),
        body: document.getElementById('tpl-body').value.trim(),
        category: document.getElementById('tpl-category').value
      });
      showToast('Template created!', 'success');
      closeModal('template-modal');
      fetchTemplates();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function fetchTemplates() {
  try {
    const res = await API.getTemplates();
    const container = document.getElementById('templates-list');
    const select = document.getElementById('email-template-select');
    if (!res.data || res.data.length === 0) {
      container.innerHTML = '<div class="empty-placeholder">No templates yet.</div>';
      return;
    }
    container.innerHTML = res.data.map(t => `
      <div class="contact-card-item">
        <div style="flex:1"><div style="font-weight:600">${escapeHtml(t.name)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${t.category} ${t.mergeFields?.length ? '| Fields: ' + t.mergeFields.join(', ') : ''}</div></div>
        <div style="display:flex;gap:0.4rem">
          <button class="btn btn-sm btn-outline" onclick="useTemplate('${t._id}','${escapeHtml(t.subject)}','${escapeHtml(t.body).replace(/'/g, "\\'")}')">Use</button>
          <button class="btn btn-sm btn-rose" onclick="deleteTemplate('${t._id}')">🗑️</button>
        </div>
      </div>`).join('');

    if (select) {
      select.innerHTML = '<option value="">No template</option>' + res.data.map(t => `<option value="${t._id}">${escapeHtml(t.name)}</option>`).join('');
    }
  } catch (err) { console.error('Templates error:', err); }
}

function applyEmailTemplate() {
  const select = document.getElementById('email-template-select');
  const tplId = select?.value;
  if (!tplId) return;
  API.getTemplates().then(res => {
    const tpl = res.data.find(t => t._id === tplId);
    if (tpl) {
      document.getElementById('email-subject').value = tpl.subject;
      document.getElementById('email-body').value = tpl.body;
    }
  });
}

function useTemplate(id, subject, body) {
  document.getElementById('email-lead-id').value = currentLeadId || '';
  document.getElementById('email-subject').value = subject;
  document.getElementById('email-body').value = body;
  showEmailTab('compose');
  document.querySelectorAll('#section-email .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#section-email .tab-btn')[0].classList.add('active');
}

async function deleteTemplate(id) {
  if (!confirm('Delete template?')) return;
  try { await API.deleteTemplate(id); showToast('Deleted.', 'info'); fetchTemplates(); } catch (err) { showToast(err.message, 'error'); }
}

function showTemplateModal() { document.getElementById('template-modal').classList.add('show'); }

/* ======================== REASSIGN ======================== */
function showReassignModal() {
  if (!currentLeadId) { showToast('No lead selected.', 'error'); return; }
  API.getAllUsers().then(res => {
    const select = document.getElementById('reassign-user-select');
    select.innerHTML = '<option value="">Select user...</option>' +
      (res.data || []).filter(u => u.role === 'salesperson' && u.approved).map(u =>
        `<option value="${u._id}">${escapeHtml(u.name)} (${u.email})</option>`
      ).join('');
  });
  document.getElementById('reassign-modal').classList.add('show');
}

async function submitReassign() {
  const userId = document.getElementById('reassign-user-select').value;
  if (!userId) { showToast('Select a user.', 'error'); return; }
  try {
    await API.reassignLead(currentLeadId, userId);
    showToast('Lead reassigned!', 'success');
    closeModal('reassign-modal');
    refreshDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ======================== CONTACT HOURS ======================== */
async function checkLeadContactHours() {
  if (!currentLeadId) { showToast('No lead selected.', 'error'); return; }
  try {
    const res = await API.checkContactHours(currentLeadId);
    const d = res.data;
    document.getElementById('contact-hours-result').innerHTML = `
      <div style="padding:0.5rem 0.75rem;border-radius:6px;font-size:0.85rem;background:${d.withinHours ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)'};color:${d.withinHours ? 'var(--accent-emerald)' : 'var(--accent-rose)'}">
        ${d.withinHours ? '✅' : '⛔'} ${escapeHtml(d.message)}
      </div>`;
  } catch (err) { showToast(err.message, 'error'); }
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
          ${l.status === 'meeting-booked' ? `<button class="btn btn-sm btn-indigo" onclick="triggerLeadCrmHandoff('${l._id}')" title="Handoff to CRM">🚀 CRM</button>` : ''}
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
        <div style="display:flex;gap:0.4rem;align-items:center">
          <span class="badge badge-${c.status === 'active' ? 'completed' : 'queued'}">${c.status}</span>
          <button class="btn btn-sm btn-outline" onclick="toggleCampaign('${c._id}')" title="${c.status === 'active' ? 'Pause' : 'Resume'}">${c.status === 'active' ? '⏸️' : '▶️'}</button>
          <button class="btn btn-sm btn-outline" onclick="exportCampaignLeads('${c._id}')" title="Export CSV">📥</button>
          <button class="btn btn-sm btn-rose" onclick="deleteCampaign('${c._id}')">🗑️</button>
        </div>
      </div>`).join('');
  } catch (err) { console.error('Campaigns error:', err); }
}

function showCampaignModal() { document.getElementById('campaign-modal').classList.add('show'); }

async function toggleCampaign(id) {
  try {
    await API.toggleCampaign(id);
    showToast('Campaign status toggled!', 'success');
    fetchCampaigns();
  } catch (err) { showToast(err.message, 'error'); }
}

async function exportCampaignLeads(id) {
  try {
    const blob = await API.exportCampaignLeads(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${id}-leads.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

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
    container.innerHTML = res.data.map(a => {
      const channelIcon = a.channel === 'whatsapp' ? '📱' : a.channel === 'sms' ? '💬' : a.channel === 'email' ? '✉️' : a.channel === 'phone' ? '📞' : '';
      return `<div class="contact-card-item" style="align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between"><span style="font-weight:600;font-size:0.9rem">${channelIcon} ${a.action.toUpperCase()} ${a.direction ? `(${a.direction})` : ''}</span><span style="font-size:0.7rem;color:var(--text-muted)">${new Date(a.timestamp).toLocaleString()}</span></div>
          ${a.outcome ? `<div style="font-size:0.8rem;color:var(--accent-cyan)">Outcome: ${a.outcome}</div>` : ''}
          ${a.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">${escapeHtml(a.notes)}</div>` : ''}
          ${a.duration ? `<div style="font-size:0.75rem;color:var(--text-muted)">Duration: ${a.duration}s</div>` : ''}
        </div>
      </div>`;
    }).join('');
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
      <div class="metrics-row">
        <div class="metric-card"><div class="metric-data"><span>Total Leads</span><div class="metric-value">${data.overview?.totalLeads || 0}</div></div><div class="metric-icon icon-indigo">🎯</div></div>
        <div class="metric-card"><div class="metric-data"><span>Contacted</span><div class="metric-value">${data.overview?.totalContacted || 0}</div></div><div class="metric-icon icon-cyan">📞</div></div>
        <div class="metric-card"><div class="metric-data"><span>Booked</span><div class="metric-value">${data.overview?.totalBooked || 0}</div></div><div class="metric-icon icon-emerald">📅</div></div>
        <div class="metric-card"><div class="metric-data"><span>Overall Booking Rate</span><div class="metric-value">${data.overview?.overallBookingRate || '0%'}</div></div><div class="metric-icon icon-rose">📈</div></div>
        <div class="metric-card"><div class="metric-data"><span>Overdue</span><div class="metric-value" style="color:var(--accent-rose)">${data.overview?.totalOverdue || 0}</div></div><div class="metric-icon icon-rose">⚠️</div></div>
      </div>
      ${sp.map(s => `
        <div class="contact-card-item" style="flex-direction:column;align-items:flex-start;gap:0.75rem">
          <div style="display:flex;justify-content:space-between;width:100%">
            <strong>${escapeHtml(s.user.name)}</strong>
            <span style="font-size:0.8rem;color:var(--text-muted)">${s.user.email}</span>
          </div>
          <div style="display:flex;gap:1.5rem;font-size:0.85rem;flex-wrap:wrap">
            <span>Assigned: <strong>${s.metrics.total}</strong></span>
            <span>Contacted: <strong>${s.metrics.contacted}</strong></span>
            <span>Booked: <strong>${s.metrics.booked}</strong></span>
            <span>Booking Rate: <strong>${s.metrics.bookingRate || '0%'}</strong></span>
            <span>Calls Today: <strong>${s.stats.callsToday}</strong></span>
            <span>Calls/Hr: <strong>${s.stats.callsPerHour || 0}</strong></span>
            <span>Active: <strong>${formatSeconds(s.stats.activeTimeSeconds || 0)}</strong></span>
            <span>Break: <strong>${formatSeconds(s.stats.breakTimeSeconds || 0)}</strong></span>
            <span style="color:var(--accent-rose)">Overdue: <strong>${s.metrics.callbacksOverdue}</strong></span>
          </div>
        </div>`).join('')}`;
  } catch (err) { console.error('Team error:', err); }
}

/* ======================== ADMIN ======================== */
/* ======================== ADMIN & USER MANAGEMENT ======================== */
let adminUsersData = [];
let adminPendingUsersData = [];
let currentAdminTab = 'all';
let adminSearchQuery = '';

async function fetchAdminData() {
  try {
    const [allRes, pendingRes] = await Promise.all([
      API.getAllUsers().catch(() => ({ data: [] })),
      API.getPendingUsers().catch(() => ({ data: [] }))
    ]);

    adminUsersData = allRes.data || [];
    adminPendingUsersData = pendingRes.data || [];

    // Calculate stats
    const totalUsers = adminUsersData.length;
    const onlineCount = adminUsersData.filter(u => u.isOnline).length;
    const pendingCount = adminPendingUsersData.length;
    const managerCount = adminUsersData.filter(u => u.role === 'manager' || u.role === 'admin' || u.role === 'owner').length;
    const standardUserCount = adminUsersData.filter(u => u.role === 'salesperson' || u.role === 'user').length;

    // Update stat cards
    const elTotal = document.getElementById('stat-admin-total');
    const elOnline = document.getElementById('stat-admin-online');
    const elPending = document.getElementById('stat-admin-pending');
    const elManagers = document.getElementById('stat-admin-managers');
    if (elTotal) elTotal.textContent = totalUsers;
    if (elOnline) elOnline.textContent = onlineCount;
    if (elPending) elPending.textContent = pendingCount;
    if (elManagers) elManagers.textContent = managerCount;

    // Update tab counters
    const tabAll = document.getElementById('tab-cnt-all');
    const tabOnline = document.getElementById('tab-cnt-online');
    const tabPending = document.getElementById('tab-cnt-pending');
    const tabManagers = document.getElementById('tab-cnt-managers');
    const tabUsers = document.getElementById('tab-cnt-users');
    if (tabAll) tabAll.textContent = totalUsers;
    if (tabOnline) tabOnline.textContent = onlineCount;
    if (tabPending) tabPending.textContent = pendingCount;
    if (tabManagers) tabManagers.textContent = managerCount;
    if (tabUsers) tabUsers.textContent = standardUserCount;

    // Render Pending Section
    const pendingContainer = document.getElementById('pending-users-container');
    const pendingList = document.getElementById('pending-users-list');
    const pendingBadge = document.getElementById('pending-count-badge');

    if (pendingCount > 0) {
      if (pendingContainer) pendingContainer.style.display = 'block';
      if (pendingBadge) pendingBadge.textContent = `${pendingCount} Pending`;
      if (pendingList) {
        pendingList.innerHTML = adminPendingUsersData.map(u => `
          <div class="user-admin-card pending-card">
            <div style="display:flex;align-items:center;gap:0.85rem;min-width:200px">
              <div class="avatar-initial" style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%)">
                ${(u.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-weight:600;font-size:0.95rem;color:var(--text-primary)">${escapeHtml(u.name)}</div>
                <div style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(u.email)}</div>
                <div style="font-size:0.75rem;color:var(--accent-amber);margin-top:2px">
                  Registered: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Recently'}
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
              <select id="role-select-${u._id}" class="input-control" style="padding:0.35rem 0.6rem;font-size:0.8rem;width:auto">
                <option value="salesperson">Role: User / Agent</option>
                <option value="manager">Role: Manager</option>
                <option value="admin">Role: Admin</option>
              </select>
              <button class="btn btn-sm btn-emerald" onclick="approvePendingUser('${u._id}')">✓ Approve</button>
              <button class="btn btn-sm btn-rose" onclick="rejectUser('${u._id}')">✕ Reject</button>
            </div>
          </div>
        `).join('');
      }
    } else {
      if (pendingContainer) pendingContainer.style.display = 'none';
      if (pendingList) pendingList.innerHTML = '';
    }

    renderAdminUsers();
  } catch (err) {
    console.error('Admin fetch error:', err);
    const container = document.getElementById('all-users-list');
    if (container) container.innerHTML = `<div class="empty-placeholder">Error loading users: ${escapeHtml(err.message)}</div>`;
  }
}

function setAdminTab(tab) {
  currentAdminTab = tab;
  document.querySelectorAll('.btn-admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  renderAdminUsers();
}

function filterAdminUsers() {
  const searchInput = document.getElementById('admin-user-search');
  adminSearchQuery = (searchInput ? searchInput.value : '').toLowerCase().trim();
  renderAdminUsers();
}

function formatUserLastSeen(u) {
  if (u.isOnline) {
    return `<span style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--accent-emerald);font-weight:600;font-size:0.75rem">
      <span class="online-pulse-dot"></span> Online Now
    </span>`;
  }
  if (!u.lastActive) {
    return `<span style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--text-muted);font-size:0.75rem">
      <span class="offline-dot"></span> Offline
    </span>`;
  }
  const diffMinutes = Math.floor((Date.now() - new Date(u.lastActive).getTime()) / (60 * 1000));
  if (diffMinutes < 60) {
    return `<span style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--text-secondary);font-size:0.75rem">
      <span class="offline-dot"></span> Last active ${diffMinutes}m ago
    </span>`;
  }
  if (diffMinutes < 1440) {
    const hours = Math.floor(diffMinutes / 60);
    return `<span style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--text-secondary);font-size:0.75rem">
      <span class="offline-dot"></span> Last active ${hours}h ago
    </span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--text-muted);font-size:0.75rem">
    <span class="offline-dot"></span> ${new Date(u.lastActive).toLocaleDateString()}
  </span>`;
}

function renderAdminUsers() {
  const container = document.getElementById('all-users-list');
  if (!container) return;

  let filtered = [...adminUsersData];

  // Apply tab filter
  if (currentAdminTab === 'online') {
    filtered = filtered.filter(u => u.isOnline);
  } else if (currentAdminTab === 'pending') {
    filtered = filtered.filter(u => u.approved === false);
  } else if (currentAdminTab === 'managers') {
    filtered = filtered.filter(u => u.role === 'manager' || u.role === 'admin' || u.role === 'owner');
  } else if (currentAdminTab === 'users') {
    filtered = filtered.filter(u => u.role === 'salesperson' || u.role === 'user');
  }

  // Apply search query
  if (adminSearchQuery) {
    filtered = filtered.filter(u =>
      (u.name || '').toLowerCase().includes(adminSearchQuery) ||
      (u.email || '').toLowerCase().includes(adminSearchQuery) ||
      (u.role || '').toLowerCase().includes(adminSearchQuery)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-placeholder">No users found matching current filters.</div>';
    return;
  }

  container.innerHTML = filtered.map(u => {
    const isSelf = currentUser && currentUser._id === u._id;
    const isPending = u.approved === false;
    const role = u.role || 'salesperson';
    const roleBadgeClass = (role === 'admin' || role === 'owner') ? 'role-badge-admin' : (role === 'manager' ? 'role-badge-manager' : 'role-badge-user');
    const roleLabel = role === 'salesperson' ? 'User / Agent' : role.charAt(0).toUpperCase() + role.slice(1);

    return `
      <div class="user-admin-card ${isPending ? 'pending-card' : ''}">
        <div style="display:flex;align-items:center;gap:0.85rem;min-width:220px;flex:1">
          <div class="avatar-initial" style="${role === 'admin' ? 'background:var(--grad-primary)' : (role === 'manager' ? 'background:var(--grad-cyan)' : 'background:rgba(255,255,255,0.1)')}">
            ${(u.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
              <span style="font-weight:600;font-size:0.95rem;color:var(--text-primary)">${escapeHtml(u.name)}</span>
              ${isSelf ? '<span class="badge" style="font-size:0.65rem;background:rgba(99,102,241,0.2);color:var(--accent-primary)">You</span>' : ''}
              <span class="role-badge ${roleBadgeClass}">${roleLabel}</span>
              ${isPending ? '<span class="badge" style="font-size:0.65rem;background:rgba(245,158,11,0.15);color:var(--accent-amber);border:1px solid rgba(245,158,11,0.3)">Pending Approval</span>' : ''}
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">${escapeHtml(u.email)}</div>
            <div style="margin-top:4px">
              ${formatUserLastSeen(u)}
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;justify-content:flex-end">
          ${isPending ? `
            <button class="btn btn-sm btn-emerald" onclick="approveUser('${u._id}')">✓ Approve</button>
            <button class="btn btn-sm btn-rose" onclick="rejectUser('${u._id}')">✕ Reject</button>
          ` : `
            ${role === 'salesperson' || role === 'user' ? `
              <button class="btn btn-sm btn-cyan" onclick="promoteToManager('${u._id}')" title="Promote to Manager">
                👔 Make Manager
              </button>
            ` : ''}
            ${role === 'manager' ? `
              <button class="btn btn-sm btn-outline" onclick="demoteToUser('${u._id}')" title="Demote to Standard User">
                👤 Demote to User
              </button>
            ` : ''}

            <!-- Quick Role Select Dropdown -->
            <select class="input-control" style="padding:0.35rem 0.6rem;font-size:0.78rem;width:auto" onchange="changeUserRole('${u._id}', this.value)" ${isSelf ? 'disabled title="Cannot change own role"' : ''}>
              <option value="salesperson" ${role === 'salesperson' || role === 'user' ? 'selected' : ''}>User / Agent</option>
              <option value="manager" ${role === 'manager' ? 'selected' : ''}>Manager</option>
              <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>

            ${!isSelf ? `
              <button class="btn btn-sm btn-rose" onclick="rejectUser('${u._id}')" title="Remove User">🗑</button>
            ` : ''}
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function approvePendingUser(id) {
  const roleSelect = document.getElementById(`role-select-${id}`);
  const role = roleSelect ? roleSelect.value : 'salesperson';
  try {
    await API.approveUser(id, role);
    showToast(`User approved as ${role}!`, 'success');
    await fetchAdminData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function approveUser(id) {
  try {
    await API.approveUser(id);
    showToast('User approved successfully!', 'success');
    await fetchAdminData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function rejectUser(id) {
  if (!confirm('Are you sure you want to remove/reject this user?')) return;
  try {
    await API.rejectUser(id);
    showToast('User removed successfully.', 'info');
    await fetchAdminData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function promoteToManager(id) {
  if (!confirm('Promote this user to Manager?')) return;
  try {
    await API.updateUserRole(id, 'manager');
    showToast('User promoted to Manager!', 'success');
    await fetchAdminData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function demoteToUser(id) {
  if (!confirm('Demote this manager to standard User / Agent?')) return;
  try {
    await API.updateUserRole(id, 'salesperson');
    showToast('Role updated to User / Agent.', 'info');
    await fetchAdminData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function changeUserRole(id, newRole) {
  try {
    await API.updateUserRole(id, newRole);
    showToast(`Role updated to ${newRole === 'salesperson' ? 'User' : newRole}!`, 'success');
    await fetchAdminData();
  } catch (err) {
    showToast(err.message, 'error');
    await fetchAdminData();
  }
}

const fetchPendingUsers = fetchAdminData;

/* ======================== WHATSAPP ======================== */
function initWhatsAppActions() {
  const waForm = document.getElementById('form-send-whatsapp');
  const waBody = document.getElementById('wa-body-input');
  const counter = document.getElementById('wa-char-counter');
  if (waBody && counter) waBody.addEventListener('input', () => { counter.textContent = `${waBody.value.length}/1024`; });
  if (waForm) waForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const to = document.getElementById('wa-recipient-input').value.trim();
    const body = waBody.value.trim();
    const leadId = document.getElementById('wa-lead-id').value.trim() || undefined;
    const templateId = document.getElementById('wa-template-select').value || undefined;
    if (!to) { showToast('Enter a phone number.', 'error'); return; }
    if (!body && !templateId) { showToast('Enter a message or select a template.', 'error'); return; }
    try {
      await API.sendWhatsApp({ to, body: body || undefined, leadId, templateId });
      showToast('WhatsApp sent!', 'success');
      waBody.value = '';
      if (counter) counter.textContent = '0/1024';
      refreshDashboard();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function showWhatsAppTab(tab) {
  document.querySelectorAll('#section-whatsapp .tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('wa-compose-tab').style.display = tab === 'compose' ? 'block' : 'none';
  document.getElementById('wa-templates-tab').style.display = tab === 'templates' ? 'block' : 'none';
  document.getElementById('wa-history-tab').style.display = tab === 'history' ? 'block' : 'none';
  if (tab === 'templates') fetchWhatsAppTemplates();
  if (tab === 'history') fetchWhatsAppHistory();
}

function sendWhatsAppFromLead() {
  if (!currentLeadData) { showToast('Open a lead first.', 'error'); return; }
  const phone = currentLeadData.contact?.phone;
  if (!phone) { showToast('Lead has no phone number.', 'error'); return; }
  document.getElementById('wa-recipient-input').value = phone;
  document.getElementById('wa-lead-id').value = currentLeadId || '';
  closeModal('lead-detail-modal');
  switchTab('whatsapp');
  showToast('Lead loaded into WhatsApp station', 'info');
}

async function toggleLeadSuppression(channel) {
  if (!currentLeadId) { showToast('No lead selected.', 'error'); return; }
  try {
    await API.suppressLead(currentLeadId, channel);
    showToast(`${channel} suppression toggled`, 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

function initWhatsAppTemplateActions() {
  const form = document.getElementById('form-create-wa-template');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.createWhatsAppTemplate({
        name: document.getElementById('wa-tpl-name').value.trim(),
        body: document.getElementById('wa-tpl-body').value.trim(),
        category: document.getElementById('wa-tpl-category').value
      });
      showToast('WhatsApp template created!', 'success');
      closeModal('wa-template-modal');
      fetchWhatsAppTemplates();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function fetchWhatsAppTemplates() {
  try {
    const res = await API.getWhatsAppTemplates();
    const container = document.getElementById('wa-templates-list');
    const select = document.getElementById('wa-template-select');
    if (!res.data || res.data.length === 0) {
      if (container) container.innerHTML = '<div class="empty-placeholder">No WhatsApp templates yet.</div>';
      if (select) select.innerHTML = '<option value="">No template</option>';
      return;
    }
    if (container) {
      container.innerHTML = res.data.map(t => `
        <div class="contact-card-item">
          <div style="flex:1"><div style="font-weight:600">${escapeHtml(t.name)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted)">${t.category} ${t.mergeFields?.length ? '| Fields: ' + t.mergeFields.join(', ') : ''}</div></div>
          <div style="display:flex;gap:0.4rem">
            <button class="btn btn-sm btn-outline" onclick="useWhatsAppTemplate('${t._id}','${escapeHtml(t.body).replace(/'/g, "\\'")}')">Use</button>
            <button class="btn btn-sm btn-rose" onclick="deleteWhatsAppTemplate('${t._id}')">🗑️</button>
          </div>
        </div>`).join('');
    }
    if (select) {
      select.innerHTML = '<option value="">No template</option>' + res.data.map(t => `<option value="${t._id}">${escapeHtml(t.name)}</option>`).join('');
    }
  } catch (err) { console.error('WhatsApp templates error:', err); }
}

function applyWhatsAppTemplate() {
  const select = document.getElementById('wa-template-select');
  const tplId = select?.value;
  if (!tplId) return;
  API.getWhatsAppTemplates().then(res => {
    const tpl = res.data.find(t => t._id === tplId);
    if (tpl) {
      document.getElementById('wa-body-input').value = tpl.body;
      const counter = document.getElementById('wa-char-counter');
      if (counter) counter.textContent = `${tpl.body.length}/1024`;
    }
  });
}

function useWhatsAppTemplate(id, body) {
  document.getElementById('wa-body-input').value = body;
  const counter = document.getElementById('wa-char-counter');
  if (counter) counter.textContent = `${body.length}/1024`;
  if (currentLeadId) document.getElementById('wa-lead-id').value = currentLeadId;
  if (currentLeadData?.contact?.phone) document.getElementById('wa-recipient-input').value = currentLeadData.contact.phone;
  showWhatsAppTab('compose');
  document.querySelectorAll('#section-whatsapp .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#section-whatsapp .tab-btn')[0].classList.add('active');
}

async function deleteWhatsAppTemplate(id) {
  if (!confirm('Delete WhatsApp template?')) return;
  try { await API.deleteWhatsAppTemplate(id); showToast('Deleted.', 'info'); fetchWhatsAppTemplates(); } catch (err) { showToast(err.message, 'error'); }
}

function showWhatsAppTemplateModal() { document.getElementById('wa-template-modal').classList.add('show'); }

async function fetchWhatsAppHistory() {
  try {
    const res = await API.getMessages();
    const container = document.getElementById('wa-history-list');
    const waMessages = (res.data || []).filter(m => m.channel === 'whatsapp');
    if (waMessages.length === 0) {
      container.innerHTML = '<div class="empty-placeholder">No WhatsApp messages yet.</div>';
      return;
    }
    container.innerHTML = waMessages.map(m => `
      <div class="contact-card-item" style="align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between">
            <span style="font-weight:600;font-size:0.85rem">${m.direction === 'inbound' ? '📥' : '📤'} ${escapeHtml(m.to || m.from)}</span>
            <span style="font-size:0.7rem;color:var(--text-muted)">${new Date(m.createdAt).toLocaleString()}</span>
          </div>
          <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">${escapeHtml(m.body || '').substring(0, 200)}</div>
          <div style="font-size:0.7rem;margin-top:2px"><span class="badge badge-${m.status === 'sent' || m.status === 'delivered' ? 'completed' : m.status === 'failed' ? 'failed' : 'queued'}">${m.status}</span></div>
        </div>
      </div>`).join('');
  } catch (err) { console.error('WhatsApp history error:', err); }
}

/* ======================== HELPERS ======================== */
function formatSeconds(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function escapeHtml(s) { return (s || '').replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t)); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function dismissAlert(category) {
  const dismissed = JSON.parse(localStorage.getItem('dismissedAlerts') || '[]');
  if (!dismissed.includes(category)) {
    dismissed.push(category);
    localStorage.setItem('dismissedAlerts', JSON.stringify(dismissed));
  }
  const el = document.querySelector(`.alert-item[data-category="${category}"]`);
  if (el) el.remove();
  const remaining = document.querySelectorAll('.alert-item');
  if (remaining.length === 0) {
    document.getElementById('alerts-pill').style.display = 'none';
    const list = document.querySelector('.alerts-list');
    if (list) list.remove();
  } else {
    document.getElementById('alerts-text').textContent = `${remaining.length} alert(s)`;
  }
}

/* ======================== BREAK ACTIONS ======================== */
async function handleToggleBreak() {
  try {
    const res = await API.toggleBreak();
    const { isOnBreak } = res.data;
    const breakBtn = document.getElementById('btn-toggle-break');
    if (breakBtn) {
      if (isOnBreak) {
        breakBtn.innerHTML = '▶ Resume Work';
        breakBtn.className = 'btn btn-sm btn-emerald';
        showToast('Break started. Active work timer paused.', 'info');
      } else {
        breakBtn.innerHTML = '☕ Start Break';
        breakBtn.className = 'btn btn-sm btn-outline';
        showToast('Work resumed!', 'success');
      }
    }
    refreshDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ======================== PROFILE ACTIONS ======================== */
async function openProfileModal() {
  try {
    const res = await API.getMe();
    const user = res.data;
    document.getElementById('prof-calendar-link').value = user.calendarLink || '';
    document.getElementById('prof-crm-webhook').value = user.crmWebhookUrl || '';
    document.getElementById('prof-timezone').value = user.timezone || 'UTC';
    document.getElementById('profile-modal').classList.add('show');
  } catch (err) { showToast(err.message, 'error'); }
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const calendarLink = document.getElementById('prof-calendar-link').value.trim();
  const crmWebhookUrl = document.getElementById('prof-crm-webhook').value.trim();
  const timezone = document.getElementById('prof-timezone').value.trim();

  try {
    await API.updateProfile({ calendarLink, crmWebhookUrl, timezone });
    showToast('Profile settings saved!', 'success');
    closeModal('profile-modal');
    if (currentUser) {
      currentUser.calendarLink = calendarLink;
      currentUser.crmWebhookUrl = crmWebhookUrl;
      currentUser.timezone = timezone;
    }
  } catch (err) { showToast(err.message, 'error'); }
}

/* ======================== CRM HANDOFF ======================== */
async function triggerCurrentLeadCrmHandoff() {
  if (!currentLeadId) { showToast('No lead selected.', 'error'); return; }
  await triggerLeadCrmHandoff(currentLeadId);
}

async function triggerLeadCrmHandoff(leadId) {
  try {
    showToast('Dispatching CRM handoff...', 'info');
    const res = await API.crmHandoff([leadId]);
    showToast(res.message || 'Lead successfully handed off to CRM!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
