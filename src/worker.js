import Hero from '@ulixee/hero';

/**
 * Worker class for parallel job scraping
 * Each worker has its own Hero browser instance
 */
export class Worker {
  constructor(id, config, queue, fileHandler) {
    this.id = id;
    this.config = config;
    this.queue = queue;
    this.fileHandler = fileHandler;
    this.hero = null;
    this.isRunning = false;
    this.processedCount = 0;
  }
  
  /**
   * Initialize the worker's Hero browser instance
   */
  async init() {
    console.log(`🔧 Worker ${this.id}: Initializing Hero browser...`);
    
    this.hero = new Hero({
      connectionToCore: {
        host: this.config.cloudHost
      },
      showChrome: false,
      userAgent: '~ chrome >= 120'
    });
    
    console.log(`✅ Worker ${this.id}: Hero browser ready`);
  }
  
  /**
   * Start processing jobs from the queue
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log(`🚀 Worker ${this.id}: Starting job processing...`);
    
    while (this.isRunning) {
      // Get next job from queue
      const job = this.queue.getNext();
      
      if (!job) {
        // No jobs available, wait and check again
        if (this.queue.isDone()) {
          console.log(`✅ Worker ${this.id}: Queue is done, stopping...`);
          break;
        }
        await this.delay(500);
        continue;
      }
      
      try {
        await this.processJob(job);
        this.queue.complete(job.id);
        this.processedCount++;
      } catch (error) {
        console.error(`❌ Worker ${this.id}: Error processing job ${job.id}:`, error.message);
        this.queue.fail(job.id, error, true); // Retry on failure
      }
      
      // Random delay between requests
      await this.randomDelay();
    }
    
    console.log(`🏁 Worker ${this.id}: Finished. Processed ${this.processedCount} jobs.`);
  }
  
  /**
   * Process a single job - extract data directly from page using Hero
   * @param {Object} job - Job to process
   */
  async processJob(job) {
    console.log(`📋 Worker ${this.id}: Processing job ${job.id}...`);
    
    // Navigate to job detail page
    await this.hero.goto(job.url);
    await this.hero.waitForPaintingStable();
    
    // Wait for content to load
    await this.delay(2000);
    
    // Extract job details using Hero directly (works with JS-rendered content)
    const jobData = await this.extractJobDetails(job.url);
    
    // Merge with existing data from list view (use preview data as fallback)
    const mergedData = {
      id: job.id,
      url: job.url,
      previewText: job.previewText || '',
      title: jobData.title !== 'ไม่ระบุตำแหน่ง' ? jobData.title : (job.title || 'ไม่ระบุตำแหน่ง'),
      company: jobData.company !== 'ไม่ระบุบริษัท' ? jobData.company : (job.company || 'ไม่ระบุบริษัท'),
      companyLogo: jobData.companyLogo || '',
      location: jobData.location !== 'ไม่ระบุสถานที่' ? jobData.location : (job.location || 'ไม่ระบุสถานที่'),
      salary: jobData.salary !== 'ไม่ระบุเงินเดือน' ? jobData.salary : (job.salary || 'ไม่ระบุเงินเดือน'),
      positions: jobData.positions || '',
      companyHistory: jobData.companyHistory || '',
      benefits: jobData.benefits || '',
      contact: jobData.contact || '',
      transportation: jobData.transportation || '',
      jobUrl: job.url,
      postedDate: jobData.postedDate || job.postedDate || '',
      scrapedAt: new Date().toISOString()
    };
    
    console.log(`✅ Worker ${this.id}: Extracted - ${mergedData.title} @ ${mergedData.company}`);
    
    // Save to file (real-time)
    await this.fileHandler.addJob(mergedData);
  }
  
