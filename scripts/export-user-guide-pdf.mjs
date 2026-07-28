import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(import.meta.dirname, '..');
const guidePath = path.join(workspaceRoot, 'docs', 'huong-dan-su-dung.html');
const outputPath = path.join(workspaceRoot, 'output', 'pdf', 'cam-nang-su-dung-lms-thpt.pdf');

let playwright;
try {
  playwright = require('playwright');
} catch {
  const moduleRoot = process.env.CODEX_NODE_MODULES;
  if (!moduleRoot) {
    throw new Error('Không tìm thấy Playwright. Hãy đặt CODEX_NODE_MODULES tới thư mục node_modules có playwright.');
  }
  playwright = require(path.join(moduleRoot, 'playwright'));
}

await mkdir(path.dirname(outputPath), { recursive: true });
const systemBrowsers = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const executablePath = systemBrowsers.find(existsSync);
const browser = await playwright.chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(guidePath).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts?.ready);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '12mm', right: '12mm', bottom: '16mm', left: '12mm' },
  });
} finally {
  await browser.close();
}

console.log(outputPath);
