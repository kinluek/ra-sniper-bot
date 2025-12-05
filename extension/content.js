// Berlin Ticket Shark - Content Script
// Runs on ra.co/events/* pages

let isMonitoring = false;
let refreshTimeout = null;
let settings = {};

// Initialize when page loads
async function init() {
  console.log('[Berlin Ticket Shark] Content script loaded on:', window.location.href);

  // Load settings
  settings = await chrome.storage.sync.get({
    targetTicket: '',
    refreshInterval: 30,
    autoBuy: false,
    soundEnabled: true,
    isMonitoring: false
  });

  console.log('[Berlin Ticket Shark] Settings:', settings);

  // Show indicator on page
  showStatusIndicator();

  if (settings.isMonitoring && settings.targetTicket) {
    console.log('[Berlin Ticket Shark] Auto-starting monitoring...');
    startMonitoring();
  }
}

// Create visual indicator on page
function showStatusIndicator() {
  // Remove existing indicator if any
  const existing = document.getElementById('ra-watcher-indicator');
  if (existing) existing.remove();

  const indicator = document.createElement('div');
  indicator.id = 'ra-watcher-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      left: 10px;
      background: #1a1a2e;
      color: white;
      padding: 10px 15px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <span id="ra-watcher-dot" style="
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #666;
      "></span>
      <span id="ra-watcher-status">Berlin Ticket Shark: Idle</span>
    </div>
  `;
  document.body.appendChild(indicator);
}

// Update status indicator
function updateIndicator(status, color) {
  const dot = document.getElementById('ra-watcher-dot');
  const text = document.getElementById('ra-watcher-status');
  if (dot) dot.style.background = color;
  if (text) text.textContent = `Berlin Ticket Shark: ${status}`;
  console.log(`[Berlin Ticket Shark] Status: ${status}`);
}

// Check tickets in the iframe
function checkTickets() {
  console.log('[Berlin Ticket Shark] Checking tickets...');

  // Find the iframe containing the ticket widget
  const iframe = document.querySelector('iframe');
  if (!iframe) {
    console.log('[Berlin Ticket Shark] No iframe found on page');
    return { found: false, error: 'No iframe' };
  }

  let iframeDoc;
  try {
    iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  } catch (e) {
    console.log('[Berlin Ticket Shark] Cannot access iframe (cross-origin):', e.message);
    return { found: false, error: 'Cross-origin iframe' };
  }

  if (!iframeDoc) {
    console.log('[Berlin Ticket Shark] Iframe document not accessible');
    return { found: false, error: 'Iframe not accessible' };
  }

  // Find the ticket list using the correct selector
  const ticketList = iframeDoc.querySelector('ul[data-ticket-info-selector-id="tickets-info"]');
  if (!ticketList) {
    console.log('[Berlin Ticket Shark] Ticket list not found');
    return { found: false, error: 'Ticket list not found' };
  }

  // Find all ticket items
  const ticketItems = ticketList.querySelectorAll('li');
  console.log(`[Berlin Ticket Shark] Found ${ticketItems.length} ticket items`);

  const tickets = [];
  const targetLower = settings.targetTicket.toLowerCase();

  ticketItems.forEach((item, index) => {
    // Check if ticket is on sale (has 'onsale' class) or closed
    const isOnSale = item.classList.contains('onsale');
    const isClosed = item.classList.contains('closed');

    // Get full text content of the list item for matching
    const fullText = item.textContent.trim();

    // Get price from type-price element
    const priceEl = item.querySelector('.type-price');
    const price = priceEl ? priceEl.textContent.trim() : '';

    // Extract name by removing price from full text
    let name = fullText.replace(price, '').trim();

    if (fullText) {
      const ticket = {
        name,
        fullText,
        price,
        isOnSale,
        isClosed,
        index,
        element: item
      };
      tickets.push(ticket);

      const status = isOnSale ? '✅ ON SALE' : '❌ CLOSED';
      console.log(`[Berlin Ticket Shark] Ticket ${index + 1}: "${name}" - ${price} [${status}]`);

      // Check if this is our target ticket and it's on sale
      if (isOnSale && fullText.toLowerCase().includes(targetLower)) {
        console.log(`[Berlin Ticket Shark] 🎉 MATCH FOUND! Target "${settings.targetTicket}" found in "${name}"`);
      }
    }
  });

  // Find target ticket that is on sale - match against full text content
  const target = tickets.find(t =>
    t.isOnSale && t.fullText.toLowerCase().includes(targetLower)
  );

  if (target) {
    console.log('[Berlin Ticket Shark] 🎉 TARGET TICKET IS AVAILABLE!', target);
    return { found: true, ticket: target, allTickets: tickets };
  }

  console.log(`[Berlin Ticket Shark] Target "${settings.targetTicket}" not available. Tickets found: ${tickets.length}`);
  return { found: false, allTickets: tickets };
}

// Click the buy button
function clickBuyButton() {
  const iframe = document.querySelector('iframe');
  if (!iframe) return false;

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return false;

    // First, click the ticket radio button to select it
    const targetLower = settings.targetTicket.toLowerCase();
    const ticketItems = iframeDoc.querySelectorAll('li.onsale');

    for (const item of ticketItems) {
      const name = item.textContent || '';
      if (name.toLowerCase().includes(targetLower)) {
        // Click the radio input or label
        const radio = item.querySelector('input[type="radio"]');
        const label = item.querySelector('label');

        if (radio) {
          radio.click();
          console.log('[Berlin Ticket Shark] Clicked ticket radio button');
        } else if (label) {
          label.click();
          console.log('[Berlin Ticket Shark] Clicked ticket label');
        }
        break;
      }
    }

    // Wait a moment then click buy button
    setTimeout(() => {
      // Find buy button - look for various selectors
      const buyButton = iframeDoc.querySelector('a[href="#"], button, .buy-button, [class*="buy"]');
      const buyLinks = Array.from(iframeDoc.querySelectorAll('a, button')).filter(
        el => el.textContent?.toLowerCase().includes('buy')
      );

      if (buyLinks.length > 0) {
        buyLinks[0].click();
        console.log('[Berlin Ticket Shark] Clicked buy button');
        return true;
      }
    }, 500);

  } catch (e) {
    console.error('[Berlin Ticket Shark] Error clicking buy:', e);
  }

  return false;
}

// Play alert sound
function playAlertSound() {
  if (!settings.soundEnabled) return;

  try {
    // Create audio context for alert sound
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;

    oscillator.start();

    // Beep pattern
    setTimeout(() => { gainNode.gain.value = 0; }, 200);
    setTimeout(() => { gainNode.gain.value = 0.3; }, 300);
    setTimeout(() => { gainNode.gain.value = 0; }, 500);
    setTimeout(() => { gainNode.gain.value = 0.3; }, 600);
    setTimeout(() => { gainNode.gain.value = 0; }, 800);
    setTimeout(() => { oscillator.stop(); }, 900);

    console.log('[Berlin Ticket Shark] Playing alert sound');
  } catch (e) {
    console.error('[Berlin Ticket Shark] Error playing sound:', e);
  }
}

// Main check function
async function doCheck() {
  if (!isMonitoring) {
    console.log('[Berlin Ticket Shark] Not monitoring, skipping check');
    return;
  }

  console.log('[Berlin Ticket Shark] ========== CHECKING TICKETS ==========');
  updateIndicator('Checking...', '#f39c12');

  // Update last check time
  const now = Date.now();
  await chrome.storage.sync.set({ lastCheck: now });

  // Send status update to popup
  try {
    chrome.runtime.sendMessage({
      type: 'STATUS_UPDATE',
      status: 'monitoring',
      lastCheck: now
    });
  } catch (e) {
    // Popup might be closed
  }

  const result = checkTickets();

  if (result.found) {
    // TICKET FOUND!
    console.log('[Berlin Ticket Shark] 🎉🎉🎉 TICKET AVAILABLE! 🎉🎉🎉');
    updateIndicator('TICKET FOUND!', '#27ae60');

    // Play sound alert
    playAlertSound();

    // Stop monitoring
    isMonitoring = false;
    await chrome.storage.sync.set({ isMonitoring: false });

    // Notify background script for Chrome notification and Telegram
    try {
      chrome.runtime.sendMessage({
        type: 'TICKET_FOUND',
        ticket: result.ticket.name,
        price: result.ticket.price,
        url: window.location.href
      });
    } catch (e) {
      console.error('[Berlin Ticket Shark] Error sending message:', e);
    }

    // Auto-buy if enabled
    if (settings.autoBuy) {
      console.log('[Berlin Ticket Shark] Auto-buy enabled, attempting purchase...');
      clickBuyButton();
    }

    return; // Don't schedule refresh
  }

  // Not found, schedule page refresh
  updateIndicator(`Waiting (${settings.refreshInterval}s)`, '#3498db');

  console.log(`[Berlin Ticket Shark] Target not available. Refreshing in ${settings.refreshInterval}s...`);

  // Clear any existing timeout
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }

  refreshTimeout = setTimeout(() => {
    if (isMonitoring) {
      console.log('[Berlin Ticket Shark] Refreshing page now...');
      location.reload();
    }
  }, settings.refreshInterval * 1000);
}

// Start monitoring
async function startMonitoring() {
  // Reload settings
  settings = await chrome.storage.sync.get({
    targetTicket: '',
    refreshInterval: 30,
    autoBuy: false,
    soundEnabled: true,
    isMonitoring: true
  });

  if (!settings.targetTicket) {
    console.log('[Berlin Ticket Shark] No target ticket set!');
    updateIndicator('No target set!', '#e74c3c');
    return;
  }

  console.log('[Berlin Ticket Shark] Starting monitoring for:', settings.targetTicket);
  console.log('[Berlin Ticket Shark] Refresh interval:', settings.refreshInterval, 'seconds');

  isMonitoring = true;
  updateIndicator('Starting...', '#3498db');

  // Wait for iframe to load, then check
  setTimeout(doCheck, 3000);
}

// Stop monitoring
function stopMonitoring() {
  console.log('[Berlin Ticket Shark] Stopping monitoring');
  isMonitoring = false;

  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }

  updateIndicator('Stopped', '#666');
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Berlin Ticket Shark] Received message:', message.type);

  if (message.type === 'START_MONITORING') {
    startMonitoring();
    sendResponse({ success: true });
  }

  if (message.type === 'STOP_MONITORING') {
    stopMonitoring();
    sendResponse({ success: true });
  }

  if (message.type === 'CHECK_NOW') {
    doCheck();
    sendResponse({ success: true });
  }

  return true;
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
