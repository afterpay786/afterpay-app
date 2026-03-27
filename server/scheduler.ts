import * as cron from "node-cron";
import { sendBackupEmail } from "./backup";
import { startScrape, isScraping } from "./scraper";
import { runHealthAudit, isAuditRunning } from "./health-audit";
import { runScraperAudit, isScraperAuditRunning } from "./scraper-audit";
import { db } from "./db";
import { scrapeLog } from "@shared/schema";
import { sql } from "drizzle-orm";

let backupTask: cron.ScheduledTask | null = null;
let scrapeTask: cron.ScheduledTask | null = null;
let auditTask: cron.ScheduledTask | null = null;
let scraperAuditTask: cron.ScheduledTask | null = null;
let lastBackupRun: Date | null = null;
let lastScrapeRun: Date | null = null;
let lastAuditRun: Date | null = null;
let lastScraperAuditRun: Date | null = null;

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const CATCH_UP_DELAY_MS = 30 * 1000;

async function runBackup() {
  const now = new Date();
  if (lastBackupRun && (now.getTime() - lastBackupRun.getTime()) < 60 * 1000) {
    console.log("[Scheduler] Backup skipped - ran less than 1 minute ago (duplicate prevention)");
    return;
  }
  lastBackupRun = now;
  console.log(`[Scheduler] Running automated database backup at ${now.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT`);
  try {
    const result = await sendBackupEmail();
    console.log(`[Scheduler] Backup result: ${result.message}`);
  } catch (err) {
    console.error("[Scheduler] Backup error:", err);
  }
}

async function runScraperAuditTask() {
  const now = new Date();
  if (lastScraperAuditRun && (now.getTime() - lastScraperAuditRun.getTime()) < 60 * 1000) {
    console.log("[Scheduler] Scraper audit skipped - ran less than 1 minute ago");
    return;
  }
  if (isScraperAuditRunning()) {
    console.log("[Scheduler] Skipping scraper audit - already in progress");
    return;
  }
  if (isScraping()) {
    // Queue audit for 3 minutes after scrape ends
    console.log("[Scheduler] Scraper running — scraper audit queued for 3 minutes later");
    setTimeout(() => runScraperAuditTask(), 3 * 60 * 1000);
    return;
  }
  lastScraperAuditRun = now;
  console.log(`[Scheduler] Running automated scraper audit with auto-fix at ${now.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT`);
  try {
    const result = await runScraperAudit(true);
    const { pass, fail, warning, fixed } = result.summary;
    console.log(`[Scheduler] Scraper audit: score=${result.healthScore} passed=${pass} failed=${fail} warnings=${warning} fixed=${fixed}`);
    if (fail > 0 || warning > 0) {
      console.log(`[Scheduler] Scraper audit found issues — auto-fix applied. Re-running audit in 10 minutes to verify fixes...`);
      setTimeout(() => runScraperAuditTask(), 10 * 60 * 1000);
    }
  } catch (err) {
    console.error("[Scheduler] Scraper audit error:", err);
  }
}

async function runScrape() {
  const now = new Date();
  if (lastScrapeRun && (now.getTime() - lastScrapeRun.getTime()) < 60 * 1000) {
    console.log("[Scheduler] Scrape skipped - ran less than 1 minute ago (duplicate prevention)");
    return;
  }
  if (isScraping()) {
    console.log("[Scheduler] Skipping auto-scrape - already in progress");
    return;
  }
  lastScrapeRun = now;
  console.log(`[Scheduler] Running automated Priceoye scrape at ${now.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT`);
  try {
    const result = await startScrape();
    console.log(`[Scheduler] Scrape result: ${result.message}`);
    // Auto-run scraper audit 5 minutes after scrape completes to catch and fix any data issues
    console.log(`[Scheduler] Scrape complete — scraper audit will run in 5 minutes`);
    setTimeout(() => runScraperAuditTask(), 5 * 60 * 1000);
  } catch (err) {
    console.error("[Scheduler] Scrape error:", err);
  }
}

async function runAudit() {
  const now = new Date();
  if (lastAuditRun && (now.getTime() - lastAuditRun.getTime()) < 60 * 1000) {
    console.log("[Scheduler] Audit skipped - ran less than 1 minute ago (duplicate prevention)");
    return;
  }
  if (isAuditRunning()) {
    console.log("[Scheduler] Skipping audit - already in progress");
    return;
  }
  lastAuditRun = now;
  console.log(`[Scheduler] Running automated health audit at ${now.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT`);
  try {
    const result = await runHealthAudit(true);
    console.log(`[Scheduler] Audit result: ${result.issuesSummary.total} issues found, ${result.issuesSummary.autoFixed} auto-fixed`);
  } catch (err) {
    console.error("[Scheduler] Audit error:", err);
  }
}

