/**
 * Enterprise Telecommunications Dashboard Logic
 */

let callTimerInterval = null;
let secondsElapsed = 0;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verify Authentication
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  // Load User Profile
  loadUserProfile();

  // 2. Initialize Navigation & Interactivity
  initSidebarNavigation();
  initDialpad();
  initCallActions();
  initSmsActions();
  initContactActions();

  // 3. Data Fetching
  await refreshDashboard();

  // Periodic polling every 8 seconds for background webhook updates
  setInterval(refreshDashboard, 8000);
});

/**
 * Load authenticated user profile
 */
async function loadUserProfile() {
  try {
    const res = await API.getMe();
    const user = res.data;
    document.getElementById('user-name-display').textContent = user.name;
    document.getElementById('user-email-display').textContent = user.email;
    document.getElementById('user-avatar-initial').textContent = user.name.charAt(0).toUpperCase();
  } catch (err) {
    console.error('Profile fetch error:', err);
  }
}

/**
 * Sidebar Tab Navigation Switcher
 */
function initSidebarNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const targetSectionId = item.getAttribute('data-section');
      if (targetSectionId && targetSectionId !== 'overview') {
        const elem = document.getElementById(`section-${targetSectionId}`);
        if (elem) {
          elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

/**
 * Refresh call history, SMS logs, contacts, and statistics
 */
async function refreshDashboard() {
  await Promise.all([
    fetchCallHistory(),
    fetchSmsHistory(),
    fetchContacts()
  ]);
}

/* ==========================================================================
   CALLING CONTROLLER
   ========================================================================== */

function initDialpad() {
  const phoneInput = document.getElementById('call-phone-input');
  const dialButtons = document.querySelectorAll('.num-btn');
  const clearBtn = document.getElementById('clear-phone-btn');

  dialButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const digit = btn.getAttribute('data-digit');
      if (digit) {
        phoneInput.value += digit;
      }
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      phoneInput.value = '';
    });
  }
}

function initCallActions() {
  const callBtn = document.getElementById('btn-make-call');
  const endCallBtn = document.getElementById('btn-end-call');
  const phoneInput = document.getElementById('call-phone-input');

  if (callBtn) {
    callBtn.addEventListener('click', async () => {
      const phone = phoneInput.value.trim();
      if (!phone) {
        showToast('Please enter a destination phone number.', 'error');
        return;
      }

      try {
        updateCallStatus('Initiating Call...', 'ringing');
        callBtn.disabled = true;

        const res = await API.makeCall(phone);
        showToast(`Call initiated to ${phone}! SID: ${res.data.callSid.substring(0, 10)}...`, 'success');

        updateCallStatus('Connected / Active', 'active');
        startCallTimer();

        if (endCallBtn) endCallBtn.style.display = 'inline-flex';

        setTimeout(fetchCallHistory, 1200);
      } catch (err) {
        updateCallStatus('Failed / Config Check', 'failed');
        showToast(err.message, 'error');
        callBtn.disabled = false;
      }
    });
  }

  if (endCallBtn) {
    endCallBtn.addEventListener('click', () => {
      stopCallTimer();
      updateCallStatus('Status: Ready', 'ready');
      callBtn.disabled = false;
      endCallBtn.style.display = 'none';
      showToast('Call session terminated.', 'info');
      fetchCallHistory();
    });
  }
}

function updateCallStatus(statusText, stateClass = 'ready') {
  const statusLabel = document.getElementById('call-status-label');
  const statusDot = document.getElementById('call-status-dot');

  if (statusLabel) statusLabel.textContent = statusText;
  if (statusDot) {
    statusDot.className = 'status-dot';
    if (stateClass === 'active') statusDot.classList.add('active');
    if (stateClass === 'ringing') statusDot.classList.add('ringing');
    if (stateClass === 'failed') statusDot.classList.add('failed');
  }
}

