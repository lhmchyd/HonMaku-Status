const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

// --- Load external config.json ---
const CONFIG_PATH = path.join(__dirname, "../config.json");
let CONFIG = null;

try {
  CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  console.log("✓ Loaded config.json");
} catch (err) {
  console.error("✗ Failed to load config.json:", err.message);
  process.exit(1);
}

// --- Settings from config.json ---
const SITES = CONFIG.sites || [];
const SETTINGS = CONFIG.settings || {
  maxHistoryChecks: 100,
  maxDailySnapshots: 60,
  timezone: "UTC",
};

// --- File paths ---
const RESULTS_FILE = path.join(__dirname, "../status-results.json");
const HISTORY_FILE = path.join(__dirname, "../status-history.json");
const DAILY_FILE = path.join(__dirname, "../status-day.json");

// --- Check a single URL ---
function checkUrl(site) {
  return new Promise((resolve) => {
    const protocol = site.url.startsWith("https") ? https : http;
    const startTime = Date.now();

    const req = protocol.get(site.url, { timeout: site.timeout || 10000 }, (res) => {
      const responseTime = Date.now() - startTime;

      resolve({
        name: site.name,
        url: site.url,
        status: res.statusCode >= 200 && res.statusCode < 400 ? "up" : "down",
        statusCode: res.statusCode,
        responseTime,
        error: null,
      });

      res.resume();
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        name: site.name,
        url: site.url,
        status: "down",
        statusCode: null,
        responseTime: Date.now() - startTime,
        error: "Request timeout",
      });
    });

    req.on("error", (err) => {
      resolve({
        name: site.name,
        url: site.url,
        status: "down",
        statusCode: null,
        responseTime: Date.now() - startTime,
        error: err.message,
      });
    });
  });
}

// --- Date Helpers ---
function getDateString(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SETTINGS.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // YYYY-MM-DD
}

// --- Safe file helpers ---
function readJsonFile(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`⚠️ Could not read ${filePath}:`, err.message);
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`✓ Written to ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to write ${filePath}:`, err.message);
    return false;
  }
}

// --- Daily Snapshot Processor ---
function processDailySnapshots(history, existingDaily) {
  const dailyMap = new Map(existingDaily.map((s) => [s.date, s]));
  const today = getDateString();

  const historyByDay = new Map();
  history.forEach((check) => {
    const d = getDateString(check.timestamp);
    if (!historyByDay.has(d)) historyByDay.set(d, []);
    historyByDay.get(d).push(check);
  });

  historyByDay.forEach((checks, date) => {
    if (date === today) return;
    if (!dailyMap.has(date)) {
      const lastCheck = checks.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
      dailyMap.set(date, {
        date,
        timestamp: lastCheck.timestamp,
        checks: lastCheck.checks,
        summary: calculateSummary(lastCheck.checks),
      });
      console.log(`✓ Added daily snapshot for ${date}`);
    }
  });

  return Array.from(dailyMap.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, SETTINGS.maxDailySnapshots);
}

// --- Summary Calculation ---
function calculateSummary(checks) {
  const total = checks.length;
  const up = checks.filter((c) => c.status === "up").length;
  const down = total - up;
  const avgResponse =
    checks.reduce((sum, c) => sum + (c.responseTime || 0), 0) / total || 0;
  return {
    total,
    up,
    down,
    uptime: total > 0 ? ((up / total) * 100).toFixed(2) + "%" : "0%",
    avgResponseTime: Math.round(avgResponse),
  };
}

// --- Main Execution ---
async function main() {
  console.log("=== HonMaku Status Check ===");
  console.log("Timezone:", SETTINGS.timezone);
  console.log("Sites:", SITES.length);
  console.log("---------------------------");

  const checks = [];
  for (const site of SITES) {
    console.log(`Checking ${site.name} (${site.url})...`);
    const result = await checkUrl(site);
    checks.push(result);
    console.log(`→ ${result.status.toUpperCase()} (${result.responseTime}ms)`);
    if (result.error) console.log(`  Error: ${result.error}`);
  }

  const currentCheck = {
    timestamp: Date.now(),
    date: getDateString(),
    checks,
  };

  writeJsonFile(RESULTS_FILE, currentCheck);

  // Update history
  const history = readJsonFile(HISTORY_FILE, []);
  history.unshift(currentCheck);
  writeJsonFile(HISTORY_FILE, history.slice(0, SETTINGS.maxHistoryChecks));

  // Update daily
  const daily = readJsonFile(DAILY_FILE, []);
  const updatedDaily = processDailySnapshots(history, daily);
  writeJsonFile(DAILY_FILE, updatedDaily);

  console.log("---------------------------");
  console.log("Status check completed successfully!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
