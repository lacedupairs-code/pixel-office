# Live office trust and controls

The health character reports HQ's current app states, including failed, stopped,
and empty feeds. On a failed fetch it shows stale status immediately. Its ambient
speech uses the same current summary; sample health messages explicitly say sample.

An offline startup shows the sample day while retrying HQ every three seconds.
The first valid feed removes sample characters and scheduled sample scenes before
creating live characters. Later outages retain clearly labeled last-known data.
Requests time out after eight seconds and never overlap. Explicit `?demo=1` stays
in demo without contacting HQ. Leaving the page stops future retries.

Names, descriptions, task summaries, and activity text are escaped in HTML templates.
Inspector links accept only absolute HTTP and HTTPS URLs. Filter and quality controls
are native buttons with pressed states and visible keyboard focus. Long live text wraps.

Validation:

- `npm run build` and `npm run lint` passed.
- `npm run test:live-ui`: five regression tests passed.
- Native T3 browser, actual 3D page with licensed local models and a synthetic feed:
  offline startup recovered without reload; sample cast removed; failed app reported;
  later outage labeled stale; recovery returned to live; malicious label, inspector,
  and activity text remained literal; unsafe inspector URL omitted; filter click updated
  its pressed state. No real agent jobs were sent.
- Static captures checked actual rendered UI markup and styles at desktop and phone
  widths. They omit the 3D canvas. Long-text wrapping was improved after inspection.
- Expanded `tests/office3d-browser.cjs` covers keyboard activation, recovery, escaping,
  stale health, and explicit demo isolation. This expanded suite has not yet run.
  T3 keyboard calls did not activate the focused controls and its screenshots timed out;
  these limitations are not counted as passing keyboard or full-scene visual checks.

Remaining checks: run the expanded browser suite on a licensed asset host; physical
phone and screen reader. This package does not implement reduced motion or the mobile
activity/status redesign from the later audit findings.
