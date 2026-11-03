# Visitor counts: the comparison, the choice, and how to read the numbers (improvements A1)

Written 2026-11-03 for runbook card A1. The owner's question: Cloudflare's dashboard showed 349 "unique visitors" in a
day, but on the Free plan that number comes from the edge (every request, crawlers and scrapers included). How many
real people use `/`, `/lineup/` and `/t-score/`, how often do they come back, and on what (phone or computer)?

**Choice (owner, 2026-11-03): Umami Cloud, free Hobby plan.** Loaded by `js/shared/analytics.js` on the three pages,
on mydraftstrategist.com only, with an opt-out (`?nocount=1`). No custom events yet (K1 decides them). The owner's
preference: pay nothing.

## The comparison (checked 2026-11-03)

Every price and limit below was read on the tool's own page that day, except where the row says otherwise. Script
sizes marked "measured" were downloaded and gzipped in the session.

| | Cloudflare Web Analytics | Plausible | Google Analytics 4 | **Umami Cloud** | GoatCounter |
|---|---|---|---|---|---|
| Cost | Free | $9/mo Starter (10k page views, 1 site); 30-day trial; no free plan | Free (360 is the paid enterprise tier) | **$0 Hobby**: 100K events/mo, 1 website, 6 months' data. Pro $20/mo | Free "for reasonable public usage… small-to-medium business… is fine" |
| Cookies; consent banner | None; no | None; no | `_ga` cookie (2 years) "to distinguish users"; **banner needed for EU/UK** | None; no | None; no |
| Bots | Only browsers that run the beacon count | Bots, referrer spam and data-centre traffic excluded | Known bots and spiders (Google + IAB list), always on | `isbot` user-agent check (source code) | User-agent check |
| People or visits | **Visits and page views only** ("a page view that originated from a different website or direct link") | Unique visitors **per day** (daily salt) | Unique users (cookie) | **Unique visitors per month** (monthly salt) | Visits per page (8-hour session) |
| Returning visitors | No | No (the daily salt rules it out) | Yes | Within a month: "User Retention" report, free | No |
| Custom events | No ("Not yet") | Yes | Yes | **Yes, free** (`data-umami-event`) | Basic |
| Ad blockers | Blocked by Adblock Plus, Brave, DuckDuckGo (Cloudflare's FAQ) | Commonly blocked | Most commonly blocked | Commonly blocked | Commonly blocked |
| Script (gzip) | 10.3 KB measured | 1.3 KB measured | ~135 KB more than Plausible (Plausible's claim; Google's host refused) | **3.9 KB measured** | 3.5 KB (its README) |
| Data lives | Cloudflare; 6 months, unsampled for 7 days then ~10% | EU | Google | US and EU | EU |

Sources (all read 2026-11-03):
[Plausible pricing](https://plausible.io/#pricing), [Plausible data policy](https://plausible.io/data-policy);
[Umami pricing](https://umami.is/pricing), Umami's session hash in
[`src/app/api/send/route.ts`](https://github.com/umami-software/umami/blob/master/src/app/api/send/route.ts) (`SALT_ROTATION`
defaults to `month`) and its tracker [`src/tracker/index.ts`](https://github.com/umami-software/umami/blob/master/src/tracker/index.ts);
Cloudflare Web Analytics [about](https://developers.cloudflare.com/web-analytics/about/),
[FAQ](https://developers.cloudflare.com/web-analytics/faq/),
[metrics](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/),
[Pages one-click setup](https://developers.cloudflare.com/pages/how-to/web-analytics/);
GA4 [cookie usage](https://support.google.com/analytics/answer/11397207),
[bot exclusion](https://support.google.com/analytics/answer/9888366),
[Marketing Platform](https://marketingplatform.google.com/about/analytics/);
GoatCounter [home page and pricing](https://www.goatcounter.com/),
[sessions](https://github.com/arp242/goatcounter/blob/master/tpl/help/sessions.md).

## Why Umami

- It's the only free, cookieless option that counts **people**, not just visits, and the only one besides GA4 with
  any notion of **coming back** (its User Retention report, within a month).
- No cookies and nothing kept in the browser, so no consent banner (GA4 would need one for EU and UK visitors).
- Small (3.9 KB gzipped), and custom events are free if K1 wants them.
- The free plan's limits fit: one "website" covers all three pages (one domain), and 100K events a month is far above
  this site's traffic, as long as tab switches don't count as page views (they don't; see below).

What it can't do: it isn't Cloudflare (one more account), and its idea of "the same person" lasts a month at most.

## How it's wired

- `js/shared/analytics.js`, the last `<script type="module">` on each page (after the app's own module, so it can't
  hold up the first paint or the app's start-up). It checks the hostname (`mydraftstrategist.com` or `www.`) and the
  opt-out, then adds `<script defer src="https://cloud.umami.is/script.js" data-website-id=…>`. Branch previews
  (`*.pages.dev`), localhost and the tests never load it; `data-domains` repeats the check inside Umami's own script.
- `data-exclude-hash`: tab switches only change the `#hash` (`history.pushState`), and Umami counts every pushState
  as a page view unless told not to. Without it every tab switch would be an "event" against the 100K limit.
  `data-exclude-search` keeps query strings (`?week=6`, `?nocount=1`) out of the recorded address.
- What Umami's script sends, checked in the session with the real script and the request captured (not sent): one
  POST to `https://gateway.umami.is/api/send` per page load with the website ID, screen size, language, page title,
  hostname, URL (no query string or hash) and referrer. Its server adds browser, OS, device type and location from
  the request, and makes the visitor's session code from IP + browser + a monthly salt (the IP isn't stored).
- The service worker (`sw.js`) doesn't touch any of it: its fetch handler returns early for cross-origin requests
  (`cloud.umami.is`, `gateway.umami.is`) and for anything that isn't a GET. Offline, the script simply fails to load:
  nothing is shown and nothing logged by the app (the browser notes the failed request itself, as it does for Ko-fi's
  image). The pages have no Content-Security-Policy, so nothing else needs allowing.
- Opt-out: `?nocount=1` on any page sets `shared_analytics_optout` = `'1'` (`KEYS.shared.analyticsOptOut`) and shows a
  toast; `?nocount=0` removes it and says so. The parameter is then taken out of the address bar. The key is
  site-wide (`shared_`, like the other keys both apps use), so it's in **neither app's Backup** (a restore doesn't
  bring it back or take it away) and **neither app's reset** (Factory Reset, Reset Everything) clears it. Clearing the
  browser's site data does. Umami's own `umami.disabled` key would do the same job, but every key has to be spelled in
  `keys.js` and the loader skipping the script entirely is simpler and sends nothing at all.
- **Do this once on every browser you use** (phone, computer, each browser): open
  `https://mydraftstrategist.com/?nocount=1`. Private windows forget it when closed.

Load cost (`npm run perf -- --server cf --runs 3`, this branch against `origin/main`, PageSpeed's mobile setup; the
measurements run on localhost, so they show the cost of the loader file itself, about 1 KB, not of Umami's script):
see the LOG entry for the numbers. Umami's own script loads after the page, with `defer`, from another host.

## Reading the dashboard

Umami's dashboard (cloud.umami.is, "Websites", then the site):

- **Visitors** is the number to use as **real people**. One browser on one device is one visitor for the calendar
  month. Over a week or a day it's still unique within that range. Caveats: the same person on a phone and a computer
  is two visitors; someone whose IP changes (home Wi-Fi to mobile data) can count twice; people whose ad blocker
  stops Umami's script aren't counted at all (no one publishes a reliable share; on a fantasy-football audience it
  could be sizeable). So it's a slight overcount of devices and an
  undercount of people with blockers; treat it as "about this many".
- **Visits** are sessions: one visitor opening the app on Sunday morning and again Sunday night is two visits.
  **Views** are page loads (`/`, `/lineup/`, `/t-score/`; tab switches inside a page don't count).
- **Pages**: the split between `/` (Draft Strategist), `/lineup/` (Lineup Strategist) and `/t-score/`.
- **Devices / Browsers / OS**: phone vs. computer. **Countries**: where they are.
- **Referrers**: where people came from (Reddit, a search engine, a Discord link…). "Direct" includes the installed
  app and bookmarks.
- **Coming back**: Reports, then **Retention**: of the visitors who first came in a given week or day, how many came
  back later. Limited to the current month by the monthly salt (a visitor in November and again in December looks like
  two new visitors).
- What it **can't** tell you: anything about a specific person, how many people use the installed app versus the
  browser (both look the same), or what they do inside a page (which tabs, which buttons). Button taps need custom
  events, which K1 decides.

### Next to Cloudflare's number

Cloudflare's dashboard (the zone's Analytics, Free plan) counts at the edge: every request to the site, by any client,
including search-engine crawlers, scrapers, uptime checkers, link previews from chat apps and the service worker's own
update checks. Its "unique visitors" are unique IP addresses that made a request, so it's always higher than Umami's
Visitors, often by a lot on a small site. Use it for bandwidth and "is the site up", not for people. The gap between
the two is roughly bots plus ad-blocked humans. Bot Fight Mode (on since 2026-11-02) challenges some bots but doesn't
change what Cloudflare counts.

## Left for later

- Custom events (a Ko-fi tap, Share, Export, Optimize All…): K1 decides which, then each is a `data-umami-event="…"`
  attribute on the button, no code. Free on the Hobby plan, but each counts against the 100K events a month.
- If the site ever outgrows 100K events a month, Umami's Pro is $20/month; or drop to Cloudflare Web Analytics (free,
  visits only).
