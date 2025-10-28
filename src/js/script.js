let lastCheckTime = null;
let fullHistory = [];
let config = {};

// --- Load Config ---
async function loadConfig() {
    try {
        const response = await fetch('config.json?t=' + Date.now());
        if (response.ok) {
            config = await response.json();
        } else {
            throw new Error('Failed to load config');
        }
    } catch (error) {
        console.error('Error loading config:', error);
        // Default fallback
        config = {
            "title": "Service Status",
            "description": "Real-time status monitoring for our services",
            "githubRepo": "lhmchyd/HonMaku-Status",
            "githubBranch": "main",
            "updateInterval": 30000,
            "checkInterval": 30000,
            "services": [
                { "name": "AniList", "url": "https://anilist.co" },
                { "name": "Giscus", "url": "https://giscus.app" }
            ],
            "dateFormat": "12hour"
        };
    }
}

// --- Date Formatting Helpers ---
function formatDateTime(date) {
    if (!date) return 'Unknown';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Unknown';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${ampm}`;
}

function formatDateShort(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '--/--';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

function formatDateLong(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Unknown date';
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month} ${day}, ${year}`;
}

// --- Generate Uptime Bars ---
function generateUptimeBars(url, isCurrentlyUp) {
    const days = 60;
    let bars = '';
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() - i);
        const historyForDate = fullHistory.find(check => {
            const checkDateObj = new Date(check.lastChecked);
            return checkDateObj.toDateString() === checkDate.toDateString();
        });

        let dayStatus = 'unknown';
        let dayData = null;

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

                if (serviceResult.status && serviceResult.status < 400) dayStatus = 'up';
                else if (serviceResult.status === null || serviceResult.status >= 500) dayStatus = 'down';
                else dayStatus = 'degraded';
            }
        }

        if (!dayData) {
            dayData = {
                date: formatDateShort(checkDate),
                time: 'No data',
                status: 'N/A',
                statusText: 'No checks recorded'
            };
        }

        const tooltipContent = `
            <div class="tooltip-date">${formatDateLong(checkDate)} / ${dayData.responseTime ? dayData.responseTime + 'ms' : '—'}</div>
            <div class="tooltip-layout">${dayData.error || (dayStatus === 'up' ? 'No downtime recorded' : 'Downtime detected')}</div>
        `;

        bars += `<div class="uptime-day ${dayStatus}"><div class="uptime-tooltip">${tooltipContent}</div></div>`;
    }

    return bars;
}

// --- Load Status ---
async function loadStatus() {
    try {
        const response = await fetch('status-results.json?t=' + Date.now());
        const data = await response.json();

        // ✅ Normalize JSON format (handles both old/new structure)
        data.lastChecked = data.lastChecked || new Date(data.timestamp).toISOString();
        data.results = data.results || data.checks || [];

        try {
            const historyResponse = await fetch('status-history.json?t=' + Date.now());
            fullHistory = await historyResponse.json();
        } catch {
            console.log('No history file found');
            fullHistory = [data];
        }

        // ✅ Fix: handle invalid or missing timestamp
        if (data.lastChecked && !isNaN(new Date(data.lastChecked).getTime())) {
            lastCheckTime = new Date(data.lastChecked).getTime();
            document.getElementById('last-updated').textContent = formatDateTime(data.lastChecked);
        } else {
            document.getElementById('last-updated').textContent = 'Unknown';
        }

        const allUp = data.results.every(r => r.status && r.status < 400);
        const hasDown = data.results.some(r => r.status === null || r.status >= 400);
        const hasDegraded = data.results.some(r => r.status && r.status >= 400 && r.status < 500);

        const badge = document.getElementById('overall-badge');
        const downServices = data.results.filter(r => r.status === null || r.status >= 400);

        if (allUp) {
            badge.className = 'status-badge';
            badge.innerHTML = `
                ✅ <span>All Systems Operational</span>
            `;
            document.title = 'Status - All Systems Operational';
        } else if (hasDown) {
            const serviceNames = downServices.map(s => s.url.split('/')[2]).join(', ');
            badge.className = 'status-badge down';
            badge.innerHTML = `❌ <span>${serviceNames} ${downServices.length === 1 ? 'is' : 'are'} down</span>`;
            document.title = `Status - ${serviceNames} down`;
        } else if (hasDegraded) {
            badge.className = 'status-badge degraded';
            badge.innerHTML = `⚠️ <span>Degraded Performance</span>`;
            document.title = 'Status - Degraded Performance';
        }

        const container = document.getElementById('services-container');
        container.innerHTML = '';

        data.results.forEach(result => {
            const isUp = result.status && result.status < 400;
            const isDown = result.status === null || result.status >= 400;
            const serviceName = result.url.split('/')[2].split('.')[0];
            const statusClass = isDown ? 'down' : 'operational';

            const item = document.createElement('div');
            item.className = 'service-item';
            item.innerHTML = `
                <div class="service-header">
                    <div class="service-name">${serviceName}</div>
                    <div class="service-status-text ${statusClass}">${isUp ? 'Operational' : 'Down'}</div>
                </div>
                <div class="uptime-container">
                    <div class="uptime-bar">${generateUptimeBars(result.url, isUp)}</div>
                    <div class="uptime-labels"><span>60 days ago</span><span>Today</span></div>
                </div>
            `;
            container.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading status:', error);
        document.getElementById('last-updated').textContent = 'Error loading data';
        document.getElementById('services-container').innerHTML = `
            <div class="service-item error">Unable to load status data.</div>
        `;
        setTimeout(loadStatus, 5000);
    }
}

// --- Periodic Check ---
async function checkForUpdates() {
    try {
        const response = await fetch('status-results.json?t=' + Date.now());
        if (!response.ok) return;
        const data = await response.json();

        // Normalize again for periodic updates
        data.lastChecked = data.lastChecked || new Date(data.timestamp).toISOString();

        const newUpdateTime = formatDateTime(data.lastChecked);
        const currentText = document.getElementById('last-updated').textContent;
        if (newUpdateTime !== currentText && newUpdateTime !== 'Unknown') {
            document.getElementById('last-updated').textContent = newUpdateTime;
        }
    } catch (e) {
        console.error('Error checking updates:', e);
    }
}

// --- Initialize ---
async function initializeApp() {
    await loadConfig();
    loadStatus();
    setInterval(checkForUpdates, config.checkInterval || 30000);
}

initializeApp();
