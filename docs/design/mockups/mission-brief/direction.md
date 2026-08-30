# Mission Brief: the density-first field tool

One of three candidate directions for Readiness Hub v2. Mockups: `home.html`, `unit-overview.html` (self-contained, open in any browser, resize to 390px to judge the phone experience).

## The idea

Readiness Hub becomes a mission packet, not a dashboard. Black ink on white paper, numbered sections, a BLUF box at the top of every page, and a sticky section rail that works like the paragraph numbers of an operations order. Nothing decorates. Color appears only when the data has a verdict: scarlet means act, yellow means watch, and a healthy unit reads as a colorless page. The feeling to protect: a commander in a parking lot, a first sergeant in a hallway, a cadet in formation, each getting an answer in one thumb-scroll and putting the phone away.

Three moves define the direction:

1. **BLUF first.** Every page opens with a bordered BLUF box: one bold sentence that answers the page's question ("Mission-capable with gaps. 2 findings need action, 2 to watch."), then a mono status line. The ten-second read is a design contract, not a hope.
2. **Numbered sections + sticky rail.** Pages are packets of numbered sections (01 SITUATION, 02 STRENGTH, ...). A sticky anchor rail (left on desktop, horizontal strip on phones) carries each section's number, name, and status glyph, so the rail itself is a readiness summary before you scroll anywhere.
3. **Aggressive disclosure.** Sections collapse to a one-line header that must carry its whole verdict (rest-state budget: one score, one state word, one alert count). Evidence hides; verdicts never do. Methodology fine print lives behind "How this is computed."

## Token sheet

### Color: two layers, hard semantics

Primitives (the only hues in the app; CI grep-bans everything else):

| Token | Hex | May appear as |
|---|---|---|
| `ink` | `#000000` | All text. Hierarchy comes from size and weight, never from graying text. |
| `paper` | `#FFFFFF` | Page and panel background. The only surface color. |
| `blue` (Symbol Blue) | `#001871` | Identity and interaction only: the 3px letterhead keyline, logo mark, links, current tab underline, focus rings, selected rows, user chip. Never a status color. |
| `gray` (Silver Gray) | `#9EA2A2` | Structure only: OK glyph outlines, meter accents, decorative strokes. Never text (2.5:1 on white fails AA). |
| `scarlet` (Scarlet Red) | `#BA0C2F` | ACTION verdicts only: finding glyph + ACTION tag, action-bearing counts. Always paired with the word, never color alone. Also the as-of chip on confirmed ingest failure. |
| `yellow` (AF Yellow) | `#FFCD00` | WATCH glyph fill (always with a 1px ink border) and the WATCH tag border. Never used for text; never used as a fill behind text without the ink pairing. |

20% tints (supplemental, backgrounds and hairlines only, never carrying meaning alone):

| Token | Hex | May appear as |
|---|---|---|
| `blue-20` | `#CCD1E3` | Selected row in the unit selector; selected filter chips. |
| `gray-20` | `#ECECEC` | Hairline row rules, meter tracks, hover fills, fine-print background. |
| `black-20` | `#CCCCCC` | Section rules, control borders (the "strong hairline"). |
| `scarlet-20` | `#F1CFD5` | ACTION tag background (scarlet text on it passes AA). |
| `yellow-20` | `#FFF5CC` | WATCH tag background (ink text on it). |

Accent budget, enforced as a rule: outside the Needs Attention queue, at most one scarlet element per section rest state. Category never gets a color (no green seniors, no yellow cadets). Meters fill with ink.

### Glyph grammar (the "small status glyphs")

8px marks, always accompanied by a word or count, never meaning by color alone:

- ACTION: solid scarlet dot
- WATCH: yellow diamond with 1px ink border (the border keeps it visible on white)
- STEADY/OK: gray outline circle (decorative; the text carries the state)
- NO DATA: gray dashed circle ("not recorded" is a neutral state, never red)

### Type

- Stacks: sans `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`; mono `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`. System stack now; if the owner's Brand Portal check lands on a vendorable face, Public Sans drops into the sans slot without layout change.
- Mono is a voice, not a decoration: charters (`GLR-MI-104`), section numbers, kickers, timestamps, the as-of chip, status lines, funnels (`L1 17 · L2 9 ...`). If it reads like a designator or a stamp, it is mono.
- Scale (px): 9.5 tag / 10.5 kicker / 11 rail + stat / 12 meta / 13 body / 13.5 lead / 12.5 section title (uppercase, +0.04em) / 19-21 figures and page title. Weights 400/600/700 only. Line-height 1.45.
- `font-variant-numeric: tabular-nums` on `body`. Every figure in the app aligns.

