# HonMaku-Status (Simplified)

A simple service status monitoring system with Unix timestamps, running locally with configurable services and visual uptime tracking.

## Features

- ✅ **Configurable Services**: Define services in config.json
- ✅ **Unix Timestamps**: Clean and efficient data storage (no date/timestamp conflicts)
- ✅ **Local Execution**: Runs locally without complex setup
- ✅ **Visual Uptime Bars**: 60-day history visualization with detailed tooltips
- ✅ **Incident Tracking**: Detailed error logs when services fail
- ✅ **Interactive Tooltips**: Hover for detailed status information with service names and error details

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Services
Edit `config.json` to add your services to monitor:
```json
{
  "title": "Service Status",
  "description": "Real-time status monitoring for our services",
  "updateInterval": 30000,
  "checkInterval": 30000,
  "timezone": "UTC",
  "dateFormat": "12hour",
  "services": [
    {
      "name": "My Website",
      "url": "https://example.com",
      "timeout": 10000
    },
    {
      "name": "My API",
      "url": "https://api.example.com",
      "timeout": 10000
    }
  ]
}
```

### 3. Run Status Checks
```bash
# Run a single check
npm run check

# Start local server to view status page
npm start
```

## Data Files

The system uses three JSON files with clean Unix timestamp-based structure:

#### `status-results.json` - Current Status (5-minute intervals)
```json
{
  "timestamp": 1700000000,
  "results": [
    {
      "url": "https://example.com",
      "status": 200,
      "statusText": "OK",
      "responseTime": 125,
      "error": null,
      "timestamp": 1700000000
    }
  ]
}
```

#### `status-history.json` - Daily Status History
```json
[
  {
    "timestamp": 1700000000,
    "status": "good"
  }
]
```

#### `status-incidents.json` - Detailed Incident History
```json
[
  {
    "timestamp": 1700000000,
    "service": "https://example.com",
    "name": "My Website",
    "status": null,
    "error": "getaddrinfo ENOTFOUND example.com",
    "responseTime": 17
  }
]
```

## How It Works

### Flow
```
Every 5 minutes:
1. Check all configured services from config.json
2. Update status-results.json with current 5-minute status (Unix timestamp)
3. Update status-history.json with daily status (Unix timestamp, good/error)
4. Add detailed incidents to status-incidents.json if services fail (Unix timestamp)
5. Frontend visualizes data with 60-day uptime bars and detailed tooltips
```

### Visualization
- **Green bars**: Days with no errors ("No downtime recorded on this day.")
- **Red bars**: Days with errors (shows service name and error message)
- **Gray bars**: Days with no data ("No data exists for this day.")
- **Tooltips**: Hover over bars for date and detailed status information
- **Multiple Incidents**: Shows "+X more incidents" when multiple issues occurred on same day

## Running Locally

### Option 1: Using package.json scripts
```bash
# Install dependencies
npm install

# Run the status check (one-time)
npm run check

# Start local server to view status page
npm start
```

## Configuration

### Settings in config.json:
- `services`: Array of services to monitor with name, url, and timeout
- `timezone`: Timezone for date calculations (default: "UTC")
- `updateInterval`: Frontend refresh interval in ms (default: 30000)
- `checkInterval`: Backend check interval in ms (default: 30000)

### Adding Services
Add services to the `services` array in config.json:
```json
{
  "services": [
    {
      "name": "Website",
      "url": "https://yoursite.com",
      "timeout": 10000
    }
  ]
}
```

## Frontend Features

- **Real-time status updates** with Unix timestamp display
- **60-day visual uptime timeline** with color-coded status
- **Interactive tooltips** showing detailed status on hover (service name + error details)
- **Incident history** section with timestamp-organized errors
- **Responsive dark theme** design
- **Detailed downtime info** in tooltips without needing to scroll to history

## Deployment

### GitHub Pages
1. Push the repository to GitHub
2. Enable GitHub Pages in repository settings
3. The status page will be available at `https://yourusername.github.io/repository-name`

### Local Operation
1. Run `npm run check` periodically to update status
2. Serve files through a web server (not direct file opening)
3. Access the status page through the server URL

## Benefits of This Approach

✅ **Simple Architecture**: Only 3 JSON files needed  
✅ **Configurable**: Services defined in config.json  
✅ **Unix Timestamps**: Efficient data storage with no conflicts  
✅ **Visual History**: 60-day uptime timeline with detailed information  
✅ **Local Operation**: Easy to run and maintain  
✅ **Detailed Logging**: Incident tracking with error details  
✅ **No Redundancy**: Clean data structure without duplicate date/timestamp fields

## Troubleshooting

### Visual elements not updating?
- Clear browser cache or do a hard refresh (Ctrl+F5)
- Ensure you're serving through a web server, not opening files directly
- Run `npm run check` to generate fresh data

### Status files not updating?
- Check that you're running `npm run check` 
- Verify that your config.json has properly formatted services
- Check if your service URLs are accessible

### Bars showing incorrect status?
- The system only marks days as "error" when at least one service fails during that day
- Run the check script multiple times to build up historical data
- Gray bars indicate days with no historical data
