import Hero from '@ulixee/hero';
import { parseJobList, parsePagination, parseTotalJobs, parseJobDetail } from './utils/parser.js';
import { JobQueue, PageQueue } from './queue.js';
import { WorkerPool } from './worker.js';
import { FileHandler } from './utils/file-handler.js';

/**
 * Main JobThai Scraper class
 * Coordinates the scraping process with parallel workers
 */
export class JobThaiScraper {
  constructor(config) {
    this.config = config;
    this.jobQueue = new JobQueue();
    this.pageQueue = new PageQueue();
    this.fileHandler = new FileHandler(config.output);
    this.workerPool = null;
    this.hero = null; // Main hero for list pages
    this.totalJobsFound = 0;
    this.isRunning = false;
  }
  
  /**
   * Build search URL based on config
   * @returns {string} Search URL
   */
  buildSearchUrl() {
    const { searchMode, keyword, bts_mrt, custom_url } = this.config;
    
    if (searchMode === 'custom_url' && custom_url) {
      console.log(`🔍 Custom URL mode: ${custom_url}`);
      return custom_url;
    } else if (searchMode === 'bts_mrt' && bts_mrt) {
      console.log(`🔍 BTS/MRT mode: ${bts_mrt}`);
      // BTS/MRT mode - Thai path (will be auto-encoded by browser)
      // URL: https://www.jobthai.com/หางาน/รถไฟฟ้า-และ-BRT
      return `https://www.jobthai.com/หางาน/${bts_mrt}`;
    } else if (searchMode === 'keyword' && keyword) {
      console.log(`🔍 Keyword mode: ${keyword}`);
      // Keyword mode
      // URL: https://www.jobthai.com/th/jobs?keyword=ไอที
      const encodedKeyword = encodeURIComponent(keyword);
      return `https://www.jobthai.com/th/jobs?keyword=${encodedKeyword}`;
    } else {
      // Default - all jobs
      return 'https://www.jobthai.com/th/jobs';
    }

  }
  
  /**
   * Initialize the scraper
   */
  async init() {
    console.log('🔧 Initializing JobThai Scraper...');
    
    // Initialize file handler
    await this.fileHandler.init();
    
    // Initialize main Hero for listing pages
    this.hero = new Hero({
      connectionToCore: {
        host: this.config.cloudHost
      },
      showChrome: false,
      userAgent: '~ chrome >= 120'
    });
    
    // Initialize worker pool for detail pages
    this.workerPool = new WorkerPool(this.config, this.jobQueue, this.fileHandler);
    await this.workerPool.init();
    
    // Setup event listeners
    this.setupEventListeners();
    
    console.log('✅ Scraper initialized');
  }
  
  /**
   * Setup event listeners for queues
   */
  setupEventListeners() {
    this.jobQueue.on('job:completed', (job) => {
      const stats = this.jobQueue.getStats();
      console.log(`📊 Progress: ${stats.completed}/${stats.total} jobs completed`);
    });
    
    this.jobQueue.on('queue:done', (stats) => {
      console.log(`🎉 Queue done! Completed: ${stats.completed}, Failed: ${stats.failed}`);
    });
    
    this.pageQueue.on('page:completed', (info) => {
      console.log(`📄 Page ${info.pageNum}: Found ${info.jobsFound} jobs`);
    });
  }
  
