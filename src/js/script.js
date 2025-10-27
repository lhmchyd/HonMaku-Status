let lastCheckTime = null;
let fullHistory = [];
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
                "githubRepo": "lhmchyd/HonMaku-Status",
                "githubBranch": "main",
                "updateInterval": 30000,
                "checkInterval": 30000,
                "services": [
                    {
                        "name": "AniList",
                        "url": "https://anilist.co"
                    },
                    {
                        "name": "Giscus",
                        "url": "https://giscus.app"
                    }
                ],
                "dateFormat": "12hour"
            };
        }
    } catch (error) {
        console.error('Error loading config:', error);
        // Use defaults if config file is not found
        config = {
            "title": "Service Status",
            "description": "Real-time status monitoring for our services",
            "githubRepo": "lhmchyd/HonMaku-Status",
            "githubBranch": "main",
            "updateInterval": 30000,
            "checkInterval": 30000,
            "services": [
                {
                    "name": "AniList",
                    "url": "https://anilist.co"
                },
                {
                    "name": "Giscus",
                    "url": "https://giscus.app"
                }
            ],
            "dateFormat": "12hour"
        };
    }
}

function formatDateTime(date) {
    const d = new Date(date);
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

function formatDateShort(date) {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

function formatDateLong(date) {
    const d = new Date(date);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const day = d.getDate(); // Don't pad with zero
    const year = d.getFullYear();
    return `${month} ${day}, ${year}`;
}

function generateUptimeBars(url, isCurrentlyUp) {
    const days = 60;
    let bars = '';
    const now = new Date();
    
    // Create a map of dates to status for faster lookup
    const dateToStatus = {};
    fullHistory.forEach(check => {
        const checkDate = new Date(check.lastChecked);
        const dateStr = checkDate.toDateString();
        const serviceResult = check.results.find(r => r.url === url);
        if (serviceResult) {
            let dayStatus = 'unknown';
            if (serviceResult.status && serviceResult.status < 400) {
                dayStatus = 'up';
            } else if (serviceResult.status === null || serviceResult.status >= 500) {
                dayStatus = 'down';
            } else {
                dayStatus = 'degraded';
            }
            dateToStatus[dateStr] = {
                status: dayStatus,
                responseTime: serviceResult.responseTime,
                error: serviceResult.error,
                time: formatDateTime(checkDate)
            };
        }
    });
    
    for (let i = days - 1; i >= 0; i--) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toDateString();
        const dateKey = checkDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format for consistent comparison
        
        let dayStatus = 'unknown';
        let dayData = null;
            
        // Check if we have data for this exact date
        const historyForDate = fullHistory.find(check => {
            const checkDateObj = new Date(check.lastChecked);
            return checkDateObj.toDateString() === checkDate.toDateString();
        });
        
        if (historyForDate) {
            const serviceResult = historyForDate.results.find(r => r.url === url);
            if (serviceResult) {
                dayData = {
                    date: formatDateShort(checkDate),
                    time: formatDateTime(checkDate),
                    status: serviceResult.status,
                    statusText: serviceResult.statusText,
                    responseTime: serviceResult.responseTime,
                    error: serviceResult.error
                };
                
                if (serviceResult.status && serviceResult.status < 400) {
                    dayStatus = 'up';
                } else if (serviceResult.status === null || serviceResult.status >= 500) {
                    dayStatus = 'down';
                } else {
                    dayStatus = 'degraded';
                }
            }
        }
        
        // If no data for that day, show as unknown (gray)
        if (!dayData) {
            dayData = {
                date: formatDateShort(checkDate),
                time: 'No data',
                status: 'N/A',
                statusText: 'No checks recorded'
            };
        }
        
        const tooltipStatusClass = dayStatus === 'up' ? 'up' : dayStatus === 'down' ? 'down' : '';
        const dateLong = formatDateLong(checkDate);
        const responseTime = dayData.responseTime ? `${dayData.responseTime}ms` : '';
        const downtimeStatus = dayStatus === 'up' ? 'No downtime recorded on this day' : (dayData.error || 'Downtime recorded');
        
        const tooltipContent = `
            <div class="tooltip-date">${dateLong} / ${responseTime || '—'}</div>
            <div class="tooltip-layout">
                ${downtimeStatus}
            </div>
        `;
        
        bars += `<div class="uptime-day ${dayStatus}"><div class="uptime-tooltip">${tooltipContent}</div></div>`;
    }
    return bars;
}





async function loadStatus() {
    try {
        const response = await fetch('status-results.json?t=' + Date.now());
        const data = await response.json();
        
        // Load history
        try {
            const historyResponse = await fetch('status-history.json?t=' + Date.now());
            fullHistory = await historyResponse.json();
        } catch (error) {
            console.log('No history file found');
            fullHistory = [data]; // Use current data as fallback
        }
        
        lastCheckTime = new Date(data.lastChecked).getTime();
        document.getElementById('last-updated').textContent = formatDateTime(data.lastChecked);
        
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
                        ${generateUptimeBars(result.url, isUp)}
                    </div>
                    <div class="uptime-labels">
                        <span>60 days ago</span>
                        <span>Today</span>
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });

        // Update history section
        const historyContainer = document.getElementById('history-container');
        historyContainer.innerHTML = '';
        
        if (fullHistory.length > 0) {
            // Show past incidents in date order
            const incidentsByDate = {};
            
            // Group incidents by date
            fullHistory.forEach(check => {
                const checkDate = new Date(check.lastChecked);
                const dateKey = checkDate.toISOString().split('T')[0]; // YYYY-MM-DD format
                const formattedDate = formatDateLong(checkDate); // e.g., "26 Oct 2025"
                
                const hasDown = check.results.some(r => r.status === null || r.status >= 400);
                
                if (hasDown) {
                    if (!incidentsByDate[dateKey]) {
                        incidentsByDate[dateKey] = {
                            date: formattedDate,
                            incidents: []
                        };
                    }
                    
                    const downServices = check.results.filter(r => r.status === null || r.status >= 400);
                    downServices.forEach(service => {
                        incidentsByDate[dateKey].incidents.push({
                            service: service.url.replace('https://', '').replace('http://', '').split('/')[0],
                            error: service.error || service.statusText
                        });
                    });
                }
            });
            
            // Convert to array and sort by date (most recent first)
            const sortedIncidents = Object.keys(incidentsByDate)
                .map(dateKey => incidentsByDate[dateKey])
                .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date, most recent first
            
            if (sortedIncidents.length > 0) {
                // Display each incident date
                sortedIncidents.forEach(incident => {
                    const incidentDate = document.createElement('div');
                    incidentDate.className = 'incident-date';
                    incidentDate.innerHTML = `
                        <div class="incident-date-header">
                            <h3>${incident.date}</h3>
                        </div>
                        <div class="incident-list">
                            ${incident.incidents.map(inc => `
                                <div class="incident-item">
                                    <div class="incident-service">${inc.service}</div>
                                    <div class="incident-details">${inc.error}</div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    historyContainer.appendChild(incidentDate);
                });
            } else {
                // No incidents reported
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
            const newUpdateTime = formatDateTime(data.lastChecked);
            
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