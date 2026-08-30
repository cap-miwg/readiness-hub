# Readiness Hub v2 Design Plan

Status: awaiting owner sign-off. Nothing in this plan is implemented yet.

This plan is the product of a 39-agent design council: 23 CAP duty-position personas (squadron commander through region commander, plus cadets, new members, and every squadron staff officer), 8 design/engineering specialists, a synthesis pass, three competing visual directions built as working mockups, a three-judge panel, and a completeness critic run against the owner's feedback as a checklist.

## How to review this package

1. Read this document (the decisions are in section 2; everything after it is the supporting spec).
2. Open the three mockup sets in a browser, best on both a desktop window and a phone-width window:
   - `docs/design/mockups/quiet-authority/` (recommended) - home.html, unit-overview.html
   - `docs/design/mockups/command-ledger/` - the runner-up; several of its ideas are grafted into the recommendation
   - `docs/design/mockups/mission-brief/` - the density extreme; its ES content spec is grafted
3. Skim `docs/design/persona-needs.md` (the full needs matrix from the 31 personas).
4. Mark up section 2 with approve/change per decision.

What sign-off approves: the visual direction and token system, the navigation model, the Home and Unit Overview designs as mocked, the page grammar for the remaining pages (specified in words in section 6 and each direction.md; they follow the approved language without new mockups), the duty-module roadmap and its release sequencing, and the privacy gates. Pixel-final designs for Seniors/Cadets/Reports/Org Chart/Admin land as PRs against the approved language.

---

## 1. The recommendation in one paragraph

Adopt **Quiet Authority** as the design language: paper-white pages, near-black ink, Silver Gray hairlines, Symbol Blue as the only chromatic voice, scarlet and yellow appearing solely as labeled verdict marks on true findings; a healthy unit reads as a calm, nearly colorless page. Graft into it the judges' picks from the other two directions: band words and 12-month deltas under the big numerals, the ink-colored sparkline, the bordered WATCH diamond so yellow never whispers, the indexed ACTION/WATCH/PLAN finding chips, the three-fact Data panel, the NOT RECORDED neutral state, Expand/Collapse all, and Mission Brief's concrete ES content (fieldable counts with named deficits: "needs 2 UDF technicians", "no qualified IC"). Implement it pragmatically on the existing component vocabulary (restyle Card/Badge/DataTable to the new tokens rather than deleting them), which was the engineering judge's core objection to Quiet Authority as originally specified. Every core page converts from a scoreboard you read into a worklist you run, led by a ranked Needs Attention queue; every signed-in member lands on their own My Progress card. The scores stay, with their math one tap away, but the plain-English verdict sentence always outranks the number.

Judge scores: Quiet Authority won the commander lens (88) and the design lens (89); Command Ledger won the engineering lens (87) purely on implementation cost, which the grafting strategy above resolves.

---

## 2. Decision sheet

Each item: the council's recommendation, and what changes if you decide otherwise. Everything else in the plan follows whichever way these go.

**D1. Visual direction.** RECOMMENDED: Quiet Authority with the grafts listed in section 1. Alternates: Command Ledger as-is (warmer, more traditional dashboard, cheapest to build, but boxes-in-boxes and heavier blue spend), or Mission Brief (highest density, but judged hostile to the older-member demographic at 2130 on a Tuesday).

**D2. Desktop navigation.** You asked for tabs collapsed into a hamburger. The council pushed back, and this is the one place the plan recommends against your first instinct: RECOMMENDED: keep the six tabs visible on desktop (they cost one thin row, and 148 v1 users navigate by them), collapse to a hamburger drawer below the tablet breakpoint, and move the unit selector + Include Sub-Units into the single-row top bar on all viewports (which delivers the space win you were actually after: the second header row disappears everywhere). Alternate: hamburger on all viewports as you originally described; it costs one extra click per page switch and tab discoverability, and everything else in the plan still works.

