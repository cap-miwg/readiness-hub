# Migrating from v1 (Apps Script) to v2

v1 is the Google Apps Script + Google Sheets application, last released as `v1.11.0`. It remains available on the `v1.11.0` tag and keeps working where it is deployed; v2 does not touch a v1 deployment. v2 is a different product operationally: a containerized service you run (laptop, VM, cloud) instead of a script you copy into script.google.com.

## What carries over

- The CAPWATCH data contract: one zip from eServices, fetched daily or uploaded by hand. Same endpoint, same credentials, same annual attestation requirement.
- The six-tab UX: Home, Unit Overview, Senior Dashboard, Cadet Dashboard, Reports, Org Chart, plus the unit selector and Sub-Units toggle.
- The domain rules: cadet promotion requirements, senior E&T levels, ES qualifications, team readiness, awards tracking. Ported from v1 source with the corrections below; the v1 constant tables were extracted mechanically from v1 code, not retyped.
- Sign-in with your Wing Google account (now standard OIDC instead of Apps Script domain deployment).
- In-app feedback (now stored in the app's database, optionally mirrored to GitHub issues).

## Rule corrections (v1 values were wrong; v2 cites the source)

Promotion rules, per CAPR 35-5 (22 Nov 2016) Figures 2, 8, 9, 10:

| Rule | v1 | v2 |
|---|---|---|
| Capt -> Maj | 36 months | 48 months (fig 2: 4 years) |
| Maj -> Lt Col | 48 months | 60 months (fig 2: 5 years) |
| SM -> 2d Lt | immediate | requires 6 months as a member (fig 2) |
| SFO -> Capt | immediate | 30 months as 1st Lt or SFO (fig 2) |
| Lt Col -> Col | 60 months, Level 5 | removed: Colonel is a special appointment (section 3.2), not a duty-performance promotion |
| MSgt duty requirement label | "Unit NCO" | "Squadron/Flight NCO" (fig 9 wording) |

Consequence: v1 showed Captains and Majors promotable a year early and new SMs and SFOs immediately promotable. v2 numbers will be lower and correct.

Also fixed: the internal SET/ICUT constant mixup (v1 carried a knowingly wrong `SET: '217'`; v2 uses SET=124, ICUT=217, which is what the v1 computation actually used).

## Deliberate behavior changes

- Cadet date of birth and parent/guardian contact render only for admin users in v2.0. Viewers see computed age (every age gate needs only age). v1 showed both to every authenticated domain user.
- The data-age banner shows the extract's own generation time (`DownLoadDate.txt`), not the last sync time. A stale extract now looks stale.
- Unit exclusions (v1 hardcoded `000`/`004`) and included member types are configuration. Defaults: exclude units `000` and `999`; include CADET, SENIOR, LIFE, FIFTY YEAR.
- Org chart: v1's wing-only Chief of Staff staff hierarchy (Chief of Staff and Senior Enlisted Leader parents over Administration, Personnel, Plans and Programs, Historian, Health Services, IT, Logistics, Public Affairs, Recruiting, Chaplain, Finance, Development) renders flattened in v2.0. Every unit type uses the traditional staff structure, and any duty title that structure does not model (Chief of Staff, Senior Enlisted Leader, advisors, Testing Officer, Historian, Health Services, Plans and Programs, sUAS Officer, Counterdrug, Development/Diversity, and so on) appears under an Other Staff node beneath the commander with the duty title shown, so no duty-holder vanishes from the chart. Group and wing charts also do not render subordinate-unit commander nodes yet (planned).
- Empty states are diagnosable: an ingest that produced zero units says so and why (the v1 adoption failure mode was a silent white screen).
- Admin functions (ingest, settings, logs) exist only for admin-role users. v1 exposed every server function to every authenticated user via `google.script.run`.

## Dropped or deferred

- The IT chatbot webhook notification on feedback (v1 `notifyITChatbot`): dropped. Feedback lives in the app and optionally on GitHub.
- Google Workspace adoption auto-collection (v1 collected Admin SDK metrics inside the app, Michigan-hardcoded): the dashboard section remains, fed by an optional CSV sideload (`docs/CAPWATCH.md` documents the contract). Wings without the sideload simply do not see the section.
- Cadet rank insignia thumbnails (v1 hardcoded 21 Google Drive file IDs): v2 renders grade text.
- `CadetAchvFullReport` is still ingested (it is the approval-date fallback for sentinel-dated approvals).

## For the eventual cutover (not yet)

- v1's GitHub Pages preview workflow was removed on the v2 branch; the Pages site and HUBCAP listing (repository 440) need an update when v2.0 releases.
- The `main` README should gain a banner pointing v1 adopters at the v1.11.0 tag and v2 at the release.
