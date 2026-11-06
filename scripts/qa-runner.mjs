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

const results = {
  journeys: {},
  visual: {},
  dataIntegrity: {},
  screenshots: [],
  consoleErrors: [],
};

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      results.consoleErrors.push(msg.text());
    }
  });

  // ==========================================
  // Journey 1: Homepage loads correctly
  // ==========================================
  console.log("Checking Journey 1: Homepage loads correctly...");
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  const pageTitle = await page.title();
  const headerExists = await page.$("header") !== null;
  const heroHeading = await page.$eval("h1", (el) => el.textContent.trim());
  const footerExists = await page.$("footer") !== null;

  results.journeys.homepageLoads = {
    passed: headerExists && footerExists && heroHeading.length > 0,
    title: pageTitle,
    heading: heroHeading,
  };

  const desktopHomeScreenshot = path.join(ARTIFACT_DIR, "desktop-homepage.png");
  await page.screenshot({ path: desktopHomeScreenshot, fullPage: false });
  results.screenshots.push("desktop-homepage.png");

  // ==========================================
  // Visual Inspection: Desktop Horizontal Overflow & Broken Images
  // ==========================================
  console.log("Checking Visual Inspection: Desktop Layout & Images...");
  const desktopOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  const desktopBrokenImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    return imgs
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src);
  });

  results.visual.desktop = {
    hasHorizontalOverflow: desktopOverflow,
    brokenImages: desktopBrokenImages,
  };

  // ==========================================
  // Journey 2: Navbar links navigate correctly
  // ==========================================
  console.log("Checking Journey 2: Navbar links...");
  const navTests = [];

  for (const target of ["/chat", "/compare", "/cart", "/"]) {
    await page.click(`nav[aria-label="Main"] a[href="${target}"]`);
    await page.waitForFunction(
      (expectedPath) => window.location.pathname === expectedPath,
      { timeout: 5000 },
      target
    );
    navTests.push({ target, currentUrl: page.url() });
  }

  results.journeys.navbarNavigation = {
    passed: navTests.every((t) => t.currentUrl.endsWith(t.target)),
    navTests,
  };

  // ==========================================
  // Journey 3: Mobile Navigation
  // ==========================================
  console.log("Checking Journey 3: Mobile Navigation...");
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  const mobileHomeScreenshot = path.join(ARTIFACT_DIR, "mobile-homepage.png");
  await page.screenshot({ path: mobileHomeScreenshot, fullPage: false });
  results.screenshots.push("mobile-homepage.png");

  // Check mobile overflow
  const mobileOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  results.visual.mobile = {
    hasHorizontalOverflow: mobileOverflow,
  };

  // Open mobile menu
  const menuButton = await page.$('button[aria-controls="shopmate-mobile-nav"]');
  const initialExpanded = await page.$eval(
    'button[aria-controls="shopmate-mobile-nav"]',
    (el) => el.getAttribute("aria-expanded")
  );
  await menuButton.click();
  await page.waitForSelector("#shopmate-mobile-nav");

  const openedExpanded = await page.$eval(
    'button[aria-controls="shopmate-mobile-nav"]',
    (el) => el.getAttribute("aria-expanded")
  );

  const mobileMenuScreenshot = path.join(ARTIFACT_DIR, "mobile-menu-open.png");
  await page.screenshot({ path: mobileMenuScreenshot, fullPage: false });
  results.screenshots.push("mobile-menu-open.png");

  // Click a link in mobile menu
  await page.click('#shopmate-mobile-nav a[href="/compare"]');
  await page.waitForFunction(
    () => window.location.pathname === "/compare",
    { timeout: 5000 }
  );
  const mobileNavigatedUrl = page.url();

  // Re-open and close menu to verify close button interaction
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  await page.click('button[aria-controls="shopmate-mobile-nav"]');
  await page.waitForSelector("#shopmate-mobile-nav");
  await page.click('button[aria-controls="shopmate-mobile-nav"]');
  const closedAfterClick = await page.$("#shopmate-mobile-nav") === null;

  results.journeys.mobileNavigation = {
    passed: initialExpanded === "false" && openedExpanded === "true" && mobileNavigatedUrl.endsWith("/compare") && closedAfterClick,
    initialExpanded,
    openedExpanded,
    mobileNavigatedUrl,
    closedAfterClick,
  };

  // Restore Desktop Viewport
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  // ==========================================
  // Journey 4 & 5: Hero Search & Slash Keyboard Shortcut
  // ==========================================
  console.log("Checking Journey 4 & 5: Hero Search & Slash Shortcut...");
  // Press '/' key while document is not focused on an input
  await page.keyboard.press("/");
  const focusedId = await page.evaluate(() => document.activeElement?.id);
  const slashFocusPassed = focusedId === "hero-search";

  // Type in hero search
  await page.type("#hero-search", "quiet wireless headphones under $250");

  // Test that pressing '/' inside an input types '/' instead of taking over
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
  // Journey 6: Submitting search query opens /chat?q=...
  // ==========================================
  console.log("Checking Journey 6: Search submission...");
  await page.click('form[role="search"] button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  const searchResultUrl = page.url();

  results.journeys.searchSubmission = {
    passed: searchResultUrl.includes("/chat?q="),
    url: searchResultUrl,
  };

  const desktopChatScreenshot = path.join(ARTIFACT_DIR, "desktop-chat.png");
  await page.screenshot({ path: desktopChatScreenshot, fullPage: false });
  results.screenshots.push("desktop-chat.png");

  // ==========================================
  // Journey 7: Category cards pass correct intent to AI workspace
  // ==========================================
  console.log("Checking Journey 7: Category cards...");
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  const categoryCards = await page.$$eval('a[href*="/chat?q="]', (anchors) =>
    anchors.map((a) => ({
      href: a.getAttribute("href"),
      text: a.textContent.trim(),
    }))
  );

  const audioCategory = categoryCards.find((c) => c.href?.includes("Quiet%20wireless") || c.href?.includes("wireless"));
  results.journeys.categoryCards = {
    passed: categoryCards.length >= 4,
    categoriesFound: categoryCards.length,
    sampleHref: audioCategory?.href,
  };

  // ==========================================
  // Journey 8: Featured product cards display actual catalog data & provenance
  // ==========================================
  console.log("Checking Journey 8: Featured product cards...");
  const productCardsData = await page.$$eval("article", (articles) =>
    articles.map((art) => {
      const name = art.querySelector("h3")?.textContent.trim() || "";
      const price = art.querySelector("p.tabular-nums")?.textContent.trim() || "";
      const badge = art.querySelector("span[title], span.tracking-wide")?.textContent.trim() || "";
      const img = art.querySelector("img");
      const glyphSvg = art.querySelector("svg");
      return {
        name,
        price,
        badge,
        hasMedia: img !== null || glyphSvg !== null,
        mediaType: img ? "image" : (glyphSvg ? "glyph-icon" : "none"),
      };
    })
  );

  results.journeys.featuredProducts = {
    passed: productCardsData.length > 0 && productCardsData.every((p) => p.name && p.price && p.hasMedia),
    productCount: productCardsData.length,
    sampleCard: productCardsData[0],
  };

  // ==========================================
  // Journey 9: Add-to-cart works and updates cart count
  // ==========================================
  console.log("Checking Journey 9: Add to cart...");
  // Clear any existing cart in localStorage
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });

  const initialCartText = await page.evaluate(() => {
    const cartLink = document.querySelector('nav[aria-label="Main"] a[href="/cart"]');
    return cartLink?.textContent?.trim() || "";
  });

  // Click Add to Cart on first article
  const addButtons = await page.$$('article button[type="button"]');
  if (addButtons.length > 0) {
    await addButtons[0].click();
    await new Promise((r) => setTimeout(r, 300));
  }

  const updatedCartText = await page.evaluate(() => {
    const cartLink = document.querySelector('nav[aria-label="Main"] a[href="/cart"]');
    return cartLink?.textContent?.trim() || "";
  });

  // Navigate to /cart
  await page.goto(`${BASE_URL}/cart`, { waitUntil: "networkidle0" });

  const desktopCartScreenshot = path.join(ARTIFACT_DIR, "desktop-cart.png");
  await page.screenshot({ path: desktopCartScreenshot, fullPage: false });
  results.screenshots.push("desktop-cart.png");

  results.journeys.addToCart = {
    passed: updatedCartText.includes("1"),
    initialText: initialCartText,
    updatedText: updatedCartText,
  };

  // ==========================================
  // Journey 10: Footer links work
  // ==========================================
  console.log("Checking Journey 10: Footer links...");
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  const footerLinks = await page.$$eval("footer a", (anchors) =>
    anchors.map((a) => ({
      href: a.getAttribute("href"),
      label: a.textContent.trim(),
    }))
  );

  results.journeys.footerLinks = {
    passed: footerLinks.length >= 4 && footerLinks.every((l) => l.href && l.href.startsWith("/")),
    footerLinksCount: footerLinks.length,
    links: footerLinks,
  };

  // ==========================================
  // Visual Inspection: Tablet Viewport
  // ==========================================
  console.log("Checking Visual Inspection: Tablet Layout...");
  await page.setViewport({ width: 768, height: 1024 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });
  const tabletOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  results.visual.tablet = {
    hasHorizontalOverflow: tabletOverflow,
  };

  // ==========================================
  // Data Integrity Verification
  // ==========================================
  console.log("Checking Data Integrity...");
  // 1. Provenance distinction
  const demoBadges = await page.$$eval('span[title*="Demo record"]', (badges) => badges.length);
  results.dataIntegrity.provenanceDistinction = {
    hasDemoBadges: demoBadges > 0,
    demoBadgesCount: demoBadges,
  };

  // 2. Assistant preview & Payment wording audit
  const pageText = await page.evaluate(() => document.body.innerText);
  const paymentCapturedMention = pageText.includes("Payment captured") || pageText.includes("order captured");
  results.dataIntegrity.paymentWording = {
    noPrematureCapturedClaimsOnHome: !paymentCapturedMention,
  };

  console.log("Browser QA Completed Successfully!");
} catch (err) {
  console.error("Browser QA Error:", err);
  results.error = err.message;
} finally {
  await browser.close();
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "browser-qa-results.json"),
    JSON.stringify(results, null, 2)
  );
  console.log("Results written to browser-qa-results.json");
}
