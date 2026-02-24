/**
 * Captures screenshots of all Sprint 1–10 screens and generates a PDF.
 *
 * Usage:  npx playwright install chromium  (one-time)
 *         node scripts/screenshot-pages.mjs
 *
 * Output: screenshots/ec3l-sprint-screens.pdf
 */
import { mkdirSync, existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

// Dynamically resolve playwright-core from npx cache
let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.log("Installing playwright-core...");
  execSync("npm install --no-save playwright-core", { stdio: "inherit" });
  ({ chromium } = await import("playwright-core"));
}

const BASE = "http://localhost:5001/t/default";

const TENANT_SLUG = "default";
const USER_ID = "user-admin";

const pages = [
  // Sprint 1
  { name: "01-apps-home",        path: "/apps",                                  title: "Sprint 1 — Apps Home (My Apps)" },
  { name: "02-app-dashboard",    path: "/apps/facilities-request",                title: "Sprint 8 — App Dashboard (Getting Started)" },
  // Sprint 2
  { name: "03-record-list",      path: "/records",                                title: "Sprint 2 — Records Page" },
  { name: "04-primitives",       path: "/primitives",                             title: "Sprint 2 — Primitives (Record Types)" },
  // Sprint 3/5
  { name: "05-app-manage",       path: "/apps/facilities-request/manage",         title: "Sprint 3/5 — App Manage Page" },
  // Sprint 4
  { name: "06-create-app-wizard",path: "/build/apps/new",                         title: "Sprint 4 — Create App Wizard" },
  // Sprint 6
  { name: "07-sidebar-nav",      path: "/apps",                                   title: "Sprint 6 — Sidebar Navigation" },
  // Sprint 7
  { name: "08-workspace",        path: "/workspace",                              title: "Sprint 7 — Workspace Landing" },
];

const OUT_DIR = path.resolve("screenshots");

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:5001",
          localStorage: [
            { name: "tenantId", value: TENANT_SLUG },
            { name: "userId", value: USER_ID },
          ],
        },
      ],
    },
  });

  const screenshotPaths = [];

  for (const pg of pages) {
    const page = await context.newPage();
    const url = `${BASE}${pg.path}`;
    console.log(`📸  ${pg.title}  →  ${url}`);

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      // Give React a moment to settle
      await page.waitForTimeout(1500);
    } catch (e) {
      console.warn(`   ⚠️  Timeout/error loading ${url}: ${e.message}`);
    }

    const file = path.join(OUT_DIR, `${pg.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    screenshotPaths.push(file);
    console.log(`   ✅  saved ${file}`);
    await page.close();
  }

  // --- Generate PDF from screenshots ---
  console.log("\n📄  Generating PDF...");
  const pdfPage = await context.newPage();

  const imgTags = screenshotPaths
    .map((fp, i) => {
      const b64 = readFileSync(fp).toString("base64");
      const dataUri = `data:image/png;base64,${b64}`;
      const title = pages[i].title;
      return `
        <div style="page-break-after: always; text-align: center; padding: 20px;">
          <h2 style="font-family: sans-serif; margin-bottom: 12px;">${title}</h2>
          <img src="${dataUri}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 8px;" />
        </div>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>EC3L Sprint Screens</title></head>
<body style="margin: 0; padding: 0;">
  <div style="text-align: center; padding: 60px 20px; page-break-after: always;">
    <h1 style="font-family: sans-serif; font-size: 32px;">EC3L — Sprint 1–10 Screen Captures</h1>
    <p style="font-family: sans-serif; color: #666; font-size: 14px;">Generated ${new Date().toISOString().slice(0, 10)}</p>
  </div>
  ${imgTags}
</body>
</html>`;

  await pdfPage.setContent(html, { waitUntil: "load" });
  const pdfPath = path.join(OUT_DIR, "ec3l-sprint-screens.pdf");
  await pdfPage.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
  });
  console.log(`\n✅  PDF saved: ${pdfPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
