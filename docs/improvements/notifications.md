# Notifications: what each option takes (improvements N1)

Research only, written 2026-11-01 for card N1 of the
[Strategist Improvements Runbook](https://claude.ai/artifact/SF5xjaoxUyzPJM7WKCmohN). No app code changed.
The owner's decision and the adjusted N2–N4 cards are in `docs/improvements/LOG.md` under N1.

The three alerts the owner picked:

1. **On the clock** (Draft Strategist): you're a few picks away, or on the clock, in a Sleeper draft MDS is live-syncing.
   Mainly for MDS open on a computer while Sleeper is only on your phone (Sleeper's app already notifies).
2. **A starter has a problem before kickoff** (Lineup Strategist): Out, Doubtful, IR, bye or no game.
3. **Rankings updated and a lineup would change** (Lineup Strategist).

How these were checked: the repo's code (paths below), and web searches for browser and Cloudflare facts. This
session's network blocked direct page fetches of developers.cloudflare.com and developer.chrome.com, so the Cloudflare
and Chrome numbers come from search results quoting those pages (listed under Sources). Re-check them on the live
pages before building anything server-side. Where a fact needs a real device test, it says so.

## Short answer

| Alert | Site open (no server) | Site closed (web push) | Cards | Main risks |
|---|---|---|---|---|
| **On the clock** (MDS) | **Works on a computer.** In a hidden tab Chrome may run the 3 s poll only once a minute, so the alert can be up to ~60 s late; warning 1–3 picks early covers it. iPhone/iPad: no (a Safari tab has no notifications; an installed app is paused in the background). | **Works**, about 1 minute late at best (cron runs once a minute at most). Sleeper's draft and picks endpoints are public and small. | Open: **1** (N4, on N2's module). Closed: **3** (Worker + storage + push setup, sw.js push handlers and Settings, the draft poller). | Open: lateness in a hidden tab (Chrome's once-a-minute throttle). Closed: server upkeep, secrets, storing usernames; a minute of lag still matters on a 30–60 s clock. |
| **Starter problem** (MLS) | **Works on a computer** with `/lineup/` open: a timer before each kickoff window checks the starters with the data from the last sync, or refreshes it first. Lateness doesn't matter at this scale (minutes). Phones: mostly no (background tabs are frozen or paused). | **Partly.** Bye, empty slot, no game, IR slot: yes, from Sleeper's small endpoints. Injury status: only from Sleeper's 15 MB player file, which Sleeper asks to fetch at most once a day and the free Worker plan can't parse (10 ms CPU). So late scratches (Sunday inactives, 90 min before kickoff) would be missed unless another injury source is found. | Open: **1** (N2, with the shared module). Closed: **+2** on top of the push setup (the poller, the injury source), likely the $5/month Workers plan. | Open: only helps if the site is open on a computer at the time. Closed: stale injury data, the paid plan, Sleeper's once-a-day guidance. Sleeper's own app already sends player news. |
| **Rankings updated** (MLS) | **Nothing to alert.** Rankings change only when you upload or tap the ROS fetch button, so you're already looking. The app already marks Weekly rankings older than 6 days in amber (league cards, rankings header). | **Can't be computed.** Rankings and the recommended lineup live only in your browser. | **0** (drop N3), or fold one line into N2's alert. | None if dropped. |

**Recommendation: alerts only while the site is open** (N2 and N4), **drop N3** as its own card, and fold a "your
Weekly rankings are N days old" line into N2's starter alert. Details and the reasons under
[Recommendation](#recommendation).

## 1. While the site is open

### `new Notification()` versus `registration.showNotification()`

- `new Notification(title, options)` works in desktop Chrome, Edge, Firefox and Safari, from the page itself.
- On Android, Chrome (and Samsung Internet) throws `TypeError: Failed to construct 'Notification': Illegal
  constructor. Use ServiceWorkerRegistration.showNotification() instead.` [3]. The service-worker form works
  everywhere that has notifications.
- So the shared module should always use `navigator.serviceWorker.ready.then(reg => reg.showNotification(...))`. The
  site already registers `sw.js` on every page, so that's available. A tap on the notification is handled by a
  `notificationclick` listener in `sw.js` (focus an open `/` or `/lineup/` window, or open one). Without that listener
  the notification shows but a tap does nothing useful, so N2 has to add it to `sw.js` (a middle-number `CACHE_NAME`
  bump: the service worker's own behavior changes).
- The permission prompt (`Notification.requestPermission()`) must follow a tap: Safari refuses it otherwise, and Chrome
  quietens prompts that come unasked. The site asks only from a Settings toggle.

### What still runs in a hidden or minimized tab

Draft Strategist's live sync is a `setInterval` of 3,000 ms (`js/mds/sleeperSync.js`, `State.autoSyncTimer`, near
line 616). Each tick calls `processSleeperDraftData`, which fetches the draft's picks from Sleeper.

| Browser | Hidden tab | Effect on a 3 s poll |
|---|---|---|
| **Chrome / Edge (desktop)** | Timers fire at most once a second as soon as the tab is hidden. Once the page has been hidden *and* silent for a while, timers in a chain of 5 or more (every `setInterval` tick counts) are woken **once a minute** ("intensive wake-up throttling"). The documented wait is 5 minutes [1]; Chrome 109 shipped a shorter 10-second wait for pages that were fully loaded when hidden [2]. Exempt: pages playing audio, or using WebRTC. | After 10 s to 5 min hidden, **one poll a minute**. A pick can be up to ~60 s old when MDS notices it. |
| **Firefox (desktop)** | After 30 s in the background, timers run on a budget (it refills at 10 ms per second); nested timers in background tabs are held to at least 1 s apart [4][5]. | A 3 s poll with a short callback stays roughly on time; parsing a large picks list could eat the budget and slow it. No once-a-minute stage like Chrome's. |
| **Safari (macOS)** | Hidden pages have their timers aligned to 1-second boundaries, and pages with no visible change get a further, undocumented throttle [6]. No published numbers for 2025–26. | Probably on time to within seconds; **needs a real test** (open MDS live, hide the tab, watch the network panel). |
| **Minimized window** | Same as a hidden tab in all three. A window that's merely covered by another window is *not* hidden (still visible to the page). | |
| **Phones** | Android Chrome freezes background tabs after about 5 minutes; iOS pauses a backgrounded Safari tab or Home Screen app almost at once. | Effectively **no polling** in the background on phones. |

**Would an on-the-clock alert arrive late?** In Chrome, after the tab has been hidden a while, yes: by up to about a
minute. A Sleeper pick clock is anything from 30 seconds to hours. For the owner's case (MDS on a computer, clock of a
minute or more, Sleeper on the phone), a **"2 picks away" warning** arrives a full pick or more ahead of time even at
one poll a minute; the "on the clock" alert alone could arrive with half the clock gone on a fast draft.

Ways N4 could reduce the lag without touching the 3 s timing for the visible tab (the card's "don't change live-sync
timing" stays true):

- Warn early (1–3 picks ahead, the owner picks N).
- Run the poll's *timer* in a dedicated Web Worker that posts a message to the page on each tick. Chrome's intensive
  throttling is described for the page's DOM timers; whether worker timers escape it isn't stated in what I found, so
  **N4 tests this** in Chrome before relying on it.
- Use the draft's own data: Sleeper's draft object has the pick timer (`settings.pick_timer`) and the last pick's time,
  so the alert text can say how much clock is left ("on the clock, about 40 s left") rather than pretend it's fresh.
- Flash the tab title (works without permission) so a glance at the tab bar shows it.

### iPhone and iPad

- **A Safari tab on iPhone or iPad has no notifications at all.** `Notification` is undefined there.
- **A Home Screen web app (iOS/iPadOS 16.4 and later) can ask for permission and receive web push** [7][8][9]. The
  site's `manifest.json` already has `"display": "standalone"`, which installing needs. Permission must be asked from
  a tap [8].
- **A local notification from an open Home Screen app** (`showNotification` from the page, no push): I found no
  source that settles whether iOS shows it; it needs a device test. It matters little, because iOS pauses an app's
  JavaScript almost as soon as it goes to the background, so nothing would be running to decide to alert.
- **So on iPhone and iPad only web push can alert you while you're elsewhere**, and only after "Add to Home Screen".

### Fallbacks when permission is denied or unavailable

In order of usefulness for these alerts:

1. **A toast** (`js/shared/ui/toast.js`), for when the tab is visible anyway.
2. **Title flash**: `document.title` alternating between "(1) On the clock" and the normal title while the tab is
   hidden; stop on `visibilitychange`. Needs no permission; works in every browser's tab bar.
3. **A short sound** through Web Audio. Browsers block audio until the page has had a tap; turning the alert on in
   Settings counts, and live sync is started by a tap too. Off by default, a separate toggle. (Playing audio also
   exempts the tab from Chrome's intensive throttling [1], but a page that plays silence to stay awake is a hack and
   not recommended.)
4. **App icon badge** (`navigator.setAppBadge`) for an installed app; optional.

If permission is denied, the Settings toggle explains how to allow it in the browser and keeps the fallbacks working.

## 2. While the site is closed (web push)

### What it takes

Web push means the browser hands the site a **push subscription** (an endpoint URL on Google's, Mozilla's or Apple's
push service, plus two keys). A server later sends an encrypted message to that endpoint, signed with the site's
**VAPID** key pair; the browser wakes `sw.js`, whose `push` listener calls `showNotification`. The site must decide
*when* to send, so something has to watch Sleeper on a schedule.

On Cloudflare:

| Piece | What | Notes |
|---|---|---|
| Subscribe / unsubscribe endpoints | Pages Functions, e.g. `functions/api/push/subscribe.js`, beside the existing `functions/api/ffc/[format].js` | Pages Functions handle requests but **have no cron**. They can write to the same KV or D1 binding the Worker reads. |
| The scheduler | A separate **Worker** with a **Cron Trigger** | Its own `wrangler.toml` (e.g. `workers/notify/`), deployed apart from Pages. |
| Storage | **D1** (SQL) or **KV** | Subscriptions, Sleeper user and league IDs, alert toggles, "already sent" markers. D1 suits "which drafts are live now"; KV is simpler but has a low free write limit. |
| Push sending | Web Push encryption with Web Crypto | Node's `web-push` package doesn't run on Workers; Web-Crypto ports do (`@block65/webcrypto-web-push`, `web-push-neo`, `@pushforge/builder`) [12]. The site has no build step, so the Worker needs its own small bundle or a copied single file. |
| Secrets | The VAPID private key | A Worker secret (`wrangler secret put`), never in the repo. The public key goes in the page. |
| `sw.js` | `push` and `notificationclick` listeners | A middle-number `CACHE_NAME` bump. |

### Free-tier limits (Workers Free plan, as quoted from Cloudflare's docs)

| Limit | Free | Paid ($5/month) | Source |
|---|---|---|---|
| Requests | 100,000 a day | 10 million a month included | [10] |
| CPU time per invocation (incl. each cron run) | **10 ms** | 30 s (cron every < 1 h), up to 15 min (≥ 1 h) | [10][11] |
| Memory | 128 MB | 128 MB | [10] |
| Outgoing requests per invocation | 50 | 10,000 (now higher) | [10] |
| Cron Triggers | 5 per account | 250 | [11] |
| Cron frequency | Once a minute at most | Same | [11] (third-party guides; Cloudflare's page wasn't reachable) |
| D1 | 5 M rows read, 100,000 rows written a day, 5 GB | more | [13] |
| KV | about 100,000 reads and 1,000 writes a day (the FFC function's own comment cites "1,000/day") | more | `functions/api/ffc/[format].js`; not re-verified this session |

Network waits don't count as CPU time; JSON parsing and the push encryption do.

### Compared with the clocks that matter

- **Draft pick clock (30 s to hours).** A once-a-minute cron means an on-the-clock push arrives 0–60 s after the
  pick, plus push delivery (usually seconds). Fine for clocks of a few minutes or more; poor for a 30–60 s clock unless
  it warns a pick or two early. Each live draft costs 1 small request a minute (the draft object; its picks only when
  the pick count changed), well inside the free limits for one person. Sub-minute checks would need a Durable Object
  alarm instead of cron, which is more to build and keep running.
- **Kickoff windows (Thursday, Sunday 1:00/4:05/4:25/8:20 ET, Monday).** A check 90 and 30 minutes before each
  window is a handful of runs a week; minutes of lag don't matter. The problem is the data (below), not the timing.
- **Sleeper's own limit:** stay under 1,000 calls a minute per IP [14]. Not close.

## 3. What a server can and can't compute

A server only sees what Sleeper (and ESPN) publish. Your rankings, ranking sets and Lineup Strategist's recommended
lineup live only in your browser (localStorage and IndexedDB).

| Check | Data a server would use | Closed? |
|---|---|---|
| You're on the clock / N picks away | `GET /draft/{id}` (status, `draft_order`, type, rounds, `settings.pick_timer`), `GET /draft/{id}/picks` | **Yes** |
| An empty slot, a bye, no game this week | `/league/{id}/matchups/{week}` (your Sleeper starters), `/state/nfl`, each player's team (from the player file), ESPN's scoreboard for byes and kickoffs (what `refreshGameTimes` in `js/mls/state.js` uses) | **Yes**, with a player-to-team map kept on the server |
| A starter in Sleeper's IR slot or on NFL IR | rosters' `reserve`, player file's `injury_status` | **Yes**, as fresh as the player file |
| **Out / Doubtful** | `injury_status` lives only in `GET /players/nfl`: **about 15 MB** (14.6 MB in Oct 2026, `js/shared/api/sleeper.js`), and Sleeper asks for it at most once a day | **Weak.** Free Workers can't parse 15 MB in 10 ms CPU; the paid plan can, but once a day misses Friday designations until Saturday and misses Sunday inactives entirely. Another injury source (for example an ESPN team injuries endpoint) would need its own research. |
| Your *recommended* lineup differs from Sleeper's | rankings + optimizer | **No**, unless rankings and the optimizer moved to a server |
| Rankings changed your best lineup | rankings | **No** |

So the closed-site starter alert can only judge **the lineup you set in Sleeper** (what scores), never Lineup
Strategist's recommendation, and its injury half is the hard part.

## 4. Is "rankings updated" worth an alert?

Not as stated. Rankings change only when you upload a file or tap the ROS fetch button (`autoFetchRosRankings` in
`js/mls/rankings/rosFetch.js` is button-only), so you're already in the app, and Replace Set already shows what
changed (S3). Nothing changes rankings in the background, and no source the site uses would let it.

What could make it useful, and what already exists:

- **"Your Weekly rankings are old on game day."** Already shown in the app: league cards mark Weekly rankings older
  than 6 days in amber (`leagueStatus` in `js/mls/render/leagueCards.js`, `getFreshness` in `js/shared/freshness.js`),
  and the rankings header says "likely stale, re-upload for this week". As a *notification* it can only run while the
  site is open (the timestamps are local), at which point the amber mark is already on screen.
- Cheapest useful form: **one line inside N2's starter alert** ("Weekly rankings for 3 leagues are 8 days old"),
  using the same `getFreshness(…, 6)` rule. No new toggle, no new card.

**Recommendation: drop N3 as a card**; N2 adds that line (or leaves it out if the owner prefers).

## 5. Privacy and upkeep

- **Today:** everything stays on the device. The only server code is the FFC proxy, which stores public ADP lists.
- **Open-only alerts:** no change. Nothing leaves the browser; the permission is the browser's.
- **Web push** would store, on Cloudflare: each browser's push endpoint and keys, the Sleeper user ID or username,
  league and draft IDs, which alerts are on, and "already sent" markers. That needs a privacy note in the Guide, a way
  to delete it (unsubscribe removes the row; Factory Reset should call it), and handling of expired subscriptions
  (push services answer 404/410; delete the row).
- **Upkeep with push:** a second deployable (the Worker), its secrets (VAPID private key; rotating it invalidates every
  subscription), a cron that runs all year, Sleeper or ESPN changing their JSON, and debugging a scheduler you can't
  watch. Tests would need a stubbed push service and a fake clock for the Worker. The repo has no build step; the
  Worker would be the first thing that needs `wrangler` to deploy.

## 6. Permission UX (either option)

- Ask for permission only from a tap on a toggle in Settings (Lineup Strategist: Advanced Settings; Draft
  Strategist: Settings). Never on load.
- One toggle per alert, off by default. Turning the first one on asks for permission; if denied, the toggle says how to
  allow notifications in the browser and offers the fallbacks.
- Storage: one key per toggle, spelled only in `js/shared/storage/keys.js` with the app's prefix (for example
  `mls_notify_starters`, `mds_notify_on_clock`, `mds_notify_picks_ahead`), so Backup/Restore and Factory Reset cover
  them. "Already alerted for this player this week" can live in memory (a reload re-alerting once is acceptable), or in
  one `mls_` key if the owner wants it to survive reloads.
- Help text says plainly where it works: "Works while this page is open on a computer. Phones pause pages in the
  background; Sleeper's app covers your phone."
- Icons in the toggles and any badge: inline SVG (a Feather-style bell), per the site's rule; a legend line if a new
  badge appears.

## Recommendation

**Alerts only while the site is open**, for both apps, built as N2 (shared module + starter alert) and N4
(on the clock); **drop N3** and put a stale-rankings line in N2's alert.

Why:

1. **On the clock is a computer case by definition.** The owner's scenario is MDS open on a computer while Sleeper is
   on the phone, and MDS is already polling every 3 s. An open-site alert needs no server; Chrome's once-a-minute
   throttle in hidden tabs is the only catch, and warning 1–3 picks ahead (plus the title flash) covers it. Web push
   would be about as late (cron is once a minute) and adds a server.
2. **The closed-site starter alert can't see what matters most.** Without the 15 MB player file it has no injury
   status; with it (paid plan) the status is up to a day old and misses Sunday inactives. It also can only judge the
   Sleeper lineup, not Lineup Strategist's. Sleeper's own app already sends player news to phones.
3. **Rankings alerts can't run closed at all**, and open they duplicate the amber mark already on screen.
4. **Cost and privacy.** Push adds a Worker, storage, secrets, a cron that runs all year, a privacy note and about
   three extra cards, and moves the site from "nothing leaves your device" to storing Sleeper IDs on a server.

What open-only gives up: **no alerts on iPhone or iPad, and none on Android once the tab is in the background**. If
that turns out to matter, the cheapest push to add later is **on the clock only** (the draft endpoints are small, the
free plan likely suffices); see option C below.

### The options for the owner

| Option | What you get | Cards | Server |
|---|---|---|---|
| **A. Only while open (recommended)** | On the clock and starter alerts on a computer with the page open (hidden tab is fine); toast/title flash otherwise. N3 dropped. | N2, N4 | None |
| **B. Also while closed (web push for both)** | Alerts on phones too, including iPhone after Add to Home Screen. Starter alert judges your Sleeper lineup; injury status weak or day-old unless a better source is found. | ~5–6: push setup (Worker, D1, VAPID, subscribe Function), sw.js + Settings, draft poller, starter poller, injury source research; plus N2/N4's open-site parts | Worker + D1, likely $5/month for the injury file |
| **C. Mix by trigger** | A, plus web push for **on the clock only** (Sleeper draft endpoints, once a minute). Starter alert stays open-only. | N2, N4, then ~3 push cards later (setup, sw.js + Settings, draft poller) | Worker + D1 on the free plan (to verify) |

### Proposed card split for option A

- **N2 — Shared notification module and the Lineup Strategist starter alert** (~15k tok). `js/shared/ui/notify.js`
  (permission from a tap, `registration.showNotification`, toast and title-flash fallbacks, a fake-able clock);
  `notificationclick` in `sw.js` (middle-number bump); Lineup Strategist Settings toggle; a timer that, while
  `/lineup/` is open, checks each league's starters ~90 min (owner picks) before each kickoff window with
  `getLineupIssues` / `lineupIssueItems` and `State.gameTimesByTeam`, alerts once per player per week, and adds the
  stale-Weekly-rankings line. Asks: Sleeper lineup or recommended lineup; minutes before kickoff; Questionable or not;
  whether to refresh injury statuses (the 15 MB file) once before each window or use the last sync.
- **N3 — dropped** (folded into N2 as one line).
- **N4 — Draft Strategist on the clock** (~12k tok). As written, plus: test whether a Worker-driven tick avoids Chrome's
  once-a-minute throttle (keep the 3 s timing either way), show clock time left from `settings.pick_timer` and the
  last pick's time, and say in the help text that a hidden tab may notice a pick up to a minute late.

## Sources

1. Chrome Developers, "Heavy throttling of chained JS timers beginning in Chrome 88":
   https://developer.chrome.com/blog/timer-throttling-in-chrome-88
2. blink-dev, "Intent to Ship: Quick intensive timer throttling of loaded background pages" (10 s instead of 5 min;
   desktop, milestone 109):
   https://groups.google.com/a/chromium.org/g/blink-dev/c/5SZB2CFFGqE/m/-mtBskjyAgAJ
3. "Failed to construct 'Notification': Illegal constructor" on Android Chrome and Samsung Internet (error text names
   `ServiceWorkerRegistration.showNotification()`):
   https://meta.discourse.org/t/failed-to-construct-notification-illegal-constructor/106450
4. MDN, Page Visibility API, "Policies in place to aid background page performance" (budget-based throttling):
   https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
5. Mozilla bug 1377766 (background timeout budget throttling, Firefox 58, after 30 s in the background):
   https://bugzilla.mozilla.org/show_bug.cgi?id=1377766
6. WebKit bugs 98474 (align hidden pages' timers to 1 s) and 162865 (background tab throttling):
   https://bugs.webkit.org/show_bug.cgi?id=98474, https://bugs.webkit.org/show_bug.cgi?id=162865
7. WebKit, "WebKit Features in Safari 16.4" (Web Push for Home Screen web apps): https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
8. Apple WWDC22, "Meet Web Push for Safari" (permission must follow a user gesture):
   https://developer.apple.com/videos/play/wwdc2022/10098/
9. WebKit, "Web Push for Web Apps on iOS and iPadOS": https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
10. Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/ and pricing:
    https://developers.cloudflare.com/workers/platform/pricing/
11. Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/ (one-minute
    granularity also from https://cronuru.com/guides/cloudflare-workers-cron-triggers)
12. Web Push on Workers with Web Crypto: https://github.com/block65/webcrypto-web-push,
    https://github.com/ryoppippi/web-push-neo
13. Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/ (daily free numbers as quoted by
    https://freetier.co/articles/cloudflare-d1-free-tier-limits-pricing-and-alternatives)
14. Sleeper API docs (stay under 1,000 calls a minute; `GET /draft/{id}/picks`): https://docs.sleeper.com/

Repo facts: `js/mds/sleeperSync.js` (3 s `setInterval`, `draft_order`), `js/shared/api/sleeper.js` (15 MB player
file, once-a-day cache), `js/mls/state.js` (`refreshGameTimes`, ESPN scoreboard), `js/mls/lineup/gameInfo.js` and
`issues.js` (`getLineupIssues`, `lineupIssueItems`), `js/mls/render/leagueCards.js` (Weekly rankings stale after 6
days), `js/mls/rankings/rosFetch.js` (button-only ROS fetch), `manifest.json` (`display: standalone`), `sw.js` (no
`push` or `notificationclick` listeners today), `functions/api/ffc/[format].js` (the one Pages Function, KV binding).
