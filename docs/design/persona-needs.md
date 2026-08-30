# Persona Needs Matrix: Readiness Hub v2 Redesign

Synthesis of a 31-persona design council (CAP duty positions plus product, design, engineering, mobile, security, and data specialists) run against the v2 build, the owner's feedback, and the CAPWATCH data inventory. This document is a sign-off appendix to the redesign plan.

Ground rules applied throughout:

- The owner's law governs: less is more; every word, box, and metric earns its keep.
- Needs voiced by many personas outrank needs voiced by one.
- Specialist red flags are treated as constraints, not suggestions.
- No real member names appear in this document or in any design mock.

---

## 1. Themes (what the council converged on)

1. **Color is a verdict, not decoration.** Two-layer CAP token system (brand primitives plus 20% tints under semantic roles). Neutral-first pages; Symbol Blue is identity and interaction; scarlet and yellow appear only attached to an actionable finding, always paired with icon plus label. Hard accent budget per viewport. A healthy unit reads as a colorless page.
2. **Action queue over scoreboard.** Every core page converts from a dashboard you read into a worklist you run: a single ranked Needs Attention queue on Unit Overview (replacing three competing callout boxes), a blocker engine on Cadets, Test Night, Teach This Next, Renewal Watch, Train to the Gap. If the queue is empty, one calm line says the unit is healthy. This is the move that beats the eServices Commander's Dashboard.
3. **The mirror before the telescope.** Match the session email to the member record and show every signed-in member their own record first: plain-English next action, checklist, TIG countdown, HFZ or currency status. Zero new integrations. This is what turns 148 power users into 1,232 members.
4. **Participation is the missing readiness axis.** Everything measured today is credentials. AttendanceLog* (302k rows already in every nightly zip) is the highest-value unused data: engagement early warning leads every lagging retention metric. Roughly two thirds of the duty-position personas asked for it independently.
5. **Every duty position finds something, without page bloat.** Collapsible duty modules on Unit Overview with status-bearing collapsed headers (one score, one state word, one alert count), ordered by a server-derived position lens (session email to member to duty positions). The page is not bigger; it is yours. The same lens object becomes the input to real access scoping later.
6. **Trust plumbing surfaced honestly.** Neutral "as of" chip instead of a scarlet stale badge; scarlet only on confirmed ingest failure; explicit "no data recorded" states for units that do not log attendance or safety in eServices; every export carries its as-of date.
7. **Counts at overview, names on drill-down.** Named individuals never appear in alarm callouts on broadly visible surfaces; roles and counts at rest, names one click deep, and only within appropriate scope. Per-unit scoping graduates from roadmap polish to a committed prerequisite as minors' data and drift lists deepen.
8. **One scoreboard grammar, every echelon.** Mode C generalizes into a command deck: exceptions-first strip, month-over-month deltas, sparklines, rolled up one echelon per view (region sees wings, wing sees groups/squadrons). Requires retained nightly snapshots, no new CAPWATCH tables.
9. **Ship as a sequence, not a big bang.** Token PR first (the rainbow lives in about six lookup tables), then chrome, then Home, then per-page sweeps behind a CI ban on off-brand hues. 2.0 freezes new ingest at OrgMeetings so sign-off is purely a design decision; attendance is the 2.1 headline; safety is 2.2. Instrument usage at cutover or the v1-vs-v2 baseline is lost forever.
10. **Most of the value needs zero new data.** Promotion blockers, board packets, approval queues, milestone radar, encampment slates, PD funnels, ICUT status, command health: all computable from tables already ingested.

---

## 2. Needs matrix

Format per persona: top jobs (condensed), then top gaps with data source and ingest status. "Ingested" means the table is already in the app; "new" means it ships in every CAPWATCH zip but is not yet ingested; "infra" means no CAPWATCH data involved.

### 2.1 Unit command team

**Squadron Commander (composite, 28 members, 4 hrs/week)**
- Jobs: ten-second healthy-or-not verdict; named and dated action list; SUI exposure sorted by overdue; Tuesday recognition prep; duty coverage.
- Gaps: engagement early warning and fading-members list (AttendanceLog*, new); SUI risk rollup as one Needs Action section (Member, Training, MbrAchievements, DutyPosition, SpecTrack; ingested); safety education currency (SafetyBriefings*, new); guest follow-up list (AttendanceLogGuest, new, counts only); meeting day/time/location on the unit header (OrgMeetings, new).

