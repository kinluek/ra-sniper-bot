// Berlin Ticket Shark - Background Service Worker

console.log('[Berlin Ticket Shark BG] Service worker started');

// ===== TELEGRAM POLLING FOR RESTART COMMANDS =====
const TELEGRAM_POLL_ALARM_NAME = 'telegram-poll';
const TELEGRAM_POLL_INTERVAL_MINUTES = 0.5; // Poll every 30 seconds (0.5 minutes)

// Parse chat IDs from stored string (comma or newline separated)
function parseChatIds(text) {
  if (!text) return [];
  return text
    .split(/[,\n]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

// Poll Telegram for new messages (looking for "restart" command)
async function pollTelegramForRestart() {
  console.log('[Berlin Ticket Shark BG] 🔍 Polling Telegram for restart command...');

  const settings = await chrome.storage.sync.get(['telegramToken', 'telegramChatIds', 'telegramLastUpdateId', 'lastMonitoredUrl', 'telegramPollingActive']);
  const { telegramToken, telegramChatIds, telegramLastUpdateId, lastMonitoredUrl, telegramPollingActive } = settings;

  if (!telegramPollingActive) {
    console.log('[Berlin Ticket Shark BG] Polling not active, stopping alarm');
    await chrome.alarms.clear(TELEGRAM_POLL_ALARM_NAME);
    return;
  }

  const chatIds = parseChatIds(telegramChatIds);
  console.log('[Berlin Ticket Shark BG] Authorized chat IDs:', chatIds);

  if (!telegramToken || chatIds.length === 0) {
    console.log('[Berlin Ticket Shark BG] Telegram not configured for polling');
    return;
  }

  try {
    // Get updates from Telegram (only new ones after lastUpdateId)
    const offset = telegramLastUpdateId ? telegramLastUpdateId + 1 : undefined;
    const url = `https://api.telegram.org/bot${telegramToken}/getUpdates?timeout=5${offset ? `&offset=${offset}` : ''}`;

    console.log('[Berlin Ticket Shark BG] Fetching updates, offset:', offset || 'none');
    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok) {
      console.error('[Berlin Ticket Shark BG] Telegram getUpdates error:', data.description);
      return;
    }

    const updates = data.result || [];
    console.log(`[Berlin Ticket Shark BG] Got ${updates.length} update(s) from Telegram`);

    for (const update of updates) {
      // Store the latest update_id to avoid processing duplicates
      await chrome.storage.sync.set({ telegramLastUpdateId: update.update_id });

      const message = update.message;
      if (!message || !message.text) continue;

      const chatId = String(message.chat.id);
      const text = message.text.toLowerCase().trim();

      console.log(`[Berlin Ticket Shark BG] Message from chat ${chatId}: "${text}"`);
      console.log(`[Berlin Ticket Shark BG] Checking if ${chatId} is in authorized list: ${chatIds.join(', ')}`);

      // Check if message is from an authorized chat and contains "restart"
      if (chatIds.includes(chatId) && text === 'restart') {
        console.log('[Berlin Ticket Shark BG] 🔄 RESTART command received!');

        // Stop polling
        await chrome.storage.sync.set({ telegramPollingActive: false });
        await chrome.alarms.clear(TELEGRAM_POLL_ALARM_NAME);

        // Send confirmation to Telegram
        await sendTelegramReply(chatId, '🔄 Restarting monitoring...\n\nNavigating back to the event page.');

        // Restart the monitoring
        await restartMonitoring(lastMonitoredUrl);
        return;
      }
    }
  } catch (error) {
    console.error('[Berlin Ticket Shark BG] Telegram polling error:', error);
  }
}

// Send a reply message to a specific Telegram chat
async function sendTelegramReply(chatId, text) {
  const settings = await chrome.storage.sync.get(['telegramToken']);
  const { telegramToken } = settings;

  if (!telegramToken) return;

  try {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    console.log(`[Berlin Ticket Shark BG] Reply sent to ${chatId}`);
  } catch (error) {
    console.error('[Berlin Ticket Shark BG] Error sending reply:', error);
  }
}

// Start polling for Telegram restart commands using chrome.alarms
async function startTelegramPolling() {
  const settings = await chrome.storage.sync.get(['telegramPollingActive']);

  if (settings.telegramPollingActive) {
    console.log('[Berlin Ticket Shark BG] Telegram polling already active');
    return;
  }

  console.log('[Berlin Ticket Shark BG] 👂 Starting Telegram polling for restart commands...');

  // Store polling state in storage (survives service worker sleep)
  await chrome.storage.sync.set({ telegramPollingActive: true });

  // Create a repeating alarm that wakes up the service worker
  await chrome.alarms.create(TELEGRAM_POLL_ALARM_NAME, {
    delayInMinutes: 0.1, // First poll in 6 seconds
    periodInMinutes: TELEGRAM_POLL_INTERVAL_MINUTES // Then every 30 seconds
  });

  console.log('[Berlin Ticket Shark BG] Alarm created for Telegram polling');

  // Also do an immediate poll
  pollTelegramForRestart();
}

// Stop polling for Telegram restart commands
async function stopTelegramPolling() {
  console.log('[Berlin Ticket Shark BG] Stopping Telegram polling');
  await chrome.storage.sync.set({ telegramPollingActive: false });
  await chrome.alarms.clear(TELEGRAM_POLL_ALARM_NAME);
}

// Restart monitoring by navigating to the event page and starting monitoring
async function restartMonitoring(url) {
  if (!url) {
    console.error('[Berlin Ticket Shark BG] No URL stored for restart');
    return;
  }

  console.log('[Berlin Ticket Shark BG] Restarting monitoring at:', url);

  // Set monitoring state
  await chrome.storage.sync.set({ isMonitoring: true });

  // Find existing tab with the RA event or create new one
  const tabs = await chrome.tabs.query({ url: 'https://ra.co/events/*' });

  if (tabs.length > 0) {
    // Use existing tab - reload it
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { url: url, active: true });
    console.log('[Berlin Ticket Shark BG] Reloading existing RA tab');
  } else {
    // Create new tab
    await chrome.tabs.create({ url: url, active: true });
    console.log('[Berlin Ticket Shark BG] Created new tab for RA event');
  }
}

