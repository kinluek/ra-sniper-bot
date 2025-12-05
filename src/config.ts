import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

export interface TicketConfig {
  eventUrl: string;
  targetTicketType: string; // e.g., "Final release"
  maxPrice?: number; // Optional max price in EUR
  quantity: number;
  autoPurchase: boolean; // If true, attempt to buy automatically
}

export interface BotConfig {
  tickets: TicketConfig;
  polling: {
    intervalMs: number; // How often to check (default: 30 seconds)
    retryDelayMs: number; // Delay between retries on error
  };
  notifications: {
    desktop: boolean;
    sound: boolean;
    openBrowserOnAvailable: boolean;
  };
  browser: {
    headless: boolean;
    userDataDir: string; // For persistent login
  };
}

export const DEFAULT_CONFIG: BotConfig = {
  tickets: {
    eventUrl: 'https://ra.co/events/2300927',
    targetTicketType: 'Final release',
    quantity: 1,
    autoPurchase: false,
  },
  polling: {
    intervalMs: 45000, // 45 seconds - less aggressive to avoid detection
    retryDelayMs: 10000, // 10 seconds
  },
  notifications: {
    desktop: true,
    sound: true,
    openBrowserOnAvailable: true,
  },
  browser: {
    headless: false, // Run with visible browser to help bypass bot detection
    userDataDir: join(__dirname, '..', 'browser-data'),
  },
};

export function loadConfig(): BotConfig {
  if (existsSync(CONFIG_PATH)) {
    try {
      const fileContent = readFileSync(CONFIG_PATH, 'utf-8');
      const userConfig = JSON.parse(fileContent);
      return { ...DEFAULT_CONFIG, ...userConfig };
    } catch (e) {
      console.warn('Failed to load config.json, using defaults');
    }
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: BotConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function createConfigFile(): void {
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    console.log(`Created config.json at ${CONFIG_PATH}`);
  }
}