**Deputy Commander for Seniors**
- Jobs: board-defensible promotion evidence; E&T progression tracking; track/duty alignment; duty coverage; monthly hygiene sweep.
- Gaps: compute the duty-performance leg of promotion eligibility instead of N/A (DutyPosition + SeniorLevel, ingested); per-track rating progress, not just chips (SpecTrack + PL_* + MbrTasks, ingested); attendance recency per senior (AttendanceLog*, new); safety currency in the hygiene sweep (new); one-click printable Board Packet per member (all ingested).

**Deputy Commander for Cadets**
- Jobs: promotable-this-cycle with blockers; HFZ scheduled ahead of promotions; encampment season; o-flight coordination; parent answers in under a minute.
- Gaps: attendance early warning (new); promotion-blocker rollup replacing raw status (CadetAchv/Aprs + PL_* + HFZ + CadetActivities, ingested); HFZ-expires-before-TIG collision forecast (ingested); standing encampment readiness panel (ingested); parent-shareable single-cadet what's-next one-pager, PII-minimal (ingested).

**Cadet Commander (C/Capt, 17, phone between school and practice)**
- Jobs: promotion-ready list before formation; stalled cadets with the why; cadet billet coverage; closing-formation recognition list; own staff checklists.
- Gaps: blocker breakdown with aggregation ("8 blocked on HFZ") (ingested); recognition queue of changes since last extract (CadetRank/Achv/Awards/Activities diffs, ingested); missed-3-meetings flag (AttendanceLog*, new); HFZ-before-TIG collision flag (ingested).

**Cadet First Sergeant**
- Jobs: spot drifting cadets while a phone call still works; weekly meeting run; per-cadet blockers; NCO structure; new-join follow-up.
- Gaps: last-seen column and missed-3 filter (AttendanceLog*, new); ranked drift watchlist crossing attendance, stall, and expiration (new + ingested); new-cadet pre-Curry tracker (Member + CadetAchv, ingested); guest follow-through counts (AttendanceLogGuest, new, counts only).

### 2.2 Squadron duty officers

**New Senior Member (week 8, Level 1)**
- Jobs: plain-English Level 1 checklist; the one next thing to do; acronym translation everywhere; my own record first; when does my unit meet.
- Gaps: My Progress surface as the signed-in default (MbrContact email match + PL_*/MbrTasks/SeniorLevel/Training, ingested); inline plain-language expansion of every qual and task code (Achievements/Tasks/PL_Tasks/CdtAchvEnum, ingested); meeting info (OrgMeetings, new); new-members-first-6-months lens for unit leadership (Member + PL_*, ingested).

**Emergency Services Officer / GTL**
- Jobs: who can I field tonight; expiring quals 30/60/90 out; training night planned to the gap; evaluator matching; SPOF watch.
- Gaps: forward expiration horizon, not an expired count (MbrAchievements + Achievements, ingested); SQTR open-task rollup ranked by how many trainees each task unblocks (MbrTasks + Tasks + AchvStep*, ingested); evaluator-to-task matching with contact (ingested); fieldability gated on operational and safety currency (MemberCurrency + SafetyBriefings*, new); engagement-weighted pipeline (AttendanceLog*, new).

**Aerospace Education Officer**
- Jobs: which cadets are blocked on an AE module; Yeager tracking; o-flight seat triage; attendance-aware activity planning; one-line AE answer for the commander.
- Gaps: restrained AE section on Unit Overview, three numbers (CadetAchv + SeniorAwards/Training + OFlight, ingested); Yeager filter on Seniors (ingested); o-flight column and sort on the Cadets roster (OFlight, ingested); attendance recency and meeting info (AttendanceLog* + OrgMeetings, new).

**Professional Development Officer / E&T**
- Jobs: pick the class that unblocks the most seniors; level positions per member; completed-but-unapproved levels; track/duty mismatches; promotion answers.
- Gaps: Teach This Next demand panel (PL_* + MbrTasks + SeniorLevel, ingested); persistent approval-queue counter (ingested); PD section on Unit Overview (ingested); stalled-and-absent flag (AttendanceLog*, new); meeting schedules across units for shared classes (OrgMeetings, new).

