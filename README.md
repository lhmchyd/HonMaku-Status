# HonMaku-Status Improvements

## Problems Fixed

### 1. **status-day.json Not Being Generated**
- **Root Cause**: Missing logic to detect completed days and extract daily snapshots
- **Solution**: Implemented proper day completion detection and snapshot extraction

### 2. **Timezone Issues**
- **Problem**: Date calculations not considering timezone
- **Solution**: Using `Intl.DateTimeFormat` with configurable timezone

### 3. **No Clear Daily Snapshot Logic**
- **Problem**: Unclear when and how to create daily snapshots
- **Solution**: Take the last check from each completed day (excluding today)

### 4. **Poor Error Handling**
- **Problem**: File read/write failures not handled properly
- **Solution**: Added safe file operations with fallbacks

## Key Improvements

### ✅ Proper Daily Snapshot Generation
```javascript
// Only process completed days (not today)
if (date === today) {
  return; // Skip today as it's not complete
}

// Take the last check of the day
const lastCheck = checks.reduce((latest, current) => 
  current.timestamp > latest.timestamp ? current : latest
);
```

### ✅ Timezone Support
```javascript
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CONFIG.timezone,  // e.g., 'Asia/Jakarta'
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
```

### ✅ Summary Statistics
Each daily snapshot includes:
- Total checks
- Up/down count
- Uptime percentage
- Average response time

### ✅ Safe File Operations
- Graceful handling of missing files
- Proper error logging
- Atomic writes

## Implementation Steps

### 1. Update check-status.js
Replace your existing `scripts/check-status.js` with the improved version.

### 2. Configure Your Sites
Edit the `CONFIG` object in `check-status.js`:

```javascript
const CONFIG = {
  urls: [
    { name: 'My Website', url: 'https://yoursite.com', timeout: 10000 },
    { name: 'My API', url: 'https://api.yoursite.com', timeout: 10000 }
  ],
  maxHistoryChecks: 100,      // Keep last 100 detailed checks
  maxDailySnapshots: 60,      // Keep 60 days of snapshots
  timezone: 'Asia/Jakarta'    // Your timezone
};
```

### 3. Update GitHub Actions Workflow
Replace `.github/workflows/status-check.yml` with the improved version.

### 4. Initialize Empty Files (Optional)
```bash
# Create empty JSON files if they don't exist
echo "[]" > status-history.json
echo "[]" > status-day.json
echo "{}" > status-results.json
```

### 5. Test Locally
```bash
# Run the check script
node scripts/check-status.js

# Verify files are created
ls -l status-*.json

# Check the content
cat status-day.json
```

### 6. Commit and Push
```bash
git add .
git commit -m "Improve status check with daily snapshots"
git push
```

## How It Works

### Flow Diagram
```
Every 5 minutes:
1. Check all configured URLs
2. Create current check result
3. Add to status-history.json (keep last 100)
4. Analyze history for completed days
5. Extract last check from each completed day
6. Update status-day.json (keep last 60 days)
7. Commit and push changes
```

### Daily Snapshot Logic
```
Day 1: [Check1, Check2, Check3, ..., Check288] → Take Check288
Day 2: [Check1, Check2, Check3, ..., Check288] → Take Check288
...
Today: [Check1, Check2, Check3, ...] → Skip (incomplete)
```

## Data Structure

### status-results.json (Current Status)
```json
{
  "timestamp": 1730084400000,
  "date": "2025-10-28",
  "checks": [
    {
      "name": "Main Website",
      "url": "https://example.com",
      "status": "up",
      "statusCode": 200,
      "responseTime": 245,
      "error": null
    }
  ]
}
```

### status-history.json (Recent Checks)
```json
[
  {
    "timestamp": 1730084400000,
    "date": "2025-10-28",
    "checks": [...]
  },
  // ... up to 100 most recent checks
]
```

### status-day.json (Daily Snapshots)
```json
[
  {
    "date": "2025-10-27",
    "timestamp": 1730073600000,
    "checks": [...],
    "summary": {
      "total": 3,
      "up": 3,
      "down": 0,
      "uptime": "100.00%",
      "avgResponseTime": 234
    }
  },
  // ... up to 60 days
]
```

## Frontend Integration

Your existing `script.js` can now use `status-day.json` for long-term trends:

```javascript
// Fetch daily snapshots
fetch('status-day.json')
  .then(res => res.json())
  .then(daily => {
    // Calculate 30-day uptime
    const last30Days = daily.slice(0, 30);
    const totalUptime = last30Days.reduce((sum, day) => {
      return sum + parseFloat(day.summary.uptime);
    }, 0) / last30Days.length;
    
    console.log(`30-day average uptime: ${totalUptime.toFixed(2)}%`);
  });
```

## Advanced Configuration

### Custom Timezone
```javascript
timezone: 'America/New_York'  // EST/EDT
timezone: 'Europe/London'      // GMT/BST
timezone: 'Asia/Tokyo'         // JST
timezone: 'UTC'                // Universal
```

### Adjust Retention
```javascript
maxHistoryChecks: 288,    // 24 hours at 5-min intervals
maxDailySnapshots: 90,    // 3 months of daily data
```

### Custom Timeout
```javascript
urls: [
  { name: 'Fast API', url: '...', timeout: 5000 },   // 5 seconds
  { name: 'Slow Service', url: '...', timeout: 30000 } // 30 seconds
]
```

## Troubleshooting

### status-day.json still empty?
1. Check if enough time has passed (need at least 1 complete day)
2. Verify timezone configuration is correct
3. Check console logs in GitHub Actions

### Wrong dates in snapshots?
- Verify `timezone` setting matches your location
- Check system time in GitHub Actions runner

### Files not updating?
- Check GitHub Actions logs for errors
- Verify repository permissions (needs `contents: write`)
- Ensure files are being committed properly

## Monitoring

Check GitHub Actions runs:
1. Go to your repository
2. Click "Actions" tab
3. Select "Status Check" workflow
4. Review recent runs

## Benefits of This Approach

✅ **Efficient Storage**: Only keeps detailed checks for recent period  
✅ **Long-term History**: Daily snapshots for trends and analytics  
✅ **API Ready**: `status-day.json` perfect for external consumption  
✅ **Timezone Aware**: Correct date calculations anywhere in the world  
✅ **Robust**: Proper error handling and safe file operations  
✅ **Scalable**: Can easily add more sites without performance issues  

## Next Steps

1. **Add Notifications**: Integrate with Discord, Slack, or email
2. **Add Metrics**: Track MTTR (Mean Time To Recovery)
3. **Add Incidents**: Log and track outages
4. **Add Alerts**: Set up thresholds for response time
5. **Add Charts**: Visualize uptime trends on frontend

## Questions?

If you encounter issues, check:
- GitHub Actions logs
- Console output from `check-status.js`
- File permissions
- JSON file structure (valid JSON)
