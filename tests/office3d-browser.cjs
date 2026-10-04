// Start Pixel Office with its private Synty assets first. Uses Playwright's Edge/Chromium driver.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.OFFICE_TEST_URL || 'http://localhost:7012';

(async () => {
  const browser = await chromium.launch({ channel: process.env.OFFICE_TEST_BROWSER || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1120 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => {
      if (message.type()==='error' && /WebGL|THREE|shader|GL_INVALID/i.test(message.text())) errors.push(message.text());
    });
    const config = await (await page.request.get(`${base}/api/office-config`)).json();
    assert(config.syntyReady, 'Install the licensed Synty assets before running the 3D browser checks.');
    await page.goto(`${base}/?demo=1&night=0`);
    await page.waitForFunction(() => window.__office, { timeout: 120000 });
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => __office.ROOMS.length), 12);
    assert(await page.evaluate(() => __office.agents.every(a => !a.body.robot && a.body.character && Object.keys(a.body.actions).length >= 8)));
    await page.evaluate(() => __office.select(__office.CAST.hermes));
    await page.locator('.av img').waitFor();
    assert((await page.locator('.av img').getAttribute('src')).startsWith('data:image/png'));
    await page.locator('#fit').click();
    await page.waitForTimeout(1500);
    await page.locator('[data-f="Agents"]').click();
    await page.waitForFunction(() => document.querySelector('.lbl.dim'));
    await page.locator('#lounge').click();
    await page.locator('#night').click();
    await page.locator('#quality').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#fit').click();
    assert(await page.locator('#zoomIn').isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#zoomIn').click(); await page.locator('#rotate').click();
    assert.equal(await page.locator('#rotate').getAttribute('aria-pressed'), 'true');
    // Exercise live routing too: unfamiliar agents/bots must never revert to robots.
    await page.route('**/api/office-config', route => route.fulfill({ json: { ...config, hqUrl: base } }));
    await page.route('**/api/office', route => route.fulfill({ json: {
      apps: [], tasks: [], crews: [], ships: [], proofs: [], activity: [], backup: {},
      jarvis: { reached: true, handoffs: [], agents: [
        { id: 'hermes', name: 'Hermes', busy: true, job: { text: 'Researching' } },
        { id: 'unfamiliar-agent', name: 'New coworker', waiting: true, job: { text: 'Review request' } },
      ], bots: [{ id: 'new-bot', name: 'New bot', state: 'working' }] },
    } }));
    await page.goto(`${base}/?night=0`);
    await page.waitForFunction(() => window.__office, { timeout: 120000 });
    assert.match(await page.locator('#mode').innerText(), /LIVE/);
    assert(await page.evaluate(() => __office.agents.every(a => !a.body.robot && a.body.character)));
    assert.equal(await page.locator('#sWait').innerText(), '1');
    assert(await page.evaluate(() => __office.LIVE.agents.has('agent:unfamiliar-agent') && __office.LIVE.agents.has('bot:new-bot')));
    assert.deepEqual(errors, []);
    console.log('PASS: 12 rooms, human animation rigs and portraits, filtering, camera controls, mobile layout, and live unknown-agent/bot routing.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