**Testing Officer**
- Jobs: who tests tonight and which test; what each cadet already passed; milestone exam radar; pending approvals; stalled mid-achievement.
- Gaps: blocking-requirement column on the roster (CadetAchv + CdtAchvEnum + HFZ, ingested); Test Night queue grouped by test type (ingested); milestone exam radar (CadetAchv + CadetAwards, ingested); tested-awaiting-approval bucket (CadetAchvAprs, ingested); stalled-mid-achievement flag (ingested).

**Recruiting and Retention Officer**
- Jobs: expirations 30/60/90 early enough to talk; first-year stalls; guest-to-member funnel; inactivity before renewal; monthly picture for the commander.
- Gaps: Renewal Watchlist crossing expiration runway with attendance recency (Member + AttendanceLog*, new); first-year cohort funnel (Member + CadetAchv/SeniorLevel, ingested); guest pipeline with conversion (AttendanceLogGuest, new, counts only); net transfer line in the R&R numbers (MbrTransfer, new).

**Safety Officer**
- Jobs: monthly currency roster; delinquent chase list on a phone; one honest compliance number; activity gate checks; trend.
- Gaps: Safety Education Compliance roster report, Current/Lapsing/Delinquent (SafetyBriefingsMonthly + List, new, rolling-window ingest); one safety tile on Unit Overview expanding to the named list (new); safety-currency flag inside ES fieldability (new); 12-month compliance trend (new).

**Communications Officer**
- Jobs: ICUT gate check before handing out a radio; MRO/CUL pipeline and expirations; coverage depth; radio accountability; wing data calls.
- Gaps: ICUT completion metric and report (MbrAchievements/Tasks, ingested); per-capability comms drill inside the ES deep dive (ingested); duty coverage rollup across units (DutyPosition + Organization, ingested); operational currency beside qual status (MemberCurrency, new); comms equipment count (equipment/property, new, contested: see conflicts).

**Logistics / Supply Officer**
- Jobs: annual property inventory; vehicle inspections and usage reporting; van availability per activity; gear recovery from departing members; wing LG data calls.
- Gaps (all contested, see conflicts): Logistics section with vehicle and property cards (vehicles/equipment/property, new); vehicle utilization report (vehicles_usage, new); property accountability with change history (equipment_hst, new); separation-risk-on-issued-property join (equipment + Member + MbrTransfer, new). Uncontested win available today: Membership Expiring Soon report as the hand-receipt recovery early warning (ingested).

**Administrative / Personnel Officer**
- Jobs: expirations 60/90 out; duty assignment hygiene; transfer processing and reconciliation; paper strength vs real attendance; the small constant questions.
- Gaps: Personnel health section with 30/60/90 expiration buckets (Member, ingested); transfers in/out ledger (MbrTransfer, new); last-attended and 8-week absence count (AttendanceLog*, new); vacant-essential-seat and multi-hat counts (DutyPosition + Commanders, ingested); meeting info on the header (OrgMeetings, new).

**Public Affairs Officer**
- Jobs: who earned what this week while it is news; exact name-grade-award-date; upcoming milestones for ceremony lead time; bragging points; clean exports.
- Gaps: Recognition feed from nightly extract diffs (CadetRank/Achv/Awards + SeniorLevel/Awards, ingested, needs diff infra); approaching-milestone watchlist (ingested); recent-milestones report with copy-ready lines (ingested); first o-flight and encampment completion events (OFlight + CadetActivities, ingested); Squadron of Merit standing (OrgSquadron_Of_Merit, new, contested).

### 2.3 HQ echelons

**Group Commander (8 squadrons)**
- Jobs: rank squadrons and spot the sliders; target the monthly staff-assist visit; commanders-call one-screeners; verify follow-through; find the model squadron.
- Gaps: month-over-month deltas with magnitude in the comparison table (retained nightly snapshots, infra); attendance trend column as the early-warning (AttendanceLog*, new); safety compliance per squadron (SafetyBriefings*, new); meeting info for visit planning (OrgMeetings, new); transfer flow in retention diagnostics (MbrTransfer, new).

**Wing Commander (~1,500 members, 40 units, quarterly user)**
- Jobs: wing direction since last quarter; the outlier units; a defensible one-page summary; command health; compliance exposure.
- Gaps: 12-month trend lines and quarter deltas (retained snapshots, infra); exceptions-first "units needing attention" strip above the table (ingested); engagement early warning per unit (new); command health view, vacant seats and time-in-command (Commanders + DutyPosition, ingested); safety compliance column (new).

