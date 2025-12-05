// Berlin Ticket Shark - Payment Page Content Script
// Runs on ra.co/shop/* pages to auto-click "Pay now"

console.log('[Berlin Ticket Shark] Payment page script loaded');

async function init() {
  // Check if we're on the payment page
  if (!window.location.href.includes('/shop/')) {
    return;
  }

  // Load settings
  const settings = await chrome.storage.sync.get({
    autoBuy: false,
    isMonitoring: false
  });

  console.log('[Berlin Ticket Shark] Payment page settings:', settings);

  // Only auto-pay if autoBuy is enabled
  if (!settings.autoBuy) {
    console.log('[Berlin Ticket Shark] Auto-buy disabled, not clicking Pay now');
    showIndicator('Auto-pay disabled', '#666');
    return;
  }

  // Show indicator that we're about to pay
  showIndicator('Auto-pay in 3s...', '#f39c12');

  // Wait a moment to let user see what's happening and for page to fully load
  await sleep(3000);

  // Find and click the Pay now button
  const payButton = findPayNowButton();

  if (payButton) {
    showIndicator('Clicking Pay now!', '#27ae60');
    console.log('[Berlin Ticket Shark] Found Pay now button, clicking...');

    // Small delay then click
    await sleep(500);
    payButton.click();

    console.log('[Berlin Ticket Shark] Pay now button clicked!');

    // Send notification
    try {
      chrome.runtime.sendMessage({
        type: 'AUTO_PAY_CLICKED',
        url: window.location.href
      });
    } catch (e) {
      console.log('[Berlin Ticket Shark] Could not send message:', e);
    }
  } else {
    console.log('[Berlin Ticket Shark] Pay now button not found');
    showIndicator('Pay button not found', '#e74c3c');
  }
}

function findPayNowButton() {
  // Try multiple selectors to find the Pay now button

  // 1. By data-test-id (most reliable)
  let button = document.querySelector('button[data-test-id="pay-now-button"]');
  if (button) {
    console.log('[Berlin Ticket Shark] Found button by data-test-id');
    return button;
  }

  // 2. By button text content
  const buttons = document.querySelectorAll('button[type="submit"]');
  for (const btn of buttons) {
    if (btn.textContent?.toLowerCase().includes('pay now')) {
      console.log('[Berlin Ticket Shark] Found button by text content');
      return btn;
    }
  }

  // 3. By any element with "pay now" text
  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    if (btn.textContent?.toLowerCase().includes('pay now')) {
      console.log('[Berlin Ticket Shark] Found button by general search');
      return btn;
    }
  }

  return null;
}

function showIndicator(status, color) {
  // Remove existing indicator
  const existing = document.getElementById('bts-payment-indicator');
  if (existing) existing.remove();

  const indicator = document.createElement('div');
  indicator.id = 'bts-payment-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      right: 10px;
      background: #1a1a2e;
      color: white;
      padding: 12px 18px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      gap: 10px;
      border-left: 4px solid ${color};
    ">
      <span style="font-size: 18px;">🦈</span>
      <span>${status}</span>
    </div>
  `;
  document.body.appendChild(indicator);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
