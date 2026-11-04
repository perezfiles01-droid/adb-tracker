/* Run the site the way the live one runs, and look at it.
 *
 * The live site behaves differently under /adb-tracker/ (window.TRACKER_CLEAN):
 * the password curtain, the Index-only sidebar, the ADB project, the FAQ.
 * The checks in checks/ load Tracker-standalone.html from file://, so they
 * never see any of that. This script serves the repo under /adb-tracker/ on
 * localhost and drives it with Playwright, which is the closest a cloud
 * session can get: github.io itself is blocked by the egress proxy.
 *
 *   node scripts/live_check.cjs                 # open ADB, screenshot
 *   node scripts/live_check.cjs faq             # open the FAQ, open Q1, click step 1
 *   node scripts/live_check.cjs kt 6            # open the KT guide at chapter 7 (0-based)
 *   node scripts/live_check.cjs publish         # FAQ edit + Publish, GitHub faked
 *
 * Screenshots go to $OUT (default /tmp). Every run prints page errors and
 * failed requests; "errors []" and "bad []" are the pass condition.
 * `publish` never reaches GitHub: api.github.com is intercepted and the PUTs
 * it would have sent are printed instead.
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.OUT || "/tmp";
const PORT = 8765 + Math.floor(Math.random() * 500);
const [mode = "adb", arg] = process.argv.slice(2);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (!p.startsWith("/adb-tracker")) { res.writeHead(404); return res.end(); }
  p = p.replace(/^\/adb-tracker\/?/, "") || "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [], bad = [], puts = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("response", (r) => { if (r.status() >= 400 && r.url().includes("localhost")) bad.push(`${r.status()} ${r.url()}`); });
  p.on("dialog", (d) => (d.type() === "prompt" ? d.accept("test-token") : d.accept()));
  await p.route("https://api.github.com/**", async (r) => {
    const q = r.request();
    if (q.method() === "PUT") {
      const j = JSON.parse(q.postData());
      puts.push({ path: q.url().split("/contents/")[1], message: j.message, sha: j.sha });
      return r.fulfill({ status: 201, body: "{}" });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sha: "test-sha" }) });
  });
  const shot = (name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });

  await p.goto(`http://localhost:${PORT}/adb-tracker/`);
  await p.waitForTimeout(1200);
  if (await p.locator("#sitegate").count()) { await p.fill("#sitegate input", "adb"); await p.click("#sitegate button"); }
  await p.waitForTimeout(500);
  const local = p.getByText("Use this computer only");
  if (await local.count()) await local.click();
  await p.waitForTimeout(800);
  await p.getByText("Asian Development Bank").first().click();
  await p.waitForTimeout(600);
  console.log("hub cards:", (await p.locator("[data-hub]").allInnerTexts()).map((t) => t.split("\n")[0]));

  if (mode === "kt") {
    await p.locator('[data-hub="adb-knowledge-transfer"]').click();
    await p.waitForTimeout(800);
    await p.locator(`.bk-toc [data-bkgo="${arg || 0}"]`).click();
    await p.waitForTimeout(2500);
    console.log("chapter:", await p.locator(".bk-page:not([hidden]) .bk-title").innerText());
    await p.locator(".bk-progress").evaluate((e) => e.scrollIntoView());
    await shot("kt");
  } else if (mode === "faq" || mode === "publish") {
    await p.locator('[data-hub="frequently-asked-questions"]').click();
    await p.waitForTimeout(1500);
    console.log("questions:", await p.locator("details.faqq summary").allInnerTexts());
    if (mode === "faq") {
      await p.locator(".faqq summary").first().click();
      await p.waitForTimeout(300);
      await p.locator('[data-faqstep="0.0.0"]').click();
      await p.waitForTimeout(500);
      console.log("step 1 screenshots shown:", await p.locator('[data-faqstep="0.0.0"] .faqshots').isVisible());
      await p.locator(".faqq").first().evaluate((e) => e.scrollIntoView());
      await shot("faq");
    } else {
      await p.click('[data-faqact="edit"]');
      await p.waitForTimeout(300);
      await p.locator(".faqq").first().locator(".faqnum").click();
      await p.locator('[data-faqf="0|question"]').click();
      await p.keyboard.press("End");
      await p.keyboard.type(" (test)");
      await p.click('[data-faqact="publish"]');
      await p.waitForTimeout(1500);
      console.log("status:", await p.locator(".faqstatus").innerText());
      console.log("PUTs that would have gone to GitHub:", puts);
    }
  } else {
    await shot("adb");
  }
  console.log("bad", bad);
  console.log("errors", errors);
  await b.close();
  server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