// Send Telegram notification to all configured chat IDs
async function sendTelegramNotification(ticket, price, url) {
  const settings = await chrome.storage.sync.get(['telegramToken', 'telegramChatIds']);
  const { telegramToken, telegramChatIds } = settings;

  const chatIds = parseChatIds(telegramChatIds);

  if (!telegramToken || chatIds.length === 0) {
    console.log('[Berlin Ticket Shark BG] Telegram not configured');
    return;
  }

  const message = `
🦈 <b>TICKET AVAILABLE!</b>

<b>Ticket:</b> ${ticket}
<b>Price:</b> ${price}

<a href="${url}">🔗 Open Event Page</a>

⚡ Go grab it now!

💬 Reply <b>restart</b> to start monitoring again
  `.trim();

  console.log(`[Berlin Ticket Shark BG] Sending Telegram to ${chatIds.length} chat(s)...`);

  for (const chatId of chatIds) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        })
      });

      const data = await response.json();
      if (data.ok) {
        console.log(`[Berlin Ticket Shark BG] Telegram sent to ${chatId}`);
      } else {
        console.error(`[Berlin Ticket Shark BG] Telegram error for ${chatId}:`, data.description);
      }
    } catch (error) {
      console.error(`[Berlin Ticket Shark BG] Telegram fetch error for ${chatId}:`, error);
    }
  }
}

// Send Telegram notification for auto-pay
async function sendAutoPayNotification(url) {
  const settings = await chrome.storage.sync.get(['telegramToken', 'telegramChatIds']);
  const { telegramToken, telegramChatIds } = settings;

  const chatIds = parseChatIds(telegramChatIds);

  if (!telegramToken || chatIds.length === 0) {
    return;
  }

  const message = `
💳 <b>AUTO-PAY TRIGGERED!</b>

The "Pay now" button was clicked automatically.

<a href="${url}">🔗 View Payment Page</a>

Check your email for confirmation!

💬 Reply <b>restart</b> to buy another ticket
  `.trim();

  for (const chatId of chatIds) {
    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
    } catch (error) {
      console.error(`[Berlin Ticket Shark BG] Auto-pay notification error:`, error);
    }
  }
}

// Show Chrome notification
async function showNotification(ticket, price) {
  try {
    await chrome.notifications.create('ra-ticket-found', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '🦈 Ticket Available!',
      message: `${ticket}\n${price}`,
      priority: 2,
      requireInteraction: true
    });
    console.log('[Berlin Ticket Shark BG] Chrome notification shown');
  } catch (error) {
    console.error('[Berlin Ticket Shark BG] Notification error:', error);
  }
}

