import { chromium } from 'playwright';
import { loadConfig, createConfigFile } from './config.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

async function login(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              🔐 RA Login Session Helper 🔐                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  createConfigFile();
  const config = loadConfig();

  console.log('🚀 Opening browser...');
  console.log('📝 Please log into your RA account in the browser window.');
  console.log('⏳ Once logged in, press Enter in this terminal to save your session.\n');

  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // Navigate to RA login page
  await page.goto('https://ra.co/login');

  console.log('🌐 Browser opened at RA login page');
  console.log('');
  console.log('Instructions:');
  console.log('  1. Log into your RA account');
  console.log('  2. Navigate around if needed to ensure you\'re logged in');
  console.log('  3. Return to this terminal and press ENTER to save session');
  console.log('');

  // Wait for user input
  await waitForEnter();

  // Save cookies
  console.log('\n💾 Saving session...');

  if (!existsSync(config.browser.userDataDir)) {
    mkdirSync(config.browser.userDataDir, { recursive: true });
  }

  const cookies = await context.cookies();
  const cookiesPath = `${config.browser.userDataDir}/cookies.json`;
  writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));

  console.log(`✅ Session saved to ${cookiesPath}`);
  console.log('');
  console.log('You can now run the bot with: npm start');

  await browser.close();
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

login().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
