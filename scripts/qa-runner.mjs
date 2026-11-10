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

const results = {
  journeys: {},
  visual: {},
  dataIntegrity: {},
  screenshots: [],
  consoleErrors: [],
  pageErrors: [],
};

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
});

async function saveShot(page, name, fullPage = false) {
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
  const out = path.join(ARTIFACT_DIR, name);
  await page.screenshot({ path: out, fullPage });
  results.screenshots.push(name);
}

try {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      results.consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    results.pageErrors.push(err.message);
  });

  // ==========================================
  // Journey 1: Homepage loads cleanly (Desktop 1440x900)
  // ==========================================
  console.log("Checking Journey 1: Homepage (1440x900)...");
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  const pageTitle = await page.title();
  const headerExists = (await page.$("header")) !== null;
  const heroHeading = await page.$eval("h1", (el) => el.textContent.trim());
  const footerExists = (await page.$("footer")) !== null;

  results.journeys.homepageLoads = {
    passed: headerExists && footerExists && heroHeading.length > 0,
    title: pageTitle,
    heading: heroHeading,
  };

  await saveShot(page, "desktop-homepage.png", true);

  const desktopOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  const desktopBrokenImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src),
  );

  results.visual.desktop = {
    hasHorizontalOverflow: desktopOverflow,
    brokenImages: desktopBrokenImages,
  };

  // ==========================================
  // Journey 2: Desktop Navbar navigation
  // ==========================================
  console.log("Checking Journey 2: Desktop Navbar links...");
  const navTests = [];
  for (const target of ["/chat", "/compare", "/cart", "/"]) {
    await page.click(`nav[aria-label="Main"] a[href="${target}"]`);
    await page.waitForFunction(
      (expectedPath) => window.location.pathname === expectedPath,
      { timeout: 5000 },
      target,
    );
    navTests.push({ target, currentUrl: page.url() });
  }
  results.journeys.navbarNavigation = {
    passed: navTests.every((t) => new URL(t.currentUrl).pathname === t.target),
    navTests,
  };

  // ==========================================
  // Journey 3: Mobile Bottom Nav + Mobile Quick Search Sheet (390x844)
  // ==========================================
  console.log("Checking Journey 3: Mobile Bottom Nav & Quick Search Sheet...");
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  await saveShot(page, "mobile-homepage.png", true);

  const mobileOverflowHome = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );

  const bottomNavTabs = await page.$$eval(
    'nav[aria-label="Mobile bottom navigation"] a',
    (links) => links.map((a) => a.getAttribute("href")),
  );

  const searchBtnSelector = 'button[aria-label="Open quick search"]';
  const initialExpanded = await page.$eval(searchBtnSelector, (el) =>
    el.getAttribute("aria-expanded"),
  );
  await page.click(searchBtnSelector);
  await page.waitForSelector('#shopmate-mobile-search-sheet[role="dialog"]');
  const openedExpanded = await page.$eval(searchBtnSelector, (el) =>
    el.getAttribute("aria-expanded"),
  );

  await saveShot(page, "mobile-search-open.png", false);

  await page.click('button[aria-label="Close quick search"]');
  const closedAfterCloseBtn =
    (await page.$("#shopmate-mobile-search-sheet")) === null;

  await page.click(searchBtnSelector);
  await page.waitForSelector("#mobile-quick-search");
  await page.type("#mobile-quick-search", "wireless headphones under $250");
  await page.click('button[aria-label="Submit quick search"]');
  await page.waitForFunction(
    () => window.location.pathname === "/chat",
    { timeout: 5000 },
  );
  const searchedFromMobile = page.url().includes("/chat?q=");

  await page.click('nav[aria-label="Mobile bottom navigation"] a[href="/compare"]');
  await page.waitForFunction(
    () => window.location.pathname === "/compare",
    { timeout: 5000 },
  );
  const mobileNavCompare = new URL(page.url()).pathname === "/compare";

  results.journeys.mobileNavigation = {
    passed:
      bottomNavTabs.length === 4 &&
      initialExpanded === "false" &&
      openedExpanded === "true" &&
      closedAfterCloseBtn &&
      searchedFromMobile &&
      mobileNavCompare,
    bottomNavTabs,
    initialExpanded,
    openedExpanded,
    closedAfterCloseBtn,
    searchedFromMobile,
    mobileNavCompare,
  };

  // ==========================================
  // Journey 4 & 5: Hero Search & Slash Shortcut (Desktop 1440x900)
  // ==========================================
  console.log("Checking Journey 4 & 5: Hero Search & Slash Shortcut...");
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  await page.keyboard.press("/");
  const focusedId = await page.evaluate(() => document.activeElement?.id);
  const slashFocusPassed = focusedId === "hero-search";

  await page.type("#hero-search", "quiet wireless headphones under $250");
  await page.keyboard.press("/");
  const valueAfterSlash = await page.$eval("#hero-search", (el) => el.value);
  const slashInsideInputPassed = valueAfterSlash.endsWith("/");

  results.journeys.heroSearchAndShortcut = {
    passed: slashFocusPassed && slashInsideInputPassed,
    slashFocusPassed,
    slashInsideInputPassed,
    typedValue: valueAfterSlash,
  };

  // ==========================================
  // Journey 6: Search Submission -> /chat?q=...
  // ==========================================
  console.log("Checking Journey 6: Search submission...");
  await page.click('form[role="search"] button[type="submit"]');
  await page.waitForFunction(
    () => window.location.pathname === "/chat" && window.location.search.includes("q="),
    { timeout: 10000 },
  );
  results.journeys.searchSubmission = {
    passed: page.url().includes("/chat?q="),
    url: page.url(),
  };

  // ==========================================
  // Journey 7: Interactive Category Filtering & AI Links
  // ==========================================
  console.log("Checking Journey 7: Interactive Category Filter Tiles...");
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  const categoryButtons = await page.$$(
    'div[role="group"][aria-label="Filter catalog by category"] button',
  );
  let audioClickedAskAi = null;
  for (const btn of categoryButtons) {
    const label = await btn.evaluate((el) => el.textContent || "");
    if (label.includes("Audio")) {
      await btn.click();
      await new Promise((r) => setTimeout(r, 150));
      audioClickedAskAi = await page.$$eval('a[href*="/chat?q="]', (anchors) =>
        anchors.map((a) => ({
          href: a.getAttribute("href"),
          text: a.textContent.trim(),
        })),
      );
      break;
    }
  }
  const filteredArticlesCount = (await page.$$("article")).length;

  // Reset to Featured
  if (categoryButtons.length > 0) {
    await categoryButtons[0].click();
    await new Promise((r) => setTimeout(r, 150));
  }

  results.journeys.categoryCards = {
    passed:
      categoryButtons.length >= 5 &&
      filteredArticlesCount > 0 &&
      (audioClickedAskAi?.some((l) => l.href?.includes("headphones")) ?? false),
    categoriesFound: categoryButtons.length,
    filteredArticlesCount,
    aiLinksAfterAudioFilter: audioClickedAskAi,
  };

  // ==========================================
  // Journey 8: Featured Product Cards
  // ==========================================
  console.log("Checking Journey 8: Featured product cards...");
  const productCardsData = await page.$$eval("article", (articles) =>
    articles.map((art) => {
      const name = art.querySelector("h3")?.textContent?.trim() || "";
      const price = art.querySelector(".tabular-nums")?.textContent?.trim() || "";
      const badge =
        art.querySelector('span[title*="Demo record"], span.tracking-wide')
          ?.textContent?.trim() || "";
      const img = art.querySelector("img");
      const glyphSvg = art.querySelector("svg");
      const hasAnalysisBtn = Array.from(art.querySelectorAll("button")).some(
        (b) => b.textContent?.includes("Analysis"),
      );
      const hasCompareBtn = Array.from(art.querySelectorAll("button")).some(
        (b) =>
          b.textContent?.includes("Compare") ||
          b.textContent?.includes("Compared"),
      );
      return {
        name,
        price,
        badge,
        hasMedia: img !== null || glyphSvg !== null,
        hasAnalysisBtn,
        hasCompareBtn,
      };
    }),
  );

  results.journeys.featuredProducts = {
    passed:
      productCardsData.length > 0 &&
      productCardsData.every(
        (p) => p.name && p.price && p.hasMedia && p.hasAnalysisBtn && p.hasCompareBtn,
      ),
    productCount: productCardsData.length,
    sampleCard: productCardsData[0],
  };

  // ==========================================
  // Journey 9: Compare Dock + Analysis Drawer -> Add to Cart -> /cart & /compare & Confirmation
  // ==========================================
  console.log("Checking Journey 9: Compare Dock, Analysis Drawer & Add-to-Cart...");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle0" });

  // Toggle Compare on first 2 articles to surface Sliding Comparison Drawer
  const articles = await page.$$("article");
  for (let i = 0; i < Math.min(2, articles.length); i++) {
    const compareBtn = await articles[i].evaluateHandle((art) =>
      Array.from(art.querySelectorAll("button")).find(
        (b) =>
          b.getAttribute("aria-pressed") !== null &&
          (b.textContent?.includes("Compare") ?? false),
      ),
    );
    const el = compareBtn.asElement();
    if (el) await el.click();
  }
  await page.waitForSelector('aside[aria-label="Pinned product comparison drawer"]', {
    timeout: 5000,
  });
  const compareDockLink = await page.$(
    'aside[aria-label="Pinned product comparison drawer"] a[href="/compare"]',
  );
  await page.click(
    'aside[aria-label="Pinned product comparison drawer"] button[aria-controls="shopmate-comparison-drawer-panel"]',
  );
  await page.waitForSelector("#shopmate-comparison-drawer-panel", {
    timeout: 3000,
  });
  const compareDrawerVisible =
    compareDockLink !== null &&
    (await page.$("#shopmate-comparison-drawer-panel")) !== null;
  await page.mouse.move(10, 10);
  await new Promise((r) => setTimeout(r, 250));
  await saveShot(page, "desktop-compare-drawer.png", false);

  // Minimize drawer before clicking article Analysis button so fixed overlay doesn't intercept pointer
  await page.click('button[aria-label="Minimize comparison drawer"]');
  await page.waitForFunction(
    () => document.querySelector("#shopmate-comparison-drawer-panel") === null,
    { timeout: 3000 },
  );

  // Open Analysis Drawer on first article -> click Add to cart -> Close
  const analysisBtn = await articles[0].evaluateHandle((art) =>
    Array.from(art.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Analysis"),
    ),
  );
  await page.evaluate((el) => {
    el?.scrollIntoView({ block: "center", behavior: "instant" });
  }, analysisBtn);
  await new Promise((r) => setTimeout(r, 100));
  await analysisBtn.asElement()?.click();
  await page.waitForSelector('div[role="dialog"]');
  await saveShot(page, "desktop-analysis-drawer.png", false);

  const addInDialog = await page.evaluateHandle(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    return Array.from(dialog?.querySelectorAll("button") ?? []).find((b) =>
      b.textContent?.includes("Add to cart"),
    );
  });
  await addInDialog.asElement()?.click();
  await new Promise((r) => setTimeout(r, 200));

  await page.click('button[aria-label="Close product analysis"]');
  await page.waitForFunction(
    () => document.querySelector('div[role="dialog"]') === null,
    { timeout: 3000 },
  );

  const updatedDesktopCartText = await page.evaluate(() => {
    const cartLink = document.querySelector('nav[aria-label="Main"] a[href="/cart"]');
    return cartLink?.textContent?.trim() || "";
  });

  // Navigate to Desktop /compare & capture
  await page.goto(
    `${BASE_URL}/compare?ids=demo-aurora-headphones,demo-bloom-earbuds`,
    { waitUntil: "networkidle0" },
  );
  const desktopCompareOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  await saveShot(page, "desktop-compare.png", true);

  // Navigate to Desktop /cart (populated) & capture
  await page.goto(`${BASE_URL}/cart`, { waitUntil: "networkidle0" });
  await page.waitForSelector('iframe[title*="PayPal"]', { timeout: 6000 }).catch(() => {});
  const desktopCartText = await page.evaluate(() => document.body.innerText);
  await saveShot(page, "desktop-cart.png", true);

  // Navigate to Mobile /cart & verify MobileBottomNav badge shows "1"
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('iframe[title*="PayPal"]', { timeout: 6000 }).catch(() => {});
  const mobileCartBadgeText = await page.evaluate(() => {
    const link = document.querySelector(
      'nav[aria-label="Mobile bottom navigation"] a[href="/cart"]',
    );
    return link?.textContent?.trim() || "";
  });
  const mobileOverflowCart = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  await saveShot(page, "mobile-cart.png", true);

  // Mobile /compare screenshot + overflow check
  await page.goto(
    `${BASE_URL}/compare?ids=demo-aurora-headphones,demo-bloom-earbuds`,
    { waitUntil: "networkidle0" },
  );
  const mobileOverflowCompare = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  await saveShot(page, "mobile-compare.png", true);

  // Screen 05 Confirmation View (seeded via sessionStorage receipt, both Mobile & Desktop)
  await page.goto(`${BASE_URL}/cart`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    sessionStorage.setItem(
      "shopmate.receipt.v1",
      JSON.stringify({
        orderId: "SM-AUDIT-2026-QA",
        captureId: "CAP-AUDIT-992384-SBX",
        amount: { currency: "USD", value: "378.00" },
        purchasedItems: [
          {
            quantity: 1,
            product: {
              id: "demo-aurora-headphones",
              name: "Aurora ANC Headphones",
              description: "Demo headphones",
              price: 249,
              currency: "USD",
              availability: "in_stock",
              images: [
                "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
              ],
              ratings: 0,
              reviews: 0,
              category: "Audio",
              brand: "Auralia",
              specs: {},
              source: "demo",
              demo: true,
            },
          },
          {
            quantity: 1,
            product: {
              id: "demo-bloom-earbuds",
              name: "Bloom ANC Earbuds",
              description: "Demo earbuds",
              price: 129,
              currency: "USD",
              availability: "in_stock",
              images: [
                "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80",
              ],
              ratings: 0,
              reviews: 0,
              category: "Audio",
              brand: "Auralia",
              specs: {},
              source: "demo",
              demo: true,
            },
          },
        ],
        capturedAt: "23:20 UTC",
      }),
    );
  });
  await page.reload({ waitUntil: "networkidle0" });
  const mobileConfirmState = await page.evaluate(() => ({
    hasHeading: document.body.innerText.includes("Payment Confirmed & Captured"),
    hasCheckoutFlowHeader: document.body.innerText.includes("Checkout Flow"),
    bottomNavHidden:
      document.querySelector('nav[aria-label="Mobile bottom navigation"]') === null,
  }));
  await saveShot(page, "mobile-confirmation.png", true);

  await page.setViewport({ width: 1440, height: 900 });
  await saveShot(page, "desktop-confirmation.png", true);

  // Clear receipt + empty cart state
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle0" });
  const emptyCartHeading = await page.evaluate(() =>
    document.body.innerText.includes("Your Cart is Quiet"),
  );
  await saveShot(page, "desktop-cart-empty.png", false);

  results.journeys.addToCartAndCompare = {
    passed:
      compareDrawerVisible &&
      updatedDesktopCartText.includes("1") &&
      mobileCartBadgeText.includes("1") &&
      mobileConfirmState.hasHeading &&
      mobileConfirmState.hasCheckoutFlowHeader &&
      mobileConfirmState.bottomNavHidden &&
      emptyCartHeading,
    compareDrawerVisible,
    updatedDesktopCartText,
    mobileCartBadgeText,
    mobileConfirmState,
    emptyCartHeading,
  };

  // ==========================================
  // Journey 10: Footer Links
  // ==========================================
  console.log("Checking Journey 10: Footer links...");
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  const footerLinks = await page.$$eval("footer a", (anchors) =>
    anchors.map((a) => ({
      href: a.getAttribute("href"),
      label: a.textContent.trim(),
    })),
  );
  results.journeys.footerLinks = {
    passed:
      footerLinks.length >= 4 &&
      footerLinks.every((l) => l.href && l.href.startsWith("/")),
    footerLinksCount: footerLinks.length,
    links: footerLinks,
  };

  // ==========================================
  // Tablet Overflow Check (768x1024)
  // ==========================================
  await page.setViewport({ width: 768, height: 1024 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  const tabletOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  results.visual.mobile = {
    hasHorizontalOverflow:
      mobileOverflowHome || mobileOverflowCart || mobileOverflowCompare,
    home: mobileOverflowHome,
    cart: mobileOverflowCart,
    compare: mobileOverflowCompare,
  };
  results.visual.compareDesktop = {
    hasHorizontalOverflow: desktopCompareOverflow,
  };
  results.visual.tablet = {
    hasHorizontalOverflow: tabletOverflow,
  };

  // ==========================================
  // Data Integrity Verification
  // ==========================================
  const demoBadgesCount = await page.$$eval(
    'span[title*="Demo record"]',
    (els) => els.length,
  );
  const homeBodyText = await page.evaluate(() => document.body.innerText);
  const noFakeTaxOrSim =
    !desktopCartText.includes("$31.04") &&
    !desktopCartText.includes("Sandbox Simulation Controls");
  results.dataIntegrity = {
    hasDemoBadges: demoBadgesCount > 0,
    demoBadgesCount,
    noPrematureCapturedClaimsOnHome:
      !homeBodyText.includes("Payment captured") &&
      !homeBodyText.includes("order captured"),
    noFakeTaxOrSimInCart: noFakeTaxOrSim,
  };

  console.log("Browser QA Completed!");
} catch (err) {
  console.error("Browser QA Error:", err);
  results.error = err.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "browser-qa-results.json"),
    JSON.stringify(results, null, 2),
  );

  const allJourneysPassed =
    Object.keys(results.journeys).length === 9 &&
    Object.values(results.journeys).every((j) => j.passed === true);
  const noOverflow =
    !results.visual.desktop?.hasHorizontalOverflow &&
    !results.visual.mobile?.hasHorizontalOverflow &&
    !results.visual.compareDesktop?.hasHorizontalOverflow &&
    !results.visual.tablet?.hasHorizontalOverflow;
  const noBrokenImages = (results.visual.desktop?.brokenImages?.length ?? 0) === 0;
  const integrityOk =
    results.dataIntegrity.hasDemoBadges &&
    results.dataIntegrity.noPrematureCapturedClaimsOnHome &&
    results.dataIntegrity.noFakeTaxOrSimInCart;

  console.log(JSON.stringify(results, null, 2));
  if (
    results.error ||
    !allJourneysPassed ||
    !noOverflow ||
    !noBrokenImages ||
    !integrityOk ||
    results.pageErrors.length > 0 ||
    results.consoleErrors.length > 0
  ) {
    console.error("QA assertions failed — see browser-qa-results.json above.");
    process.exitCode = 1;
  }
}
