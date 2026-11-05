// Screenshots of the Trust + Support pages — AAPAWZ shot-tools pattern
// (@sparticuz/chromium + puppeteer-core, LNA checks disabled for loopback).
// Run from ~/workspace/aapawz/shot-tools so requires resolve:
//   cd ~/workspace/aapawz/shot-tools && node ~/workspace/unsaid/wt/trust/scripts/screenshots.cjs [baseUrl] [ticketId]
const chromium = require("@sparticuz/chromium").default;
const puppeteer = require("puppeteer-core");
const { mkdirSync } = require("node:fs");

const BASE = process.argv[2] || "http://localhost:3107";
const OUT = "/home/hatch/workspace/unsaid/wt/trust/screenshots";
mkdirSync(OUT, { recursive: true });

const pages = [
  ["support-queue", "/admin/support"],
  ["support-reporting", "/admin/support/reporting"],
  ["support-config", "/admin/support/config"],
  ["trust-overview", "/admin/trust"],
  ["trust-risk", "/admin/trust/risk"],
  ["trust-compliance", "/admin/trust/compliance"],
];
if (process.argv[3]) pages.push(["ticket-detail", `/admin/support/${process.argv[3]}`]);

(async () => {
  chromium.setGraphicsMode = false;
  const execPath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    executablePath: execPath,
    args: [...chromium.args, "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests", "--window-size=1440,1000"],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  for (const [name, path] of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 90000 });
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log("shot", name);
  }
  await browser.close();
  console.log("SCREENSHOTS DONE");
})().catch((e) => { console.error("SHOT FAILED", e.message); process.exit(1); });