function startCallTimer() {
  stopCallTimer();
  secondsElapsed = 0;
  const timerDisplay = document.getElementById('call-timer-display');
  
  callTimerInterval = setInterval(() => {
    secondsElapsed++;
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
    const secs = String(secondsElapsed % 60).padStart(2, '0');
    if (timerDisplay) timerDisplay.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
}

/* ==========================================================================
   SMS CONTROLLER
   ========================================================================== */

function initSmsActions() {
  const smsForm = document.getElementById('form-send-sms');
  const smsBody = document.getElementById('sms-body-input');
  const charCounter = document.getElementById('sms-char-counter');

  if (smsBody && charCounter) {
    smsBody.addEventListener('input', () => {
      const len = smsBody.value.length;
      const segments = Math.ceil(len / 160) || 1;
      charCounter.textContent = `${len} / 160 chars (${segments} Segment${segments > 1 ? 's' : ''})`;
    });
  }

  if (smsForm) {
    smsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const recipient = document.getElementById('sms-recipient-input').value.trim();
      const body = smsBody.value.trim();
      const sendBtn = smsForm.querySelector('button[type="submit"]');

      if (!recipient || !body) {
        showToast('Please provide recipient phone and message content.', 'error');
        return;
      }

      try {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Dispatching...';

        const res = await API.sendMessage(recipient, body);
        showToast('SMS message dispatched successfully!', 'success');

        smsBody.value = '';
        if (charCounter) charCounter.textContent = '0 / 160 chars (1 Segment)';
        
        await fetchSmsHistory();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '✉️ DISPATCH SMS';
      }
    });
  }
}

/* ==========================================================================
   LOGS & DATA FETCHING
   ========================================================================== */

