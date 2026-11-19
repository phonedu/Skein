/* global URL, document, console */
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const browser = await chromium.launch({ headless: true });
const boards = [
  ['m0', 'M0-role-map', 1440, 900],
  ['m1', 'M1-merged-desktop', 1440, 900],
  ['m2', 'M2-merged-desktop-action', 1440, 900],
  ['m3', 'M3-merged-mobile', 360, 800],
  ['m4a', 'M4-merged-mobile-margin', 360, 800],
  ['m4b', 'M4b-merged-mobile-pinned', 360, 800],
  ['m5', 'M5-merged-thesis', 1440, 900],
];
const page = await browser.newPage({ viewport: { width: 1536, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`file://${resolve(here, 'concepts.html')}`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts?.ready);

for (const [id, filename, width, height] of boards) {
  await page.setViewportSize({ width: width + 96, height });
  const el = page.locator(`#${id}`);
  await el.evaluate((node) => node.scrollIntoView({ block: 'start', inline: 'start' }));
  const box = await el.boundingBox();
  await page.screenshot({
    path: resolve(here, `${filename}.png`),
    clip: { x: Math.round(box.x), y: Math.round(box.y), width, height },
    scale: 'device',
  });
}
await browser.close();
console.log('Captured 7 boards at their actual CSS sizes with deviceScaleFactor=1.');
