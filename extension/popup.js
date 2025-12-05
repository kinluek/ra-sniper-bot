// DOM Elements
const targetTicketInput = document.getElementById('targetTicket');
const refreshIntervalInput = document.getElementById('refreshInterval');
const intervalValueSpan = document.getElementById('intervalValue');
const autoBuyCheckbox = document.getElementById('autoBuy');
const soundEnabledCheckbox = document.getElementById('soundEnabled');
const telegramTokenInput = document.getElementById('telegramToken');
const telegramChatIdsInput = document.getElementById('telegramChatIds');
const testTelegramBtn = document.getElementById('testTelegram');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const statusText = statusDiv.querySelector('.status-text');
const lastCheckP = document.getElementById('lastCheck');

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    targetTicket: '',
    refreshInterval: 30,
    autoBuy: false,
    soundEnabled: true,
    telegramToken: '',
    telegramChatIds: '',
    isMonitoring: false,
    lastCheck: null
  });

  targetTicketInput.value = settings.targetTicket;
  refreshIntervalInput.value = settings.refreshInterval;
  intervalValueSpan.textContent = settings.refreshInterval;
  autoBuyCheckbox.checked = settings.autoBuy;
  soundEnabledCheckbox.checked = settings.soundEnabled;
  telegramTokenInput.value = settings.telegramToken;
  telegramChatIdsInput.value = settings.telegramChatIds;

  updateStatus(settings.isMonitoring ? 'monitoring' : 'idle');
  updateButtons(settings.isMonitoring);

  if (settings.lastCheck) {
    lastCheckP.textContent = `Last check: ${new Date(settings.lastCheck).toLocaleTimeString()}`;
  }
}

// Save settings
async function saveSettings() {
  await chrome.storage.sync.set({
    targetTicket: targetTicketInput.value,
    refreshInterval: parseInt(refreshIntervalInput.value),
    autoBuy: autoBuyCheckbox.checked,
    soundEnabled: soundEnabledCheckbox.checked,
    telegramToken: telegramTokenInput.value,
    telegramChatIds: telegramChatIdsInput.value
  });
}

// Update status display
function updateStatus(state) {
  statusDiv.className = `status ${state}`;
  const states = {
    idle: 'Idle',
    monitoring: 'Monitoring...',
    found: 'TICKET FOUND!',
    error: 'Error'
  };
  statusText.textContent = states[state] || state;
}

// Update button states
function updateButtons(isMonitoring) {
  startBtn.disabled = isMonitoring;
  stopBtn.disabled = !isMonitoring;
}

// Event Listeners
refreshIntervalInput.addEventListener('input', () => {
  intervalValueSpan.textContent = refreshIntervalInput.value;
  saveSettings();
});

[targetTicketInput, autoBuyCheckbox, soundEnabledCheckbox, telegramTokenInput, telegramChatIdsInput].forEach(el => {
  el.addEventListener('change', saveSettings);
});

// Start monitoring
startBtn.addEventListener('click', async () => {
  if (!targetTicketInput.value.trim()) {
    alert('Please enter a target ticket type');
    return;
  }

  await saveSettings();
  await chrome.storage.sync.set({ isMonitoring: true });

  // Send message to background script to start
  chrome.runtime.sendMessage({ type: 'START_MONITORING' });

  // Also send to active tab's content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes('ra.co/events')) {
    chrome.tabs.sendMessage(tab.id, { type: 'START_MONITORING' });
  }

  updateStatus('monitoring');
  updateButtons(true);
});

// Stop monitoring
stopBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set({ isMonitoring: false });

  chrome.runtime.sendMessage({ type: 'STOP_MONITORING' });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes('ra.co/events')) {
    chrome.tabs.sendMessage(tab.id, { type: 'STOP_MONITORING' });
  }

  updateStatus('idle');
  updateButtons(false);
});

// Parse chat IDs from textarea (comma or newline separated)
function parseChatIds(text) {
  return text
    .split(/[,\n]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

// Test Telegram
testTelegramBtn.addEventListener('click', async () => {
  const token = telegramTokenInput.value.trim();
  const chatIds = parseChatIds(telegramChatIdsInput.value);

  if (!token || chatIds.length === 0) {
    alert('Please enter both Bot Token and at least one Chat ID');
    return;
  }

  testTelegramBtn.disabled = true;
  testTelegramBtn.textContent = 'Testing...';

  const results = [];

  for (const chatId of chatIds) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ Berlin Ticket Shark connected successfully!\n\nYou will receive notifications here when tickets become available.',
          parse_mode: 'HTML'
        })
      });

      const data = await response.json();

      if (data.ok) {
        results.push({ chatId, success: true });
      } else {
        results.push({ chatId, success: false, error: data.description });
      }
    } catch (error) {
      results.push({ chatId, success: false, error: error.message });
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success);

  if (failed.length === 0) {
    alert(`Success! Sent test message to ${successful} chat(s).`);
    await saveSettings();
  } else {
    const failedMsg = failed.map(f => `${f.chatId}: ${f.error}`).join('\n');
    alert(`Sent to ${successful}/${chatIds.length} chats.\n\nFailed:\n${failedMsg}`);
  }

  testTelegramBtn.disabled = false;
  testTelegramBtn.textContent = 'Test Telegram';
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATUS_UPDATE') {
    updateStatus(message.status);
    if (message.lastCheck) {
      lastCheckP.textContent = `Last check: ${new Date(message.lastCheck).toLocaleTimeString()}`;
    }
  }
  if (message.type === 'TICKET_FOUND') {
    updateStatus('found');
  }
});

// Initialize
loadSettings();
