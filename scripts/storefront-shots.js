// Storefront verification screenshots (puppeteer harness, adapted from
// ~/workspace/aapawz/shot-tools/shot3.js). Usage:
//   node scripts/storefront-shots.js [baseUrl] [productPath]
// Writes PNGs to ~/workspace/unsaid/screenshots/storefront/.
const fs = require("fs");
// @sparticuz/chromium is ESM-only with an exports map — it must be
// required BY NAME with resolution anchored in the shot-tools folder
// (an absolute-path require of the package directory fails).
const { createRequire } = require("module");
const shotRequire = createRequire("/home/hatch/workspace/aapawz/shot-tools/shot3.js");
const chromium = shotRequire("@sparticuz/chromium").default;
const puppeteer = shotRequire("puppeteer-core");

const BASE = process.argv[2] || "http://127.0.0.1:3101";
const PRODUCT = process.argv[3] || "";
const OUT = "/home/hatch/workspace/unsaid/screenshots/storefront";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  chromium.setGraphicsMode = false;
  const execPath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    executablePath: execPath,
    args: [...chromium.args, "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests", "--window-size=1440,900"],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const targets = [
    ["shop-apparel-men", "/shop/apparel/men"],
    ["shop-l4-hats", "/shop/headwear/hats/all-hats/5-panel-hats"],
    ["shop-wall-art", "/shop/wall-art"],
  ];
  if (PRODUCT) targets.push(["pdp", PRODUCT]);
  for (const [name, path] of targets) {
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 180000 });
      await new Promise((r) => setTimeout(r, 2500));
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(name, "->", page.url(), "| title:", await page.title());
    } catch (e) {
      console.log(name, "FAILED", e.message.slice(0, 140));
    }
  }
  await browser.close();
})();
