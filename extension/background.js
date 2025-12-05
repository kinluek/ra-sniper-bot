// Berlin Ticket Shark - Background Service Worker

console.log('[Berlin Ticket Shark BG] Service worker started');

// Parse chat IDs from stored string (comma or newline separated)
function parseChatIds(text) {
  if (!text) return [];
  return text
    .split(/[,\n]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0);
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

    // Update storage
    chrome.storage.sync.set({
      isMonitoring: false,
      lastFoundTicket: {
        ticket: message.ticket,
        price: message.price,
        url: message.url,
        timestamp: Date.now()
      }
    });
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
  }

  if (message.type === 'STOP_MONITORING') {
    console.log('[Berlin Ticket Shark BG] Monitoring stopped');
    chrome.storage.sync.set({ isMonitoring: false });
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
      isMonitoring: false
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
