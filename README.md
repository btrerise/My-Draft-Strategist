# 🏈 My Draft Strategist

**My Draft Strategist** is a mobile-first, high-performance web application designed for fantasy football enthusiasts. It functions as a complete draft companion, offering custom ranking management, real-time market value (ADP) syncing, live platform integrations, advanced roster tracking, and full draft-board grid visualization.

---
# My Draft Strategist

The official repository for [My Draft Strategist](https://mydraftstrategist.com), featuring custom tools and calculators designed for fantasy football draft preparation and lineup strategy.

## Project Structure

* **`/css`** - Global stylesheets (`styles.css`) applied across the application.
* **`/images`** - Brand assets, logos, and graphics (`logo.png`).
* **`/js`** - Shared JavaScript utility and helper scripts.
* **`/lineup`** - The *Lineup Strategist* tool (contains its page-specific HTML and script files).
* **`/t-score`** - The *T-Score* tool (contains its page-specific HTML and `tscore_data.js` file).
* **Root Files:**
  * `index.html` - The main landing page of the website.
  * `sw.js` - Progressive Web App service worker for caching.
  * `manifest.json` - PWA web app manifest configuration.
  * `5775.png` - Site favicon.

## Hosting
Hosted and deployed statically via Cloudflare Pages.
---

## 🌟 Comprehensive Feature List

### 1. Setup & Data Ingestion

* **Custom Spreadsheet Upload:** Supports parsing `.csv`, `.xlsx`, and `.xls` files with flexible header mapping (Player Name, Position, Tier, Team, Bye Week, ADP/Value).
* **Raw CSV Paste Area:** Allows users to paste raw spreadsheet rows directly into a text box for instant parsing.
* **LeagueLogs "Quick-Start":** A one-click bootstrap option that populates the entire player pool using live market value and ADP rankings from the LeagueLogs API.
* **Live Market Value (ADP) Syncing:** Pulls platform-wide ADP trends and market data tailored to specific league formats (Redraft 1QB/Superflex, Dynasty 1QB/Superflex, PPR/Half-PPR) and automatically flags rookies with a purple `[R]` badge.
* **Manual Market Paste Fallback:** Allows users to paste custom ADP rows if API access is restricted.
* **Setup Screen Shortcuts & Tooltips:**
* An interactive banner linking directly to the Info & Guide tab.
* Custom CSS hover/tap tooltips (`ℹ️`) next to major sections explaining their functionality.



### 2. Sleeper Platform Integration

* **API Authentication:** Links directly to Sleeper username and Draft ID endpoints.
* **Live Auto-Sync Mode:** Polls the Sleeper draft picks API every 3 seconds to auto-cross players off the tracker as they are drafted league-wide.
* **Interactive Live Indicator:** A clickable `🔴 LIVE` pill in the header that displays active synchronization status and allows users to stop live syncing with a single tap.
* **Automatic League Configuration:** Pulls official league settings (total teams and total rounds) directly from Sleeper's draft metadata.

### 3. The Tracker (Primary Drafting View)

* **Clean Row-Based Header Control:** Stacked layout featuring a live pick counter (`Pick: X.XX`) on the left, a narrower reset picks button on the right, and a 100% width search bar below.
* **Dynamic Position Grid & Tiers:**
* 5-button filter grid (ALL, QB, RB, WR, TE) for instant positional filtering.
* Live tier tracking display (e.g., `QB T2 (3)` indicates the highest available tier is Tier 2 with 3 players remaining).


* **Smart Player Cards:** Displays player rank, name, positional group, display rank, rookie status, team, bye week, and market value.
* **Dynamic Value / Reach Badges:** Automatically calculates whether a player is a value pick (`+12 Value`) or a reach (`-8 Reach`) based on the current overall pick number versus their custom rank.
* **Call-Out Color Coding:** Custom highlight styles and background tints for user-defined **Targets (🟢)**, **Avoids (🔴)**, and **Dart Throws (🔵)**.
* **Stack Highlighting:** Automatically tags available WRs or TEs with a `🔥 Stack` badge if their corresponding quarterback is already on your team roster.
* **Inline Player Editor:** Tapping the pencil icon (`✏️`) on any player card opens an inline editor to adjust rank, tier, team, or bye week on the fly without leaving the tracker.
* **Pick Actions:** Quick action buttons (`Taken` vs. `My Pick`) to update draft state manually or offline.

### 4. The Team Tab (Roster & Lineup Management)

* **Configurable Roster Limits:** Fully customizable starting requirements (QB, RB, WR, TE, FLEX, SFLEX, Bench, Total) with auto-calculating total rounds.
* **Visual Lineup Slotting:** Automatically slots your drafted players into optimal starting and bench positions.
* **Bye Week Collision Warnings:** Built-in 2026 NFL bye week database that triggers an alert banner if 3 or more starting players share the same bye week.
* **Draft History Feed:** Displays a reverse-chronological list of all other drafted players with a quick `Undo` action.

### 5. The Draft Board Tab (Grid View)

* **Ultra-Wide Full-Bleed Grid:** Scales dynamically across columns based on league size (e.g., 10-team, 12-team, 14-team) and round depth.
* **Positional Color Coordination:** Cells are color-coded by position (QB, RB, WR, TE) and display player first/last name abbreviations and pick numbers.
* **My Team Highlighting:** Automatically outlines and highlights your team's drafted columns with a bold white border.
* **Hybrid Mapping Support:** Functions seamlessly with both live Sleeper API sync and sequential manual tracker picks for offline users.

### 6. UI/UX & Mobile Optimization

* **Clickable Header Navigation:** Tapping the app logo or title in the header instantly routes the user back to the Setup screen.
* **Hamburger Menu:** Slide-in navigation drawer with a dark backdrop overlay for switching tabs and accessing the Ko-fi support link.
* **Hybrid Bottom Navigation Bar:** Persistent bottom bar for quick thumb access between the Tracker, Team, and Draft Board tabs.
* **Swipe Gesture Navigation:** Allows swiping left/right between tabs on mobile, complete with a safety guard clause (`if (currentId === 'board') return;`) that suppresses tab-swapping while scrolling horizontally across the Draft Board grid.
* **Responsive Desktop/Mobile Layouts:** Designed with CSS grid and flexbox to utilize full desktop screen space while remaining compact on mobile devices.

### 7. Robust Data Handling & Edge Cases

* **Bulletproof Name Matching & Aliases:** Features a two-way normalization and alias mapping engine to successfully match mismatched names across platforms (e.g., *Kenny Gainwell* $\leftrightarrow$ *Kenneth Gainwell*, *Gabe Davis* $\leftrightarrow$ *Gabriel Davis*, *Tank Dell* $\leftrightarrow$ *Nathaniel Dell*, *Nick Singleton* $\leftrightarrow$ *Nicholas Singleton*).
* **Duplicate Name Collision Resolution:** Prioritizes active NFL players and exact team matches over retired free agents when scanning shared database IDs (e.g., resolving duplicate names like *Kyle Williams*).
* **Local Storage Persistence:** Automatically saves all draft progress, roster settings, call-outs, and custom rankings to the browser's `localStorage` so data is never lost on refresh.
* **Reset Controls:** Offers safe granular control to reset draft picks only or execute a full hard reset wipe.
