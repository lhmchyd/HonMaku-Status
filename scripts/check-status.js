const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  urls: [
    { name: 'Main Website', url: 'https://example.com', timeout: 10000 },
    { name: 'API Server', url: 'https://api.example.com', timeout: 10000 }
  ],
  maxHistoryChecks: 100,
  maxDailySnapshots: 60,
  timezone: 'UTC' // or 'Asia/Jakarta' for your location
};

// File paths
const RESULTS_FILE = path.join(__dirname, '../status-results.json');
const HISTORY_FILE = path.join(__dirname, '../status-history.json');
const DAILY_FILE = path.join(__dirname, '../status-day.json');

// Check a single URL
function checkUrl(url, timeout = 10000) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const startTime = Date.now();

    const req = protocol.get(url, { timeout }, (res) => {
      const responseTime = Date.now() - startTime;
      
      resolve({
        status: res.statusCode >= 200 && res.statusCode < 300 ? 'up' : 'down',
        statusCode: res.statusCode,
        responseTime,
        error: null
      });
      
      // Consume response data to free up memory
      res.resume();
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 'down',
        statusCode: null,
        responseTime: Date.now() - startTime,
        error: 'Request timeout'
      });
    });

    req.on('error', (err) => {
      resolve({
        status: 'down',
        statusCode: null,
        responseTime: Date.now() - startTime,
        error: err.message
      });
    });
  });
}

// Get date in YYYY-MM-DD format for the configured timezone
function getDateString(timestamp = Date.now()) {
  const date = new Date(timestamp);
  
  // Use Intl API for proper timezone handling
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  return formatter.format(date); // Returns YYYY-MM-DD
}

// Read JSON file safely
function readJsonFile(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`Warning: Could not read ${filePath}:`, err.message);
  }
  return defaultValue;
}

// Write JSON file safely
function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✓ Written to ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to write ${filePath}:`, err.message);
    return false;
  }
}

// Process daily snapshots from history
function processDailySnapshots(history, existingDaily) {
  const dailyMap = new Map();
  
  // Load existing daily snapshots into map
  existingDaily.forEach(snapshot => {
    dailyMap.set(snapshot.date, snapshot);
  });
  
  const today = getDateString();
  const historyByDay = new Map();
  
  // Group history by date
  history.forEach(check => {
    const checkDate = getDateString(check.timestamp);
    if (!historyByDay.has(checkDate)) {
      historyByDay.set(checkDate, []);
    }
    historyByDay.get(checkDate).push(check);
  });
  
  // Process each day (except today - it's not complete yet)
  historyByDay.forEach((checks, date) => {
    if (date === today) {
      return; // Skip today as it's not complete
    }
    
    // Only update if we don't have this day or if we have more recent data
    if (!dailyMap.has(date)) {
      // Take the last check of the day (highest timestamp)
      const lastCheck = checks.reduce((latest, current) => 
        current.timestamp > latest.timestamp ? current : latest
      );
      
      dailyMap.set(date, {
        date,
        timestamp: lastCheck.timestamp,
        checks: lastCheck.checks,
        summary: calculateSummary(lastCheck.checks)
      });
      
      console.log(`✓ Added daily snapshot for ${date}`);
    }
  });
  
  // Convert map to array and sort by date (newest first)
  const dailyArray = Array.from(dailyMap.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, CONFIG.maxDailySnapshots);
  
  return dailyArray;
}

// Calculate summary statistics
function calculateSummary(checks) {
  const total = checks.length;
  const up = checks.filter(c => c.status === 'up').length;
  const down = total - up;
  const avgResponseTime = checks
    .filter(c => c.responseTime !== null)
    .reduce((sum, c) => sum + c.responseTime, 0) / total;
  
  return {
    total,
    up,
    down,
    uptime: total > 0 ? ((up / total) * 100).toFixed(2) + '%' : '0%',
    avgResponseTime: Math.round(avgResponseTime)
  };
}

// Main execution
async function main() {
  console.log('Starting status check...');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Timezone:', CONFIG.timezone);
  console.log('Current date:', getDateString());
  console.log('---');
  
  // Perform checks for all URLs
  const checks = [];
  for (const site of CONFIG.urls) {
    console.log(`Checking ${site.name} (${site.url})...`);
    const result = await checkUrl(site.url, site.timeout);
    
    checks.push({
      name: site.name,
      url: site.url,
      ...result
    });
    
    console.log(`  Status: ${result.status} (${result.statusCode || 'N/A'})`);
    console.log(`  Response time: ${result.responseTime}ms`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }
  
  const currentCheck = {
    timestamp: Date.now(),
    date: getDateString(),
    checks
  };
  
  console.log('---');
  
  // 1. Write current results
  writeJsonFile(RESULTS_FILE, currentCheck);
  
  // 2. Update history
  const history = readJsonFile(HISTORY_FILE, []);
  history.unshift(currentCheck); // Add to beginning
  
  // Keep only last N checks
  const trimmedHistory = history.slice(0, CONFIG.maxHistoryChecks);
  writeJsonFile(HISTORY_FILE, trimmedHistory);
  
  // 3. Process and update daily snapshots
  const existingDaily = readJsonFile(DAILY_FILE, []);
  const updatedDaily = processDailySnapshots(trimmedHistory, existingDaily);
  
  if (updatedDaily.length !== existingDaily.length) {
    writeJsonFile(DAILY_FILE, updatedDaily);
    console.log(`Daily snapshots: ${updatedDaily.length} days stored`);
  } else {
    console.log('No new daily snapshots to add');
  }
  
  console.log('---');
  console.log('Status check completed successfully!');
}

// Run main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
