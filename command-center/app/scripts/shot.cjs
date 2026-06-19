const puppeteer = require("puppeteer-core");
const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:8788";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
  });

  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  const login = await page.evaluate(async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "dev-test", mode: "test" }),
    });
    return { ok: res.ok, status: res.status };
  });
  console.log("login:", JSON.stringify(login));

  async function shot(path, file, extraWait = 1600) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await sleep(extraWait);
    await page.screenshot({ path: `/tmp/${file}` });
    console.log("shot:", path, "->", file);
  }

  await shot("/home", "app-home.png");
  await shot("/leads", "app-leads.png");

  // open the pipeline switcher dropdown on the Leads screen
  const btn = await page.$('button[aria-haspopup="listbox"]');
  if (btn) {
    await btn.click();
    await sleep(500);
    await page.screenshot({ path: "/tmp/app-leads-switcher.png" });
    console.log("shot: leads switcher open -> app-leads-switcher.png");
  } else {
    console.log("WARN: switcher button not found");
  }

  await shot("/conversations", "app-conversations.png");
  await shot("/contacts", "app-contacts.png");

  console.log("console errors:", errors.length ? errors : "none");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
