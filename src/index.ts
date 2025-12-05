import { loadConfig, createConfigFile, BotConfig } from './config.js';
import { RAScraper, TicketInfo } from './scraper.js';
import { Notifier } from './notifier.js';

class RABot {
  private config: BotConfig;
  private scraper: RAScraper;
  private notifier: Notifier;
  private isRunning: boolean = false;
  private checkCount: number = 0;

  constructor(config: BotConfig) {
    this.config = config;
    this.scraper = new RAScraper(config);
    this.notifier = new Notifier(config);
  }

  async start(): Promise<void> {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║            🎵 RA Ticket Bot - Resident Advisor 🎵           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🎯 Target: ${this.config.tickets.targetTicketType}`);
    console.log(`🔗 Event: ${this.config.tickets.eventUrl}`);
    console.log(`⏱️  Polling interval: ${this.config.polling.intervalMs / 1000}s`);
    console.log(`🛒 Auto-purchase: ${this.config.tickets.autoPurchase ? 'YES' : 'NO'}`);
    console.log('');

    try {
      await this.scraper.initialize();
      this.isRunning = true;

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n\n👋 Shutting down...');
        await this.stop();
        process.exit(0);
      });

      // Start monitoring loop
      await this.monitorLoop();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifier.notifyError(`Failed to start: ${errorMessage}`);
      await this.stop();
      process.exit(1);
    }
  }

  private async monitorLoop(): Promise<void> {
    while (this.isRunning) {
      this.checkCount++;
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\n[${timestamp}] Check #${this.checkCount}...`);

      try {
        const ticket = await this.scraper.findTargetTicket();

        if (ticket && ticket.available) {
          // Ticket is available!
          await this.handleAvailableTicket(ticket);

          if (this.config.tickets.autoPurchase) {
            // First select the ticket
            const selected = await this.scraper.selectTicket(ticket);
            if (!selected) {
              console.log('⚠️  Failed to select ticket, retrying...');
              continue;
            }

            // Attempt purchase
            const success = await this.scraper.attemptPurchase();
            if (success) {
              console.log('\n✅ Purchase initiated! Complete checkout in browser.');
              console.log('💳 You may need to log in and complete payment.');
              // Keep browser open for manual checkout completion
              console.log('Press Ctrl+C to exit when done.');
              await this.waitForever();
            }
          } else {
            console.log('\n⚡ Auto-purchase disabled. Browser is open for manual purchase.');
            console.log('💡 Tip: Run with --auto flag to enable auto-purchase.');
            // Keep running but slower to not spam
            await this.sleep(this.config.polling.intervalMs * 2);
          }
        } else if (ticket) {
          // Found target but not available
          console.log(`⏳ Waiting for tickets to become available...`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error during check: ${errorMessage}`);
        console.log(`⏳ Retrying in ${this.config.polling.retryDelayMs / 1000}s...`);
        await this.sleep(this.config.polling.retryDelayMs);
        continue;
      }

      // Wait before next check
      await this.sleep(this.config.polling.intervalMs);
    }
  }

  private async handleAvailableTicket(ticket: TicketInfo): Promise<void> {
    await this.notifier.notify(ticket);

    // Check price if max price is set
    if (this.config.tickets.maxPrice && ticket.priceValue > this.config.tickets.maxPrice) {
      console.log(`\n⚠️  Price ${ticket.price} exceeds max ${this.config.tickets.maxPrice}€`);
      return;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async waitForever(): Promise<void> {
    return new Promise(() => {}); // Never resolves
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.scraper.close();
  }
}

// Parse command line arguments
function parseArgs(): Partial<BotConfig['tickets']> & { help?: boolean } {
  const args = process.argv.slice(2);
  const result: Partial<BotConfig['tickets']> & { help?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--url':
      case '-u':
        result.eventUrl = next;
        i++;
        break;
      case '--ticket':
      case '-t':
        result.targetTicketType = next;
        i++;
        break;
      case '--quantity':
      case '-q':
        result.quantity = parseInt(next);
        i++;
        break;
      case '--auto':
      case '-a':
        result.autoPurchase = true;
        break;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
RA Ticket Bot - Monitor Resident Advisor for ticket availability

Usage: npm start [options]

Options:
  -h, --help              Show this help message
  -u, --url <url>         Event URL to monitor
  -t, --ticket <type>     Ticket type to watch for (e.g., "Final release")
  -q, --quantity <n>      Number of tickets to purchase (default: 1)
  -a, --auto              Enable auto-purchase when tickets available

Examples:
  npm start
  npm start --url https://ra.co/events/12345 --ticket "Final release"
  npm start -u https://ra.co/events/12345 -t "1st release" -a

Configuration:
  Edit config.json to customize polling interval, notifications, etc.

Login:
  Run 'npm run login' to open a browser and log into RA.
  Your session will be saved for future use.
`);
}

// Main entry point
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  // Ensure config file exists
  createConfigFile();

  // Load config and merge with command line args
  const config = loadConfig();

  if (args.eventUrl) config.tickets.eventUrl = args.eventUrl;
  if (args.targetTicketType) config.tickets.targetTicketType = args.targetTicketType;
  if (args.quantity) config.tickets.quantity = args.quantity;
  if (args.autoPurchase !== undefined) config.tickets.autoPurchase = args.autoPurchase;

  const bot = new RABot(config);
  await bot.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
