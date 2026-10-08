// Live content is data. Escape it before composing the office's small HTML templates.
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function safeLink(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function appHealth(apps, stale = false) {
  if (stale) return { status: 'idle', text: 'HQ unreachable · app status is stale' };
  if (!apps.length) return { status: 'idle', text: 'No apps reported by HQ' };
  const failed = apps.filter(a => a.status === 'failed');
  if (failed.length) return { status: 'error', text: `${failed.map(a => a.name).join(', ')} ${failed.length === 1 ? 'is' : 'are'} down` };
  const running = apps.filter(a => a.status === 'running').length;
  return { status: running === apps.length ? 'working' : 'idle', text: `${running} of ${apps.length} apps running` };
}

// One request at a time, including startup recovery. Injected timers make the retry behavior testable.
export function createLivePoller({ read, accept, unavailable, schedule = setTimeout, cancel = clearTimeout, delay = 3000 }) {
  let timer, stopped = false;
  async function poll() {
    if (stopped) return;
    try {
      const feed = await read();
      if (!stopped) accept(feed);
    } catch (error) { if (!stopped) unavailable(error); }
    finally { if (!stopped) timer = schedule(poll, delay); }
  }
  return { start: poll, stop() { stopped = true; cancel(timer); } };
}