  /**
   * Start the scraping process
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Scraper is already running');
      return;
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    console.log('\n' + '='.repeat(60));
    console.log('🕷️  JobThai Scraper Started');
    console.log('='.repeat(60));
    
    const searchUrl = this.buildSearchUrl();
    console.log(`🔍 Search URL: ${searchUrl}`);
    console.log(`👷 Workers: ${this.config.workers}`);
    console.log(`📂 Output: ${this.config.output}`);
    console.log('='.repeat(60) + '\n');
    
    try {
      // Phase 1: Scrape all job listings from search results
      await this.scrapeJobListings(searchUrl);
      
      console.log(`\n📋 Total jobs to scrape: ${this.jobQueue.getStats().pending}`);
      
      // Phase 2: Process job details with parallel workers
      if (!this.jobQueue.isEmpty()) {
        console.log('\n🏭 Starting parallel job detail scraping...\n');
        await this.workerPool.start();
      }
      
      // Final statistics
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const stats = this.jobQueue.getStats();
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 Scraping Complete!');
      console.log('='.repeat(60));
      console.log(`✅ Jobs scraped: ${stats.completed}`);
      console.log(`❌ Failed: ${stats.failed}`);
      console.log(`⏱️  Duration: ${duration}s`);
      console.log(`📂 Output file: ${this.config.output}`);
      console.log(`💾 Total jobs in file: ${this.fileHandler.getCount()}`);
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('❌ Scraping error:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Scrape job listings from all search result pages
   * @param {string} startUrl - Initial search URL
   */
  async scrapeJobListings(startUrl) {
    let currentUrl = startUrl;
    let pageNum = 1;
    const maxPages = this.config.maxPages || 0; // 0 = no limit
    const existingIds = this.fileHandler.getExistingIds();
    
    console.log('📄 Scraping job listings from search results...\n');
    
    while (currentUrl) {
      console.log(`📄 Processing page ${pageNum}: ${currentUrl}`);
      
      try {
        // Navigate to the page
        await this.hero.goto(currentUrl);
        await this.hero.waitForPaintingStable();
        
        // Wait for job list to load
        await this.delay(2000);
        
        // Get page HTML
        const html = await this.hero.document.documentElement.outerHTML;
        
        // Parse total jobs on first page
        if (pageNum === 1) {
          this.totalJobsFound = parseTotalJobs(html);
          if (this.totalJobsFound > 0) {
            console.log(`📊 Total jobs found: ${this.totalJobsFound}`);
          }
        }
        
        // Parse job listings from this page
        const jobs = await this.extractJobsFromPage(html, currentUrl);
        
        // Filter out already scraped jobs
        const newJobs = jobs.filter(job => !existingIds.has(job.id));
        
        // Add new jobs to queue
        const added = this.jobQueue.addBulk(newJobs);
        console.log(`   ➕ Found ${jobs.length} jobs, ${added} new jobs added to queue`);
        
        // Add existing IDs to prevent re-processing
        newJobs.forEach(job => existingIds.add(job.id));
        
        this.pageQueue.completePage(jobs.length);
        
        // Check for next page
        const pagination = parsePagination(html, currentUrl);
        
        // Check if we should continue
        if (maxPages > 0 && pageNum >= maxPages) {
          console.log(`\n⏹️ Reached max pages limit (${maxPages})`);
          break;
        }
        
        if (pagination.hasNext && pagination.nextPageUrl) {
          currentUrl = pagination.nextPageUrl;
          pageNum++;
          
          // Random delay between pages
          await this.randomDelay();
        } else {
          console.log('\n✅ Reached last page of search results');
          currentUrl = null;
        }
        
      } catch (error) {
        console.error(`❌ Error on page ${pageNum}:`, error.message);
        
        // Try to continue with next page
        if (this.config.retryAttempts > 0) {
          await this.delay(5000);
          continue;
        }
        break;
      }
    }
    
    console.log(`\n📄 Finished scraping ${pageNum} pages`);
  }
  
  /**
   * Extract jobs from a search results page
   * Uses Hero to find job elements directly
   */
  async extractJobsFromPage(html, pageUrl) {
    const jobs = [];
    
    try {
      // Use Hero to query job elements
      const jobLinks = await this.hero.document.querySelectorAll('a[href*="/job/"]');
      const processedIds = new Set();
      
      for (const link of jobLinks) {
        try {
          const href = await link.getAttribute('href');
          if (!href || !href.includes('/job/')) continue;
          
          // Extract job ID from URL
          const match = href.match(/\/job\/(\d+)/);
          if (!match) continue;
          
          const jobId = match[1];
          
          // Skip if already processed on this page
          if (processedIds.has(jobId)) continue;
          processedIds.add(jobId);
          
          // Build full URL
          const jobUrl = href.startsWith('http') 
            ? href 
            : `https://www.jobthai.com${href}`;
          
          // Try to get text content for preview
          let text = '';
          try {
            text = await link.textContent;
          } catch (e) {
            // Ignore text extraction errors
          }

          // Parse preview text to extract basic info
          const parsedPreview = this.parsePreviewText(text.trim());

          console.log(`🔍 Job ID: ${jobId}, Title: ${parsedPreview.title}, Company: ${parsedPreview.company}`);
   
          jobs.push({
            id: jobId,
            url: jobUrl,
            previewText: text.trim().substring(0, 500),
            ...parsedPreview
          });
          
        } catch (e) {
          // Continue with next link
        }
      }
      
    } catch (error) {
      console.error('Error extracting jobs:', error.message);
      
      // Fallback to Cheerio parsing
      const parsedJobs = parseJobList(html);
      for (const job of parsedJobs) {
        if (job.id && job.jobUrl) {
          jobs.push({
            id: job.id,
            url: job.jobUrl
          });
        }
      }
    }
    
    return jobs;
  }
  
  /**
   * Stop the scraper
   */
  async stop() {
    console.log('🛑 Stopping scraper...');
    this.isRunning = false;
    
    if (this.workerPool) {
      await this.workerPool.stop();
    }
    
    this.jobQueue.pause();
  }
  
