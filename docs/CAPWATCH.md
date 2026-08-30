# CAPWATCH ingestion reference

## What CAPWATCH is

CAPWATCH is the bulk data-extract facility of eServices. One HTTP GET returns one zip containing the full membership and operational dataset for an organization and (optionally) everything subordinate to it. No deltas, no pagination.

```
GET https://www.capnhq.gov/CAP.CapWatchAPI.Web/api/cw?ORGID=<orgid>&unitOnly=0
Authorization: Basic base64(eservices_username:eservices_password)
```

- `ORGID` is the eServices internal organization key, **not** the charter number. Find it in `Organization.txt` or the eServices CAPWATCH download page (the dropdown option value is the ORGID).
- A `403` means bad entitlement OR a charter number in the ORGID slot OR a lapsed annual attestation; eServices does not distinguish.
- Download permission requires the annual CAPWATCH Security course and a self-attestation approved by your commander. When it lapses, downloads stop with 403s. Put the renewal on a calendar.
- NHQ blocks downloads daily 00:00-02:30 Central. The default fetch schedule (04:00 Eastern) clears it.

## What v2 ingests

The authoritative registry is `server/src/ingest/tables.ts`: exact filenames, per-column allowlists, and target types. Files not registered are skipped and logged. Columns not allowlisted are dropped and never stored; that includes `Member.txt`'s `SSN`, `Gender`, `Profession`, `EducationLevel`, `Citizen`, and `Ethnicity` columns. Address, attendance, safety, and logistics tables are not ingested.

Parsing rules:

- Header-name based, never positional. CAPWATCH inserts columns over time (13 additions 2017-2026); positional consumers break silently.
- RFC 4180 CSV (quoted commas, quoted newlines), CRLF line endings, optional BOM.
- `01/01/1900` is the CAPWATCH null-date sentinel; it becomes NULL.
- `DoNotContact` is honored by anything that would ever contact members.
- `DutyPosition.ORGID` is where the duty is held, which may differ from the member's home unit. Org scoping always joins through `members.orgid`.

## Adoption sideload (optional, not CAPWATCH)

Two CSVs feed the Google Workspace adoption view if you have them; most wings will not. Contract (headers verbatim):

```
GoogleAdoptionStats.csv: Unit,RosterCount,TotalAccounts,ActiveUsers,RecentLogin,GmailActive,DriveActive,AdoptionRate,CollectionDate
GoogleAdoptionUsers.csv: Unit,Email,FullName,IsActiveUser,HasRecentLogin,LastLoginDate,HasGmailActivity,HasDriveActivity,CollectionDate
```

Upload via Admin > Ingest > Adoption CSVs. The dashboard section renders only when data exists.

## PII

The extract carries names, CAP IDs, dates of birth, home addresses, phone numbers, and parent/guardian contact details; roughly half of CAP's membership are cadets, who are minors. v2 stores only what it renders, never persists the raw zip, never quotes row content into logs, and field-gates DOB and parent contact to admin users. Keep every deployment behind authentication, use TLS for anything non-localhost, and treat database backups as PII (encrypt, cap retention).