**D3. Typography.** RECOMMENDED: vendor an open-licensed sans (Public Sans, the U.S. government's open typeface; Inter is the alternate) self-hosted in the repo, with the system font stack as fallback, and tabular numerals mandatory on every figure. The CAP Brand Guide's typeface spec is behind the member Brand Portal (brand.gocivilairpatrol.com); public CAP guidance names only Calibri/Arial, which are not open-web fonts. YOUR ACTION: check the Brand Portal typeface name; if it is licensable for an open-source web app we swap it in, otherwise Public Sans stands.

**D4. Silver Gray and accessibility.** Silver Gray (#9EA2A2) fails WCAG AA as text on white (~2.6:1). RECOMMENDED: Silver Gray is reserved for hairlines, borders, and decorative micro-caps; every load-bearing label (the words that name a number) renders in ink; the focus ring is full Symbol Blue. A one-token strict-AA mode remaps all gray text to ink for deployments that want it.

**D5. Data visibility scope.** RECOMMENDED: 2.0 launches with v1-parity visibility (any signed-in domain member sees all units), and default-own-unit scoping is a committed, named 2.1 deliverable that MUST ship before any attendance-drift or named-watch lists exist. This is a privacy gate, not a preference: engagement lists plus wing-wide visibility would create pattern-of-life exposure for named cadets. Alternate: scope in 2.0 (adds meaningful work to the sign-off release and delays the visual overhaul).

**D6. 2.0 ingest freeze.** RECOMMENDED: the redesign release ingests exactly one new table, OrgMeetings (unit meeting day/time/place for mastheads and My Unit), and freezes there so sign-off is purely a design decision. All other new data lands in 2.1/2.2 per section 7.

**D7. Attendance (the biggest data unlock).** AttendanceLog* (302k rows already in every zip) was independently requested by roughly two thirds of the duty-position personas: participation is the missing readiness axis and leads every lagging retention metric. RECOMMENDED: 2.1 headline, gated behind D5 scoping, counts-first (unit trends, quiet-members early warning), guest names never ingested (counts only; guests are often minors with no membership consent).

**D8. Logistics tables (vehicles/equipment/property).** RECOMMENDED: excluded this cycle. ORMS is the system of record and the council judged it scope creep against thin demand (one persona). Revisit on real user demand. Alternate: a minimal vehicles-ready strip in 2.2.

**D9. Named single points of failure.** ES personas call the named SPOF the most actionable thing in the product; five command/staff personas call wing-visible named callouts a morale grenade. RECOMMENDED: callouts name the POSITION at rest ("Mission Scanner/Observer rests on one qualified member"), the member name appears on drill-down at the member's own unit scope, and counts-only above that scope.

**D10. Data-age indicator.** RECOMMENDED: neutral "As of 28 Aug" chip on every page with an explanatory popover (your instinct that it helps data-issue diagnosis is right); scarlet appears only on confirmed ingest failure, and the staleness threshold becomes a deployment setting. The current default-scarlet badge trains users to ignore red.

**D11. My Progress identity matching.** RECOMMENDED: match the session email to a member by (1) CAPID mailbox local part, else (2) unique match against MbrContact PRIMARY EMAIL. Zero or ambiguous matches: the card degrades gracefully to a "your record could not be matched" hint with self-service guidance, never a guess (a wrong guess would show someone else's progress). This convention dependence is stated in the deployment docs.

**D12. Brand Portal logo.** RECOMMENDED: the app ships a neutral placeholder mark and a config/volume-mounted logo slot; each deployment drops in the official CAP mark obtained from the Brand Portal. No runtime logo upload (stored-XSS surface), and the repo never commits the trademarked mark. YOUR ACTION: pull the official asset for the MIWG deployment when we implement.

---

## 3. Design system

### Color

Two layers: brand primitives, consumed only through semantic roles.

| Primitive | Hex | 20% tint on white |
|---|---|---|
| Symbol Blue | #001871 | #CCD1E3 |
| Silver Gray | #9EA2A2 | #ECEDED |
| Scarlet Red | #BA0C2F | #F1CED5 |
| Air Force Yellow | #FFCD00 | #FFF5CC |
| Black (ink #111417 in practice) | #000000 | #CCCCCC |
| White | #FFFFFF | - |

Semantic roles (components never reference a hue directly):

- `ink` / `ink-secondary`: near-black text; secondary stays AA-passing
- `hairline` / `muted`: Silver Gray; never load-bearing text (D4)
- `identity` / `interactive`: Symbol Blue: logo wordmark, links, active tab, selected states, focus ring
- `critical`: Scarlet, only on an actionable finding, always icon + word, never a tile background
- `warning`: AF Yellow as the bordered WATCH diamond (yellow fill, 1px ink border) + label; never bare dots, never text on white
- `plan`: Symbol Blue chip for scheduled work (the third finding category)
- `not-recorded`: dashed Silver Gray glyph; a unit that does not log something in eServices is never painted red for it
- "Success" is silence: a healthy state is neutral ink with no accent. No green exists in this system.

Hard rules enforced in CI: gradients banned; off-brand Tailwind hues (indigo/purple/emerald/orange/teal/rose) grep-banned; accent budget of roughly three colored marks per viewport, spent by verdicts only. Category is never a color (no green-seniors/yellow-cadets tiles).

### Typography

Per D3. Scale (from the winning direction): 34/28 page titles, 20 section heads, 15 body, 13 secondary, 11 uppercase micro-caps for kickers; figure numerals 40-54 at weight 300 with tight tracking; tabular numerals everywhere a number lives. Line length capped ~72ch.

### Structure

Hairlines and whitespace are the default container; cards keep their component API but restyle to hairline-bordered, shadow-free surfaces reserved for genuinely modular content (mockup fidelity without deleting the working component vocabulary). 8px spacing grid, 6px radius, elevation only on floating panels (menus, modals).

---

## 4. Shell and navigation

Single-row top bar, all viewports: logo slot + "Readiness Hub" wordmark left; six tabs (desktop, per D2); right cluster: unit selector, As-of chip, user menu. Below tablet width: logo, scope chip, hamburger.

- Unit selector: one control, opening a panel grouped by command structure (wing, groups, squadrons indented) with a fixed-width Silver Gray charter column: `MI-104  Riverside Composite Sqdn`. Include Sub-Units lives INSIDE the panel as its pinned first row, with the active scope echoed in the closed control ("MI-104 + sub-units"). Search filter for wings at scale.
- Charter number formats, canonical: selector rows and chips `MI-104`; page mastheads `GLR-MI-104`; exports full charter. Unit names never overspill; the number is always the stable identifier.
- User menu: profile line (name, role badge), Settings, Send feedback, Sign out. Admin tab appears only for admins.
- As-of chip per D10.

---

## 5. Home: the platform page (as mocked)

Top to bottom: greeting with date + extract kicker; **My Progress** (D11: plain-English next action sentence, three personal figures, requirement checklist; for cadets: next achievement, TIG countdown, HFZ validity, o-flight syllabus; for seniors: next grade, level tasks, expiring quals); **My Unit** (name, charter, meeting night from OrgMeetings, one-line health verdict, three figures, link to Unit Overview); **Announcements** (admin-authored) beside **What's New** (release notes baked from the CHANGELOG at build time, never fetched); **About the data** as three fact rows (extract date / last ingest / next expected); version bottom-left, GitHub bottom-right. Nothing on Home replicates Unit Overview. 2.1 adds the Recognition feed (dated milestone events from extract diffs, copy-ready for PAOs).

Announcements is a new admin write surface and ships with its security spec: fixed schema (title, body, dates), sanitized rendering, requireAdmin + CSRF, audit-logged, no rich media.

---

## 6. Page grammar (approved as language, built as PRs)

**Unit Overview.** Calm masthead (charter kicker, unit name, meeting line); verdict sentence; figures strip with band words + deltas (grafted); **Needs Attention queue**: 3-5 ranked findings, each one line + one action link, indexed and categorized ACTION/WATCH/PLAN, with a calm "unit is healthy" empty state; then collapsible sections (Recruiting & Retention, Emergency Services, Cadet Program, Professional Development, Personnel & Expirations, Workspace Adoption demoted to collapsed/neutral), each with a status-bearing collapsed header under a hard budget: one score, one state word, one alert count. Expand/Collapse all. Sections lazy-mount, remember per-user state, and order by the viewer's duty lens (position-relevant first). ES section leads with the capability sentence and Mission Brief's content spec; score math behind "How this is computed". Mode C becomes the command deck: exceptions-first strip, month-over-month deltas, sparklines, one echelon per view with drill-down (region sees wings, wing sees units).

**Seniors.** Fixed-height rows, plain-text E&T level ("Level 3, 2 tasks to L4" replaces the six-dot strip), primary track + "+N", one meaningful discrepancy indicator per row. Adds: Teach This Next demand panel, awaiting-approval counter, one-click Board Packet PDF from the profile modal.

**Cadets.** The blocker engine: a named blocking-requirement chip per cadet; rollup tiles rephrased in requirement terms ("14 blocked by HFZ, 9 by TIG, 6 awaiting board") replacing the low-signal Close/90+ tiles; Test Night saved view (grouped by open test type, printable); HFZ-before-TIG collision flag; milestone radar; parent-shareable single-cadet what's-next export (PII-minimal by construction).

**Reports.** Searchable list, whole-card targets, monochrome icons; every export prints its as-of date; new entries per the module roadmap (ICUT Status, Quals Expiring 90 Days, Transfers Ledger, Recent Milestones; Safety Compliance in 2.2).

**Org Chart.** Tree + exports stay on desktop; below the large breakpoint a collapsible position list replaces the canvas; vacancy toggle gains CAC-representative vacancies.

**Admin.** Adds announcements authoring and the usage panel (D-metrics below); staleness threshold + admin contact become settings.

**Mobile (the cadet-and-commander-on-a-phone contract).** Below 768px: rosters render as member cards (name + two verdict-bearing fields, tap-through to a full-screen profile sheet); filters move to a full-height sheet with an applied-count badge; chrome collapses to one row with a scope chip opening a bottom sheet; Unit Overview's collapsed sections ARE the mobile navigation. PWA (manifest + installability) evaluated in 2.2, PWA-first, no native app.

---

## 7. Duty-module roadmap (every position finds something)

Ranked by the council (value x demand / cost). "New ingest" = table already in every CAPWATCH zip, not yet loaded.

| # | Module | Serves | Data | New ingest | Release |
|---|---|---|---|---|---|
| 1 | Needs Attention queue | every commander/staff | already ingested | no | 2.0 |
| 2 | Participation & engagement early warning | ~20 personas | AttendanceLog* | yes | 2.1 (after D5) |
| 3 | Cadet promotion blocker engine + Test Night | DCC, testing, cadet cmdr | already ingested | no | 2.0 |
| 4 | My Progress personal card | every member | already ingested | no | 2.0 |
| 5 | Meeting info masthead / My Unit | everyone | OrgMeetings | yes (the one 2.0 ingest) | 2.0 |
| 6 | Personnel & roster health (30/60/90, transfers) | admin, R&R, commanders | + MbrTransfer | yes | 2.1 |
| 7 | Safety currency watch | safety officer, commanders | SafetyBriefings* | yes | 2.2 |
| 8 | Command deck (Mode C at every echelon) | group/wing/region | snapshots of ingested | no | 2.1 |
| 9 | PD block: levels funnel, Teach This Next, approvals | PDO, wing DPD | already ingested | no | 2.0 (partial) / 2.1 |
| 10 | ES fieldability gated on currency + Train to the Gap | ES officers, wing DES | + MemberCurrency | yes | 2.2 |
| 11 | Recognition feed | PAO, everyone | extract diffs | no (needs snapshots) | 2.1 |
| 12 | Cadet pipeline funnel + encampment slate | wing DCP, DCC | already ingested | no | 2.1 |
| 13 | AE block (module currency, Yeager coverage) | AEO | already ingested | no | 2.1 |
| 14 | Command health board (vacant commands, tenure) | wing/region | already ingested | no | 2.1 |
| 15 | Aviation strip (sorties, airframes) | wing DES, flying units | CapFlt + aircraft | yes | post-2.2 |
| 16 | Logistics | logistics officers | vehicles/equipment | yes | excluded (D8) |

Positions without a module get an explicit home: chaplain/CDI reads character-forum completion inside the Cadet Program section (already ingested); the historian gets the Recognition feed's dated milestone export; finance officer is out of scope, stated plainly (CAPWATCH carries no finance data). MemberPrm is deferred indefinitely and will never be an authorization source (advisory display at most).

Engineering note the roadmap depends on: modules 8 and 11 require nightly computed-snapshot retention and diffing (a snapshots table, retention policy of 24 months, and a diff pass at ingest). That is real 2.1 engineering work, costed below, not a free byproduct.

---

## 8. Release plan

**2.0 "the redesign" (this sign-off).** Token PR first (the color rainbow lives in ~6 lookup tables), then chrome/nav, Home, Unit Overview, then per-page sweeps, behind a CI ban on off-brand hues; modules 1/3/4/5; OrgMeetings ingest; announcements + usage panel; demo dataset restyled screenshots for the README. Estimated effort: 2-3 working sessions of the scale that built v2, sequenced as reviewable PRs on the v2 branch. Nothing ships until you approve this plan.

**2.1 "scoping + memory".** Default-own-unit scoping (D5 gate) with wing/group staff retaining broad scope; snapshot retention + diff infrastructure; then attendance (D7), command deck, recognition feed, personnel health, pipeline/AE/command-health modules. Estimated 2-3 sessions.

**2.2 "currency".** Safety watch, MemberCurrency-gated ES fieldability, PWA evaluation, strict-AA mode polish. Estimated 1-2 sessions.

Scope-lock rule (contractual): signing this plan approves the vision; it does not put the 16-module matrix into 2.0. The 2.0 release is exactly the paragraph above.

---

## 9. Beating the eServices Commander's Dashboard

Structural advantages this design banks on: (1) speed: sub-100ms pages vs eServices page loads; (2) audience: every member sees it, not just commanders with dashboard permissions; (3) an action queue with named next steps instead of static compliance panels; (4) trend memory (2.1 snapshots) where eServices shows points in time; (5) one-click exports that cite their extract date; (6) plain-English verdicts above scores. Owner action at implementation time: a side-by-side screenshot pass against the real Commander's Dashboard (we lack access to it here) to confirm line-item coverage, especially its compliance panels, so nothing a commander relies on there is missing here. [unverified: exact current eServices dashboard contents]

---

## 10. Success metrics (committed at cutover)

The admin usage panel ships in 2.0 and the baseline starts at cutover, or the v1-vs-v2 comparison is lost forever. Targets to revisit after 60 days: 150+ distinct 60-day actives (v1 lifetime baseline: 148), 20+ units viewed weekly, My Progress reached by 30% of sessions, p75 page render under 1s on the wing dataset.

---

## 11. Feedback checklist (your notes, mapped)

- Brand colors/typography: section 3, D3, D4
- Dev login screen: unchanged, dev-only (correct)
- Gradient banner: killed (kill list #1)
- CAP logo top-left: shell spec + D12
- Hamburger: D2 (recommendation differs from your instinct; your call)
- User profile dropdown: kept, gains Settings/feedback
- Data-stale icon: D10 (kept, made honest)
- Unit selector space: single-row top bar, selector moved up (section 4)
- Home as platform page, no Unit Overview duplication, version + GitHub kept: section 5
- Charter numbers restored, grouping kept: section 4
- Too many colors / less is more / every element earns its keep: the entire token system + kill list
- Collapsible sections: Unit Overview spec, with status-bearing headers so collapsed sections still inform
- Commander-first, then every member: Needs Attention queue + My Progress + D5 sequencing
- Every duty position served / one-stop shop: section 7
- Mobile on the go: section 6 mobile contract + 2.2 PWA

Full appendices: `persona-needs.md` (31-persona matrix), `mockups/*/direction.md` (per-direction specs), the three mockup sets.
