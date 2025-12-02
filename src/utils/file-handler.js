import fs from 'fs';
import path from 'path';

/**
 * Real-time JSON file handler for streaming job data
 */
export class FileHandler {
  constructor(outputPath) {
    this.outputPath = outputPath;
    this.jobs = [];
    this.isInitialized = false;
  }
  
  /**
   * Initialize the output file
   */
  async init() {
    // Ensure output directory exists
    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Load existing data if file exists
    if (fs.existsSync(this.outputPath)) {
      try {
        const data = fs.readFileSync(this.outputPath, 'utf8');
        const parsed = JSON.parse(data);
        this.jobs = parsed.jobs || [];
        console.log(`📂 Loaded ${this.jobs.length} existing jobs from ${this.outputPath}`);
      } catch (error) {
        console.log(`📂 Creating new output file: ${this.outputPath}`);
        this.jobs = [];
      }
    }
    
    this.isInitialized = true;
    await this.save();
  }
  
  /**
   * Add a job and save immediately (real-time saving)
   * @param {Object} job - Job data to add
   * @returns {boolean} True if job was added (not duplicate)
   */
  async addJob(job) {
    if (!this.isInitialized) {
      await this.init();
    }
    
    // Check for duplicate by job ID
    const exists = this.jobs.some(j => j.id === job.id);
    if (exists) {
      console.log(`⏭️  Skipping duplicate job: ${job.id}`);
      return false;
    }
    
    this.jobs.push(job);
    await this.save();
    console.log(`💾 Saved job: ${job.id} - ${job.title} (Total: ${this.jobs.length})`);
    return true;
  }
  
  /**
   * Add multiple jobs at once
   * @param {Array} jobs - Array of job data
   * @returns {number} Number of new jobs added
   */
  async addJobs(jobs) {
    if (!this.isInitialized) {
      await this.init();
    }
    
    let addedCount = 0;
    const existingIds = new Set(this.jobs.map(j => j.id));
    
    for (const job of jobs) {
      if (!existingIds.has(job.id)) {
        this.jobs.push(job);
        existingIds.add(job.id);
        addedCount++;
      }
    }
    
    if (addedCount > 0) {
      await this.save();
      console.log(`💾 Saved ${addedCount} new jobs (Total: ${this.jobs.length})`);
    }
    
    return addedCount;
  }
  
  /**
   * Save jobs to file
   */
  async save() {
    const data = {
      metadata: {
        totalJobs: this.jobs.length,
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      },
      jobs: this.jobs
    };
    
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(this.outputPath, json, 'utf8');
  }
  
  /**
   * Get all jobs
   * @returns {Array} All saved jobs
   */
  getJobs() {
    return this.jobs;
  }
  
  /**
   * Get job count
   * @returns {number} Number of jobs
   */
  getCount() {
    return this.jobs.length;
  }
  
  /**
   * Check if job already exists
   * @param {string} jobId - Job ID to check
   * @returns {boolean} True if exists
   */
  hasJob(jobId) {
    return this.jobs.some(j => j.id === jobId);
  }
  
  /**
   * Get existing job IDs as Set for efficient lookup
   * @returns {Set} Set of job IDs
   */
  getExistingIds() {
    return new Set(this.jobs.map(j => j.id));
  }
  
  /**
   * Create a backup of current data
   */
  async backup() {
    if (this.jobs.length === 0) return;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
    const backupPath = this.outputPath.replace('.json', `-backup-${timestamp}.json`);
    const data = {
      metadata: {
        totalJobs: this.jobs.length,
        backupDate: new Date().toISOString()
      },
      jobs: this.jobs
    };
    
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`📦 Backup created: ${backupPath}`);
  }
}

export default FileHandler;

