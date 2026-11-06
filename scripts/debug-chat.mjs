import puppeteer from "puppeteer-core";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  page.on("request", (req) => {
    if (req.url().includes("/api/chat")) {
      console.log("[REQ /api/chat]", req.method(), req.postData());
    }
  });
  page.on("response", async (res) => {
    if (res.url().includes("/api/chat")) {
      console.log("[RES /api/chat]", res.status());
      try {
        const text = await res.text();
        console.log("[RES BODY]", text.slice(0, 500));
      } catch (e) {
        console.log("[RES ERR]", e.message);
      }
    }
  });

  await page.goto(`${BASE_URL}/chat`, { waitUntil: "networkidle0" });
  console.log("Navigated to /chat");

  const input = await page.$("#chat-input");
  await input.type("wireless headphones under $100");
  await page.click("button[type='submit']");

  console.log("Waiting for /api/chat response...");
  await page.waitForResponse((res) => res.url().includes("/api/chat"), { timeout: 15000 });
  console.log("Got response!");

  await new Promise((r) => setTimeout(r, 2000));
  const messagesCount = await page.$$eval("[role='listitem']", (els) => els.length);
  console.log("Total message rows found after reply:", messagesCount);

  const assistantRow = await page.$$eval("[role='listitem']", (els) => els.map(e => e.innerText));
  console.log("Messages text:", assistantRow);
} finally {
  await browser.close();
}
