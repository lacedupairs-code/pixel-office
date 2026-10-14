# Where work belongs

HQ owns Build conversations and their names, isolated copies, reviews, previews, Design,
Canvas pages, Ship and Undo. Jarvis may read those facts and send view-only requests.
The Canvas log view uses HQ's existing app logs. No extra terminal service is introduced.

Jarvis owns its native agents (Hermes, Cortex, Agent Zero and others), their permissions,
voice and CLI terminals. HQ's sidebar reflects their status and opens Jarvis for action.
It does not submit their permission decisions or duplicate their job controls.

Pixel Office is a read-only projection. One worker represents one HQ conversation, labelled
with its HQ name. Links return to that conversation in HQ. It never starts or approves jobs.

## View commands

Use Ctrl K Search or HQ Talk: `open <app> [page 1–4]`, `open page 2`, `show all pages`,
`go to <agent name>`, `what's <agent name> doing`, `what finished`.
Exact app names or ids are required. Ambiguous agent names need renaming in HQ.
The last command reports up to five finishes from the last day.

Jarvis recognizes the same phrases before AI routing. Its `hq_navigate` tool is restricted
to Jarvis and accepts only `{text}`. HQ converts it to one of three view actions: app,
canvas page or conversation. No task, approval, ship, terminal input or arbitrary URL action
exists on this channel. Invalid commands receive an explanation without paid fallback.

A remote request waits at most 30 seconds for a visible HQ tab. The first visible tab to poll
receives it once. Keep the intended HQ tab visible; hidden tabs do not receive commands.
For `show all pages`, HQ uses the app most recently reported by a visible tab (12-second
window); include the app in an `open <app> page N` command when several devices are open.
Requests are memory-only and disappear on restart, rather than replay later.
HQ displays a brief note when it receives a navigation request.

Jarvis callouts remain opt-in. Navigation and status reads use no model calls.

## Conversation links

`#/app/<id>/canvas/build/<conversation>` opens that conversation in Canvas. If it is
already on a saved page, HQ opens that page and focuses the existing pane. Otherwise the
existing Build panel opens beside Canvas, without inserting or saving a pane. `go to <name>`
uses this same behavior. Standard `/build/` links retain their original behavior.
