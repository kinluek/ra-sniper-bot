import notifier from 'node-notifier';
import { exec } from 'child_process';
import { BotConfig } from './config.js';
import { TicketInfo } from './scraper.js';

export class Notifier {
  private config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async notify(ticket: TicketInfo): Promise<void> {
    console.log('\n🎉🎉🎉 TICKET AVAILABLE! 🎉🎉🎉');
    console.log(`📍 ${ticket.name}`);
    console.log(`💰 ${ticket.price}`);

    // Play sound alert
    if (this.config.notifications.sound) {
      this.playSound();
    }

    // Send desktop notification
    if (this.config.notifications.desktop) {
      await this.sendDesktopNotification(ticket);
    }

    // Open browser
    if (this.config.notifications.openBrowserOnAvailable) {
      this.openInBrowser();
    }
  }

  private playSound(): void {
    // Use macOS say command for audio alert, or system bell
    if (process.platform === 'darwin') {
      exec('say "Tickets available! Tickets available!"');
      // Also play system sound
      exec('afplay /System/Library/Sounds/Glass.aiff');
    } else if (process.platform === 'linux') {
      exec('paplay /usr/share/sounds/freedesktop/stereo/complete.oga || echo -e "\\a"');
    } else {
      // Windows or fallback
      console.log('\x07'); // Terminal bell
    }
  }

  private async sendDesktopNotification(ticket: TicketInfo): Promise<void> {
    return new Promise((resolve) => {
      notifier.notify(
        {
          title: '🎫 RA Tickets Available!',
          message: `${ticket.name}\n${ticket.price}`,
          sound: true,
          wait: true,
          timeout: 30,
          actions: ['Open', 'Dismiss'],
        },
        (err, response, metadata) => {
          if (err) {
            console.error('Notification error:', err);
          }
          resolve();
        }
      );
    });
  }

  private openInBrowser(): void {
    const url = this.config.tickets.eventUrl;

    if (process.platform === 'darwin') {
      exec(`open "${url}"`);
    } else if (process.platform === 'linux') {
      exec(`xdg-open "${url}"`);
    } else {
      exec(`start "${url}"`);
    }
  }

  notifyError(message: string): void {
    console.error(`\n❌ Error: ${message}`);

    if (this.config.notifications.desktop) {
      notifier.notify({
        title: '⚠️ RA Bot Error',
        message: message,
        sound: false,
      });
    }
  }

  notifyStatus(message: string): void {
    console.log(`ℹ️  ${message}`);
  }
}
