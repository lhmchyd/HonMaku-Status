const fs = require('fs').promises;
const https = require('https');
const http = require('http');
const { URL } = require('url');

function checkWebsiteStatus(url, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Website Status Checker'
      }
    };
    
    const request = client.request(options, (res) => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      resolve({
        url,
        status: res.statusCode,
        statusText: res.statusMessage || '',
        responseTime,
        error: null,
        timestamp: Math.floor(Date.now() / 1000) // Unix timestamp
      });
      
      // Consume response to free memory
      res.resume();
    });
    
    request.on('error', (error) => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      resolve({
        url,
        status: null,
        statusText: 'Error',
        responseTime,
        error: error.message,
        timestamp: Math.floor(Date.now() / 1000) // Unix timestamp
      });
    });
    
    const timeoutId = setTimeout(() => {
      request.destroy();
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      resolve({
        url,
        status: null,
        statusText: 'Timeout',
        responseTime,
        error: 'Request timed out',
        timestamp: Math.floor(Date.now() / 1000) // Unix timestamp
      });
    }, timeout);
    
    request.on('close', () => clearTimeout(timeoutId));
    request.end();
  });
}

// Function to get date string in YYYY-MM-DD format
function getDateString(timestamp, timezone = 'UTC') {
  const date = new Date(timestamp * 1000);
  // Use timezone-aware formatting
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

async function runStatusCheck() {
  console.log('Starting website status check...');
  
  // Load configuration to get websites to monitor
  let config;
  try {
    const configData = await fs.readFile('config.json', 'utf-8');
    config = JSON.parse(configData);
  } catch (error) {
    console.log('No config.json found, using default configuration');
    config = {
      services: [
        { name: "AniList", url: "https://anilist.co", timeout: 10000 },
        { name: "Giscus", url: "https://giscus.app", timeout: 10000 }
      ]
    };
  }
  
  // Use the services from config
  const services = config.services;
  
  if (!services || services.length === 0) {
    console.log('No services configured in config.json. Please add services to monitor.');
    process.exit(0);
  }
  
  const results = [];
  let hasError = false; // Track if any service has an error
  
  for (const service of services) {
    console.log(`Checking ${service.url}...`);
    const result = await checkWebsiteStatus(service.url, service.timeout || 10000);
    // Add name to result for better tracking
    result.name = service.name;
    results.push(result);
    
    // Check if this result has an error
    if (result.status === null || result.status >= 400) {
      hasError = true;
    }
    
    console.log(`${service.url}: Status ${result.status || 'ERROR'} (${result.responseTime}ms)`);
  }
  
  const currentCheck = {
    timestamp: Math.floor(Date.now() / 1000), // Unix timestamp for 5-minute data
    results
  };
  
  // Get current date for daily tracking
  const currentDate = getDateString(Math.floor(Date.now() / 1000), config.timezone || 'UTC');
  const currentUnixTimestamp = Math.floor(Date.now() / 1000);
  
  // Load existing history (daily snapshots)
  let history = [];
  try {
    const historyData = await fs.readFile('status-history.json', 'utf-8');
    history = JSON.parse(historyData);
  } catch (error) {
    console.log('No existing history found, creating new file');
  }
  
  // Check if we already have an entry for today in history
  const todayHistoryIndex = history.findIndex(item => 
    getDateString(item.timestamp, config.timezone || 'UTC') === currentDate
  );
  
  if (todayHistoryIndex === -1) {
    // Add today's daily status to history (good/error)
    const dailyEntry = {
      date: currentDate,
      timestamp: currentUnixTimestamp,
      status: hasError ? 'error' : 'good' // Daily status is good or error
    };
    
    history.unshift(dailyEntry);
    
    // Keep only the last 60 days of history
    history = history.slice(0, 60);
    
    console.log(`Daily status added to history: ${currentDate} - ${hasError ? 'error' : 'good'}`);
  } else {
    // Update today's status if it changed
    if (history[todayHistoryIndex].status === 'good' && hasError) {
      history[todayHistoryIndex].status = 'error';
      history[todayHistoryIndex].timestamp = currentUnixTimestamp; // Update timestamp
      console.log(`Updated today's status to error: ${currentDate}`);
    }
  }
  
  // Load existing incidents
  let incidents = [];
  try {
    const incidentsData = await fs.readFile('status-incidents.json', 'utf-8');
    incidents = JSON.parse(incidentsData);
  } catch (error) {
    console.log('No existing incidents file found, creating new file');
    incidents = [];
  }
  
  // If there's an error, add detailed incident information
  if (hasError) {
    for (const result of results) {
      if (result.status === null || result.status >= 400) {
        // Check if this service already had an incident today
        const existingIncidentIndex = incidents.findIndex(incident => 
          getDateString(incident.timestamp, config.timezone || 'UTC') === currentDate &&
          incident.service === result.url
        );
        
        if (existingIncidentIndex === -1) {
          // Add new incident
          const incident = {
            date: currentDate,
            timestamp: currentUnixTimestamp,
            service: result.url,
            name: result.name,
            status: result.status,
            error: result.error || result.statusText,
            responseTime: result.responseTime
          };
          incidents.unshift(incident);
          console.log(`New incident recorded: ${result.name} (${result.url}) is down`);
        }
      }
    }
  }
  
  // Keep only the last 100 incidents to manage file size
  incidents = incidents.slice(0, 100);
  
  // Save history (daily snapshots)
  await fs.writeFile('status-history.json', JSON.stringify(history, null, 2));
  console.log(`History updated in status-history.json (${history.length} days)`);
  
  // Save incidents
  await fs.writeFile('status-incidents.json', JSON.stringify(incidents, null, 2));
  console.log(`Incidents updated in status-incidents.json (${incidents.length} incidents)`);
  
  // Save current status (5-minute data)
  await fs.writeFile('status-results.json', JSON.stringify(currentCheck, null, 2));
  console.log('Current status saved to status-results.json');
  
  return results;
}

runStatusCheck()
  .then(() => {
    console.log('Status check completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during status check:', error);
    process.exit(1);
  });