async function getLastScrapeTime(): Promise<Date | null> {
  try {
    const [latest] = await db.select({ completedAt: scrapeLog.completedAt })
      .from(scrapeLog)
      .where(sql`${scrapeLog.status} = 'completed'`)
      .orderBy(sql`${scrapeLog.completedAt} DESC NULLS LAST`)
      .limit(1);
    return latest?.completedAt ? new Date(latest.completedAt) : null;
  } catch {
    return null;
  }
}

async function cleanupStaleRunning() {
  try {
    await db.update(scrapeLog)
      .set({ status: "failed", message: "Server restarted during scrape", completedAt: new Date() })
      .where(sql`${scrapeLog.status} = 'running'`);
  } catch {}
}

async function checkAndCatchUp() {
  console.log("[Scheduler] Checking if catch-up sync is needed...");

  await cleanupStaleRunning();

  const lastScrapeTime = await getLastScrapeTime();
  const now = new Date();

  if (lastScrapeTime) {
    const hoursSince = (now.getTime() - lastScrapeTime.getTime()) / (1000 * 60 * 60);
    console.log(`[Scheduler] Last successful scrape: ${lastScrapeTime.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT (${hoursSince.toFixed(1)} hours ago)`);

    if (hoursSince >= 12) {
      console.log(`[Scheduler] Sync is overdue (${hoursSince.toFixed(1)} hours since last sync). Running catch-up in ${CATCH_UP_DELAY_MS / 1000}s...`);
      setTimeout(async () => {
        await runBackup();
        setTimeout(() => runScrape(), 10000);
      }, CATCH_UP_DELAY_MS);
    } else {
      console.log(`[Scheduler] Sync is current (last sync was ${hoursSince.toFixed(1)} hours ago). Next sync at scheduled time.`);
    }
  } else {
    console.log("[Scheduler] No previous scrape found. Catch-up scrape will run after delay...");
    setTimeout(async () => {
      await runBackup();
      setTimeout(() => runScrape(), 10000);
    }, CATCH_UP_DELAY_MS);
  }

  setTimeout(() => {
    console.log("[Scheduler] Running startup health audit...");
    runAudit();
  }, 60 * 1000);
}

export function startScheduler() {
  console.log("[Scheduler] Initializing automated tasks...");

  backupTask = cron.schedule("0 0 0,12 * * *", () => {
    runBackup();
  }, { timezone: "Asia/Karachi" });

  scrapeTask = cron.schedule("0 30 0,12 * * *", () => {
    runScrape();
  }, { timezone: "Asia/Karachi" });

  auditTask = cron.schedule("0 0 3,9,15,21 * * *", () => {
    runAudit();
  }, { timezone: "Asia/Karachi" });

  // Scraper audit runs every 4 hours (auto-fix mode) — catches any data quality issues between scrapes
  scraperAuditTask = cron.schedule("0 0 */4 * * *", () => {
    runScraperAuditTask();
  }, { timezone: "Asia/Karachi" });

  console.log("[Scheduler] Backup: every 12 hours (12:00 AM & 12:00 PM PKT)");
  console.log("[Scheduler] Scrape: every 12 hours (12:30 AM & 12:30 PM PKT)");
  console.log("[Scheduler] Health Audit: every 6 hours (3 AM, 9 AM, 3 PM, 9 PM PKT)");
  console.log("[Scheduler] Scraper Audit (auto-fix): every 4 hours + 5min after every scrape");

  checkAndCatchUp();
}

export function getScheduleInfo() {
  return {
    backup: {
      schedule: "Every 12 hours (12:00 AM & 12:00 PM PKT)",
      active: backupTask !== null,
      lastRun: lastBackupRun?.toISOString() || null,
    },
    scrape: {
      schedule: "Every 12 hours (12:30 AM & 12:30 PM PKT)",
      active: scrapeTask !== null,
      lastRun: lastScrapeRun?.toISOString() || null,
    },
    audit: {
      schedule: "Every 6 hours (3 AM, 9 AM, 3 PM, 9 PM PKT)",
      active: auditTask !== null,
      lastRun: lastAuditRun?.toISOString() || null,
    },
    scraperAudit: {
      schedule: "Every 4 hours + 5min after each scrape (auto-fix)",
      active: scraperAuditTask !== null,
      lastRun: lastScraperAuditRun?.toISOString() || null,
    },
  };
}

export function stopScheduler() {
  if (backupTask) { backupTask.stop(); backupTask = null; }
  if (scrapeTask) { scrapeTask.stop(); scrapeTask = null; }
  if (auditTask) { auditTask.stop(); auditTask = null; }
  if (scraperAuditTask) { scraperAuditTask.stop(); scraperAuditTask = null; }
  console.log("[Scheduler] All scheduled tasks stopped");
}