### Space, radius, elevation

- 4px base scale: 4, 8, 12, 16, 24, 32, 48. Row heights: 32px data rows, 44px section headers and all touch targets on phones (WCAG 2.5.8 pass is a stated acceptance check).
- Radius: 0 by default (sections, panels, tables); 2px on small controls (tags, chips, buttons). No pills, no rounded cards.
- Elevation: none. Dropdown panels use a 1px ink border instead of shadow. Hierarchy is drawn with two rule weights: `black-20` between sections, `gray-20` between rows.

## Shell spec

Single-row 51px top bar on every page: a 3px Symbol Blue keyline across the very top (the letterhead), white bar, `black-20` hairline below.

- **Logo slot, top-left.** A config/volume-mounted asset (deployments drop in the official mark from the Brand Portal); mockups ship a neutral roundel. Never a fabricated seal, never runtime-uploaded. Wordmark "Readiness Hub" in 14px/700 ink beside it.
- **Tabs.** Desktop (>940px) keeps all six tabs visible inline: Home, Unit Overview, Seniors, Cadets, Reports, Org Chart. Current tab: Symbol Blue text + 2px blue underline. Admin is not a seventh tab; it lives in the user menu (admin role only).
- **Hamburger.** Appears below 940px only, far left. Contains: the six tabs (current marked with a blue left rule), Admin, and a mono footer line with the as-of stamp and version. This is the council resolution of the owner's hamburger request: phones get the hamburger, desktop keeps the muscle memory of 148 v1 users; flagged for the owner at sign-off.
- **Unit selector.** Charter-number-first chip: `GLR-MI-104 · Riverside Composite Sqdn` (name drops on phones, charter never does). The panel is the command structure: group headers as mono kickers (Wing, then each Group), units as rows with the charter in a fixed-width mono column so names can be long without breaking scanning. Current unit: `blue-20` row. **Include Sub-Units** folds into the panel as its first row, a checkbox: "Include sub-units of selection"; when on, the chip gains a `+N` suffix (`GLR-MI-090 +3`). Below 560px the panel is replaced by a native `<select>` (optgroups per echelon) for one-thumb use.
- **Data age.** A neutral mono chip: `as of 28 Aug 03:00`. Click opens a popover: extract timestamp, ingest run number and status, configured alert threshold, deployment admin contact. The chip escalates to the ACTION treatment (scarlet, "data failure") only on a confirmed ingest failure past the configured threshold; age alone never turns it red. On phones the chip hides; the stamp lives in every page's masthead kicker and in the hamburger footer, so the answer is never more than one glance away. Every export prints the same stamp.
- **User menu.** 30px Symbol Blue initials chip (the one solid-blue element in the chrome). Contains: grade + name + CAPID header, My Progress, Settings, Admin (admin role), Sign out.

## Navigation model

Two levels, no more:

1. **Routes** (top bar): the six v1 tabs, URLs and filter params unchanged.
2. **Sections** (in-page rail): numbered anchors within a page. Desktop: sticky left rail, 190px, blue left-rule on the current section. Phone: the rail becomes a sticky horizontal strip under the top bar; the strip plus collapsed section headers ARE the mobile navigation, so a commander reads unit health in one thumb-scroll. Rail items carry the section's status glyph; the rail is a summary, not just a menu. Production adds an IntersectionObserver scrollspy (the mockups mark the current section statically) and persists each user's expand/collapse choices per section.

Section numbers are stable per page and deep-linkable (`/unit-overview#sec-es`), which makes "see paragraph 04" a usable sentence in an email.

## What the mockups show

**home.html**: the platform page as a daily brief. Masthead kicker carries date + data stamp; BLUF box gives the member their one next action. 01 YOUR STATUS is the My Progress mirror (session email matched to member record: plain-English next action, Level checklist behind a disclosure, ES currency countdown, awaiting-approval state; cadet variant swaps in TIG countdown, next achievement, HFZ validity, o-flights). 02 YOUR UNIT is the snapshot entry point (charter, one-line health verdict, meeting night and location from OrgMeetings, strength, link into Unit Overview). 03 PLATFORM is the voice of the deployment: admin-authored announcements (dated, attributed, body behind Read more) and What's New baked from the CHANGELOG at build time, plus the planned 2.1/2.2 line. Version bottom-left, GitHub bottom-right. No hero, no stat tiles, no role cards, nothing that replicates Unit Overview.

