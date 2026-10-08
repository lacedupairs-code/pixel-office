// Start Pixel Office with its private Synty assets first. Uses Playwright's Edge/Chromium driver.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.OFFICE_TEST_URL || 'http://localhost:7012';
const captureDir = process.env.OFFICE_SCREENSHOT_DIR;

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
    await page.locator('[data-f="Agents"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-f="Agents"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-f="all"]').getAttribute('aria-pressed'), 'false');
    await page.waitForFunction(() => document.querySelector('.lbl.dim'));
    await page.locator('#lounge').click();
    await page.locator('#night').click();
    assert.equal(await page.getByRole('switch',{name:'Night mode'}).getAttribute('aria-checked'),'true');
    assert.equal(await page.locator('html').getAttribute('data-appearance'),'dark');
    await page.locator('#night').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#night').getAttribute('aria-checked'),'false','Keyboard switches back to day');
    assert.equal(await page.locator('html').getAttribute('data-appearance'),'light');
    const wasHigh = await page.locator('#quality').getAttribute('aria-pressed');
    await page.locator('#quality').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#quality').getAttribute('aria-pressed'), String(wasHigh !== 'true'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#fit').click();
    assert(await page.locator('#zoomIn').isVisible());
    assert(await page.locator('#mobileMode').isVisible());
    await page.getByRole('button',{name:'Activity',exact:true}).click();
    assert(await page.locator('#activityPanel').isVisible());
    assert.equal(await page.locator('#insp').isVisible(),false);
    if (captureDir) await page.screenshot({path:`${captureDir}/office-phone-activity.png`});
    await page.locator('#night').click();
    assert.equal(await page.locator('html').getAttribute('data-appearance'),'dark');
    if (captureDir) await page.screenshot({path:`${captureDir}/office-phone-activity-dark.png`});
    await page.locator('#night').click();
    await page.getByRole('button',{name:'Inspector',exact:true}).focus(); await page.keyboard.press('Enter');
    assert(await page.locator('#insp').isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    // dragging rotates by default (as in the look tests); ROTATE switches it to moving
    assert.equal(await page.locator('#rotate').getAttribute('aria-pressed'), 'true');
    await page.locator('#zoomIn').click(); await page.locator('#rotate').click();
    assert.equal(await page.locator('#rotate').getAttribute('aria-pressed'), 'false');
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
    assert.equal(await page.evaluate(() => __office.CAST.guard.doing), 'No apps reported by HQ');
    // An unreachable startup must recover without reload and must remove the sample cast.
    await page.unroute('**/api/office');
    let unavailable = true, feedReads = 0;
    const maliciousName = '<img src=x onerror="window.injected=1">';
    await page.route('**/api/office', route => {
      feedReads++;
      return unavailable ? route.fulfill({ status:503, json:{} }) : route.fulfill({ json:{
        apps:[{id:'jarvis',name:'Jarvis',status:'failed',url:'javascript:alert(1)'},{id:'bot',name:'Bot',status:'stopped'}],
        tasks:[],crews:[],ships:[],proofs:[],backup:{},
        activity:[{id:'unsafe',type:'agent.test',appName:maliciousName,summary:'<svg onload="window.injected=2">',at:new Date().toISOString()}],
        jarvis:{reached:true,handoffs:[],bots:[],agents:[{id:'unsafe',name:maliciousName,busy:true,job:{text:'<img src=x onerror="window.injected=3">'}}]},
      }});
    });
    await page.goto(`${base}/?q=low&night=0`);
    await page.waitForFunction(() => window.__office, { timeout:120000 });
    assert.match(await page.locator('#mode').innerText(), /DEMO.*RETRYING/);
    unavailable=false;
    await page.waitForFunction(() => document.querySelector('#mode').textContent === 'LIVE · HQ', {timeout:20000});
    assert(feedReads >= 2);
    assert.equal(await page.evaluate(() => !!__office.CAST.hermes),false,'Sample characters are removed');
    assert.equal(await page.evaluate(() => __office.CAST.guard.doing),'Jarvis is down');
    await page.evaluate(() => __office.select(__office.LIVE.agents.get('agent:unsafe')));
    assert((await page.locator('#insp').innerText()).includes(maliciousName));
    assert.equal(await page.locator('#insp a').count(),0,'Unsafe application URL is omitted');
    assert.equal(await page.locator('#feed img,#feed svg,.agent-name img,#insp img:not([src^="data:"])').count(),0);
    assert.equal(await page.evaluate(() => !!window.injected),false);
    unavailable=true;
    await page.waitForFunction(() => document.querySelector('#mode').textContent.includes('LAST KNOWN'), {timeout:20000});
    assert.match(await page.evaluate(() => __office.CAST.guard.doing), /stale/);
    unavailable=false;
    await page.waitForFunction(() => document.querySelector('#mode').textContent === 'LIVE · HQ', {timeout:20000});
    await page.goto(`${base}/?demo=1&q=low`);
    await page.waitForFunction(() => window.__office, {timeout:120000});
    const beforeDemoReads=feedReads;
    await page.waitForTimeout(6500);
    assert.equal(feedReads,beforeDemoReads,'Explicit demo never polls live HQ');
    // Reduced motion follows OS changes without hiding live information or controls.
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(() => __office.reducedMotion);
    assert.equal(await page.evaluate(() => __office.controls.enableDamping),false);
    await page.locator('#fit').click();
    await page.waitForTimeout(150);
    const stillA=await page.evaluate(()=>{const a=__office.agents[0];return {time:a.body.mixer.time,camera:__office.camera.position.toArray()};});
    await page.waitForTimeout(300);
    const stillB=await page.evaluate(()=>{const a=__office.agents[0];return {time:a.body.mixer.time,camera:__office.camera.position.toArray()};});
    assert.equal(stillA.time,stillB.time,'Idle rig animations stop');
    assert.deepEqual(stillA.camera,stillB.camera,'Camera settles immediately');
    if (captureDir) {
      await page.setViewportSize({width:1300,height:900});
      await page.screenshot({path:`${captureDir}/office-reduced-motion.png`});
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(() => !__office.reducedMotion);
    assert.equal(await page.evaluate(() => __office.controls.enableDamping),true);
    assert.deepEqual(errors, []);
    console.log('PASS: 12 rooms, human animation rigs and portraits, filtering, camera controls, mobile layout, and live unknown-agent/bot routing.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