  /**
   * Extract job details directly from the page using Hero selectors
   */
  async extractJobDetails(jobUrl) {
    const document = this.hero.document;
    
    // Extract job title from page title (reliable method)
    let title = '';
    let company = '';
    
    try {
      const pageTitle = await this.hero.document.title;
      // Format: "งาน หางาน สมัครงาน บริษัท XXX | ตำแหน่งงาน - JobThai"
      const titleMatch = pageTitle.match(/\|\s*(.+?)\s*-\s*JobThai/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
      
      const companyMatch = pageTitle.match(/บริษัท\s+(.+?)\s*\|/);
      if (companyMatch) {
        company = companyMatch[1].trim();
      }
    } catch (e) {
      console.log(`⚠️ Worker ${this.id}: Could not parse page title`);
    }
    
    // Try to extract from page content using various selectors
    if (!title) {
      title = await this.extractTextFromSelectors([
        'h1',
        '[class*="JobTitle"]',
        '[class*="job-title"]',
        '[class*="position"]'
      ]);
    }
    
    if (!company) {
      company = await this.extractTextFromSelectors([
        'a[href*="/company/"]',
        '[class*="company"]',
        '[class*="Company"]'
      ]);
    }
    
    // Extract other details
    const location = await this.extractTextFromSelectors([
      '[class*="location"]',
      '[class*="Location"]',
      '[class*="address"]'
    ]);
    
    const salary = await this.extractTextFromSelectors([
      '[class*="salary"]',
      '[class*="Salary"]',
      '[class*="wage"]'
    ]);
    
    // Get full page text for description extraction
    let extractedSections = {
      company: '',
      postedDate: '',
      title: '',
      location: '',
      salary: '',
      positions: '',
      companyHistory: '',
      benefits: '',
      contact: '',
      transportation: ''
    };

    try {
      const bodyText = await document.body.innerText;

      // Extract sections from body text
      extractedSections = this.extractSectionsFromText(bodyText);
    } catch (e) {
      console.log(`⚠️ Worker ${this.id}: Could not extract body text`);
    }
    
    // Extract company logo
    let companyLogo = '';
    try {
      const logoImg = await document.querySelector('img[class*="logo"], img[class*="company"]');
      if (logoImg) {
        companyLogo = await logoImg.src;
      }
    } catch (e) {
      // No logo found
    }
    
    return {
      title: extractedSections.title || title || 'ไม่ระบุตำแหน่ง',
      company: extractedSections.company || company || 'ไม่ระบุบริษัท',
      companyLogo: companyLogo,
      location: extractedSections.location || location || 'ไม่ระบุสถานที่',
      salary: extractedSections.salary || salary || 'ไม่ระบุเงินเดือน',
      positions: extractedSections.positions || '',
      companyHistory: extractedSections.companyHistory || '',
      benefits: extractedSections.benefits || '',
      contact: extractedSections.contact || '',
      transportation: extractedSections.transportation || '',
      jobUrl: jobUrl,
      postedDate: extractedSections.postedDate || '',
      scrapedAt: new Date().toISOString()
    };
  }
  
  /**
   * Extract text from multiple selectors, return first match
   */
  async extractTextFromSelectors(selectors) {
    for (const selector of selectors) {
      try {
        const element = await this.hero.document.querySelector(selector);
        if (element) {
          const text = await element.innerText;
          if (text && text.trim()) {
            return text.trim();
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    return '';
  }
  
  /**
   * Extract job sections from body text
   */
  extractSectionsFromText(bodyText) {

    const sections = {
      company: '',
      postedDate: '',
      title: '',
      location: '',
      salary: '',
      positions: '',
      companyHistory: '',
      benefits: '',
      contact: '',
      transportation: ''
    };

    const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);

    // หาชื่อบริษัท (บริษัท ... จำกัด)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^บริษัท\s+.+\s+จำกัด$/)) {
        sections.company = lines[i];
        break;
      }
    }

    // หาวันที่ประกาศ (รูปแบบ: XX ธ.ค. XX)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\d{1,2}\s+[ก-ฮ]\.[ก-ฮ]\.\s+\d{2}$/)) {
        sections.postedDate = lines[i];
        break;
      }
    }

    // หาตำแหน่งงาน (บรรทัดหลังวันที่ประกาศ และไม่ใช่คำว่า "สถานที่ปฏิบัติงาน" หรือ "เงินเดือน")
    const dateIndex = lines.findIndex(l => l.match(/^\d{1,2}\s+[ก-ฮ]\.[ก-ฮ]\.\s+\d{2}$/));
    if (dateIndex !== -1 && dateIndex + 1 < lines.length) {
      const titleCandidate = lines[dateIndex + 1];
      if (titleCandidate && !titleCandidate.includes('สถานที่') && !titleCandidate.includes('เงินเดือน')) {
        sections.title = titleCandidate;
      }
    }

    // หาสถานที่ปฏิบัติงาน (หลังคำว่า "สถานที่ปฏิบัติงาน")
    const locationIndex = lines.findIndex(l => l === 'สถานที่ปฏิบัติงาน');
    if (locationIndex !== -1 && locationIndex + 1 < lines.length) {
      sections.location = lines[locationIndex + 1];
    }

    // หาเงินเดือน (หลังคำว่า "เงินเดือน")
    const salaryIndex = lines.findIndex(l => l === 'เงินเดือน');
    if (salaryIndex !== -1 && salaryIndex + 1 < lines.length) {
      sections.salary = lines[salaryIndex + 1];
    }

    // หาจำนวนเปิดรับ (หลังคำว่า "อัตรา")
    const positionsIndex = lines.findIndex(l => l === 'อัตรา');
    if (positionsIndex !== -1 && positionsIndex + 1 < lines.length) {
      sections.positions = lines[positionsIndex + 1];
    }

    // หาประวัติบริษัท (หาบรรทัดที่เป็นภาษาอังกฤษและมี website)
    let companyHistoryLines = [];
    let foundCompanyHistoryStart = false;
    for (let i = 0; i < lines.length; i++) {
      // เริ่มต้นเมื่อเจอชื่อบริษัทภาษาอังกฤษ (มี Co., Ltd.)
      if (lines[i].match(/Co\.,?\s*Ltd\.?/i)) {
        foundCompanyHistoryStart = true;
        companyHistoryLines.push(lines[i]);
        continue;
      }

      // หาก found แล้วให้เก็บบรรทัดต่อไปจนกว่าจะเจอ "สวัสดิการ"
      if (foundCompanyHistoryStart) {
        if (lines[i] === 'สวัสดิการ') {
          break;
        }
        companyHistoryLines.push(lines[i]);
      }
    }
    sections.companyHistory = companyHistoryLines.join('\n');

    // หาสวัสดิการ (หลังคำว่า "สวัสดิการ")
    const benefitsIndex = lines.findIndex(l => l === 'สวัสดิการ');
    if (benefitsIndex !== -1) {
      let benefitsLines = [];
      for (let i = benefitsIndex + 1; i < lines.length; i++) {
        if (lines[i] === 'ติดต่อ') {
          break;
        }
        // เก็บเฉพาะบรรทัดที่ขึ้นต้นด้วยตัวเลข
        if (lines[i].match(/^\d+\./)) {
          benefitsLines.push(lines[i]);
        }
      }
      sections.benefits = benefitsLines.join('\n');
    }

    // หาข้อมูลติดต่อ (หลังคำว่า "ติดต่อ")
    const contactIndex = lines.findIndex(l => l === 'ติดต่อ');
    if (contactIndex !== -1) {
      let contactLines = [];
      for (let i = contactIndex; i < lines.length; i++) {
        if (lines[i] === 'วิธีการเดินทาง') {
          break;
        }
        contactLines.push(lines[i]);
      }
      sections.contact = contactLines.join('\n');
    }

    // หาวิธีการเดินทาง (หลังคำว่า "วิธีการเดินทาง")
    const transportIndex = lines.findIndex(l => l === 'วิธีการเดินทาง');
    if (transportIndex !== -1 && transportIndex + 1 < lines.length) {
      const transportLine = lines[transportIndex + 1];
      // เก็บเฉพาะบรรทัดที่มี BTS หรือ MRT
      if (transportLine.match(/BTS|MRT/)) {
        sections.transportation = transportLine;
      }
    }

    return sections;
  }
  