**unit-overview.html**: the commander's ten-second view. Masthead: charter, name, type, meeting line. BLUF box answers "is my unit healthy" above the fold at 390px, with a mono status line covering R&R, ES, cadets, and participation. 01 SITUATION is the Needs Attention queue: four numbered findings (F1-F4), each one bold claim + one evidence sentence + one action link; SPOF shown as position at rest (the name only on drill-down); calm empty state written into the page. 02 STRENGTH is a five-figure strip. Then collapsible sections: 03 Recruiting & Retention (collapsed; header carries `58 · FAIR · 1 watch`), 04 Emergency Services (expanded; the capability sentence leads, score + ink meter + computation disclosure below it, then capabilities, qual health, evaluators, SPOF, pipeline as 32px data rows), 05 Cadet Programs (blocker rollup in requirement terms), 06 Professional Development (funnel, approval queue, Teach This Next), 07 Participation (an honest neutral "not recorded" state, labeled 2.1), 08 Workspace Adoption (demoted to a collapsed admin-leaning section). Expand all / Collapse all sits above the packet.

## How it scales to the other pages (no new mockups needed)

The direction is a grammar: masthead + BLUF, numbered sections on a rail, 32px verdict rows, glyph + word, disclosure for evidence. Each remaining page is a straightforward sentence in it:

- **Seniors**: BLUF ("14 promotable; 2 approvals aging"). Rail: 01 Situation (Teach This Next + approval queue), 02 Roster, 03 Levels funnel. Roster rows fixed-height: name + grade, plain-text E&T (`L3 · 2 tasks to L4`), primary track `+N`, promotion leg, ES count; no dot strips, no chip walls, no scattered triangles. Filters compress to one mono toolbar row; on phones they fold into a full-height sheet with an applied-count badge. Below 940px rows become two-line cards (name + the one verdict field the current sort is about) that open a full-screen profile sheet, where Board Packet export lives.
- **Cadets**: BLUF ("4 ready now; HFZ is the top blocker"). Rail: 01 Situation (blocker rollup tiles in requirement terms), 02 Roster (named blocking-requirement chip per row as plain text, e.g. `blocked: HFZ expired`), 03 Test night (unit-scoped, grouped by open test type, printable: name + CAPID + requirement only), 04 Milestones (radar list). PII-minimal by construction; the parent-shareable what's-next export is a single-cadet packet in exactly this visual language.
- **Reports**: the catalog as a mono packet index: one searchable list, whole-row tap targets, monochrome glyphs, one filter row, CSV/PDF at the row's right edge, as-of stamp printed on every export. Rail groups: Personnel, Cadet Programs, ES, Admin.
- **Org Chart**: desktop keeps the tree and PNG/PDF export (toolbar becomes quiet bordered controls). Below the large breakpoint the chart becomes this direction's native pattern: a grouped collapsible position list with vacancy glyphs, i.e. the section rail applied to an org tree.
- **Admin**: already the app's most restrained page; it adopts the packet chrome and its runs table collapses to mono cards on phones.
- **Mode C / command deck** (wing and group scope): 01 SITUATION becomes the exceptions-first strip ("5 of 48 units carry findings"), 02 a dense mono table of units: charter, strength, R&R, ES, delta vs last month, ink sparkline; row tap drills one echelon down. Counts only above the viewer's own unit; no named callouts at wing scope.

## Accessibility and honesty notes

- Ink on paper is 21:1; scarlet on white 6.7:1; every tag pairs color with a word; state never rides on color alone. Silver Gray is banned from text by token rule, which is what makes the monochrome discipline AA-safe.
- Focus rings are 2px Symbol Blue; all disclosure headers are real `details/summary` or buttons, keyboard-first; 44px targets on phones.
- "No data recorded" is a first-class neutral state with its own glyph, so units that do not log attendance or safety in eServices are never painted red.
- The mockups run on `details/summary` plus a five-line expand-all script: the direction survives with almost no JavaScript, which is the right omen for a sub-100ms app.

## Tradeoffs accepted

- Density over air: this is the least "Apple-like" of plausible readings of "less is more"; it bets the owner's phrase means "every element earns its keep," not "generous whitespace." Type runs small (13px body) by design.
- All-black text spends the color budget almost entirely; Symbol Blue reads as chrome and links, not as page decoration. The brand shows in the keyline, the mark, and discipline rather than in painted surfaces.
- Desktop keeps six visible tabs (adoption continuity) instead of the owner's literal hamburger-everywhere ask; flagged for sign-off.
- Collapsed-by-default sections cost one tap to reach evidence; the rest-state budget (score + state word + alert count) is the compensation, and per-user persistence remembers each reader's preferred open set.
