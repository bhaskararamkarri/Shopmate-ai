import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const ARTIFACT_DIR =
  process.env.ARTIFACT_DIR ||
  path.join(process.cwd(), ".superpowers/sdd/audit-screenshots");
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
  consoleErrors: [],
  pageErrors: [],
};

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
});

async function waitForImages(page) {
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("img")).every(
          (img) => img.complete,
        ),
      { timeout: 4000 },
    )
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
}

try {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      report.consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    report.pageErrors.push(err.message);
  });

  // -------------------------------------------------------------
  // Test 1: Desktop Strictly 2-Column Decision Workspace Layout (1440x900)
  // -------------------------------------------------------------
  console.log("Checking Desktop 2-Column Workspace layout (1440x900)...");
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/chat`, { waitUntil: "networkidle0" });

  const hasLeftPanel =
    (await page.$("aside[aria-label='Shopping requirements & refinements']")) !==
    null;
  const hasDesktopShortlistAside =
    (await page.$(
      "aside[aria-label='Live product shortlist & decision insights']",
    )) !== null;
  const hasChatInput = (await page.$("#chat-input")) !== null;

  report.desktopTests.initialLayout = {
    passed: hasLeftPanel && !hasDesktopShortlistAside && hasChatInput,
    hasLeftPanel,
    hasDesktopShortlistAside,
    hasChatInput,
  };

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "desktop-workspace-initial.png"),
    fullPage: false,
  });
  report.screenshots.push("desktop-workspace-initial.png");

  // -------------------------------------------------------------
  // Test 2: Send Query & Verify Inline 2-Up Synthesis Cards
  // -------------------------------------------------------------
  console.log("Sending shopping query in workspace...");
  await page.waitForSelector("#chat-input");
  await page.type(
    "#chat-input",
    "Recommend top wireless headphones under $200 from the catalog",
  );
  await page.click('button[aria-label="Send message"]');

  console.log("Waiting for AI response & inline Recommended products list...");
  await page.waitForSelector("ul[aria-label='Recommended products'] li", {
    timeout: 60000,
  });

  const leftPanelText = await page.$eval(
    "aside[aria-label='Shopping requirements & refinements']",
    (el) => el.innerText,
  );
  const inlineProductsText = await page.$eval(
    "ul[aria-label='Recommended products']",
    (el) => el.innerText,
  );

  const hasCategoryExtracted =
    leftPanelText.toLowerCase().includes("headphone") ||
    leftPanelText.toLowerCase().includes("audio") ||
    inlineProductsText.toLowerCase().includes("headphone");
  const hasBudgetExtracted =
    leftPanelText.includes("200") || inlineProductsText.includes("$");
  const lowerInline = inlineProductsText.toLowerCase();
  const hasInlineBadges =
    inlineProductsText.includes("Best Overall") ||
    inlineProductsText.includes("Best Value") ||
    inlineProductsText.includes("Best Fit") ||
    lowerInline.includes("demo data") ||
    lowerInline.includes("live");
  const hasTradeOffs =
    inlineProductsText.toLowerCase().includes("trade-off") ||
    inlineProductsText.toLowerCase().includes("why it fits") ||
    inlineProductsText.toLowerCase().includes("specifications");

  report.desktopTests.queryExtraction = {
    passed:
      hasCategoryExtracted &&
      hasBudgetExtracted &&
      hasInlineBadges &&
      hasTradeOffs,
    hasCategoryExtracted,
    hasBudgetExtracted,
    hasInlineBadges,
    hasTradeOffs,
  };

  await waitForImages(page);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "desktop-workspace-active.png"),
    fullPage: false,
  });
  report.screenshots.push("desktop-workspace-active.png");

  // -------------------------------------------------------------
  // Test 3: Interactive Refinement Chip in Left Requirements Rail
  // -------------------------------------------------------------
  console.log("Testing interactive refinement chip...");
  const priorRecommendationLists = await page.$$eval(
    "ul[aria-label='Recommended products']",
    (els) => els.length,
  );
  const budgetBtnHandle = await page.evaluateHandle(() => {
    const aside = document.querySelector(
      "aside[aria-label='Shopping requirements & refinements']",
    );
    return Array.from(aside?.querySelectorAll("button") ?? []).find((b) =>
      b.textContent?.includes("< $200") || b.textContent?.includes("< $100"),
    );
  });
  const budgetBtn = budgetBtnHandle.asElement();
  if (budgetBtn) {
    // Prefer clicking "< $100" explicitly so it triggers a fresh narrowed refinement turn
    const sub100Handle = await page.evaluateHandle(() => {
      const aside = document.querySelector(
        "aside[aria-label='Shopping requirements & refinements']",
      );
      return Array.from(aside?.querySelectorAll("button") ?? []).find((b) =>
        b.textContent?.includes("< $100"),
      );
    });
    const targetBtn = sub100Handle.asElement() ?? budgetBtn;
    await targetBtn.click();
    await page
      .waitForFunction(
        (prevCount) => {
          const loadingGone = !document.body.innerText.includes("Evaluating…");
          const lists = document.querySelectorAll(
            "ul[aria-label='Recommended products']",
          ).length;
          return loadingGone && lists > prevCount;
        },
        { timeout: 60000 },
        priorRecommendationLists,
      )
      .catch(() => {});
  }

  await waitForImages(page);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "desktop-workspace-refined.png"),
    fullPage: false,
  });
  report.screenshots.push("desktop-workspace-refined.png");

  // -------------------------------------------------------------
  // Test 4: One-Click Add to Cart from Inline Synthesis Card
  // -------------------------------------------------------------
  console.log("Testing Add to Cart from inline product card...");
  const addToCartBtnHandle = await page.evaluateHandle(() => {
    const list = document.querySelector("ul[aria-label='Recommended products']");
    return Array.from(list?.querySelectorAll("button") ?? []).find((b) =>
      b.textContent?.includes("Add to Cart"),
    );
  });
  await addToCartBtnHandle.asElement()?.click();
  await new Promise((r) => setTimeout(r, 300));

  const cartUpdatedText = await page.evaluate(() => {
    const cartLink = document.querySelector('nav[aria-label="Main"] a[href="/cart"]');
    return cartLink?.textContent?.trim() || "";
  });
  report.desktopTests.inlineAddToCart = {
    passed: cartUpdatedText.includes("1"),
    cartUpdatedText,
  };

  // -------------------------------------------------------------
  // Test 5: Mobile Responsive Layout, 0 Overflow & Segmented Tabs (390x844)
  // -------------------------------------------------------------
  console.log("Testing Mobile Workspace Layout (390x844)...");
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await new Promise((r) => setTimeout(r, 300));

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  report.overflowTests.mobile = {
    bodyWidth,
    clientWidth,
    hasHorizontalOverflow: bodyWidth > clientWidth,
  };

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "mobile-workspace-chat.png"),
    fullPage: false,
  });
  report.screenshots.push("mobile-workspace-chat.png");

  // Context tab
  const contextTab = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Context"),
    ),
  );
  await contextTab.asElement()?.click();
  await new Promise((r) => setTimeout(r, 300));
  const contextVisible =
    (await page.$("aside[aria-label='Shopping requirements & refinements']")) !==
    null;

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "mobile-workspace-context.png"),
    fullPage: false,
  });
  report.screenshots.push("mobile-workspace-context.png");

  // Shortlist tab
  const shortlistTab = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Shortlist"),
    ),
  );
  await shortlistTab.asElement()?.click();
  await new Promise((r) => setTimeout(r, 300));
  const shortlistTabMountedPanel =
    (await page.$(
      "aside[aria-label='Live product shortlist & decision insights']",
    )) !== null;

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "mobile-workspace-shortlist.png"),
    fullPage: false,
  });
  report.screenshots.push("mobile-workspace-shortlist.png");

  report.mobileTests.tabs = {
    passed: contextVisible && shortlistTabMountedPanel,
    contextVisible,
    shortlistTabMountedPanel,
  };

  console.log("Phase 3 Workspace QA Completed!");
} catch (err) {
  console.error("Workspace QA Error:", err);
  report.error = err.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "phase3-qa-results.json"),
    JSON.stringify(report, null, 2),
  );

  const ok =
    !report.error &&
    report.desktopTests.initialLayout?.passed &&
    report.desktopTests.queryExtraction?.passed &&
    report.desktopTests.inlineAddToCart?.passed &&
    report.mobileTests.tabs?.passed &&
    report.overflowTests.mobile?.hasHorizontalOverflow === false &&
    report.pageErrors.length === 0 &&
    report.consoleErrors.length === 0;

  console.log(JSON.stringify(report, null, 2));
  if (!ok) {
    console.error("Workspace QA assertions failed!");
    process.exitCode = 1;
  }
}
