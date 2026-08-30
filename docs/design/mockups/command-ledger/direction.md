# Command Ledger

An institutional dashboard with editorial confidence. The reference feeling is the morning command ledger: a flat Symbol Blue masthead carries identity and context, and beneath it the unit's numbers are set like a broadsheet's market page, ruled sections, dot-leader rows, tabular numerals, verdicts written in sentences. A healthy unit reads as a quiet, nearly colorless page. Color appears only when it is a verdict.

Mockups in this folder:

- `home.html`: the platform home (My Progress, My Unit, Bulletin, What's New, Data)
- `unit-overview.html`: the commander ten-second view (Morning Line verdict, Needs Attention queue, collapsible section ledger)

All member and unit data in the mockups is invented.

---

## 1. Token sheet

### 1.1 Color

Two layers: brand primitives, then semantic roles. Components reference roles only; the primitives appear in exactly one file.

**Primitives (CAP brand):**

| Token | Hex | Notes |
|---|---|---|
| `blue` (Symbol Blue) | `#001871` | Primary identity |
| `gray` (Silver Gray) | `#9EA2A2` | Primary neutral |
| `red` (Scarlet) | `#BA0C2F` | Accent |
| `yellow` (Air Force Yellow) | `#FFCD00` | Accent |
| `black` / `white` | `#000000` / `#FFFFFF` | |
| `blue20` | `#CCD1E3` | 20% tint over white |
| `gray20` | `#ECECEC` | 20% tint over white |
| `red20` | `#F1CED5` | 20% tint over white |
| `yellow20` | `#FFF5CC` | 20% tint over white |
| `black20` | `#CCCCCC` | 20% tint over white |

**Semantic roles, and the only places each primitive may appear:**

| Role | Value | Allowed appearances |
|---|---|---|
| Chrome | `blue` | The masthead and drawer. Full-strength blue as a surface appears nowhere else. |
| Interactive | `blue` | Links, buttons, focus rings, active tab underline, selected states, score bars, sparklines. |
| Ink | `black` at 88% | Body text and figures. Headings at 100%. |
| Ink, secondary | `black` at 57% | Kickers, captions, state words, footnotes. Never below 55% for text (AA). |
| Hairline | `black` at 12% (`gray20` inside cards) | Card borders, row separators. |
| Section rule | `black`, 2px | The broadsheet rule that opens every section. |
| Leader | `gray`, 1px dotted | Dot leaders in ledger rows. Silver Gray is decorative only: leaders, the neutral as-of dot, disabled marks. Never body text (fails AA on white). |
| Paper | `#FFFDF5` | Page canvas: the warm white. Derived as `yellow20` at 20% opacity over white, so it stays inside the tint system. Fallback if the owner reads the tint rule strictly: plain white. |
| Card | `white` | All content surfaces. |
| Grouping panel | `blue20` | At most one per page, for the single most important group (the Morning Line verdict, the My Unit scoreboard). Never as decoration. |
| Action (verdict) | `red` on white text; `red20` row background | Only attached to a ranked, actionable finding, always with icon plus the word ACTION. Budget: 2 per viewport. |
| Watch (verdict) | `yellow` with black text; `yellow20` row background | Caution findings, always icon plus the word WATCH. Budget: 2 per viewport. |
| Plan (neutral finding) | `blue` chip | Findings that are scheduled work, not alarms. |
| Failure | `red` | The as-of chip turns scarlet only on confirmed ingest failure. |

Rules: category is never a status (no green seniors, no yellow cadets). Verdict colors never appear without an icon and a text label. If nothing is wrong, the page contains no red and no yellow at all.

### 1.2 Type

Two stacks, zero downloads:

- **Serif (display):** `ui-serif, "New York", Georgia, "Times New Roman", serif`. Page titles and section headings only. Words, never numbers. This is the editorial voice of the direction; if the owner's Brand Portal check rules out serif display, every heading falls back to the sans stack at the same sizes and the direction survives.
- **Sans (everything else):** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. All body text, labels, and every numeral in the product.
- **Numerals:** `font-variant-numeric: tabular-nums lining-nums` on any element containing a figure. Mandatory, no exceptions; it is what makes ledger columns scan.

Scale (px / weight / stack):

| Token | Spec | Use |
|---|---|---|
| Display | 30 / 600 / serif, line 1.15 | Page title |
| Section | 19 / 600 / serif | Section headings, incl. collapsed summaries |
| Lede | 16 to 16.5 / 400, bold spans / sans | Verdict sentences, capability sentences |
| Body | 14 / 400 / sans, line 1.55 | Default |
| Ledger value | 14 / 650 / sans, tabular | Right column of ledger rows |
| Score | 22 to 24 / 700 / sans, tabular | Scoreboard figures |
| Kicker | 11 / 700 / sans, uppercase, +0.14em | Section eyebrows, dateline, column heads |
| Caption | 12 / 400 to 600 / sans | Footnotes, sublabels, byline |
| Flag | 10 / 700 / sans, uppercase, +0.10em | ACTION / WATCH / PLAN chips |

### 1.3 Spacing, radius, rules

- 4px base grid. Common steps: 4, 8, 12, 16, 24, 32.
- Content measure: max-width 1120px, 24px gutters (16px under 900px).
- Radius: 3px flags, 4px inputs and inline finding rows, 6px cards and panels. Nothing rounder; the ledger is crisp.
- Ledger row: min-height 34px, hairline separators, dot leader between label and value.
- Section grammar: 2px black top rule, serif heading, then cards. Sections, not cards, are the page's rhythm.
- Shadows: none. Depth comes from rules and paper-on-card contrast.
- Motion: 150ms ease on disclosure carets and drawer; nothing else animates.
- Touch: every interactive target 44px minimum on small screens.

---

## 2. Shell spec

### 2.1 Top chrome

Flat Symbol Blue (`#001871`), no gradient, two decks inside one visual masthead:

- **Deck 1 (brand and context):** logo slot top-left, then the "Readiness Hub" wordmark, then (right-aligned) unit selector, Include Sub-Units, as-of chip, user menu.
- **Deck 2 (tab rail):** the six tabs (plus Admin for admins), separated from deck 1 by a white 20% hairline. Active tab: white text, 2px white underline. Routes and URL params unchanged from v2.

**Logo slot.** A configurable, volume-mounted asset (deployments drop in the official mark obtained from the Brand Portal). The mockups ship a neutral delta roundel labeled "logo slot"; the app never fabricates or bundles the trademarked mark, and there is no runtime upload.

### 2.2 Hamburger

Desktop (900px and up) keeps all tabs visible: 148 existing users have the six-tab model in muscle memory, and the synthesis flags hiding them as an adoption risk. Below 900px the tab rail and context controls collapse into a hamburger at the right end of deck 1, opening a full-width drawer on the same blue:

1. The six tabs (44px rows), current page marked.
2. **Scope:** the unit selector (native select) with Include Sub-Units beneath it.
3. **Data:** the as-of line ("Extract of 28 Aug 2026, 02:14 · ingest OK").
4. **User:** name, profile, settings, sign out.

This softens the owner's literal "collapse tabs into a hamburger" request on desktop only; flagged for sign-off.

### 2.3 Unit selector

Charter number first, always: `GLR-MI-104 · Riverside Composite Sqdn`. Charter numbers render in tabular numerals so the column of codes aligns. Grouped by command structure: Wing, then each Group (with its HQ first), then units. Desktop is a popover panel with type-ahead search over name and charter, the command-structure groups, and the **Include Sub-Units switch in the panel footer** (folded into the picker per the synthesis; the mockups show it as an adjacent checkbox because they use a native select). Mobile uses the native select inside the drawer. Long names truncate; the charter number never does.

### 2.4 Data-age treatment

A neutral chip in the chrome: gray dot plus "As of 28 Aug". It is a fact, not an alarm. Its popover (mockups: title text) shows extract date, last ingest result and duration, next expected run, and the deployment admin contact. Escalation: past the admin-configured threshold the dot goes yellow with "check data"; only a confirmed ingest failure turns the chip scarlet. Every export prints the same as-of date. The dateline strip under the chrome repeats the as-of on every page, so screenshots carry their provenance.

### 2.5 User menu

Right end of deck 1: rank-abbreviated name ("Capt J. Morales"). Menu: My Progress (jump to the Home card), Profile, Settings, Admin (admins only), Sign out. Settings live here per owner preference.

---

## 3. Page grammar, and how it scales without new mockups

Every page is composed from six pieces, all present in the two mockups:

1. **Dateline:** the uppercase strip with date, scope, and as-of.
2. **Masthead:** kicker (charter, type, group), serif title, one standfirst line of facts.
3. **Morning Line:** one `blue20` verdict panel: a sentence, then a tabular scoreboard.
4. **Needs Attention queue:** ranked findings, index number, ACTION/WATCH/PLAN flag, one line, one action link. Empty state: "Nothing needs your attention. The unit is healthy as of 28 Aug." in secondary ink, no color.
5. **Section ledger:** `details` sections opened by a 2px rule, with a status-bearing collapsed summary limited to one figure, one state word, one alert count. Per-user open/closed persistence; bodies lazy-mounted; ordered by the viewer's position lens.
6. **Ledger rows:** label, dot leader, tabular value; methodology behind a quiet "How this is computed" disclosure.

Applied to the remaining pages:

- **Seniors:** masthead plus a one-row filter rail (quiet selects, applied-count badge on mobile). The roster is a ledger table: fixed-height rows, name and grade in ink, plain-text E&T ("Level 3, 2 tasks to L4"), primary track plus "+N", promotion column as a date in tabular numerals, ES as counts. No dot strips, no chip walls, no scattered triangles; a row's only possible color is one verdict flag. "Teach this next" and the awaiting-approval counter are cards in a Professional Development section above the roster. Board packet prints from the profile modal in the same ledger style with the as-of date in its footer.
- **Cadets:** identical roster grammar; the named blocking requirement is the row's one chip (WATCH-styled only when actionable, e.g. HFZ expiring before TIG). Blocker rollup tiles are a Morning Line scoreboard ("6 blocked by HFZ · 4 by TIG · 2 awaiting board · 4 ready"). Test Night is a print-first ledger: name, CAPID, open requirement, nothing else.
- **Reports:** a searchable ledger list, one report per row: monochrome blue icon, name, description in secondary ink, CSV/PDF at the row end, whole row tappable. One filter row. Every export footer prints the as-of extract date.
- **Org Chart:** the desktop tree keeps its canvas; nodes restyle to card tokens (white, hairline, ink; vacancy shown as a WATCH flag, not a color wash) and toolbar buttons become quiet secondary controls. Below 900px the tree is replaced by the section ledger itself: one collapsible section per directorate, positions as ledger rows, vacancies flagged.
- **Admin:** already the most restrained page in v1; it adopts the token sheet as-is. Runs table becomes ledger cards on phones. Announcements authoring feeds the Home Bulletin.
- **Command deck (Mode C, wing and group scope):** the same scoreboard and queue grammar rolled up one echelon: an exceptions-first strip, then a ledger table of sub-units with month-over-month deltas and the blue sparkline primitive. Counts only above the viewer's own unit; names never leave the unit scope.

## 4. Flagged decisions

1. **Serif display headings.** The signature editorial move, sourced from the system stack (New York / Georgia). Needs the owner's Brand Portal check; sans fallback is defined and costless.
2. **Warm paper `#FFFDF5`.** A 20%-of-`yellow20` derivation. If the owner wants literal 20% tints only, the canvas falls back to white and the direction keeps its structure.
3. **Desktop tabs stay visible; hamburger is mobile-only.** Softens a literal owner request in favor of adoption continuity, per the council synthesis.
4. **Accent budget as a hard rule.** At most two scarlet and two yellow verdicts per viewport; the Needs Attention ranking enforces it by demoting overflow findings to the queue's tail without color.