**Wing Director of Cadet Programs**
- Jobs: encampment slate months ahead; pipeline health and stall points; milestone award tracking; CAC representation; dying-program detection.
- Gaps: forward-looking encampment eligibility pool (CadetAchv + CadetActivities, ingested); milestone funnel at wing scope (CadetAwards + CadetAchv + CadetPhase, ingested); Cadet Programs section on Unit Overview (ingested); attendance early warning to triage the stalled 315 (new); CAC vacancy flags in the org chart (CadetDutyPositions, ingested).

**Wing Director of Emergency Services**
- Jobs: what can Michigan field tonight; aircrew depth vs airframes; SET coverage; SPOFs; the expiration wave.
- Gaps: gate the capability sentence on operational currency (MemberCurrency, new); 30/60/90 expiration wave forecast with SPOF-when-expired flags (MbrAchievements, ingested); aviation strip, airframes and sortie activity (aircraft/AcfGrp + CapFlt, new, deferred); safety-currency line inside fieldability (new).

**Wing Director of Professional Development**
- Jobs: level distribution per unit; moderated-module demand with quorum math; the approval queue; track/duty mismatches wing-wide; PD-blocked promotions.
- Gaps: PD section on Unit Overview plus a PD column in the comparison table (SeniorLevel + PL_*, ingested); module demand board by group (ingested); aging approval queue, oldest first (ingested); stalled-progression early warning, no task credit in 6 months (ingested).

**Region Commander**
- Jobs: compare wings honestly; vacant commands region-wide; asset allocation by utilization; pre-visit briefs; award and program compliance.
- Gaps: echelon-aware scoreboard, one row per wing with drill-down (Organization + ORGStatistics, ingested, aggregation change); command health board with time-in-command (Commanders, ingested); flying utilization by wing and tail (CapFlt + aircraft, new, deferred); transfer leakage view (MbrTransfer, new); participation trend per wing (AttendanceLog*, new).

### 2.4 Members

**Cadet Senior Airman (15, phone-only)**
- Jobs: what is left for the next achievement; TIG date and HFZ status before the board; o-flight tracker; pacing context without a leaderboard; all in under a minute on a phone.
- Gaps: My Progress card as the signed-in landing (CadetAchv/Rank/Phase/HFZ + CdtAchvEnum, ingested); o-flight syllabus tracker (OFlight, ingested); anonymous percentile pacing line (aggregates, ingested); meeting info (OrgMeetings, new); attendance streak (AttendanceLog*, new). Screenshot-safe: the shareable card must never include other cadets' data.

### 2.5 Specialists (constraints and platform)

**Wing IT Officer / deployer**
- Jobs: ingest health that explains itself; boring upgrades; config-only wing setup from the public MIT repo; announcements without redeploy; audit answers.
- Gaps: admin-authored announcements plus release notes baked from CHANGELOG at build time (infra); brand asset slot, config or volume mounted, neutral placeholder default (infra); self-explaining data-age popover with configurable threshold (infra); MemberPrm as advisory display only, admin-gated (new, deferred).
- Constraints: never commit or runtime-fetch the trademarked CAP logo or licensed fonts; do not change routes or URL filter params; extend, never fork, the REST API; announcements reuse the existing Markdown neutralization; MemberPrm is never a direct authorization source.

**Product design (HIG discipline)**
- Direction: 10-second verdict on Unit Overview; one Needs Attention queue replacing three callout boxes; unit masthead done once (charter number, name, meeting line); sparklines over color confetti in Mode C; neutral as-of chip; roster row discipline. Constraint: an enforced rest-state budget per collapsed section (one score, one state word, one alert count) or v3 is v2 with nicer fonts; collapsed headers must carry live status so collapse never conceals an alarm; typography is a now decision because tabular numerals are load-bearing for layout.

**Design systems (tokens, WCAG AA)**
- Direction: two-layer token architecture, CAPR 110-3 primitives plus 20% tints under semantic roles; Tone enum collapses from 10 hues to neutral/accent/warning/critical; success is the quiet absence of color; threshold-driven status tokens for the data-age chip; 4px grid, 3 radius tokens, 2 elevation levels. Constraints: Silver Gray fails AA as text and may only be borders/dividers/disabled; Air Force Yellow never carries white text and is never itself text on white; never fabricate the CAP seal; fonts are system stack or a vendored OFL face, final call flagged for the owner's Brand Portal check.

