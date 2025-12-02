import * as cheerio from 'cheerio';

/**
 * Parse job listings from JobThai search results page
 * @param {string} html - HTML content of the search results page
 * @returns {Array} Array of job summaries
 */
export function parseJobList(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  
  // JobThai job cards selector
  $('article[data-job-id], .job-card, [class*="JobCard"], a[href*="/job/"]').each((_, element) => {
    const $el = $(element);
    
    // Try to extract job URL and ID
    let jobUrl = $el.attr('href') || $el.find('a[href*="/job/"]').first().attr('href');
    if (!jobUrl) return;
    
    // Make URL absolute if needed
    if (jobUrl && !jobUrl.startsWith('http')) {
      jobUrl = `https://www.jobthai.com${jobUrl}`;
    }
    
    // Extract job ID from URL
    const jobIdMatch = jobUrl.match(/\/job\/(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : null;
    
    if (!jobId) return;
    
    // Extract basic info from list view
    const text = $el.text().trim();
    
    jobs.push({
      id: jobId,
      jobUrl: jobUrl,
      rawText: text
    });
  });
  
  return jobs;
}

/**
 * Parse detailed job information from job detail page
 * @param {string} html - HTML content of the job detail page
 * @param {string} jobUrl - URL of the job page
 * @returns {Object} Parsed job data
 */
export function parseJobDetail(html, jobUrl) {
  const $ = cheerio.load(html);
  
  // Extract job ID from URL
  const jobIdMatch = jobUrl.match(/\/job\/(\d+)/);
  const jobId = jobIdMatch ? jobIdMatch[1] : '';
  
  // Job title - try multiple selectors
  const title = extractText($, [
    'h1[class*="title"]',
    'h1[class*="job"]',
    '.job-title',
    'h1',
    '[class*="JobTitle"]'
  ]);
  
  // Company name
  const company = extractText($, [
    '.company-name',
    '[class*="company"]',
    'a[href*="/company/"]',
    '[class*="Company"]'
  ]);
  
  // Company logo
  const companyLogo = $('img[class*="company"], img[class*="logo"], .company-logo img')
    .first()
    .attr('src') || '';
  
  // Location
  const location = extractText($, [
    '.location',
    '[class*="location"]',
    '[class*="Location"]',
    '.job-location'
  ]);
  
  // Salary
  const salary = extractText($, [
    '.salary',
    '[class*="salary"]',
    '[class*="Salary"]',
    '.job-salary'
  ]);
  
  // Posted date
  const postedDate = extractText($, [
    '.posted-date',
    '[class*="date"]',
    '[class*="Date"]',
    'time'
  ]);
  
  // Job description - look for description section
  const description = extractLongText($, [
    '.job-description',
    '[class*="description"]',
    '[class*="Description"]',
    '#job-description',
    '.detail-content'
  ]);
  
  // Requirements/Qualifications
  const requirements = extractLongText($, [
    '.requirements',
    '[class*="requirement"]',
    '[class*="Requirement"]',
    '[class*="qualification"]',
    '[class*="Qualification"]'
  ]);
  
  // Benefits/Welfare
  const benefits = extractLongText($, [
    '.benefits',
    '[class*="benefit"]',
    '[class*="Benefit"]',
    '[class*="welfare"]',
    '[class*="Welfare"]'
  ]);
  
  return {
    id: jobId,
    title: title || 'ไม่ระบุตำแหน่ง',
    company: company || 'ไม่ระบุบริษัท',
    companyLogo: companyLogo,
    location: location || 'ไม่ระบุสถานที่',
    salary: salary || 'ไม่ระบุเงินเดือน',
    description: description || '',
    requirements: requirements || '',
    benefits: benefits || '',
    jobUrl: jobUrl,
    postedDate: postedDate || '',
    scrapedAt: new Date().toISOString()
  };
}

/**
 * Extract text from first matching selector
 */
function extractText($, selectors) {
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text) return text;
  }
  return '';
}

/**
 * Extract long text content, preserving line breaks
 */
function extractLongText($, selectors) {
  for (const selector of selectors) {
    const $el = $(selector).first();
    if ($el.length) {
      // Replace br tags with newlines
      $el.find('br').replaceWith('\n');
      // Replace li tags with bullet points
      $el.find('li').each((_, li) => {
        $(li).prepend('• ').append('\n');
      });
      return $el.text().trim();
    }
  }
  return '';
}

/**
 * Extract pagination info
 * @param {string} html - HTML content
 * @returns {Object} Pagination info { currentPage, totalPages, hasNext, nextPageUrl }
 */
export function parsePagination(html, currentUrl) {
  const $ = cheerio.load(html);
  
  // Try to find pagination elements
  const paginationItems = $('ul.pagination li, .pagination a, nav[aria-label*="pagination"] a, [class*="Pagination"] a');
  
  let currentPage = 1;
  let totalPages = 1;
  let hasNext = false;
  let nextPageUrl = null;
  
  // Try to find active/current page
  const activeItem = $('li.active a, .pagination .active, [aria-current="page"]');
  if (activeItem.length) {
    currentPage = parseInt(activeItem.text().trim()) || 1;
  }
  
  // Find all page numbers and determine total
  const pageNumbers = [];
  paginationItems.each((_, el) => {
    const text = $(el).text().trim();
    const num = parseInt(text);
    if (!isNaN(num)) {
      pageNumbers.push(num);
    }
  });
  
  if (pageNumbers.length) {
    totalPages = Math.max(...pageNumbers);
  }
  
  // Find next page link
  const nextLink = $('li:contains("›") a, a[rel="next"], .pagination .next a, a:contains("ถัดไป"), a[aria-label*="Next"]');
  if (nextLink.length && nextLink.attr('href')) {
    hasNext = true;
    nextPageUrl = nextLink.attr('href');
    if (nextPageUrl && !nextPageUrl.startsWith('http')) {
      const baseUrl = new URL(currentUrl);
      nextPageUrl = `${baseUrl.origin}${nextPageUrl}`;
    }
  } else if (currentPage < totalPages) {
    hasNext = true;
    // Construct next page URL
    const url = new URL(currentUrl);
    url.searchParams.set('page', currentPage + 1);
    nextPageUrl = url.toString();
  }
  
  return {
    currentPage,
    totalPages,
    hasNext,
    nextPageUrl
  };
}

/**
 * Extract total job count from search results
 * @param {string} html - HTML content
 * @returns {number} Total job count
 */
export function parseTotalJobs(html) {
  const $ = cheerio.load(html);
  
  // Look for job count text (e.g., "พบ 1,234 ตำแหน่งงาน")
  const countText = $('[class*="count"], [class*="total"], .result-count').text();
  const match = countText.match(/(\d[\d,]*)/);
  
  if (match) {
    return parseInt(match[1].replace(/,/g, ''));
  }
  
  return 0;
}

