# Quiet Authority

Maximum restraint. The page is a beautifully typeset briefing document: paper-white canvas, near-black ink, Silver Gray hairlines and captions, and exactly one chromatic voice, Symbol Blue. Scarlet and yellow exist only as verdicts. A healthy unit produces a page with no color on it at all, and that absence is the design working, not the design missing.

The test for every element: if it is on the page, it is worth reading. No decorative tinting, no boxed cards where a hairline will do, no bar where a numeral will do, no caption that repeats what the number already says.

Mockups in this folder:

- `home.html`: the platform Home (My Progress, My Unit, announcements and release notes, data provenance, version bottom-left, GitHub bottom-right).
- `unit-overview.html`: the commander ten-second view (masthead verdict, figures strip, Needs Attention queue, collapsible duty sections with status-bearing headers).

Both are self-contained, inline CSS, system fonts, responsive at 390px and 1440px. All member and unit data is invented.

---

## 1. Token sheet

### 1.1 Color

Two layers: brand primitives (never used directly in components) and semantic roles (the only names component code may reference). CI grep-bans raw Tailwind hues; these tokens are the entire vocabulary.

| Primitive | Hex | 20% tint | Tint hex |
|---|---|---|---|
| Symbol Blue | `#001871` | blue-20 | `#CCD1E3` |
| Silver Gray | `#9EA2A2` | silver-20 | `#ECECEC` |
| Scarlet | `#BA0C2F` | scarlet-20 | `#F1CED5` |
| Air Force Yellow | `#FFCD00` | yellow-20 | `#FFF5CC` |
| Ink | `#000000` | | |
| Paper | `#FFFFFF` | | |

Semantic roles, and the only places each primitive may appear:

| Role | Value | May appear as |
|---|---|---|
| `ink` | black | All body text, all numerals, all headings, table content, icons at rest |
| `paper` | white | Page background, panel background, text on blue fills |
| `identity` | Symbol Blue | Logo mark, product name, active tab underline and label |
| `interactive` | Symbol Blue | Links, buttons, summary toggles, focus-visible companion (with blue-20 ring), checkbox accent |
| `selected` | Symbol Blue on blue-20 | Selected unit row, active filter, user avatar chip, done-state checkmarks |
| `hairline` | silver-20 `#ECECEC` | Rules, dividers, table row borders, control borders at rest |
| `caption` | Silver Gray | Uppercase kickers and figure labels, footnotes, chevrons, the neutral as-of dot, "No alerts" at-rest text. Never for load-bearing prose. See 1.4. |
| `alert` | Scarlet | An 8px dot or icon plus a text label, attached to a confirmed, actionable finding only: expired quals, failed ingest, lapsed compliance. Never a background, never a bar, never a tile |
| `warning` | Air Force Yellow | Same shape as alert, for approaching problems: expiring within threshold, single points of failure, HFZ-before-TIG collisions |
| `alert-surface` | scarlet-20 | Reserved. Background wash for a full-width ingest-failure banner, the only scarlet surface in the app |
| `warning-surface` | yellow-20 | Reserved. Background wash for a system-level notice (e.g. dev auth mode) |

Accent budget, enforced as a review rule: at rest, a viewport may carry at most one scarlet mark and two yellow marks outside the Needs Attention queue. More findings than that collapse into counts inside the queue. Color never appears without an adjacent word saying what it means; the dot is redundant with its label by design (color-blind safe, screenshot safe).

What is deliberately absent: progress bars, score meters, tinted stat tiles, category colors (seniors green, cadets yellow), colored chart palettes, colored chips. The number, set large and quiet, is the display.

### 1.2 Typography

Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. System fonts are the brand-safe, zero-runtime-cost choice for a self-hosted app; if the owner's Brand Portal check surfaces a licensed-compatible open face (Public Sans is the closest in spirit to this direction), it slots in ahead of the stack with no other changes. `font-variant-numeric: tabular-nums` is mandatory on every figure, date, charter number, count, and table column. No exceptions; ragged numerals are the fastest way to make a briefing look amateur.

| Token | Size/weight | Use |
|---|---|---|
| `display` | 54px / 300, tracking -0.02em | Section lead score, one per expanded section at most |
| `figure` | 40px / 300, tracking -0.02em | Masthead figures strip |
| `figure-sm` | 26px / 400 | Component numerals inside sections |
| `title` | 32px / 600, tracking -0.015em | Page h1, one per page |
| `heading` | 22px / 600 | Named object (unit name on Home) |
| `lead` | 19px / 400 (500 when it is the capability sentence) | Verdict line, plain-English next action |
| `body` | 15px / 400, 1.5 line height | Prose, queue items |
| `table` | 14px / 400 | Fact rows, roster cells, checklists |
| `ui` | 13px / 400 | Controls, menus, popovers |
| `caption` | 11px / 600, uppercase, 0.08em tracking | Kickers, figure labels |
| `footnote` | 12px / 400 | Provenance lines, methodology footnotes |

