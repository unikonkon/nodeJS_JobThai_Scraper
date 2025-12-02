import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JobThaiScraper } from './scraper.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load configuration from config.json
 */
function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  
  if (!fs.existsSync(configPath)) {
    console.error('❌ config.json not found!');
    console.log('📝 Creating default config.json...');
    
    const defaultConfig = {
      searchMode: 'keyword',
      keyword: 'ไอที',
      bts_mrt: 'รถไฟฟ้า-และ-BRT',
      workers: 3,
      output: './output/jobs.json',
      delay: {
        min: 1000,
        max: 3000
      },
      cloudHost: 'ws://localhost:1818',
      maxPages: 0,
      retryAttempts: 3
    };
    
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('❌ Error reading config.json:', error.message);
    process.exit(1);
  }
}

/**
 * Print banner
 */
function printBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║       🕷️  JobThai Scraper with Ulixee Hero                    ║
║       ───────────────────────────────────                     ║
║       Parallel job scraping from jobthai.com                  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
}

/**
 * Print configuration
 */
function printConfig(config) {
  console.log('📋 Configuration:');
  console.log('─'.repeat(40));
  console.log(`   Search Mode: ${config.searchMode}`);
  if (config.searchMode === 'keyword') {
    console.log(`   Keyword: ${config.keyword}`);
  } else if (config.searchMode === 'bts_mrt') {
    console.log(`   BTS/MRT: ${config.bts_mrt}`);
  }
  console.log(`   Workers: ${config.workers}`);
  console.log(`   Output: ${config.output}`);
  console.log(`   Delay: ${config.delay.min}-${config.delay.max}ms`);
  console.log(`   Max Pages: ${config.maxPages || 'No limit'}`);
  console.log(`   Cloud Host: ${config.cloudHost}`);
  console.log('─'.repeat(40) + '\n');
}

/**
 * Main function
 */
async function main() {
  printBanner();
  
  // Load configuration
  const config = loadConfig();
  printConfig(config);
  
  // Create scraper instance
  const scraper = new JobThaiScraper(config);
  
  // Handle graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n\n📡 Received ${signal}, shutting down gracefully...`);
    
    try {
      await scraper.stop();
      await scraper.close();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught errors
  process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught Exception:', error);
    await scraper.close();
    process.exit(1);
  });
  
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  });
  
  try {
    // Check if Ulixee Cloud is running
    console.log('🔌 Checking Ulixee Cloud connection...');
    console.log('   Make sure to start the cloud server first:');
    console.log('   npm run cloud\n');
    
    // Initialize scraper
    await scraper.init();
    
    // Start scraping
    await scraper.start();
    
    // Cleanup
    await scraper.close();
    
    console.log('✅ Scraping completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    
    if (error.message.includes('ECONNREFUSED') || error.message.includes('connection')) {
      console.log('\n💡 Tip: Make sure Ulixee Cloud server is running:');
      console.log('   1. Open a new terminal');
      console.log('   2. Run: npm run cloud');
      console.log('   3. Wait for "Cloud server is running" message');
      console.log('   4. Then run: npm run scrape');
    }
    
    await scraper.close();
    process.exit(1);
  }
}

// Run main function
main();