async function fetchCallHistory() {
  try {
    const res = await API.getCalls();
    const calls = res.data;
    const tableBody = document.getElementById('call-history-tbody');
    const statCallCount = document.getElementById('stat-total-calls');

    if (statCallCount) statCallCount.textContent = calls.length;

    if (!tableBody) return;

    if (calls.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="empty-placeholder">No call activity recorded yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = calls.map(call => {
      const durationFormatted = formatSeconds(call.duration || 0);
      const dateFormatted = new Date(call.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      let badgeClass = 'badge-queued';
      if (call.status === 'completed') badgeClass = 'badge-completed';
      if (['failed', 'busy', 'no-answer', 'canceled'].includes(call.status)) badgeClass = 'badge-failed';
      if (call.status === 'in-progress' || call.status === 'ringing') badgeClass = 'badge-ringing';

      return `
        <tr>
          <td><strong>${call.to}</strong></td>
          <td><span class="badge ${badgeClass}">${call.status}</span></td>
          <td>${durationFormatted}</td>
          <td>${call.recordingUrl ? `<button class="btn btn-sm btn-outline" onclick="playRecording('${call.recordingUrl}.mp3')">Play</button>` : '<span style="color: var(--text-muted); font-size: 0.8rem;">—</span>'}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${dateFormatted}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Call logs fetch error:', err);
  }
}

async function fetchSmsHistory() {
  try {
    const res = await API.getMessages();
    const messages = res.data;
    const smsContainer = document.getElementById('sms-history-list');
    const statSmsCount = document.getElementById('stat-total-sms');

    if (statSmsCount) statSmsCount.textContent = messages.length;

    if (!smsContainer) return;

    if (messages.length === 0) {
      smsContainer.innerHTML = `<div class="empty-placeholder">No SMS history recorded yet.</div>`;
      return;
    }

    smsContainer.innerHTML = messages.map(msg => {
      const dateFormatted = new Date(msg.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      let badgeClass = 'badge-queued';
      if (msg.status === 'delivered' || msg.status === 'sent') badgeClass = 'badge-delivered';
      if (msg.status === 'failed') badgeClass = 'badge-failed';

      return `
        <div class="contact-card-item" style="align-items: flex-start;">
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-weight: 600; font-size: 0.9rem;">To: ${msg.to}</span>
              <span class="badge ${badgeClass}">${msg.status}</span>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 4px;">"${escapeHtml(msg.body)}"</p>
            <span style="color: var(--text-muted); font-size: 0.75rem;">${dateFormatted}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('SMS logs fetch error:', err);
  }
}

/* ==========================================================================
   CONTACTS CONTROLLER
   ========================================================================== */

function initContactActions() {
  const addBtn = document.getElementById('btn-open-contact-modal');
  const modal = document.getElementById('contact-modal');
  const closeModalBtn = document.getElementById('btn-close-contact-modal');
  const contactForm = document.getElementById('form-save-contact');

  if (addBtn && modal) {
    addBtn.addEventListener('click', () => {
      document.getElementById('contact-modal-title').textContent = 'Add New Contact';
      document.getElementById('contact-id-input').value = '';
      document.getElementById('contact-name-input').value = '';
      document.getElementById('contact-phone-input').value = '';
      modal.classList.add('show');
    });
  }

  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }

  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('contact-id-input').value;
      const name = document.getElementById('contact-name-input').value.trim();
      const phone = document.getElementById('contact-phone-input').value.trim();

      try {
        if (id) {
          await API.updateContact(id, name, phone);
          showToast('Contact updated successfully.', 'success');
        } else {
          await API.createContact(name, phone);
          showToast('Contact added successfully.', 'success');
        }

        modal.classList.remove('show');
        await fetchContacts();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

async function fetchContacts() {
  try {
    const res = await API.getContacts();
    const contacts = res.data;
    const contactList = document.getElementById('contacts-list-container');
    const statContactCount = document.getElementById('stat-total-contacts');

    if (statContactCount) statContactCount.textContent = contacts.length;

    if (!contactList) return;

    if (contacts.length === 0) {
      contactList.innerHTML = `<div class="empty-placeholder">No contacts saved yet. Click "+ Add Contact" to get started.</div>`;
      return;
    }

    contactList.innerHTML = contacts.map(c => `
      <div class="contact-card-item">
        <div style="display: flex; align-items: center; gap: 0.85rem;">
          <div class="avatar-initial">${c.name.charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight: 600; font-size: 0.95rem;">${escapeHtml(c.name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${c.phone}</div>
          </div>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-sm btn-emerald" onclick="quickCall('${c.phone}')" title="Call Number">📞 Call</button>
          <button class="btn btn-sm btn-outline" onclick="quickSms('${c.phone}')" title="Send SMS">💬 SMS</button>
          <button class="btn btn-sm btn-outline" onclick="editContact('${c._id}', '${escapeHtml(c.name)}', '${c.phone}')" title="Edit">✏️</button>
          <button class="btn btn-sm btn-rose" onclick="deleteContact('${c._id}')" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Contacts fetch error:', err);
  }
}

function quickCall(phone) {
  const callInput = document.getElementById('call-phone-input');
  if (callInput) {
    callInput.value = phone;
    callInput.scrollIntoView({ behavior: 'smooth' });
    showToast(`Number ${phone} loaded into Call Station.`, 'info');
  }
}

function quickSms(phone) {
  const smsInput = document.getElementById('sms-recipient-input');
  if (smsInput) {
    smsInput.value = phone;
    smsInput.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('sms-body-input').focus();
    showToast(`Recipient ${phone} loaded into SMS Station.`, 'info');
  }
}

function editContact(id, name, phone) {
  document.getElementById('contact-modal-title').textContent = 'Edit Contact';
  document.getElementById('contact-id-input').value = id;
  document.getElementById('contact-name-input').value = name;
  document.getElementById('contact-phone-input').value = phone;
  document.getElementById('contact-modal').classList.add('show');
}

async function deleteContact(id) {
  if (confirm('Are you sure you want to delete this contact record?')) {
    try {
      await API.deleteContact(id);
      showToast('Contact deleted.', 'info');
      await fetchContacts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

// Helpers
function formatSeconds(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function playRecording(url) {
  const audio = new Audio(url);
  audio.play().catch(err => {
    showToast('Could not play recording. It may still be processing.', 'error');
  });
  showToast('Playing recording...', 'info');
}