**React/Tailwind implementation lead**
- Direction: the rainbow lives in about six lookup tables; token PR first (CSS custom properties through the Tailwind theme), then CI grep-ban on off-brand hues, then independent PRs for Layout chrome, CollapsibleSection primitive (status chip in header, localStorage persistence, lazy mount), platform Home, a 60-line SVG sparkline, and per-page sweeps. Constraints: tone maps stay literal class strings for the Tailwind scanner; delete the unused chart.js/react-chartjs-2 deps; keep html2canvas/jspdf behind dynamic import; never a big-bang branch.

**Mobile / PWA**
- Direction: design at 390px first; below 768px rosters render as member cards, chrome collapses to one row plus a scope chip and bottom sheets, bottom tab bar for thumb reach; PWA installability with an app shell and stale-while-revalidate caching of GET /api reads only; My Readiness is the mobile anchor; 44px minimum touch targets as a pass, not per page. Constraints: service worker never touches /auth, /admin, or POST; caches cleared on logout; the maskable PWA icon uses the configurable logo slot, never a cropped Flying V; no native app for v2.x.

**Security and privacy**
- Direction: server-side authorization is the only boundary; compute a position lens at session bootstrap (email to member to duty positions to unit subtree) and use it for module ordering now, API scoping later; announcements are a constrained admin write surface (fixed schema, sanitized render, CSRF, audit-logged); attendance ingests minors-safe (aggregate bands on rosters, dated history only in the profile modal, guests as counts only); safety is the pilot duty module. Constraints: no runtime SVG logo upload, config-mounted asset only; never place per-cadet dated attendance and meeting location on the same broadly visible surface (pattern-of-life for a named minor); role awareness is personalization, not access control, until server-side scoping ships, and the plan must say so.

**CAPWATCH feasibility**
- Ingest ranking: 1 AttendanceLog* (precompute aggregates; "attendance not logged" state mandatory), 2 OrgMeetings (near-zero cost), 3 SafetyBriefings* (rolling ~15-month rowFilter), 4 MbrTransfer (corrects metrics already on the page), 5 MemberCurrency (completes the aircrew card; validate TOL semantics with a real aircrew member), 6 CapFlt/aircraft (post-sign-off roadmap). Do not ingest the logistics family in this cycle; skip OrgSquadron_Of_Merit; defer MemberPrm. Write allowlists from the CAPWATCH_Table_Structure.pdf that ships in every zip, never guessed headers.

**Product Manager**
- Direction: 2.0 is the release where the app knows your unit: freeze new ingest at OrgMeetings, re-skin under brand restraint, personalized Home; attendance is the 2.1 headline, safety 2.2. Build the Admin usage panel at cutover and define the success metric in the plan (e.g. 150+ distinct 60-day actives, 20+ units viewed weekly). Constraints: no desktop hamburger (148 users of six-tab muscle memory); any 2.0 ingest beyond OrgMeetings stalls sign-off; scarlet saturation is a brand violation and a morale problem before any wing-wide announcement.

---

## 3. Kill list (owner's law applied; deduplicated across personas)

Kill outright:

1. Home gradient hero, its four stat tiles, and the three role cards (owner-rejected; duplicates Unit Overview and the nav; the only purple in the app).
2. Every off-brand hue (indigo, purple, emerald, orange, teal, rose): collapse to the semantic intents in the token PR, then CI grep-ban the raw class names.
3. Decorative category tinting: green seniors / yellow cadets / blue scope tiles, pastel capability cards, tinted qualification blocks. Category is not a status.
4. The scarlet "Data 31h old (stale)" badge as the default state. Replace with a neutral "as of" chip; scarlet only on confirmed ingest failure; threshold configurable.
5. The six-dot E&T level strip on roster rows (encodes the level three times, illegible, color-only). Plain text: "Level 3, 2 tasks to L4".
6. The wing-wide honor-credit sum tile (vanity aggregate; honor credit stays per cadet in row and modal).
7. Scattered amber warning triangles on duty and track chips. One per-row discrepancy indicator that states its meaning, or nothing.
8. Weighted-composite methodology fine print printed under every score. Move to an info popover.
9. "Click to filter" caption microcopy inside tiles. Affordance by hover/selected state.
10. The unused chart.js and react-chartjs-2 dependencies (declared, imported nowhere).
11. Runtime logo upload as a concept. Config or volume-mounted asset only (SVG upload is stored XSS in waiting).
12. AttendanceLogGuest names, ever. Counts per meeting only; guests are often minors with no membership consent.
13. The org chart canvas on phones (two-axis scroll, no touch pan). Below the large breakpoint it becomes a collapsible position list; the tree stays for desktop and export.

