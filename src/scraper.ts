import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, BrowserContext, FrameLocator } from 'playwright';
import { BotConfig } from './config.js';

// Add stealth plugin
chromium.use(StealthPlugin());

export interface TicketInfo {
  name: string;
  price: string;
  priceValue: number;
  available: boolean;
  soldOut: boolean;
  index: number;
}

export interface ScrapeResult {
  success: boolean;
  tickets: TicketInfo[];
  error?: string;
  eventTitle?: string;
}

function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export class RAScraper {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BotConfig;
  private isFirstLoad: boolean = true;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log('🚀 Launching browser with persistent profile...');

    const fs = await import('fs');
    if (!fs.existsSync(this.config.browser.userDataDir)) {
      fs.mkdirSync(this.config.browser.userDataDir, { recursive: true });
    }

    // Use launchPersistentContext - this creates a browser that saves all data
    // like cookies, localStorage, history, etc. - making it look like a real user
    this.context = await chromium.launchPersistentContext(
      this.config.browser.userDataDir,
      {
        headless: false,
        channel: 'chrome', // Use system Chrome if available
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
        ],
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-GB',
        timezoneId: 'Europe/Berlin',
      }
    );

    // Get or create page
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    // Stealth evasions
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en-US', 'en'] });
      (window as any).chrome = { runtime: {} };
    });

    console.log('✅ Browser ready (persistent profile at: ' + this.config.browser.userDataDir + ')');
  }

  async waitForBotProtection(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('⏳ Waiting for page...');

    const waitTime = this.isFirstLoad ? 6000 : 2000;
    await randomDelay(waitTime, waitTime + 2000);

    const pageContent = await this.page.content();

    if (pageContent.includes('Verifying') || pageContent.includes('checking your browser')) {
      console.log('🔄 Bot verification in progress...');
      try {
        await this.page.waitForFunction(
          () => !document.body.textContent?.includes('Verifying'),
          { timeout: 30000 }
        );
        await randomDelay(2000, 4000);
      } catch (e) {
        console.log('⚠️  Verification timeout');
        return false;
      }
    }

    if (pageContent.includes('blocked') || pageContent.includes('Access denied')) {
      console.log('❌ Blocked by bot protection');
      return false;
    }

    this.isFirstLoad = false;
    return true;
  }

  private getTicketFrame(): FrameLocator {
    if (!this.page) throw new Error('Page not initialized');
    return this.page.frameLocator('iframe').first();
  }

  async scrapeTickets(): Promise<ScrapeResult> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      await randomDelay(500, 1500);
      console.log(`📡 Fetching ${this.config.tickets.eventUrl}`);

      await this.page.goto(this.config.tickets.eventUrl, {
        waitUntil: 'networkidle',
        timeout: 45000,
      });

      const passed = await this.waitForBotProtection();
      if (!passed) {
        return { success: false, tickets: [], error: 'Bot protection not passed' };
      }

      const eventTitle = await this.page.title();
      const ticketFrame = this.getTicketFrame();

      try {
        await ticketFrame.locator('li').first().waitFor({ timeout: 15000 });
      } catch (e) {
        console.log('⚠️  Ticket iframe not loaded');
        return { success: false, tickets: [], error: 'Iframe not loaded' };
      }

      await randomDelay(1000, 2000);

      const tickets: TicketInfo[] = [];
      const ticketList = ticketFrame.locator('ul li ul li ul li');
      const count = await ticketList.count();

      console.log(`🔍 Found ${count} ticket elements`);

      for (let i = 0; i < count; i++) {
        const item = ticketList.nth(i);
        const text = await item.textContent() || '';

        if (!text.includes('€')) continue;

        const priceMatch = text.match(/(\d+[,.]?\d*)\s*€/);
        const price = priceMatch ? priceMatch[0] : 'Unknown';
        const priceValue = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;

        let name = text.replace(/\d+[,.]?\d*\s*€.*$/, '').trim();
        const halfLength = Math.floor(name.length / 2);
        if (name.length > 20 && name.substring(0, halfLength) === name.substring(halfLength).trim()) {
          name = name.substring(0, halfLength).trim();
        }

        const isClickable = await item.evaluate((el) => {
          return window.getComputedStyle(el).cursor === 'pointer';
        });

        if (name && priceValue > 0) {
          tickets.push({
            name, price, priceValue,
            available: isClickable,
            soldOut: !isClickable,
            index: i,
          });
        }
      }

      return { success: true, tickets, eventTitle };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Scrape error:', msg);
      return { success: false, tickets: [], error: msg };
    }
  }

  async findTargetTicket(): Promise<TicketInfo | null> {
    const result = await this.scrapeTickets();

    if (!result.success) {
      console.error('Failed to scrape:', result.error);
      return null;
    }

    console.log('\n📋 Ticket Status:');
    result.tickets.forEach((t, i) => {
      const status = t.available ? '✅ Available' : '❌ Sold Out';
      console.log(`  ${i + 1}. ${t.name} - ${t.price} [${status}]`);
    });

    const target = result.tickets.find((t) =>
      t.name.toLowerCase().includes(this.config.tickets.targetTicketType.toLowerCase())
    );

    if (!target) {
      console.log(`\n⚠️  Target "${this.config.tickets.targetTicketType}" not found`);
      return null;
    }

    console.log(`\n🎯 Target: ${target.name} - ${target.price}`);
    console.log(`   Status: ${target.available ? '✅ AVAILABLE!' : '❌ Waiting for resale...'}`);

    return target;
  }

  async selectTicket(ticket: TicketInfo): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      await randomDelay(300, 800);
      const ticketFrame = this.getTicketFrame();
      const ticketList = ticketFrame.locator('ul li ul li ul li');
      await ticketList.nth(ticket.index).click();
      console.log(`✅ Selected: ${ticket.name}`);
      await randomDelay(400, 800);
      return true;
    } catch (error) {
      console.error('Failed to select ticket:', error);
      return false;
    }
  }

  async setQuantity(quantity: number): Promise<boolean> {
    if (!this.page || quantity <= 1) return true;

    try {
      const ticketFrame = this.getTicketFrame();
      const plusButton = ticketFrame.locator('img[cursor="pointer"]').last();

      for (let i = 1; i < quantity; i++) {
        await plusButton.click();
        await randomDelay(200, 500);
      }
      console.log(`✅ Quantity: ${quantity}`);
      return true;
    } catch (error) {
      console.error('Failed to set quantity:', error);
      return false;
    }
  }

  async attemptPurchase(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      console.log('🛒 Attempting purchase...');
      await randomDelay(500, 1000);

      const ticketFrame = this.getTicketFrame();
      await this.setQuantity(this.config.tickets.quantity);

      await ticketFrame.locator('text=Buy tickets').click();
      console.log('✅ Clicked buy, proceeding to checkout...');
      await randomDelay(2000, 3000);

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Purchase failed:', msg);
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }

  getPage(): Page | null {
    return this.page;
  }
}