// Play alert sound using offscreen document
async function playAlertSound() {
  const settings = await chrome.storage.sync.get(['soundEnabled']);
  if (!settings.soundEnabled) return;

  // We'll use a workaround since service workers can't play audio directly
  // The content script will handle the actual sound
  console.log('[Berlin Ticket Shark BG] Sound alert triggered (handled by content script)');
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Berlin Ticket Shark BG] Received message:', message.type);

  if (message.type === 'TICKET_FOUND') {
    console.log('[Berlin Ticket Shark BG] 🎉 TICKET FOUND!', message);

    // Send notifications
    showNotification(message.ticket, message.price);
    sendTelegramNotification(message.ticket, message.price, message.url);

    // Update storage (keep lastMonitoredUrl for restart)
    chrome.storage.sync.set({
      isMonitoring: false,
      lastFoundTicket: {
        ticket: message.ticket,
        price: message.price,
        url: message.url,
        timestamp: Date.now()
      }
    });

    // Start listening for "restart" command via Telegram
    startTelegramPolling();
  }

  if (message.type === 'STATUS_UPDATE') {
    // Broadcast to popup if open
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might not be open, that's fine
    });
  }

  if (message.type === 'START_MONITORING') {
    console.log('[Berlin Ticket Shark BG] Monitoring started');
    chrome.storage.sync.set({ isMonitoring: true });
    // Stop polling since we're actively monitoring now
    stopTelegramPolling();
  }

  if (message.type === 'STOP_MONITORING') {
    console.log('[Berlin Ticket Shark BG] Monitoring stopped');
    chrome.storage.sync.set({ isMonitoring: false });
  }

  if (message.type === 'AUTO_PAY_CLICKED') {
    console.log('[Berlin Ticket Shark BG] 💳 Auto-pay clicked!');

    // Send Telegram notification about auto-pay
    sendAutoPayNotification(message.url);

    // Show Chrome notification
    chrome.notifications.create('ra-auto-pay', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '💳 Auto-Pay Triggered!',
      message: 'Pay now button was clicked automatically',
      priority: 2
    });

    // Start listening for "restart" command via Telegram
    startTelegramPolling();
  }

  sendResponse({ received: true });
  return true;
});

// Handle notification click
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === 'ra-ticket-found') {
    const settings = await chrome.storage.sync.get(['lastFoundTicket']);
    if (settings.lastFoundTicket?.url) {
      chrome.tabs.create({ url: settings.lastFoundTicket.url });
    }
    chrome.notifications.clear(notificationId);
  }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Berlin Ticket Shark BG] Extension installed/updated:', details.reason);

  // Set default settings
  chrome.storage.sync.get(null).then(existing => {
    const defaults = {
      targetTicket: '',
      refreshInterval: 30,
      autoBuy: false,
      soundEnabled: true,
      telegramToken: '',
      telegramChatIds: '',
      isMonitoring: false,
      lastMonitoredUrl: '',
      telegramLastUpdateId: 0,
      telegramPollingActive: false
    };

    // Only set defaults for missing keys
    const toSet = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (existing[key] === undefined) {
        toSet[key] = value;
      }
    }

    if (Object.keys(toSet).length > 0) {
      chrome.storage.sync.set(toSet);
    }
  });
});

// Handle alarms (for Telegram polling)
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('[Berlin Ticket Shark BG] ⏰ Alarm triggered:', alarm.name);

  if (alarm.name === TELEGRAM_POLL_ALARM_NAME) {
    pollTelegramForRestart();
  }
});

// Check if polling should be active on service worker startup (in case it was sleeping)
chrome.storage.sync.get(['telegramPollingActive']).then(({ telegramPollingActive }) => {
  if (telegramPollingActive) {
    console.log('[Berlin Ticket Shark BG] Service worker woke up, polling was active - checking alarm');
    chrome.alarms.get(TELEGRAM_POLL_ALARM_NAME).then((alarm) => {
      if (!alarm) {
        console.log('[Berlin Ticket Shark BG] Alarm was missing, recreating...');
        chrome.alarms.create(TELEGRAM_POLL_ALARM_NAME, {
          delayInMinutes: 0.1,
          periodInMinutes: TELEGRAM_POLL_INTERVAL_MINUTES
        });
      }
    });
  }
});
