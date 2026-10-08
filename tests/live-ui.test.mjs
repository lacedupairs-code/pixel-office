import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML, safeLink, appHealth, createLivePoller } from '../office3d/live-ui.mjs';

test('live names, descriptions and attribute values remain text', () => {
  assert.equal(escapeHTML(`<img src=x onerror="alert('x')"> &`), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp;');
  assert.equal(escapeHTML(null), '');
  assert.equal(escapeHTML('مرحبا 👋 漢字'), 'مرحبا 👋 漢字');
});
test('inspector links accept only absolute HTTP(S) URLs', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//example.com', 'file:///tmp/a', null]) assert.equal(safeLink(value), null);
  assert.equal(safeLink('https://example.com/?x="'), 'https://example.com/?x=%22');
});
test('health reports actual running, stopped, failed, empty and stale feeds', () => {
  assert.deepEqual(appHealth([]), {status:'idle', text:'No apps reported by HQ'});
  assert.deepEqual(appHealth([{name:'A',status:'running'}]), {status:'working',text:'1 of 1 apps running'});
  assert.deepEqual(appHealth([{name:'A',status:'running'},{name:'B',status:'stopped'}]), {status:'idle',text:'1 of 2 apps running'});
  assert.deepEqual(appHealth([{name:'B',status:'failed'}]), {status:'error',text:'B is down'});
  assert.match(appHealth([], true).text, /stale/);
});
test('offline startup retries, recovers, and keeps polling after later failure', async () => {
  const events=[], timers=[];
  let attempt=0;
  const poller=createLivePoller({read:async()=>{if (++attempt!==2) throw Error('offline'); return {apps:[]};},accept:feed=>events.push(feed),unavailable:()=>events.push('offline'),schedule:fn=>{timers.push(fn);return timers.length;},cancel:()=>{}});
  await poller.start(); assert.deepEqual(events,['offline']); assert.equal(timers.length,1);
  await timers.shift()(); assert.deepEqual(events,['offline',{apps:[]}]);
  await timers.shift()(); assert.equal(events.at(-1),'offline'); assert.equal(timers.length,1);
  poller.stop(); await timers.shift()(); assert.equal(attempt,3);
});
test('stopping while a read is pending prevents scene updates and new timers', async () => {
  let finish; const events=[];
  const poller=createLivePoller({read:()=>new Promise(resolve=>finish=resolve),accept:()=>events.push('accepted'),unavailable:()=>events.push('failed'),schedule:()=>events.push('scheduled'),cancel:()=>{}});
  const pending=poller.start(); poller.stop(); finish({apps:[]}); await pending;
  assert.deepEqual(events,[]);
});
