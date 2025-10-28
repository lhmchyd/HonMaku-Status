let lastCheckTime = null;
let incidents = [];
let history = []; // Daily snapshots
let config = {};

async function loadConfig() {
    try {
        const response = await fetch('config.json?t=' + Date.now());
        if (response.ok) {
            config = await response.json();
        } else {
            console.error('Failed to load config, using defaults');
            config = {
                "title": "Service Status",
                "description": "Real-time status monitoring for our services",
                "updateInterval": 30000,
                "checkInterval": 30000,
                "services": [
                    {
                        "name": "AniList",
                        "url": "https://anilist.co",
                        "timeout": 10000
                    },
                    {
                        "name": "Giscus",
                        "url": "https://giscus.app",
                        "timeout": 10000
                    }
                ],
                "timezone": "UTC",
                "dateFormat": "12hour"
            };
        }
    } catch (error) {
        console.error('Error loading config:', error);
        // Use defaults if config file is not found
        config = {
            "title": "Service Status",
            "description": "Real-time status monitoring for our services",
            "updateInterval": 30000,
            "checkInterval": 30000,
            "services": [
                {
                    "name": "AniList",
                    "url": "https://anilist.co",
                    "timeout": 10000
                },
                {
                    "name": "Giscus",
                    "url": "https://giscus.app",
                    "timeout": 10000
                }
            ],
            "timezone": "UTC",
            "dateFormat": "12hour"
        };
    }
}

