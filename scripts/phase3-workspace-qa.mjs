import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(process.cwd(), "artifacts");
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}
const CHROME_PATH =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const report = {
  timestamp: new Date().toISOString(),
  desktopTests: {},
  mobileTests: {},
  overflowTests: {},
  screenshots: [],
};

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();

  // -------------------------------------------------------------
  // Test 1: Desktop 3-Column Decision Workspace Layout
  // -------------------------------------------------------------
  console.log("Checking Desktop Workspace layout...");
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`${BASE_URL}/chat`, { waitUntil: "networkidle0" });

  const hasLeftPanel = await page.$("aside[aria-label='Shopping requirements & refinements']") !== null;
  const hasShortlistPanel = await page.$("aside[aria-label='Live product shortlist & decision insights']") !== null;
  const hasChatInput = await page.$("textarea[placeholder*='Ask']") !== null || await page.$("input[placeholder*='Ask']") !== null || await page.$("input") !== null;

  report.desktopTests.initialLayout = {
    hasLeftPanel,
    hasShortlistPanel,
    hasChatInput,
  };

  const initialScreenshot = path.join(ARTIFACT_DIR, "desktop-workspace-initial.png");
  await page.screenshot({ path: initialScreenshot, fullPage: false });
  report.screenshots.push("desktop-workspace-initial.png");

  // -------------------------------------------------------------
  // Test 2: Send Query & Verify Structured Requirements + Shortlist
  // -------------------------------------------------------------
  console.log("Sending shopping query...");
  await page.waitForSelector("#chat-input");
  await page.type("#chat-input", "Recommend top wireless headphones under $200 from the catalog");
  await page.click("button[type='submit']");

  // Wait for the assistant reply to complete (wait for product shortlist to appear)
  console.log("Waiting for AI response and shortlist update...");
  await page.waitForSelector("aside[aria-label='Live product shortlist & decision insights'] ul li", {
    timeout: 60000,
  });

  // Check extracted requirements
  const leftPanelText = await page.$eval(
    "aside[aria-label='Shopping requirements & refinements']",
    (el) => el.innerText
  );
  const shortlistText = await page.$eval(
    "aside[aria-label='Live product shortlist & decision insights']",
    (el) => el.innerText
  );

  const hasCategoryExtracted = leftPanelText.toLowerCase().includes("headphone") || shortlistText.toLowerCase().includes("headphone");
  const hasBudgetExtracted = leftPanelText.includes("200") || shortlistText.includes("$");
  const hasBadgesInShortlist = shortlistText.includes("Best Overall") || shortlistText.includes("Best Value") || shortlistText.includes("Best Fit");
  const hasTradeOffs = shortlistText.toLowerCase().includes("trade-off") || shortlistText.toLowerCase().includes("why it fits");

  report.desktopTests.queryExtraction = {
    hasCategoryExtracted,
    hasBudgetExtracted,
    hasBadgesInShortlist,
    hasTradeOffs,
  };

  const activeScreenshot = path.join(ARTIFACT_DIR, "desktop-workspace-active.png");
  await page.screenshot({ path: activeScreenshot, fullPage: false });
  report.screenshots.push("desktop-workspace-active.png");

  // -------------------------------------------------------------
  // Test 3: Interactive Refinement (e.g. adjust budget or priority)
  // -------------------------------------------------------------
  console.log("Testing interactive refinement chip...");
  const budgetButton = await page.$(
    "aside[aria-label='Shopping requirements & refinements'] button"
  );
  if (budgetButton) {
    await budgetButton.click();
    console.log("Refinement chip clicked, waiting for updated response...");
    await new Promise((r) => setTimeout(r, 8000));
  }

  const refinedScreenshot = path.join(ARTIFACT_DIR, "desktop-workspace-refined.png");
  await page.screenshot({ path: refinedScreenshot, fullPage: false });
  report.screenshots.push("desktop-workspace-refined.png");

  // -------------------------------------------------------------
  // Test 4: One-Click Add to Cart from Shortlist
  // -------------------------------------------------------------
  console.log("Testing Add to Cart from Shortlist...");
  const addToCartButton = await page.$(
    "aside[aria-label='Live product shortlist & decision insights'] button"
  );
  if (addToCartButton) {
    await addToCartButton.click();
    await new Promise((r) => setTimeout(r, 600));
  }

  // -------------------------------------------------------------
  // Test 5: Mobile Responsive Layout & 0 Horizontal Overflow
  // -------------------------------------------------------------
  console.log("Testing Mobile Responsive Layout (iPhone 14 / 390x844)...");
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(`${BASE_URL}/chat`, { waitUntil: "networkidle0" });

  // Check horizontal overflow
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  report.overflowTests.mobile = {
    bodyWidth,
    clientWidth,
    hasHorizontalOverflow: bodyWidth > clientWidth,
  };

  const mobileChatScreenshot = path.join(ARTIFACT_DIR, "mobile-workspace-chat.png");
  await page.screenshot({ path: mobileChatScreenshot, fullPage: false });
  report.screenshots.push("mobile-workspace-chat.png");

  // Click Context tab on mobile
  console.log("Switching to Context tab on mobile...");
  const buttonsForContext = await page.$$("button");
  for (const btn of buttonsForContext) {
    const text = await (await btn.getProperty("textContent")).jsonValue();
    if (text.includes("Context")) {
      await btn.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 400));

  const mobileContextScreenshot = path.join(ARTIFACT_DIR, "mobile-workspace-context.png");
  await page.screenshot({ path: mobileContextScreenshot, fullPage: false });
  report.screenshots.push("mobile-workspace-context.png");

  // Click Shortlist tab on mobile
  console.log("Switching to Shortlist tab on mobile...");
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await (await btn.getProperty("textContent")).jsonValue();
    if (text.includes("Shortlist")) {
      await btn.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 300));

  const mobileShortlistScreenshot = path.join(ARTIFACT_DIR, "mobile-workspace-shortlist.png");
  await page.screenshot({ path: mobileShortlistScreenshot, fullPage: false });
  report.screenshots.push("mobile-workspace-shortlist.png");

  console.log("Phase 3 QA Run Completed Successfully!");
  console.log(JSON.stringify(report, null, 2));

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "phase3-qa-results.json"),
    JSON.stringify(report, null, 2)
  );
} catch (err) {
  console.error("QA Run Error:", err);
  process.exit(1);
} finally {
  await browser.close();
}