Demote or retune:

14. Google Workspace adoption: from a full scarlet-barred Unit Overview section (and its 48-row wing table) to a collapsed, neutral, admin-leaning section or report. It is an IT rollout metric, not readiness.
15. Specialty-track and duty chip walls on Seniors: primary plus "+N", full list in the profile modal.
16. The ES training-pipeline acronym chip cloud: a ranked count list inside the Deep Dive.
17. The "Close: 219" tile as currently defined (flags a third of the wing; discriminates nothing). Retune to TIG-eligible within 30 days and requirements substantially complete, or cut.
18. The "90+ days since promotion: 315" tile without phase-aware context (flags the majority; trains people to ignore it).
19. The Phases four-circle tile: a filter or one thin segmented bar; not a headline.
20. ES active/training badge columns on the Cadets roster: profile modal.
21. The aircrew deficit card at squadron echelon: show only where aircrew is in the unit's mission set.
22. The aggregate ES capability sentence at HQ scope ("can field 27 ground teams" is operationally fictional across squadrons): lead with the comparison board, keep the sentence per unit.
23. Reports: the 20 identical Generate buttons and 20-color icon set: whole card is the tap target, monochrome Symbol Blue icons, one filter row, searchable list.
24. The second header row on mobile: unit selector, sub-units checkbox, and data-age badge fold into one scope chip plus bottom sheet.
25. Wing-wide default scope for ordinary viewers: keep for launch parity, but the plan names default-own-unit scoping as the committed follow-up, not open-ended roadmap.
26. MemberPrm as a future authorization source: advisory display at most, admin-gated, deferred.
27. OrgSquadron_Of_Merit ingest: deferred; a standing indicator only if the owner wants it after 2.2 (PAO and group commander interest vs feasibility's "vanity number" call).

---

## 4. Duty-module ranking

Value rank blends breadth of persona demand, decision value, and cost (zero-ingest work ranks above new ingest at equal demand). "New ingest" tables all ship in every nightly CAPWATCH zip; none require new integrations.

| Rank | Module | Serves | Data source | New ingest | Release |
|---|---|---|---|---|---|
| 1 | Needs Attention queue (Commander's Brief): one ranked action list atop Unit Overview, replacing the three callout boxes; calm empty state | Commanders, deputies, every echelon | Computed from ingested Member, DutyPosition, MbrAchievements/MbrTasks, SpecTrack, Training | No | 2.0 |
| 2 | Participation and engagement: unit attendance trend, quiet-members early warning, fading flags on rosters, guest counts | ~20 personas: commanders at all echelons, 1SG, R&R, admin, deputies, PDO, ES | AttendanceLogMeeting/Attendee, Guest as counts only | Yes | 2.1 headline |
| 3 | Promotion blocker engine: named blocking requirement per cadet, blocker rollup tiles, Test Night view, HFZ-before-TIG collision, awaiting-approval bucket, senior duty-performance leg, Board Packet export | DC Cadets, DC Seniors, testing officer, cadet commander, 1SG, wing DCP/DPD | CadetAchv/Aprs, CdtAchvEnum, CadetHFZInformation, CadetRank, PL_*, MbrTasks, DutyPosition, SeniorLevel | No | 2.0 |
| 4 | My Progress personal card: session email to member match; own checklist, next action, TIG countdown, HFZ, o-flights; acronym expansion | Every member (cadets and seniors), new members especially | MbrContact + CadetAchv/Rank/Phase/HFZ, OFlight, PL_*, MbrTasks, SeniorLevel | No | 2.0 |
| 5 | Meeting info masthead: unit meeting day, time, location on the header and My Progress card | Everyone, plus prospective members and parents | OrgMeetings | Yes (the only 2.0 ingest) | 2.0 |
| 6 | Personnel and roster health: 30/60/90 expiration buckets, transfers ledger, vacant-essential-seat and multi-hat counts | Admin officer, commander, R&R, logistics, group/wing | Member, DutyPosition, Commanders (ingested) + MbrTransfer (new) | Partial | 2.0 core, transfers 2.2 |
| 7 | Safety currency (Currency Watch): Current/Lapsing/Delinquent per member, one honest unit number, ES fieldability flag, trend | Safety officer, commanders, ES, wing/region compliance | SafetyBriefingsMonthly/Quarterly/List (rolling window) | Yes | 2.2 |
| 8 | Command deck: echelon-aware scoreboard with deltas, sparklines, exceptions-first strip, drill-down | Group, wing, region commanders | ORGStatistics + retained nightly snapshots (infra) | No (snapshot retention) | 2.0/2.1 |
| 9 | Professional Development: levels funnel, Teach This Next demand panel, aging approval queue, track/duty mismatches, PD comparison column | PDO, wing DPD, commanders | SeniorLevel, PL_*, SpecTrack, DutyPosition, Training | No | 2.1 |
| 10 | ES fieldability and training planner: currency-gated capability counts, expiration wave forecast, SQTR rollup, evaluator matching, per-capability drill (incl. ICUT/comms) | ES officers, comms officer, wing DES | MbrAchievements/MbrTasks/AchvStep* (ingested) + MemberCurrency (new) | Partial | forecast 2.0, currency 2.2 |
| 11 | Recognition feed: dated milestone events from extract diffs, copy-ready lines, approaching-milestone watchlist | PAO, cadet commander, commanders, members | Diffs of CadetRank/Achv/Awards/Activities, SeniorLevel/Awards, OFlight | No (diff infra) | 2.1 |
| 12 | Cadet pipeline funnel and encampment readiness: Joined to Spaatz flow with conversion and time-in-stage; eligible-never-attended slating pool | Wing DCP, DC Cadets, commanders | CadetAchv, CadetAwards, CadetActivities, CadetRank, CadetPhase | No | 2.1 |
| 13 | Aerospace Education block: cadet module currency, Yeager coverage, o-flight coverage; three numbers | AEO, commanders | CadetAchv, SeniorAwards/Training, OFlight | No | 2.1 |
| 14 | Command health board: vacant commands, acting commanders, time-in-command | Wing and region commanders | Commanders, DutyPosition, Organization | No | 2.1 |
| 15 | Aviation and ops strip: airframes, sorties, hours, per-tail activity; renders only where flight records exist | Wing DES, region, flying units | CapFlt, aircraft, AcfGrp | Yes | Deferred (post 2.2) |
| 16 | Logistics: vehicles ready/down, property book, gear-at-risk on separation | Logistics officer, comms (equipment) | vehicles*, equipment*, property | Yes | Contested; owner decision (see conflicts) |

---

## 5. Page requirements (condensed)

**Home (platform page).** My Progress card first (the mirror), My Unit card (name, charter, one-line health, meeting night), admin-authored announcements, baked release notes, recognition feed in 2.1. Version bottom-left, GitHub link bottom-right. Nothing that replicates Unit Overview.

**Unit Overview.** Needs Attention queue on top; calm masthead (charter number, unit name, meeting line); collapsible duty modules with status-bearing headers, ordered by the viewer's position lens; scores keep visible-math popovers; capability sentence leads the ES section; SPOF shows the position at rest, the name on drill-down; Mode C becomes the command deck; explicit "no data recorded" states.

**Seniors.** Roster row discipline (plain-text level, primary track plus "+N", tabular numerals); promotion column computes the duty leg or is labeled "TIG + E&T only"; Teach This Next and approval-queue panels; attendance recency column in 2.1; Board Packet export from the profile modal.

**Cadets.** Blocker chip per row; blocker rollup tiles replace Ready/Close as defined; Test Night saved view; milestone radar; awaiting-approval status; HFZ collision flag; fading filter in 2.1; parent-shareable single-cadet export, PII-minimal by construction.

**Reports.** Catalog stays, becomes a searchable list; new entries: Safety Compliance, ICUT Status, Quals Expiring 90 Days, Guest Follow-Up (counts), Transfers Ledger, Recent Milestones, Board Packets; every export prints its as-of date; identifier columns opt-in on exports.

**Org Chart.** Vacancy toggle stays and gains CAC-rep vacancies; mobile gets the position list; toolbar buttons go quiet secondary.

**Admin.** Announcements authoring (fixed schema, sanitized, CSRF, audited); usage panel from access logs, live at cutover; staleness threshold and admin contact settings; runs table collapses to cards on phones.

**Chrome.** Single-row top bar; configurable logo slot with neutral placeholder; charter-number-first unit selector with sub-units folded in; neutral as-of chip with an explanatory popover; hamburger below the tablet breakpoint only, six tabs stay on desktop.

---

## 6. Conflicts surfaced (and the recommended resolution)

1. **Breadth vs restraint.** The owner wants both "every duty position finds something" and "less is more". Resolution: collapsible position-lens modules with a hard rest-state budget (one score, one state word, one alert count per collapsed header). The page composes itself per viewer; it never grows for everyone at once. This budget is a rule in the plan, not a vibe.
2. **Hamburger menu.** The owner asked for tabs to collapse into a hamburger; PM, design, and implementation all warn that hiding six tabs on desktop burns 148 users of muscle memory. Resolution: hamburger below the tablet breakpoint only, unit selector moves into the freed top-bar space; flagged explicitly for the owner at sign-off.
3. **Logistics ingest.** The logistics officer (and partly comms) wants the vehicles/equipment/property family; the feasibility specialist calls it six tables of scope creep for one officer against a system of record (ORMS) the wing already runs. Resolution: excluded from 2.0-2.2; presented to the owner as an explicit post-sign-off roadmap decision.
4. **Logo handling.** The IT persona proposed an Admin upload slot; security vetoes runtime SVG upload as the cheapest stored-XSS path in an app with no user content. Resolution: config or volume-mounted asset, neutral placeholder default. Red flags are constraints; security wins.
5. **Named SPOF callouts.** ES personas call the named single-point-of-failure banner the most actionable thing in the product; admin, comms, group, wing, and region personas call a wing-visible named callout a morale grenade. Resolution: position at rest, name on drill-down, counts only above the member's own unit scope; names never on exports or screenshot-friendly summaries.
6. **Wing-wide visibility.** PM keeps v1-parity visibility for launch speed; security, cadet, and DCP personas call per-unit scoping a hard prerequisite for minors' data, and attendance/drift features raise the stakes. Resolution: 2.0 ships the position lens as personalization only (stated plainly, not marketed as access control); default-own-unit scoping is a committed, named 2.x deliverable that must land before cadet logins are promoted or drift lists broaden.
7. **2.0 scope vs the biggest gap.** Attendance is the most demanded data across all personas, but the PM's sign-off analysis says any 2.0 ingest beyond OrgMeetings stalls the review. Resolution: 2.0 freezes the dataset; attendance is the named 2.1 headline in the same plan, so the owner approves the ambition without buying it all at once.
8. **Score vs sentence.** The wing commander wants composite scores with visible math; the wing DES insists the plain-language capability sentence is the truth and the score must never outrank it. Resolution: the sentence leads every ES surface; scores keep a one-tap "how this is computed" breakdown and never appear without it.
9. **Home real estate.** Platform voice (IT/PM), recognition feed (PAO), and personal progress (members) all claim Home. Resolution: mirror first (My Progress), unit facts second (My Unit card), platform voice third (announcements, release notes); the recognition feed joins in 2.1 when diff infrastructure exists.
10. **Data-age badge.** The safety officer calls the badge load-bearing for compliance; nearly everyone else says the scarlet default cries wolf. Resolution: the badge stays on every page but goes neutral by default, escalates by configured threshold, and prints as-of dates on every export, which serves the compliance case better than a permanent alarm.

---

## 7. Mobile strategy (summary)

Phone-first at 390px. Below 768px: rosters render as member cards (name plus the two or three verdict-bearing fields, tap-through to the profile sheet), chrome collapses to one row with a scope chip opening a bottom sheet, filters move to a full-height sheet with an applied-count badge, and a bottom tab bar covers Home, Unit, Seniors, Cadets, More. Unit Overview's collapsible sections are the mobile navigation: collapsed by default, status-bearing headers, Needs Attention first. The org chart becomes a position list. Touch targets get a single 44px pass.

Ship PWA installability in v2.x: manifest with Symbol Blue theme, maskable icon from the configurable logo slot, app-shell precache, stale-while-revalidate on GET /api reads only (never /auth, /admin, or POST; caches cleared on logout). The nightly-extract model makes offline honest: last night's numbers plus the as-of chip. The mobile anchor is My Progress: a member opens their own status card in one thumb-scroll, which is the experience eServices structurally cannot offer on a phone. No native app for v2.x; web push for expiring quals is available later on installed PWAs.

Canonical mobile moments the design must pass: a commander in the parking lot reading the Needs Attention queue in ten seconds; a cadet checking their next requirement one-handed on the way to the meeting; an ES officer confirming fieldability at a 2100 callout; a safety or testing officer working a hallway list off a phone before formation.
