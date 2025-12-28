# CAP Readiness Hub

A Google Apps Script web application for Civil Air Patrol units to track member readiness, cadet progression, senior member qualifications, and emergency services status.

Designed primarily for Wings and below, this tool provides dashboards and analytics based on CAPWATCH data exports.

## Features

- **Home Dashboard** - At-a-glance overview of unit health and key metrics
- **Senior Member Dashboard** - Education & Training levels (1-5), ES qualifications, promotions
- **Cadet Dashboard** - Rank progression, phase milestones, HFZ tracking, achievements
- **Unit Overview** - Staff coverage, duty position tracking, recruiting/retention metrics
- **ES Readiness** - Emergency Services team composition, qualification tracking, skill evaluator coverage
- **Org Chart** - Visual organizational hierarchy with metrics overlay
- **Reports & Export** - PDF and data exports for unit analysis

## Prerequisites

- Google Workspace account
- Access to CAPWATCH data exports for your unit
- A Google Drive folder with your CAPWATCH exports (automated daily sync recommended)

## Quick Start

### 1. Copy the Project Files

Copy all the project files to a new Google Apps Script project:
1. Go to [script.google.com](https://script.google.com)
2. Create a new project
3. Copy each file from this repository into the project

### 2. Configure Required Settings

Edit `Code.gs` and update these constants:

```javascript
// REQUIRED: Replace with your Google Drive folder ID containing CAPWATCH exports
const SOURCE_FOLDER_ID = 'YOUR_SOURCE_FOLDER_ID';

// REQUIRED: Replace with a new Google Sheet ID for data storage
const DB_SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

// REQUIRED: Customize for your unit
const APP_NAME = 'Your Wing Readiness Hub';
```

**Finding IDs:**
- **Folder ID**: Open your Drive folder, copy from URL: `https://drive.google.com/drive/folders/{FOLDER_ID}`
- **Spreadsheet ID**: Create a new Google Sheet, copy from URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

Also update `ConfigConstants.html` line 5 to match your APP_NAME.

### 3. Run Initial Data Sync

1. In the Apps Script editor, select `syncDriveToSheet` from the function dropdown
2. Click **Run**
3. Authorize the required permissions when prompted
4. Wait for the sync to complete (check the Execution Log)

### 4. Deploy as Web App

1. Click **Deploy** > **New deployment**
2. Select type: **Web app**
3. Configure:
   - Execute as: **Me**
   - Who has access: **Anyone with access** (or restrict to your organization)
4. Click **Deploy** and copy the web app URL

### 5. Set Up Automated Sync (Recommended)

1. In Apps Script, click the clock icon (Triggers)
2. Click **+ Add Trigger**
3. Configure:
   - Function: `syncDriveToSheet`
   - Event source: Time-driven
   - Type: Hour timer
   - Interval: Every hour
4. Save

## CAPWATCH Data Requirements

The app expects these CAPWATCH export files in your source folder:

### Configuration Files
- `PL_Paths.txt` - Level path definitions
- `PL_Groups.txt` - Task groups
- `PL_Tasks.txt` - Task definitions
- `PL_TaskGroupAssignments.txt` - Task-to-group mappings
- `CdtAchvEnum.txt` - Cadet achievement enumeration
- `Achievements.txt` - ES achievement catalog
- `Tasks.txt` - ES task definitions
- `AchvStepTasks.txt` - ES achievement prerequisites
- `AchvStepAchv.txt` - ES achievement dependencies

### Member Data Files
- `Member.txt` - Member demographics
- `Organization.txt` - Unit/organization hierarchy
- `DutyPosition.txt` - Senior member duty assignments
- `CadetDuty.txt` - Cadet duty assignments
- `SeniorLevel.txt` - Legacy senior level completions
- `SpecTrack.txt` - Specialty track enrollments
- `MbrCommittee.txt` - Committee assignments
- `MbrContact.txt` - Member contact info
- `MbrAchievements.txt` - Member ES achievements
- `MbrTasks.txt` - Member ES task completions
- `PL_MemberTaskCredit.txt` - Member task completions
- `PL_MemberPathCredit.txt` - Member path progress

### Cadet-Specific Files
- `CadetRank.txt` - Cadet rank history
- `CadetAchv.txt` - Cadet achievements
- `CadetAchvAprs.txt` - Cadet achievement approvals
- `CadetActivities.txt` - Cadet activity participation
- `CadetHFZInformation.txt` - Physical fitness test results
- `CadetPhase.txt` - Phase progression
- `CadetAwards.txt` - Cadet awards

### Additional Files
- `Training.txt` - Training records
- `SeniorAwards.txt` - Senior member awards
- `OFlight.txt` - Orientation flight records
- `ORGStatistics.txt` - Organizational statistics

## Optional: GitHub Feedback Integration

The app includes an optional feedback feature that creates GitHub issues. To enable:

1. Create a GitHub personal access token with `repo` scope
2. In Apps Script: **Extensions** > **Apps Script** > **Project Settings** > **Script Properties**
3. Add property: `GITHUB_TOKEN` = your token
4. Update `Code.gs`:
   ```javascript
   const GITHUB_OWNER = 'your-github-username';
   const GITHUB_REPO = 'your-repo-name';
   ```

## Optional: Cadet Rank Insignia Images

The cadet dashboard displays rank insignia. By default, these use placeholder Google Drive image IDs.

To use your own images:
1. Upload rank insignia images to Google Drive
2. Make them viewable by anyone with the link
3. Update the `CADET_RANK_INSIGNIA` object in `ConfigConstants.html` with your file IDs

To disable images, set the values to empty strings.

## CAP Terminology Glossary

### Rank Structure
- **Officer ranks**: 2d Lt, 1st Lt, Capt, Maj, Lt Col, Col
- **Enlisted ranks**: SSgt, TSgt, MSgt, SMSgt, CMSgt
- **Cadet ranks**: C/Amn through C/Col

### Cadet Program
- **Phases I-V**: Learning, Leadership, Command, Executive, Spaatz
- **Milestones**: Wright Brothers (4), Billy Mitchell (10), Amelia Earhart (14), Ira C. Eaker (20), Carl A. Spaatz (21)
- **HFZ**: Healthy Physical Fitness zone test
- **TIG**: Time in Grade (56 days minimum between ranks)

### Senior Member Programs
- **Levels 1-5**: Professional development pathway
- **Specialty Tracks**: Additional certifications (AE, CP, ES, etc.)

### Emergency Services
- **GES**: General Emergency Services (foundational qualification)
- **SET**: Skills Evaluator Training
- **Team types**: Ground Teams, Aircrew, sUAS, Mission Base, Command Staff
- **Status**: ACTIVE, TRAINING, EXPIRED

## Troubleshooting

### "Database sheet not found" error
Run `syncDriveToSheet` manually from the Apps Script editor.

### Data not updating
- Check that CAPWATCH files are in your source folder
- Verify the sync trigger is running (check Executions in Apps Script)
- Clear the app cache by running `syncDriveToSheet` again

### Slow initial load
The first load after sync may take a few seconds to build the cache. Subsequent loads will be faster.

### Missing CAPWATCH files
The app logs warnings for missing files but continues to function. Check the Apps Script execution logs for details.

## Contributing

Issues and pull requests are welcome! Please:
1. Open an issue to discuss major changes
2. Follow the existing code style
3. Test your changes with actual CAPWATCH data

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

Built for the Civil Air Patrol volunteer community to help units track readiness and member development.

---

*This project is not officially affiliated with Civil Air Patrol National Headquarters.*
