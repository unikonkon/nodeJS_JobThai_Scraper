import Hero from '@ulixee/hero';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '..', 'config.json');

/**
 * Build search URL based on config
 * @param {Object} config - Configuration object
 * @returns {string} Search URL
 */
function buildSearchUrl(config) {
  const { searchMode, keyword, bts_mrt, custom_url } = config;
  
  if (searchMode === 'custom_url' && custom_url) {
    return custom_url;
  } else if (searchMode === 'bts_mrt' && bts_mrt) {
    return `https://www.jobthai.com/หางาน/${bts_mrt}`;
  } else if (searchMode === 'keyword' && keyword) {
    const encodedKeyword = encodeURIComponent(keyword);
    return `https://www.jobthai.com/th/jobs?keyword=${encodedKeyword}`;
  } else {
    return 'https://www.jobthai.com/th/jobs';
  }
}

/**
 * Parse pagination info from HTML
 * @param {string} html - HTML content
 * @param {string} currentUrl - Current page URL
 * @returns {Object} Pagination info
 */
function parsePagination(html, currentUrl) {
  const $ = cheerio.load(html);
  
  const paginationItems = $('ul.pagination li, .pagination a, nav[aria-label*="pagination"] a, [class*="Pagination"] a');
  
  let currentPage = 1;
  let totalPages = 1;
  
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
  
  return {
    currentPage,
    totalPages
  };
}

/**
 * Parse total job count from HTML
 * @param {string} html - HTML content
 * @returns {number} Total job count
 */
function parseTotalJobs(html) {
  const $ = cheerio.load(html);
  
  // Look for job count text (e.g., "พบ 1,234 ตำแหน่งงาน")
  const countText = $('[class*="count"], [class*="total"], .result-count').text();
  const match = countText.match(/(\d[\d,]*)/);
  
  if (match) {
    return parseInt(match[1].replace(/,/g, ''));
  }
  
  return 0;
}

/**
 * Find and click next page button
 * @param {Hero} hero - Hero instance
 * @returns {boolean} true if next button was clicked, false if no next button
 */