Hierarchy comes from size, weight, and space. Never from color: a black 40px numeral over a gray 11px caption needs no third ingredient.

### 1.3 Spacing, radius, lines

- 4px base grid. Standard steps: 4, 8, 12, 16, 24, 32, 48, 64.
- Content column: max-width 1024px, centered; the top bar inner runs to 1280px. Page gutter 24px desktop, 16px phone.
- Section rhythm: 44 to 48px between sections, opened by a 1px silver-20 hairline, labeled by a caption kicker. Sections are not boxes; the hairline and the whitespace are the container.
- Radius: 6px on interactive controls (buttons, selects, panels rows), 8px on floating panels, 50% on dots and avatars. Content itself is never rounded because content is never boxed.
- Hairlines: 1px silver-20 everywhere. Full-strength Silver Gray line is reserved for print exports (where silver-20 disappears on cheap printers).
- Elevation: floating panels only, `0 8px 28px rgba(0,0,0,0.10)`. Nothing on the canvas casts a shadow.
- Touch targets: 44px minimum on all interactive elements below the tablet breakpoint (top-bar controls get invisible padding to reach it).

### 1.4 Accessibility notes (flagged for the owner)

- Symbol Blue on white: 12.6:1, passes everything.
- Silver Gray on white: roughly 2.6:1, fails AA for text. Therefore the `caption` role is restricted to text whose loss does not lose information: kickers and figure labels that name an adjacent black value, footnotes that duplicate the as-of popover, and at-rest "No alerts" states. If the owner wants strict AA on every string, the fallback is one token change: `caption` remaps to ink at the same 11px size, and the quiet look survives on tracking and size alone. This is the single open accessibility decision in the direction.
- Yellow dots always ship with a text label (yellow on white is invisible as a signal on its own).
- Focus: 2px blue-20 outline, offset 2px, on every focusable element.

---

## 2. Shell spec

One white 56px row, hairline underneath, sticky. Left to right:

1. **Logo slot + product name.** A configurable logo slot (volume-mounted asset per deployment; never a fabricated seal). Mockups ship a neutral roundel-delta placeholder in Symbol Blue. "Readiness Hub" in 16px/600 Symbol Blue sits beside it; the pair is the only always-on blue at the top of every page and doubles as the Home link.
2. **Tabs (desktop only).** Home, Unit Overview, Seniors, Cadets, Reports, Org Chart, as plain ink text. Active tab: Symbol Blue label, 600 weight, 2px blue underline flush with the bar's bottom hairline. Hover: gray underline. Routes and URL params unchanged from v2.
3. **Unit selector** (right cluster). A quiet bordered control reading charter-first: `MI-104 · Riverside Composite Sqdn`. The panel it opens is grouped by command structure with full charter numbers in a fixed-width gray column (`GLR-MI-001`, indented children), so long unit names can truncate without losing identity; the selected row is blue-on-blue-20. **Include Sub-Units** is a checkbox row pinned at the top of the panel, not a separate top-bar control; it is part of choosing scope, so it lives inside the scope picker. Below the tablet breakpoint the picker becomes a native `<select>` (optgrouped by echelon, charter-first labels) inside the drawer.
4. **Data-age chip.** A gray dot plus `As of 28 Aug`, in footnote type. Neutral is the default state; it is provenance, not an alarm. Click opens a popover: extract date, ingest time, last run status, correction path (eServices), deployment admin contact. Escalation: past the admin-configured threshold the dot turns yellow and the text reads `As of 26 Aug · aging`; only a confirmed ingest failure turns it scarlet with the label `Ingest failed`, and that same failure raises the app's only scarlet-washed banner. Every export prints the same as-of date in its footer.
5. **User menu.** A 32px blue-20 circle with blue initials. Menu: name and unit, My progress, Settings, Admin (role-gated), Sign out.

**Hamburger behavior.** Below 940px the six tabs collapse into a hamburger at the far left; the drawer that opens holds the six nav links (16px, hairline-divided), then the native unit select and the Include sub-units checkbox. The data-age chip and user menu stay in the bar (the chip drops its text and keeps the dot at the smallest width). On desktop the tabs stay visible: this follows the council resolution rather than the literal owner request, because 148 users have six-tab muscle memory; flagged for the owner at sign-off. If the owner insists on desktop hamburger, this shell absorbs it without redesign: the tabs move into the same drawer and the unit selector shifts left into the freed space.

**Admin** leaves the tab row and lives in the user menu; it is an operator surface, not a daily destination.

---

## 3. Page anatomy demonstrated in the mockups

