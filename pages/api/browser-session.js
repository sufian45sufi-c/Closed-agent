import { Sandbox } from "@vercel/sandbox";

export const config = {
  api: {
    responseLimit: false,
    bodyParser: { sizeLimit: "5mb" },
  },
};

const activeSandboxes = global.__fabionSandboxes || (global.__fabionSandboxes = new Map());

const PACKAGE_JSON = JSON.stringify(
  {
    name: "fabion-browser-sandbox",
    version: "1.0.0",
    dependencies: { "playwright-core": "1.47.0" },
  },
  null,
  2
);

async function getOrCreateSandbox(sessionId) {
  const existing = activeSandboxes.get(sessionId);
  if (existing) return existing.sandbox;

  const sandbox = await Sandbox.create({ timeout: 300_000 });

  await sandbox.writeFiles([
    { path: "package.json", content: Buffer.from(PACKAGE_JSON, "utf-8") },
  ]);

  const install = await sandbox.runCommand({ cmd: "npm", args: ["install"] });
  if (install.exitCode !== 0) {
    const errText = await install.stderr();
    throw new Error("Failed to install playwright-core: " + errText.slice(0, 800));
  }

  // Without --with-deps (which needs sudo/apt and can fail silently) — just get the Chromium binary itself.
  const installBrowser = await sandbox.runCommand({
    cmd: "npx",
    args: ["playwright", "install", "chromium"],
  });

  if (installBrowser.exitCode !== 0) {
    const errText = await installBrowser.stderr();
    throw new Error("Failed to install Chromium browser: " + errText.slice(0, 800));
  }

  activeSandboxes.set(sessionId, { sandbox, createdAt: Date.now() });
  return sandbox;
}

const BROWSER_SCRIPT = `
const { chromium } = require('playwright-core');
const action = JSON.parse(process.argv[2]);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    if (action.type === 'navigate') {
      await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else if (action.type === 'click') {
      await page.click(action.selector, { timeout: 10000 });
    } else if (action.type === 'type') {
      await page.fill(action.selector, action.text, { timeout: 10000 });
    } else if (action.type === 'scroll') {
      await page.evaluate((y) => window.scrollBy(0, y), action.amount || 500);
    }

    await page.waitForTimeout(500);
    const screenshot = await page.screenshot({ encoding: 'base64' });
    const title = await page.title();
    const url = page.url();
    const text = await page.evaluate(() => document.body.innerText.slice(0, 3000));

    console.log(JSON.stringify({ screenshot, title, url, text }));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
  } finally {
    await browser.close();
  }
})();
`;

function normalizeUrl(input) {
  if (!input) return null;
  let url = input.trim();

  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return "https://" + url;

  return "https://www.google.com/search?q=" + encodeURIComponent(url);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId, action } = req.body;

  if (!sessionId || !action) {
    return res.status(400).json({ error: "sessionId and action are required" });
  }

  if (action.type === "navigate") {
    action.url = normalizeUrl(action.url);
    if (!action.url) {
      return res.status(200).json({ error: "No valid URL provided to navigate to." });
    }
  }

  try {
    const sandbox = await getOrCreateSandbox(sessionId);

    await sandbox.writeFiles([
      { path: "browser-action.js", content: Buffer.from(BROWSER_SCRIPT, "utf-8") },
    ]);

    const proc = await sandbox.runCommand({
      cmd: "node",
      args: ["browser-action.js", JSON.stringify(action)],
    });

    const output = await proc.stdout();
    const errorOutput = await proc.stderr();

    if (proc.exitCode !== 0) {
      return res.status(200).json({ error: `Command failed (exit ${proc.exitCode}): ${errorOutput.slice(0, 500)}` });
    }

    const lastLine = output.trim().split("\n").pop();

    let result;
    try {
      result = JSON.parse(lastLine);
    } catch {
      return res.status(200).json({ error: "Unexpected browser output: " + output.slice(0, 500) });
    }

    if (result.error) {
      return res.status(200).json({ error: result.error, stderr: errorOutput });
    }

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Browser action failed" });
  }
}