  /**
   * Stop the worker
   */
  async stop() {
    console.log(`🛑 Worker ${this.id}: Stopping...`);
    this.isRunning = false;
  }
  
  /**
   * Close the worker and release resources
   */
  async close() {
    this.isRunning = false;
    
    if (this.hero) {
      try {
        await this.hero.close();
      } catch (error) {
        console.error(`⚠️ Worker ${this.id}: Error closing Hero:`, error.message);
      }
      this.hero = null;
    }
    
    console.log(`🔒 Worker ${this.id}: Closed`);
  }
  
  /**
   * Wait for specified milliseconds
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Wait for random delay between min and max
   */
  async randomDelay() {
    const { min, max } = this.config.delay;
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.delay(ms);
  }
  
  /**
   * Get worker status
   */
  getStatus() {
    return {
      id: this.id,
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      hasHero: !!this.hero
    };
  }
}

/**
 * Worker pool manager
 * Manages multiple workers for parallel processing
 */
export class WorkerPool {
  constructor(config, queue, fileHandler) {
    this.config = config;
    this.queue = queue;
    this.fileHandler = fileHandler;
    this.workers = [];
    this.isRunning = false;
  }
  
  /**
   * Initialize all workers
   */
  async init() {
    const workerCount = this.config.workers || 3;
    console.log(`🏭 Initializing worker pool with ${workerCount} workers...`);
    
    for (let i = 1; i <= workerCount; i++) {
      const worker = new Worker(i, this.config, this.queue, this.fileHandler);
      await worker.init();
      this.workers.push(worker);
    }
    
    console.log(`✅ Worker pool initialized with ${this.workers.length} workers`);
  }
  
  /**
   * Start all workers
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log(`🚀 Starting ${this.workers.length} workers...`);
    
    // Start all workers in parallel
    const workerPromises = this.workers.map(worker => worker.start());
    
    // Wait for all workers to complete
    await Promise.all(workerPromises);
    
    this.isRunning = false;
    console.log(`✅ All workers completed`);
  }
  
  /**
   * Stop all workers
   */
  async stop() {
    console.log(`🛑 Stopping all workers...`);
    this.isRunning = false;
    
    await Promise.all(this.workers.map(worker => worker.stop()));
  }
  
  /**
   * Close all workers and release resources
   */
  async close() {
    console.log(`🔒 Closing worker pool...`);
    this.isRunning = false;
    
    await Promise.all(this.workers.map(worker => worker.close()));
    this.workers = [];
    
    console.log(`✅ Worker pool closed`);
  }
  
  /**
   * Get pool status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      workerCount: this.workers.length,
      workers: this.workers.map(w => w.getStatus())
    };
  }
  
  /**
   * Get total processed count across all workers
   */
  getTotalProcessed() {
    return this.workers.reduce((total, worker) => total + worker.processedCount, 0);
  }
}

export default WorkerPool;