  /**
   * Close and cleanup resources
   */
  async close() {
    console.log('🔒 Closing scraper...');
    
    if (this.workerPool) {
      await this.workerPool.close();
    }
    
    if (this.hero) {
      try {
        await this.hero.close();
      } catch (e) {
        // Ignore close errors
      }
      this.hero = null;
    }
    
    // Create backup before closing
    await this.fileHandler.backup();
    
    console.log('✅ Scraper closed');
  }
  
  /**
   * Parse preview text from job listing to extract basic info
   * Format: "2 ธ.ค. 68ตำแหน่งงานบริษัท XXX จำกัดบริษัท XXX จำกัดสถานที่เงินเดือนHybrid Work"
   * @param {string} text - Preview text from job listing
   * @returns {Object} Parsed data { title, company, location, salary, postedDate }
   */
  parsePreviewText(text) {
    const result = {
      title: '',
      company: '',
      location: '',
      salary: '',
      postedDate: ''
    };
    
    if (!text) return result;
    
    // Extract date (format: "XX ธ.ค. XX" or "XX พ.ย. XX")
    const dateMatch = text.match(/(\d{1,2}\s+(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*\d{2})/);
    if (dateMatch) {
      result.postedDate = dateMatch[1];
      text = text.replace(dateMatch[0], '');
    }
    
    // Extract salary patterns
    const salaryPatterns = [
      /(\d{1,3}(?:,\d{3})*\s*-\s*\d{1,3}(?:,\d{3})*\s*บาท)/,
      /(\d{1,3}(?:,\d{3})*\s*บาท(?:\s*(?:ขึ้นไป|\/เดือน|\/วัน))?)/,
      /(ตามประสบการณ์)/,
      /(ตามตกลง)/,
      /(ตามโครงสร้าง(?:บริษัท)?)/,
      /(ไม่ระบุ)/
    ];
    
    for (const pattern of salaryPatterns) {
      const salaryMatch = text.match(pattern);
      if (salaryMatch) {
        result.salary = salaryMatch[1];
        text = text.replace(salaryMatch[0], '');
        break;
      }
    }
    
    // Extract location (BTS/MRT/จังหวัด/เขต)
    const locationPatterns = [
      /(BTS\s+[^\s]+(?:\s*,\s*[^\s]+)*)/,
      /(MRT\s+[^\s]+(?:\s*,\s*[^\s]+)*)/,
      /(ARL\s+[^\s]+)/,
      /(เขต[^\s]+\s*(?:กรุงเทพ(?:มหานคร)?)?)/,
      /(อ\.\s*[^\s]+\s*จ\.\s*[^\s]+)/,
      /(จ\.\s*[^\s]+)/,
      /(กรุงเทพมหานคร)/,
      /(หลายจังหวัด)/
    ];
    
    for (const pattern of locationPatterns) {
      const locationMatch = text.match(pattern);
      if (locationMatch) {
        result.location = locationMatch[1];
        break;
      }
    }
    
    // Extract company name (look for บริษัท pattern)
    const companyMatch = text.match(/(บริษัท\s+[^\s]+(?:\s+[^\s]+)*?\s*(?:จำกัด|มหาชน|จำกัด\s*\(มหาชน\)))/);
    if (companyMatch) {
      result.company = companyMatch[1];
      // Remove duplicate company names
      const companyText = result.company;
      text = text.replace(new RegExp(companyText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
    }
    
    // Clean up text and extract title (what remains before company info)
    text = text.replace(/Hybrid\s*Work/gi, '');
    text = text.replace(/Work\s*from\s*Home/gi, '');
    text = text.replace(/สัมภาษณ์(?:งาน)?(?:ออนไลน์)?/gi, '');
    text = text.replace(/รับสมัครด่วน/gi, '');
    text = text.trim();
    
    // The remaining text at the beginning is likely the job title
    if (text && !result.title) {
      // Get first significant chunk of text as title
      const parts = text.split(/บริษัท/);
      if (parts[0]) {
        result.title = parts[0].trim().substring(0, 100);
      }
    }
    
    return result;
  }
  
  /**
   * Wait for specified milliseconds
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Random delay between requests
   */
  async randomDelay() {
    const { min, max } = this.config.delay;
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.delay(ms);
  }
  
  /**
   * Get current statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      totalJobsFound: this.totalJobsFound,
      queue: this.jobQueue.getStats(),
      savedJobs: this.fileHandler.getCount(),
      workers: this.workerPool ? this.workerPool.getStatus() : null
    };
  }
}

export default JobThaiScraper;