**Home** is the mirror before the telescope: kicker with today's date and extract date, a greeting h1, then My Progress (plain-English next action as a 19px lead sentence, three quiet numerals, a hairline checklist), My Unit (name, charter, meeting night from OrgMeetings, one-sentence health verdict linking into Unit Overview, three numerals), then the platform voice in two columns (admin-authored announcements with author and date; release notes baked from the changelog with version tags), then an About-the-data provenance paragraph. Footer: version bottom-left, GitHub bottom-right. Nothing on Home replicates Unit Overview; the My Unit card states a verdict and leaves.

**Unit Overview** answers "is my unit healthy" above the fold three times over: the masthead kicker (charter, type, meeting line), a one-sentence verdict under the h1, and a four-figure strip (members, sustainability, ES readiness, open findings). Then the single ranked **Needs Attention** queue: hairline rows, one severity dot, one sentence, one action link. Empty state: "Nothing needs your attention. The unit is healthy." on an otherwise colorless page.

Below the queue, **collapsible sections** in position-lens order. Every collapsed header carries exactly one score or count, one state word, and one alert count (dot colored to worst severity, gray "No alerts" otherwise), so the collapsed page is itself a complete brief readable in one thumb-scroll. Expanded sections follow one grammar: optional lead sentence (the ES capability sentence always leads and always outranks the score), display numeral with band word and a "How this is computed" disclosure (methodology lives in the disclosure, never printed on the canvas), a small-figures component strip, hairline fact rows, footnote. SPOF findings name the position at rest; the member's name is one click deeper. Section open/closed state persists per user.

---

## 4. How the direction scales without new mockups

The whole system is five reusable pieces: figures strip, hairline fact/table rows, one ranked queue, collapsed status headers, and quiet controls. Every remaining page is a recomposition.

**Seniors.** The tile row becomes a figures strip (Total, Promotable, plus the E&T distribution as plain tabular text, not dot strips). Filters become one hairline row of quiet bordered selects. The roster is a typeset ledger: fixed-height hairline rows, tabular numerals, E&T level as plain text ("Level 3, 2 tasks to L4"), primary specialty track plus "+2" with the full list in the profile modal, promotion column as plain text ("Next: Maj · TIG met"), ES column as counts with a scarlet dot only when something is expired. No chip walls, no colored badges, no warning-triangle confetti; one per-row discrepancy indicator that states its meaning. The profile modal is a one-page briefing sheet with the Board Packet export as its blue primary action.

**Cadets.** Identical ledger grammar. The blocker engine renders as ink text per row ("Blocked: HFZ expired") with a marker dot only when actionable (scarlet for expired-blocking, yellow for the HFZ-before-TIG collision). Rollup tiles become the figures strip ("14 blocked by HFZ, 9 by TIG, 6 awaiting board"). Test Night is where this direction stops being a style and becomes the product: a printable, typeset roster grouped by open test type is literally the design system's native output. Honor credit stays per-row; no vanity sums.

**Reports.** A searchable hairline list, not a card grid: each row is report name in 15px ink, one-line description in 14px, monochrome 1.5px-stroke ink icon, whole-row tap target, CSV and PDF as quiet blue text links on the right. One filter row. Every export footer prints the as-of extract date in Silver Gray.

**Org Chart.** The tree stays for desktop and export, drawn in ink boxes with hairline connectors; vacancies are hollow rows reading "Vacant" in gray italic with a yellow dot only when the vacancy is command-and-control representative. Toolbar buttons become quiet bordered controls (no green/black/blue trio). Below the large breakpoint the canvas is replaced by the collapsed-section pattern from Unit Overview: a grouped position list with the same status-bearing headers.

**Admin** already behaves this way; its restraint is the app-wide north star, so it inherits tokens and nothing else changes.

**Mobile** falls out of the same pieces: figures strips reflow two-up, ledgers become hairline member cards (name plus two verdict-bearing fields), collapsed section headers are the navigation, and the drawer carries nav and scope. No layout invents anything the desktop page does not already have.

---

## 5. Tradeoffs accepted

- **Restraint costs glanceability for some users.** No bars or meters means trend and magnitude live in numerals and sentences. Mitigation: the 60-line SVG sparkline primitive from the synthesis is admitted later as an ink-colored, hairline-weight mark, the one data graphic this direction permits.
- **Silver Gray captions fail strict AA** (section 1.4). One-token fallback documented; owner decision.
- **Desktop keeps tabs**, softening the literal hamburger request; the shell absorbs a reversal cheaply. Flagged.
- **Yellow reads quiet by design.** A yellow dot beside ink text whispers compared to v2's amber tiles. That is intentional: warnings are for the person working the queue, not ambient decor. The Needs Attention queue guarantees they are never missed.
- **This direction lives or dies on copy discipline.** Verdict sentences and finding lines are product surface; vague copy in this frame is more visible, not less. The style guide for those sentences (one verdict, one cause, one action) must ship with the token PR.
