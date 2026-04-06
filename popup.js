// popup.js

let currentTicketId = null;
let saveTimeout = null;

// ─── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

    if (btn.dataset.tab === 'recent') loadRecentTickets();
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Safely get from chrome.storage.local (returns {} on error)
function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('storage.get error:', chrome.runtime.lastError.message);
          resolve({});
        } else {
          resolve(result || {});
        }
      });
    } catch (e) {
      console.warn('storage.get exception:', e);
      resolve({});
    }
  });
}

// Safely set in chrome.storage.local
function storageSet(obj) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) {
          console.warn('storage.set error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (e) {
      console.warn('storage.set exception:', e);
      resolve();
    }
  });
}

// Extract a Jira ticket ID from a URL string
function extractTicketId(url) {
  if (!url) return null;
  const m = url.match(/\/browse\/([A-Z]+-\d+)/i)
           || url.match(/atlassian\.net.*?\/([A-Z]+-\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

// ─── Init current ticket ─────────────────────────────────────────────────────
async function init() {
  let tab = null;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs && tabs[0];
  } catch (e) {
    console.warn('tabs.query failed:', e);
  }

  // Island browser may not expose tab.url even with "tabs" permission in some
  // configurations. Fallback: try chrome.tabs.get which can surface the URL
  // when activeTab has been granted by the popup click.
  let tabUrl = tab && tab.url;

  if (!tabUrl && tab && tab.id) {
    try {
      const fullTab = await chrome.tabs.get(tab.id);
      tabUrl = fullTab && fullTab.url;
    } catch (e) {
      console.warn('tabs.get fallback failed:', e);
    }
  }

  if (!tabUrl) {
    showNoTicket();
    return;
  }

  const ticketId = extractTicketId(tabUrl);
  if (!ticketId) {
    showNoTicket();
    return;
  }

  currentTicketId = ticketId;
  const key = `ticket_${currentTicketId}`;
  const result = await storageGet([key]);

  if (result[key]) {
    showTicket(result[key]);
  } else {
    showTicket({
      ticketId: currentTicketId,
      url: tabUrl,
      title: 'Loading ticket info…',
      notes: '',
      progress: 'not-started'
    });
  }
}

function showNoTicket() {
  document.getElementById('no-ticket').style.display = 'flex';
  document.getElementById('ticket-panel').style.display = 'none';
}

function showTicket(ticket) {
  document.getElementById('no-ticket').style.display = 'none';
  const panel = document.getElementById('ticket-panel');
  panel.style.display = 'block';

  const idLink = document.getElementById('ticket-id');
  idLink.textContent = ticket.ticketId || '';
  idLink.href = ticket.url || '#';

  const statusBadge = document.getElementById('ticket-status');
  statusBadge.textContent = ticket.status || 'Unknown';
  statusBadge.style.display = ticket.status ? '' : 'none';

  document.getElementById('ticket-title').textContent = ticket.title || 'No title captured yet';

  const metaAssignee = document.getElementById('meta-assignee');
  const metaPriority = document.getElementById('meta-priority');
  const metaPoints = document.getElementById('meta-points');

  if (ticket.assignee) {
    metaAssignee.style.display = 'flex';
    document.getElementById('assignee-text').textContent = ticket.assignee;
  } else {
    metaAssignee.style.display = 'none';
  }

  if (ticket.priority) {
    metaPriority.style.display = 'flex';
    document.getElementById('priority-text').textContent = ticket.priority;
  } else {
    metaPriority.style.display = 'none';
  }

  if (ticket.storyPoints) {
    metaPoints.style.display = 'flex';
    document.getElementById('points-text').textContent = ticket.storyPoints + ' pts';
  } else {
    metaPoints.style.display = 'none';
  }

  document.getElementById('ticket-notes').value = ticket.notes || '';
  setProgressUI(ticket.progress || 'not-started');

  if (ticket.lastVisited) {
    document.getElementById('last-visited-text').textContent =
      'Last visited: ' + timeAgo(ticket.lastVisited);
  }
}

// ─── Progress buttons ─────────────────────────────────────────────────────────
document.querySelectorAll('.progress-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentTicketId) return;
    const value = btn.dataset.value;
    setProgressUI(value);
    saveField('progress', value);
  });
});

function setProgressUI(value) {
  document.querySelectorAll('.progress-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === value);
  });
}

// ─── Save notes ───────────────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  if (!currentTicketId) return;
  const notes = document.getElementById('ticket-notes').value;
  saveField('notes', notes);
  showSaved();
});

document.getElementById('ticket-notes').addEventListener('input', () => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (!currentTicketId) return;
    const notes = document.getElementById('ticket-notes').value;
    saveField('notes', notes);
    showSaved();
  }, 1500);
});

async function saveField(field, value) {
  const key = `ticket_${currentTicketId}`;
  const result = await storageGet([key]);
  const ticket = result[key] || { ticketId: currentTicketId };
  ticket[field] = value;
  await storageSet({ [key]: ticket });
}

function showSaved() {
  const el = document.getElementById('save-status');
  el.textContent = '✓ Saved';
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

// ─── Recent tickets ───────────────────────────────────────────────────────────
async function loadRecentTickets() {
  const r = await storageGet(['recentTickets']);
  const recent = r.recentTickets || [];

  if (recent.length === 0) {
    document.getElementById('recent-empty').style.display = 'flex';
    document.getElementById('recent-list').innerHTML = '';
    return;
  }

  document.getElementById('recent-empty').style.display = 'none';
  const keys = recent.map(id => `ticket_${id}`);
  const result = await storageGet(keys);

  const list = document.getElementById('recent-list');
  list.innerHTML = '';

  recent.forEach(id => {
    const ticket = result[`ticket_${id}`];
    if (!ticket) return;

    const item = document.createElement('a');
    item.className = 'recent-item';
    item.href = ticket.url || '#';
    item.target = '_blank';

    const progress = ticket.progress || 'not-started';
    const progressLabel = {
      'not-started': 'Not Started',
      'in-progress': 'In Progress',
      'blocked': 'Blocked',
      'done': 'Done'
    }[progress] || progress;

    item.innerHTML = `
      <div class="recent-item-header">
        <span class="recent-ticket-id">${ticket.ticketId}</span>
        <span class="recent-progress progress-${progress}">${progressLabel}</span>
      </div>
      <div class="recent-title">${ticket.title || 'No title'}</div>
      <div class="recent-meta">${ticket.status ? ticket.status + ' · ' : ''}${timeAgo(ticket.lastVisited)}</div>
    `;
    list.appendChild(item);
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();