function formatUnixTimestamp(timestamp) {
    const d = new Date(timestamp * 1000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${ampm}`;
}

function formatDateLong(date) {
    const d = new Date(date * 1000); // Convert Unix timestamp to milliseconds
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const day = d.getDate(); // Don't pad with zero
    const year = d.getFullYear();
    return `${month} ${day}, ${year}`;
}

function formatTooltipDate(date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const day = date.getDate(); // Don't pad with zero
    const year = date.getFullYear();
    return `${month} ${day}, ${year}`;
}

function generateUptimeBars(result, isCurrentlyUp) {
    let bars = '';
    
    // Create 60 days of uptime bars (similar to the original)
    const now = Date.now() / 1000; // Current Unix timestamp
    const secondsInDay = 24 * 60 * 60;
    
    // Use the history array which contains daily status (good/error)
    const historyMap = {};
    history.forEach(dailyEntry => {
        historyMap[dailyEntry.date] = dailyEntry.status; // 'good' or 'error'
    });
    
    for (let i = 0; i < 60; i++) {
        // Calculate the date for this position in the bar
        const checkDateTimestamp = now - (59 - i) * secondsInDay;
        const checkDate = new Date(checkDateTimestamp * 1000);
        
        // Format date to match the history entries (YYYY-MM-DD format)
        const dateStr = checkDate.getFullYear() + '-' + 
                       String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(checkDate.getDate()).padStart(2, '0');
        
        let dayStatus = 'unknown'; // Default to unknown for no data
        let dayStatusText = 'No data';
        let dayDateText = formatTooltipDate(checkDate);
        
        // Check if we have a history entry for this day
        if (historyMap[dateStr]) {
            if (historyMap[dateStr] === 'error') {
                dayStatus = 'down'; // Error means down
                dayStatusText = 'Error';
            } else {
                dayStatus = 'up'; // Good means up
                dayStatusText = 'Operational';
            }
        }
        
        // Create tooltip content based on status
        let tooltipLayoutText = '';
        if (dayStatus === 'up') {
            tooltipLayoutText = 'No downtime recorded on this day.';
        } else if (dayStatus === 'down') {
            tooltipLayoutText = 'Downtime recorded on this day.';
        } else { // unknown
            tooltipLayoutText = 'No data exists for this day.';
        }
        
        const tooltipContent = `
            <div class="tooltip-date">${dayDateText}</div>
            <div class="tooltip-layout">
                ${tooltipLayoutText}
            </div>
        `;
        
        if (i === 59) { // Today shows current status
            const todayStatus = isCurrentlyUp ? 'up' : 'down';
            const todayStatusText = isCurrentlyUp ? 'Operational' : 'Error';
            const todayDateText = formatTooltipDate(new Date());
            
            const todayTooltipContent = `
                <div class="tooltip-date">${todayDateText}</div>
                <div class="tooltip-layout">
                    ${todayStatusText}
                </div>
            `;
            
            bars += `<div class="uptime-day ${todayStatus}"><div class="uptime-tooltip">${todayTooltipContent}</div></div>`;
        } else {
            // Use historical data from daily snapshots
            bars += `<div class="uptime-day ${dayStatus}"><div class="uptime-tooltip">${tooltipContent}</div></div>`;
        }
    }
    
    return bars;
}

async function loadStatus() {
    try {
        const response = await fetch('status-results.json?t=' + Date.now());
        const data = await response.json();
        
        // Load history (daily snapshots)
        try {
            const historyResponse = await fetch('status-history.json?t=' + Date.now());
            history = await historyResponse.json();
        } catch (error) {
            console.log('No history file found');
            history = [];
        }
        
        // Load incidents
        try {
            const incidentsResponse = await fetch('status-incidents.json?t=' + Date.now());
            incidents = await incidentsResponse.json();
        } catch (error) {
            console.log('No incidents file found');
            incidents = [];
        }
        
        lastCheckTime = data.timestamp * 1000; // Convert Unix timestamp to milliseconds
        document.getElementById('last-updated').textContent = formatUnixTimestamp(data.timestamp);
        
        const allUp = data.results.every(r => r.status && r.status < 400);
        const hasDown = data.results.some(r => r.status === null || r.status >= 400);
        const hasDegraded = data.results.some(r => r.status && r.status >= 400 && r.status < 500);
        
        const badge = document.getElementById('overall-badge');
        const downServices = data.results.filter(r => r.status === null || r.status >= 400);
        
        if (allUp) {
            badge.className = 'status-badge';
            badge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>All Systems Operational</span>
            `;
            document.title = 'Status - All Systems Operational';
        } else if (hasDown) {
            const serviceNames = downServices.map(s => {
                const hostname = s.url.replace('https://', '').replace('http://', '').split('/')[0];
                return hostname.split('.')[0];
            }).join(', ');
            
            badge.className = 'status-badge down';
            badge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>${serviceNames} ${downServices.length === 1 ? 'is' : 'are'} down</span>
            `;
            document.title = `Status - ${serviceNames} down`;
        } else if (hasDegraded) {
            badge.className = 'status-badge degraded';
            badge.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>Degraded Performance</span>
            `;
            document.title = 'Status - Degraded Performance';
        }
        
        const container = document.getElementById('services-container');
        container.innerHTML = '';
        
        data.results.forEach(result => {
            const isUp = result.status && result.status < 400;
            const isDown = result.status === null || result.status >= 400;
            
            const hostname = result.url.replace('https://', '').replace('http://', '').split('/')[0];
            const serviceName = hostname.split('.')[0];
            
            const statusClass = isDown ? 'down' : 'operational';
            const nameClass = isDown ? 'error' : '';
            
            const item = document.createElement('div');
            item.className = 'service-item';
            item.innerHTML = `
                <div class="service-header">
                    <div class="service-name ${nameClass}">${serviceName}</div>
                    <div class="service-status-text ${statusClass}">${isUp ? 'Operational' : 'Down'}</div>
                </div>
                <div class="uptime-container">
                    <div class="uptime-bar">
                        ${generateUptimeBars(result, isUp)}
                    </div>
                    <div class="uptime-labels">
                        <span>60 days ago</span>
                        <span>Today</span>
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });

        // Update history section with incidents
        const historyContainer = document.getElementById('history-container');
        historyContainer.innerHTML = '';
        
        if (incidents.length > 0) {
            // Group incidents by date
            const incidentsByDate = {};
            
            incidents.forEach(incident => {
                const dateStr = incident.date; // Use the date field from the incident
                
                if (!incidentsByDate[dateStr]) {
                    incidentsByDate[dateStr] = {
                        date: dateStr,
                        incidents: []
                    };
                }
                
                incidentsByDate[dateStr].incidents.push(incident);
            });
            
            // Convert to array and sort by date (most recent first)
            const sortedIncidents = Object.keys(incidentsByDate)
                .map(dateKey => incidentsByDate[dateKey])
                .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date, most recent first
            
            if (sortedIncidents.length > 0) {
                // Display each incident date
                sortedIncidents.forEach(incidentGroup => {
                    const incidentDate = document.createElement('div');
                    incidentDate.className = 'incident-date';
                    
                    incidentDate.innerHTML = `
                        <div class="incident-date-header">
                            <h3>${incidentGroup.date}</h3>
                        </div>
                        <div class="incident-list">
                            ${incidentGroup.incidents.map(incident => `
                                <div class="incident-item">
                                    <div class="incident-service">${incident.name || incident.service}</div>
                                    <div class="incident-details">${incident.error}</div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    
                    historyContainer.appendChild(incidentDate);
                });
            } else {
                historyContainer.innerHTML = '<div class="no-incidents">No incidents reported.</div>';
            }
        } else {
            historyContainer.innerHTML = '<div class="no-incidents">No incidents reported.</div>';
        }

    } catch (error) {
        const container = document.getElementById('services-container');
        container.innerHTML = `
            <div class="service-item">
                <div class="service-header">
                    <div class="service-name error">Unable to load status</div>
                    <div class="service-status-text down">Error</div>
                </div>
            </div>
        `;
        console.error('Error loading status:', error);
        document.getElementById('last-updated').textContent = 'Error';
        
        setTimeout(() => loadStatus(), 5000);
    }
}

// Function to periodically check for updates without full UI refresh
async function checkForUpdates() {
    try {
        const response = await fetch('status-results.json?t=' + Date.now());
        if (response.ok) {
            const data = await response.json();
            const currentUpdateTime = document.getElementById('last-updated').textContent;
            const newUpdateTime = formatUnixTimestamp(data.timestamp);
            
            // If we have newer data, update just the timestamp and other relevant info
            if (newUpdateTime !== currentUpdateTime) {
                document.getElementById('last-updated').textContent = newUpdateTime;
                
                // Update the overall status badge without recreating the whole UI
                const allUp = data.results.every(r => r.status && r.status < 400);
                const hasDown = data.results.some(r => r.status === null || r.status >= 400);
                const hasDegraded = data.results.some(r => r.status && r.status >= 400 && r.status < 500);
                
                const badge = document.getElementById('overall-badge');
                const downServices = data.results.filter(r => r.status === null || r.status >= 400);
                
                if (allUp) {
                    badge.className = 'status-badge';
                    badge.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>All Systems Operational</span>
                    `;
                    document.title = 'Status - All Systems Operational';
                } else if (hasDown) {
                    const serviceNames = downServices.map(s => {
                        const hostname = s.url.replace('https://', '').replace('http://', '').split('/')[0];
                        return hostname.split('.')[0];
                    }).join(', ');
                    
                    badge.className = 'status-badge down';
                    badge.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        <span>${serviceNames} ${downServices.length === 1 ? 'is' : 'are'} down</span>
                    `;
                    document.title = `Status - ${serviceNames} down`;
                } else if (hasDegraded) {
                    badge.className = 'status-badge degraded';
                    badge.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <span>Degraded Performance</span>
                    `;
                    document.title = 'Status - Degraded Performance';
                }
            }
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}

// Initialize the status page after loading config
async function initializeApp() {
    await loadConfig();
    // Check for updates based on config
    setInterval(checkForUpdates, config.checkInterval);
    loadStatus();
}

initializeApp();
