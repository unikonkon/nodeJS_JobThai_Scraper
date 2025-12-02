import { EventEmitter } from 'events';

/**
 * Job queue manager for parallel scraping
 * Manages job URLs to be processed by workers
 */
export class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.pending = [];      // Jobs waiting to be processed
    this.processing = [];   // Jobs currently being processed
    this.completed = [];    // Successfully completed jobs
    this.failed = [];       // Failed jobs
    this.paused = false;
  }
  
  /**
   * Add a job to the queue
   * @param {Object} job - Job object with at least { id, url }
   */
  add(job) {
    // Check if job already exists in any queue
    if (this.exists(job.id)) {
      return false;
    }
    
    this.pending.push({
      ...job,
      addedAt: Date.now(),
      attempts: 0
    });
    
    this.emit('job:added', job);
    return true;
  }
  
  /**
   * Add multiple jobs to the queue
   * @param {Array} jobs - Array of job objects
   * @returns {number} Number of jobs added
   */
  addBulk(jobs) {
    let added = 0;
    for (const job of jobs) {
      if (this.add(job)) {
        added++;
      }
    }
    return added;
  }
  
  /**
   * Get next job from queue for processing
   * @returns {Object|null} Next job or null if queue is empty/paused
   */
  getNext() {
    if (this.paused || this.pending.length === 0) {
      return null;
    }
    
    const job = this.pending.shift();
    job.startedAt = Date.now();
    job.attempts++;
    this.processing.push(job);
    
    this.emit('job:started', job);
    return job;
  }
  
  /**
   * Mark a job as completed
   * @param {string} jobId - Job ID
   * @param {Object} result - Result data
   */
  complete(jobId, result = null) {
    const index = this.processing.findIndex(j => j.id === jobId);
    if (index === -1) return false;
    
    const job = this.processing.splice(index, 1)[0];
    job.completedAt = Date.now();
    job.result = result;
    this.completed.push(job);
    
    this.emit('job:completed', job);
    this.checkDone();
    return true;
  }
  
  /**
   * Mark a job as failed
   * @param {string} jobId - Job ID
   * @param {Error} error - Error that occurred
   * @param {boolean} retry - Whether to retry the job
   */
  fail(jobId, error, retry = false) {
    const index = this.processing.findIndex(j => j.id === jobId);
    if (index === -1) return false;
    
    const job = this.processing.splice(index, 1)[0];
    job.error = error.message;
    job.failedAt = Date.now();
    
    if (retry && job.attempts < 3) {
      // Return to pending queue for retry
      this.pending.unshift(job);
      this.emit('job:retry', job);
    } else {
      this.failed.push(job);
      this.emit('job:failed', job);
    }
    
    this.checkDone();
    return true;
  }
  
  /**
   * Check if job exists in any queue
   * @param {string} jobId - Job ID
   * @returns {boolean}
   */
  exists(jobId) {
    return (
      this.pending.some(j => j.id === jobId) ||
      this.processing.some(j => j.id === jobId) ||
      this.completed.some(j => j.id === jobId) ||
      this.failed.some(j => j.id === jobId)
    );
  }
  
  /**
   * Check if all jobs are done
   */
  checkDone() {
    if (this.pending.length === 0 && this.processing.length === 0) {
      this.emit('queue:done', {
        completed: this.completed.length,
        failed: this.failed.length
      });
    }
  }
  
  /**
   * Pause the queue
   */
  pause() {
    this.paused = true;
    this.emit('queue:paused');
  }
  
  /**
   * Resume the queue
   */
  resume() {
    this.paused = false;
    this.emit('queue:resumed');
  }
  
  /**
   * Get queue statistics
   * @returns {Object} Queue stats
   */
  getStats() {
    return {
      pending: this.pending.length,
      processing: this.processing.length,
      completed: this.completed.length,
      failed: this.failed.length,
      total: this.pending.length + this.processing.length + this.completed.length + this.failed.length,
      paused: this.paused
    };
  }
  
  /**
   * Check if queue is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.pending.length === 0;
  }
  
  /**
   * Check if queue is done (no pending or processing)
   * @returns {boolean}
   */
  isDone() {
    return this.pending.length === 0 && this.processing.length === 0;
  }
  
  /**
   * Check if there are jobs available
   * @returns {boolean}
   */
  hasAvailable() {
    return !this.paused && this.pending.length > 0;
  }
  
  /**
   * Clear all queues
   */
  clear() {
    this.pending = [];
    this.processing = [];
    this.completed = [];
    this.failed = [];
    this.emit('queue:cleared');
  }
  
  /**
   * Get failed jobs for potential retry
   * @returns {Array}
   */
  getFailedJobs() {
    return [...this.failed];
  }
  
  /**
   * Retry all failed jobs
   */
  retryFailed() {
    const failedJobs = this.failed.splice(0);
    for (const job of failedJobs) {
      job.attempts = 0;
      delete job.error;
      delete job.failedAt;
      this.pending.push(job);
    }
    return failedJobs.length;
  }
}

/**
 * Page queue for managing pagination
 */
export class PageQueue extends EventEmitter {
  constructor() {
    super();
    this.pages = [];
    this.currentPage = 0;
    this.totalPages = 0;
    this.processedPages = new Set();
  }
  
  /**
   * Set total pages
   * @param {number} total - Total number of pages
   */
  setTotal(total) {
    this.totalPages = total;
    this.emit('pages:total', total);
  }
  
  /**
   * Add page to queue
   * @param {number} pageNum - Page number
   * @param {string} url - Page URL
   */
  addPage(pageNum, url) {
    if (!this.processedPages.has(pageNum)) {
      this.pages.push({ pageNum, url });
    }
  }
  
  /**
   * Get next page
   * @returns {Object|null}
   */
  getNextPage() {
    if (this.pages.length === 0) return null;
    
    const page = this.pages.shift();
    this.currentPage = page.pageNum;
    this.processedPages.add(page.pageNum);
    
    this.emit('page:processing', page);
    return page;
  }
  
  /**
   * Mark current page as complete
   * @param {number} jobsFound - Number of jobs found on this page
   */
  completePage(jobsFound) {
    this.emit('page:completed', {
      pageNum: this.currentPage,
      jobsFound
    });
  }
  
  /**
   * Check if there are more pages
   * @returns {boolean}
   */
  hasMorePages() {
    return this.pages.length > 0;
  }
  
  /**
   * Get progress
   * @returns {Object}
   */
  getProgress() {
    return {
      current: this.processedPages.size,
      total: this.totalPages,
      remaining: this.pages.length
    };
  }
}

export default JobQueue;