async function clickNextButton(hero) {
  try {
    // Try multiple selectors for next button
    const nextSelectors = [
      'a[aria-label*="Next"]',
      'a[aria-label*="next"]',
      'li:has(a:contains("›")) a',
      'a:contains("›")',
      'a:contains("ถัดไป")',
      'a[rel="next"]',
      '.pagination .next a',
      '[class*="Pagination"] a:contains("›")',
      'button:contains("›")',
      'button:contains("ถัดไป")'
    ];
    
    for (const selector of nextSelectors) {
      try {
        const nextButton = await hero.document.querySelector(selector);
        if (nextButton) {
          // Check if the button is disabled or hidden
          const isDisabled = await nextButton.getAttribute('disabled');
          const ariaDisabled = await nextButton.getAttribute('aria-disabled');
          const className = await nextButton.className || '';
          
          if (isDisabled || ariaDisabled === 'true' || className.includes('disabled')) {
            continue;
          }
          
          // Click the next button
          await nextButton.click();
          return true;
        }
      } catch (e) {
        // Selector didn't match, try next
      }
    }
    
    // Alternative: Try using querySelectorAll and find the › symbol
    try {
      const allLinks = await hero.document.querySelectorAll('a');
      for (const link of allLinks) {
        const text = await link.textContent;
        if (text && (text.includes('›') || text.includes('ถัดไป') || text.includes('Next'))) {
          const className = await link.className || '';
          const isDisabled = className.includes('disabled');
          
          if (!isDisabled) {
            await link.click();
            return true;
          }
        }
      }
    } catch (e) {
      // Ignore
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check if next button exists and is clickable
 * @param {string} html - HTML content
 * @returns {boolean} true if next button exists
 */
function hasNextButton(html) {
  const $ = cheerio.load(html);
  
  // Check for next button patterns
  const nextPatterns = [
    'a[aria-label*="Next"]',
    'a[aria-label*="next"]',
    'a:contains("›")',
    'a:contains("ถัดไป")',
    'a[rel="next"]',
    '.pagination .next a',
    'li:contains("›") a'
  ];
  
  for (const pattern of nextPatterns) {
    const el = $(pattern);
    if (el.length) {
      // Check if not disabled
      const isDisabled = el.hasClass('disabled') || 
                         el.attr('disabled') || 
                         el.attr('aria-disabled') === 'true' ||
                         el.parent().hasClass('disabled');
      if (!isDisabled) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get total pages from JobThai search by clicking through all pages
 */
async function getPages() {
  let hero = null;
  
  try {
    // Read config
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    console.log('📖 Reading config.json...');
    console.log(`   Search Mode: ${config.searchMode}`);
    if (config.searchMode === 'keyword') {
      console.log(`   Keyword: ${config.keyword || '-'}`);
    } else if (config.searchMode === 'bts_mrt') {
      console.log(`   BTS/MRT: ${config.bts_mrt || '-'}`);
    } else if (config.searchMode === 'custom_url') {
      console.log(`   Custom URL: ${config.custom_url || '-'}`);
    }
    console.log(`   Current maxPages: ${config.maxPages}`);
    
    const searchUrl = buildSearchUrl(config);
    console.log(`\n🔍 Search URL: ${searchUrl}`);
    
    // Initialize Hero
    console.log('\n🚀 Connecting to Ulixee Cloud...');
    hero = new Hero({
      connectionToCore: {
        host: config.cloudHost
      },
      showChrome: false,
      userAgent: '~ chrome >= 120'
    });
    
    // Navigate to search page
    console.log('🌐 Navigating to JobThai...');
    await hero.goto(searchUrl);
    await hero.waitForPaintingStable();
    
    // Wait for page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get page HTML
    let html = await hero.document.documentElement.outerHTML;
    
    // Parse total jobs
    const totalJobs = parseTotalJobs(html);
    console.log(`\n📊 Total jobs found: ${totalJobs}`);
    
    // Parse initial pagination
    const pagination = parsePagination(html, searchUrl);
    console.log(`📄 Initial pages detected from pagination: ${pagination.totalPages}`);
    
    // Count pages by clicking through
    let currentPage = 1;
    let totalPages = 1;
    const maxSafetyLimit = 500; // Safety limit to prevent infinite loop
    
    console.log('\n🔄 Counting pages by clicking "Next" button...');
    console.log(`   📄 Page ${currentPage}`);
    
    // Check if there's a next button
    while (hasNextButton(html) && currentPage < maxSafetyLimit) {
      // Try to click next button
      const clicked = await clickNextButton(hero);
      
      if (!clicked) {
        console.log('   ⚠️ Could not click next button, stopping...');
        break;
      }
      
      // Wait for page to load
      await hero.waitForPaintingStable();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get new page HTML
      html = await hero.document.documentElement.outerHTML;
      
      currentPage++;
      totalPages = currentPage;
      
      // Log progress every page (or every 10 pages if too many)
      if (currentPage <= 20 || currentPage % 10 === 0) {
        console.log(`   📄 Page ${currentPage}`);
      }
      
      // Check if we've reached the last page
      if (!hasNextButton(html)) {
        console.log(`   ✅ Reached last page (no more "Next" button)`);
        break;
      }
    }
    
    // Use the higher value between pagination detected and pages counted
    const paginationMax = pagination.totalPages;
    if (paginationMax > totalPages) {
      console.log(`\n📊 Using pagination max (${paginationMax}) instead of counted pages (${totalPages})`);
      totalPages = paginationMax;
    }
    
    console.log(`\n📄 Total pages counted: ${totalPages}`);
    
    // Update config.json
    console.log(`\n💾 Updating config.json with maxPages: ${totalPages}`);
    
    config.maxPages = totalPages;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    
    console.log('\n✅ Config updated successfully!');
    console.log('='.repeat(50));
    console.log(`   maxPages: ${totalPages}`);
    console.log(`   Total jobs: ${totalJobs}`);
    console.log('='.repeat(50));
    
    return { totalPages, totalJobs };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (hero) {
      try {
        await hero.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

// Run if called directly
getPages()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });

