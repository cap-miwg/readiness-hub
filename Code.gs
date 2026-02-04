/**
 * CAP Readiness Hub - Google Apps Script Backend
 *
 * A web application for Civil Air Patrol units to track member readiness,
 * cadet progression, senior member qualifications, and emergency services status.
 *
 * Data source: CAPWATCH exports synced to a Google Drive folder
 *
 * Setup Instructions:
 * 1. Run setupScriptProperties() once to initialize default property values
 * 2. Go to Extensions > Apps Script > Project Settings > Script Properties
 * 3. Configure required properties:
 *    - SOURCE_FOLDER_ID: Google Drive folder ID containing CAPWATCH exports
 *    - DB_SPREADSHEET_ID: Google Sheet ID for data storage
 *    - APP_NAME: Your unit name (e.g., "Michigan Wing Readiness Hub")
 * 4. (Optional) Configure GitHub integration:
 *    - GITHUB_TOKEN: Personal access token with 'repo' scope
 *    - GITHUB_OWNER: Your GitHub username or organization
 *    - GITHUB_REPO: Repository name (default: "readiness-hub")
 * 5. (Optional) Configure IT Chatbot integration:
 *    - CHATBOT_WEBAPP_URL: URL to the IT Chatbot web app
 *    - CHATBOT_API_KEY: API key for the chatbot
 * 6. Deploy as web app and set up hourly trigger for syncDriveToSheet()
 *
 * See README.md for detailed setup instructions.
 */

// --- CONFIGURATION VIA SCRIPT PROPERTIES ---
// All configuration is stored in Script Properties for security.
// Access via: Extensions > Apps Script > Project Settings > Script Properties

/**
 * Get a configuration value from Script Properties
 * @param {string} key - The property key
 * @param {string} defaultValue - Default value if property not set
 * @returns {string} - The property value or default
 */
function getConfig(key, defaultValue) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value !== null ? value : defaultValue;
}

/**
 * Get required configuration - throws error if not set
 * @param {string} key - The property key
 * @param {string} friendlyName - Human-readable name for error message
 * @returns {string} - The property value
 * @throws {Error} - If property is not configured
 */
function getRequiredConfig(key, friendlyName) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value || value === 'YOUR_' + key || value.startsWith('YOUR_')) {
    throw new Error(friendlyName + ' is not configured. Please set "' + key + '" in Script Properties (Extensions > Apps Script > Project Settings > Script Properties).');
  }
  return value;
}

/**
 * Initialize Script Properties with default values
 * Run this function once to set up the property structure.
 * Then edit the values in Project Settings > Script Properties.
 */
function setupScriptProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const currentProps = scriptProperties.getProperties();

  // Default configuration values - only set if not already configured
  const defaults = {
    'SOURCE_FOLDER_ID': 'YOUR_SOURCE_FOLDER_ID',
    'DB_SPREADSHEET_ID': 'YOUR_SPREADSHEET_ID',
    'DB_SHEET_NAME': 'DB',
    'LOGS_SHEET_NAME': 'Logs',
    'APP_NAME': 'CAP Readiness Hub',
    'GITHUB_OWNER': 'YOUR_GITHUB_USERNAME',
    'GITHUB_REPO': 'readiness-hub',
    'GITHUB_API_URL': 'https://api.github.com'
    // GITHUB_TOKEN, CHATBOT_WEBAPP_URL, CHATBOT_API_KEY should be added manually for security
  };

  let newProps = 0;
  let existingProps = 0;

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!currentProps.hasOwnProperty(key)) {
      scriptProperties.setProperty(key, defaultValue);
      Logger.log('Created property: ' + key + ' = ' + defaultValue);
      newProps++;
    } else {
      Logger.log('Property already exists: ' + key + ' = ' + currentProps[key]);
      existingProps++;
    }
  }

  Logger.log('========================================');
  Logger.log('Setup complete!');
  Logger.log('New properties created: ' + newProps);
  Logger.log('Existing properties kept: ' + existingProps);
  Logger.log('');
  Logger.log('Next steps:');
  Logger.log('1. Go to Extensions > Apps Script > Project Settings');
  Logger.log('2. Scroll down to Script Properties');
  Logger.log('3. Edit the values for your deployment');
  Logger.log('========================================');

  return {
    newProperties: newProps,
    existingProperties: existingProps,
    message: 'Setup complete. Edit values in Project Settings > Script Properties.'
  };
}

/**
 * Display current configuration (for debugging)
 * Masks sensitive values like tokens
 */
function showCurrentConfig() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const sensitiveKeys = ['GITHUB_TOKEN', 'CHATBOT_API_KEY'];

  Logger.log('========== CURRENT CONFIGURATION ==========');
  for (const [key, value] of Object.entries(props)) {
    if (sensitiveKeys.includes(key)) {
      Logger.log(key + ': ' + (value ? '***CONFIGURED***' : 'NOT SET'));
    } else {
      Logger.log(key + ': ' + value);
    }
  }
  Logger.log('==========================================');

  return props;
}

/**
 * Get user's full name from Google Workspace Directory
 * @param {string} userEmail - The user's email address
 * @returns {string} - The user's full name or 'Unknown' if lookup fails
 */
function getUserFullName(userEmail) {
  if (!userEmail || userEmail === 'Unknown') {
    return 'Unknown';
  }

  try {
    const user = AdminDirectory.Users.get(userEmail);
    return user.name.fullName || 'Unknown';
  } catch (err) {
    Logger.log("Could not retrieve full name for " + userEmail + ": " + err.message);
    return 'Unknown';
  }
}

/**
 * Get username from email address (part before @)
 * @param {string} userEmail - The user's email address
 * @returns {string} - The username or 'Unknown' if not available
 */
function getUserNameFromEmail(userEmail) {
  if (!userEmail || userEmail === 'Unknown') {
    return 'Unknown';
  }

  const atIndex = userEmail.indexOf('@');
  if (atIndex > 0) {
    return userEmail.substring(0, atIndex);
  }
  return 'Unknown';
}

function doGet(e) {
  const startTime = new Date();
  const userEmail = Session.getActiveUser().getEmail() || 'Unknown';
  const userName = getUserFullName(userEmail);
  let status = 'SUCCESS';
  let errorMessage = '';
  let errorStack = '';

  try {
    Logger.log("========== WEB APP ACCESS ==========");
    Logger.log("User: " + userName + " (" + userEmail + ")");
    Logger.log("Access Time: " + startTime.toISOString());
    Logger.log("====================================");

    const appName = getConfig('APP_NAME', 'CAP Readiness Hub');
    const htmlOutput = HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle(appName)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    // Log successful access
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    logWebAppAccess({
      timestamp: startTime,
      userName: userName,
      userEmail: userEmail,
      eventType: 'WEB_APP_ACCESS',
      status: status,
      durationSeconds: duration,
      queryString: e && e.queryString ? e.queryString : '',
      parameters: e && e.parameter ? JSON.stringify(e.parameter) : '{}',
      errorMessage: '',
      errorStack: ''
    });

    return htmlOutput;

  } catch (error) {
    status = 'ERROR';
    errorMessage = error.toString();
    errorStack = error.stack || 'N/A';

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    // Log the error
    logWebAppAccess({
      timestamp: startTime,
      userName: userName,
      userEmail: userEmail,
      eventType: 'WEB_APP_ACCESS',
      status: status,
      durationSeconds: duration,
      queryString: e && e.queryString ? e.queryString : '',
      parameters: e && e.parameter ? JSON.stringify(e.parameter) : '{}',
      errorMessage: errorMessage,
      errorStack: errorStack
    });

    Logger.log("ERROR in doGet: " + errorMessage);
    Logger.log("Stack: " + errorStack);

    throw error;
  }
}

/**
 * Include function for modular HTML files
 * Used via <?!= include('filename') ?> in HTML templates
 * Enables breaking up large HTML files into smaller, maintainable modules
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * SYNC FUNCTION (Trigger this to run hourly)
 */
function syncDriveToSheet() {
  const startTime = new Date();
  const executionContext = Session.getActiveUser().getEmail() ? 'Manual' : 'Trigger';
  Logger.log("========== SYNC START ==========");
  Logger.log("Execution Context: " + executionContext);
  Logger.log("Start Time: " + startTime.toISOString());
  Logger.log("User: " + (Session.getActiveUser().getEmail() || 'N/A (Trigger)'));

  try {
    // Clear cache at the start to ensure fresh data is available after sync
    Logger.log("Clearing cache...");
    const cache = CacheService.getScriptCache();
    cache.remove("app-data-payload-v6");
    Logger.log("Cache cleared successfully");
  } catch (e) {
    Logger.log("WARNING: Failed to clear cache: " + e.toString());
  }

  // Get configuration from Script Properties
  const sourceFolderId = getRequiredConfig('SOURCE_FOLDER_ID', 'Source Folder ID');
  const dbSpreadsheetId = getRequiredConfig('DB_SPREADSHEET_ID', 'Database Spreadsheet ID');
  const dbSheetName = getConfig('DB_SHEET_NAME', 'DB');

  Logger.log("Accessing Drive folder ID: " + sourceFolderId);
  const folder = DriveApp.getFolderById(sourceFolderId);
  Logger.log("Folder accessed: " + folder.getName());

  const filesIterator = folder.getFiles();
  Logger.log("Files iterator created");

  Logger.log("Opening spreadsheet ID: " + dbSpreadsheetId);
  const ss = SpreadsheetApp.openById(dbSpreadsheetId);
  Logger.log("Spreadsheet opened: " + ss.getName());

  let sheet = ss.getSheetByName(dbSheetName);

  if (!sheet) {
    Logger.log("Sheet '" + dbSheetName + "' not found, creating new sheet");
    sheet = ss.insertSheet(dbSheetName);
    Logger.log("Sheet created successfully");
  } else {
    Logger.log("Sheet '" + dbSheetName + "' found");
  }

  // Headers: Filename, Category, Key, ChunkIndex, Content, LastUpdated
  const data = [['Filename', 'Category', 'Key', 'ChunkIndex', 'Content', 'LastUpdated']];

  // STRICT FILE MAPPING with priority order
  // We use specific keywords to identify files.
  // 'exclude' ensures we don't mix up DutyPosition with CadetDutyPosition
  // and Member with CurrentMembers
  const fileMap = {
    'PL_Paths': { cat: 'config', key: 'paths', priority: 1 },
    'PL_Groups': { cat: 'config', key: 'groups', priority: 2 },
    'PL_Tasks': { cat: 'config', key: 'tasks', priority: 3 },
    'PL_TaskGroupAssignments': { cat: 'config', key: 'assignments', priority: 4 },
    'CdtAchvEnum': { cat: 'config', key: 'cadetAchvEnum', priority: 5 }, // Cadet achievement enumeration/lookup
    // ES Config Files (Emergency Services)
    'Achievements': { cat: 'config', key: 'esAchievements', exclude: 'Mbr|Cadet', priority: 6 }, // ES achievement catalog
    'Tasks': { cat: 'config', key: 'esTasks', exclude: 'PL_|Mbr|Cadet|AchvStep', priority: 7 }, // ES task definitions
    'AchvStepTasks': { cat: 'config', key: 'esAchvStepTasks', priority: 8 }, // ES tasks per achievement step
    'AchvStepAchv': { cat: 'config', key: 'esAchvStepAchv', priority: 9 }, // ES achievement prerequisites
    'PL_MemberTaskCredit': { cat: 'data', key: 'memberTasks', priority: 10 },
    'PL_MemberPathCredit': { cat: 'data', key: 'memberPaths', priority: 11 },
    // ES Member Data Files
    'MbrAchievements': { cat: 'data', key: 'esMbrAchievements', priority: 12 }, // Member ES achievement completions
    'MbrTasks': { cat: 'data', key: 'esMbrTasks', priority: 13 }, // Member ES task completions (large file, ~15MB)
    'Member': { cat: 'data', key: 'members', exclude: 'Current|Prm|Instrumentation|Currency', priority: 14 }, // Exclude CurrentMembers.txt, MemberPrm.txt, MemberInstrumentation.txt, MemberCurrency.txt
    'SpecTrack': { cat: 'data', key: 'tracks', priority: 15 },
    'Organization': { cat: 'data', key: 'organization', priority: 16 },
    'CadetDuty': { cat: 'data', key: 'cadetDuty', priority: 17 },
    'DutyPosition': { cat: 'data', key: 'duty', exclude: 'Cadet', priority: 18 }, // Crucial exclusion
    'SeniorLevel': { cat: 'data', key: 'seniorLevels', priority: 19 },
    'MbrCommittee': { cat: 'data', key: 'committees', priority: 20 },
    'MbrContact': { cat: 'data', key: 'contacts', priority: 21 },
    // Cadet-specific data files for promotion tracker
    'CadetAchv': { cat: 'data', key: 'cadetAchv', exclude: 'Aprs|Enum|Full', priority: 22 }, // Exclude CadetAchvAprs, CdtAchvEnum, CadetAchvFullReport
    'CadetAchvAprs': { cat: 'data', key: 'cadetAchvAprs', priority: 23 },
    'CadetAchvFullReport': { cat: 'data', key: 'cadetAchvFullReport', priority: 24 },
    'CadetActivities': { cat: 'data', key: 'cadetActivities', priority: 25 },
    'CadetHFZInformation': { cat: 'data', key: 'cadetHFZ', priority: 26 },
    'CadetPhase': { cat: 'data', key: 'cadetPhase', priority: 27 },
    'CadetRank': { cat: 'data', key: 'cadetRank', priority: 28 },
    'CadetAwards': { cat: 'data', key: 'cadetAwards', priority: 29 },
    'Training': { cat: 'data', key: 'training', priority: 30 },
    'SeniorAwards': { cat: 'data', key: 'seniorAwards', priority: 31 },
    'OFlight': { cat: 'data', key: 'oFlights', priority: 32 },
    'ORGStatistics': { cat: 'data', key: 'orgStats', priority: 33 },
    'PL_VolUInstructors': { cat: 'data', key: 'voluInstructors', priority: 34 },
    'GoogleAdoptionStats': { cat: 'data', key: 'googleAdoption', priority: 35 },
    'GoogleAdoptionUsers': { cat: 'data', key: 'googleAdoptionUsers', priority: 36 }
  };

  // First, collect all files into an array for sorting
  Logger.log("Collecting files from folder...");
  const fileList = [];
  let totalFilesInFolder = 0;

  while (filesIterator.hasNext()) {
    const file = filesIterator.next();
    const name = file.getName();
    totalFilesInFolder++;

    let match = null;
    for (const [searchKey, def] of Object.entries(fileMap)) {
      if (name.includes(searchKey)) {
        // Check exclusion rules (support pipe-separated patterns)
        if (def.exclude) {
          const exclusionPatterns = def.exclude.split('|');
          const isExcluded = exclusionPatterns.some(pattern => name.includes(pattern));
          if (isExcluded) {
            Logger.log("File '" + name + "' excluded due to '" + def.exclude + "' exclusion rule");
            continue;
          }
        }
        match = def;
        break;
      }
    }

    if (match) {
      fileList.push({ file: file, name: name, match: match });
      Logger.log("Matched file: " + name + " -> cat=" + match.cat + ", key=" + match.key + ", priority=" + match.priority);
    } else {
      Logger.log("Skipped file (no match): " + name);
    }
  }

  Logger.log("Total files in folder: " + totalFilesInFolder);
  Logger.log("Matched files for processing: " + fileList.length);

  // Sort files by priority to ensure consistent ordering
  fileList.sort((a, b) => a.match.priority - b.match.priority);
  Logger.log("Files sorted by priority");

  // Process files in sorted order
  const date = new Date();
  Logger.log("Processing files in sorted order...");

  fileList.forEach((item, idx) => {
    try {
      Logger.log("Processing file " + (idx + 1) + "/" + fileList.length + ": " + item.name);
      const content = item.file.getBlob().getDataAsString();
      const CHUNK_SIZE = 40000;
      const totalLength = content.length;
      let chunkIndex = 0;

      if (totalLength === 0) {
        Logger.log("  File is empty, adding empty row");
        data.push([item.name, item.match.cat, item.match.key, 0, "", date]);
      } else {
        const numChunks = Math.ceil(totalLength / CHUNK_SIZE);
        Logger.log("  File size: " + totalLength + " chars, chunks: " + numChunks);

        for (let i = 0; i < totalLength; i += CHUNK_SIZE) {
          const chunk = content.substring(i, i + CHUNK_SIZE);
          data.push([item.name, item.match.cat, item.match.key, chunkIndex, chunk, date]);
          chunkIndex++;
        }
        Logger.log("  Added " + chunkIndex + " chunks to data");
      }
    } catch (e) {
      Logger.log("ERROR processing file " + item.name + ": " + e.toString());
      Logger.log("  Stack: " + e.stack);
      // Continue processing other files even if one fails
    }
  });

  // Only clear and write if we have data
  if (data.length > 1) {
    try {
      Logger.log("Preparing to write data to sheet...");
      Logger.log("Total rows to write (including header): " + data.length);
      Logger.log("Total data rows (excluding header): " + (data.length - 1));

      // Clear the sheet
      Logger.log("Clearing existing sheet data...");
      sheet.clear();
      Logger.log("Sheet cleared");

      // Write all data at once for atomicity
      Logger.log("Writing data to range: 1,1 to " + data.length + "," + data[0].length);
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
      Logger.log("Data written to sheet");

      // CRITICAL: Flush changes to ensure they're committed immediately
      // This is especially important for time-based triggers
      Logger.log("Flushing spreadsheet changes...");
      SpreadsheetApp.flush();
      Logger.log("Spreadsheet changes flushed");

      // Verify the write by reading back the row count
      const verifyRowCount = sheet.getLastRow();
      Logger.log("Verification: Sheet now has " + verifyRowCount + " rows");

      if (verifyRowCount !== data.length) {
        Logger.log("WARNING: Row count mismatch! Expected " + data.length + " but sheet has " + verifyRowCount);
      }

      const endTime = new Date();
      const duration = (endTime - startTime) / 1000;
      Logger.log("Sync completed successfully in " + duration + " seconds");
      Logger.log("Wrote " + (data.length - 1) + " data rows");
      Logger.log("========== SYNC END ==========");

    } catch (e) {
      Logger.log("CRITICAL ERROR writing to sheet: " + e.toString());
      Logger.log("Error stack: " + e.stack);
      throw new Error("Failed to sync data to sheet: " + e.toString());
    }
  } else {
    Logger.log("WARNING: No data to sync. Check if files exist in folder.");
    Logger.log("Data array length: " + data.length);
    Logger.log("========== SYNC END (NO DATA) ==========");
  }
}

/**
 * API: Read from Sheet -> Reassemble -> Send
 */
function getAppData() {
  const startTime = new Date();
  const userEmail = Session.getActiveUser().getEmail() || 'Unknown';
  const userName = getUserFullName(userEmail);

  Logger.log("========== GET APP DATA START ==========");
  Logger.log("Request Time: " + startTime.toISOString());
  Logger.log("User: " + userName + " (" + userEmail + ")");

  const cache = CacheService.getScriptCache();
  // Bump version to force refresh if schema changes
  const cachedData = cache.get("app-data-payload-v6");

  if (cachedData) {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    Logger.log("Cache HIT - Returning cached data");
    Logger.log("Cached data size: " + cachedData.length + " characters");
    Logger.log("========== GET APP DATA END (CACHED) ==========");

    // Log API call with cache hit
    logWebAppAccess({
      timestamp: startTime,
      userName: userName,
      userEmail: userEmail,
      eventType: 'API_CALL_GET_DATA',
      status: 'SUCCESS_CACHED',
      durationSeconds: duration,
      queryString: 'cache=hit',
      parameters: '{"dataSize":' + cachedData.length + '}',
      errorMessage: '',
      errorStack: ''
    });

    return cachedData;
  }

  Logger.log("Cache MISS - Fetching data from sheet");

  // Get configuration from Script Properties
  const dbSpreadsheetId = getRequiredConfig('DB_SPREADSHEET_ID', 'Database Spreadsheet ID');
  const dbSheetName = getConfig('DB_SHEET_NAME', 'DB');

  try {
    Logger.log("Opening spreadsheet ID: " + dbSpreadsheetId);
    const ss = SpreadsheetApp.openById(dbSpreadsheetId);
    Logger.log("Spreadsheet opened: " + ss.getName());

    const sheet = ss.getSheetByName(dbSheetName);

    if (!sheet) {
      Logger.log("ERROR: Sheet '" + dbSheetName + "' not found");
      throw new Error("Database sheet not found. Please run 'syncDriveToSheet' first.");
    }

    Logger.log("Sheet '" + dbSheetName + "' found");
    Logger.log("Reading data range from sheet...");
    const rows = sheet.getDataRange().getValues();
    Logger.log("Read " + rows.length + " total rows from sheet");

    // Validate that we have more than just headers
    if (rows.length <= 1) {
      Logger.log("ERROR: Sheet has no data rows (only headers or empty)");
      throw new Error("No data in database sheet. Please run 'syncDriveToSheet' first.");
    }

    Logger.log("Sheet has " + (rows.length - 1) + " data rows (excluding header)");
    const dataRows = rows.slice(1);

    const reassemblyMap = {};
    let lastUpdatedTime = new Date().toISOString();

    const payload = {
      config: {},
      data: {},
      meta: {}
    };

    if (dataRows.length > 0 && dataRows[0][5]) {
       lastUpdatedTime = new Date(dataRows[0][5]).toISOString();
       Logger.log("Last sync timestamp from sheet: " + lastUpdatedTime);
    }
    payload.meta.lastUpdated = lastUpdatedTime;

    Logger.log("Processing and reassembling chunked data...");
    let skippedRows = 0;

    dataRows.forEach((row, idx) => {
      // Validate row has expected columns
      if (!row || row.length < 5) {
        Logger.log("WARNING: Skipping malformed row " + (idx + 2) + " (length=" + (row ? row.length : 0) + ")");
        skippedRows++;
        return;
      }

      // Index mapping based on syncDriveToSheet order
      const cat = row[1];
      const key = row[2];
      const chunkIndex = row[3];
      const content = row[4] || ""; // Default to empty string if null

      // Validate required fields
      if (!cat || !key) {
        Logger.log("WARNING: Skipping row " + (idx + 2) + " with missing category or key (cat=" + cat + ", key=" + key + ")");
        skippedRows++;
        return;
      }

      const compoundKey = `${cat}|${key}`;
      if (!reassemblyMap[compoundKey]) reassemblyMap[compoundKey] = [];
      reassemblyMap[compoundKey][chunkIndex] = content;
    });

    if (skippedRows > 0) {
      Logger.log("Skipped " + skippedRows + " invalid rows during processing");
    }

    Logger.log("Reassembly map created with " + Object.keys(reassemblyMap).length + " unique keys");

    // Validate we have the minimum required data
    const requiredKeys = ['config|paths', 'config|groups', 'config|tasks', 'data|members'];
    const missingKeys = requiredKeys.filter(k => !reassemblyMap[k]);
    if (missingKeys.length > 0) {
      Logger.log("WARNING: Missing critical data: " + missingKeys.join(', '));
    } else {
      Logger.log("All required keys present: " + requiredKeys.join(', '));
    }

    Logger.log("Assembling final payload...");
    Object.keys(reassemblyMap).forEach(compoundKey => {
      const [cat, key] = compoundKey.split('|');
      const fullContent = reassemblyMap[compoundKey].join('');
      if (payload[cat]) {
        payload[cat][key] = fullContent;
        Logger.log("  Added " + compoundKey + " (" + reassemblyMap[compoundKey].length + " chunks, " + fullContent.length + " chars)");
      }
    });

    Logger.log("Serializing payload to JSON...");
    const jsonString = JSON.stringify(payload);

    // Log payload size for monitoring
    Logger.log("Generated payload with " + dataRows.length + " rows, size: " + jsonString.length + " characters");

    Logger.log("Storing in cache (TTL: 21600 seconds / 6 hours)...");
    try {
      cache.put("app-data-payload-v6", jsonString, 21600);
      Logger.log("Successfully cached payload");
    } catch(e) {
      Logger.log("Cache storage failed (payload may be too large): " + e.toString());
    }

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    Logger.log("Data retrieval completed in " + duration + " seconds");
    Logger.log("========== GET APP DATA END ==========");

    // Log successful API call with cache miss
    logWebAppAccess({
      timestamp: startTime,
      userName: userName,
      userEmail: userEmail,
      eventType: 'API_CALL_GET_DATA',
      status: 'SUCCESS_UNCACHED',
      durationSeconds: duration,
      queryString: 'cache=miss',
      parameters: '{"dataSize":' + jsonString.length + ',"rowsProcessed":' + dataRows.length + '}',
      errorMessage: '',
      errorStack: ''
    });

    return jsonString;

  } catch (e) {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    Logger.log("CRITICAL ERROR in getAppData: " + e.toString());
    Logger.log("Error stack: " + e.stack);
    Logger.log("========== GET APP DATA END (ERROR) ==========");

    // Log failed API call
    logWebAppAccess({
      timestamp: startTime,
      userName: userName,
      userEmail: userEmail,
      eventType: 'API_CALL_GET_DATA',
      status: 'ERROR',
      durationSeconds: duration,
      queryString: '',
      parameters: '{}',
      errorMessage: e.toString(),
      errorStack: e.stack || 'N/A'
    });

    throw new Error("Data retrieval error: " + e.toString() + ". Please ensure 'syncDriveToSheet' has been run successfully.");
  }
}

/**
 * LOG WEB APP ACCESS TO LOGS SHEET
 * Captures user access and errors following standard logging practices
 */
function logWebAppAccess(logData) {
  try {
    Logger.log("Logging web app access for user: " + logData.userEmail);

    const dbSpreadsheetId = getRequiredConfig('DB_SPREADSHEET_ID', 'Database Spreadsheet ID');
    const logsSheetName = getConfig('LOGS_SHEET_NAME', 'Logs');

    const ss = SpreadsheetApp.openById(dbSpreadsheetId);
    let logsSheet = ss.getSheetByName(logsSheetName);

    // Create Logs sheet if it doesn't exist
    if (!logsSheet) {
      Logger.log("Creating new Logs sheet");
      logsSheet = ss.insertSheet(logsSheetName);

      // Set up headers with standard logging fields
      const headers = [
        'Timestamp',
        'User Name',
        'User Email',
        'Event Type',
        'Status',
        'Duration (sec)',
        'Query String',
        'Parameters',
        'Error Message',
        'Error Stack',
        'Session ID'
      ];

      logsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Format header row
      const headerRange = logsSheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('#ffffff');

      // Freeze header row
      logsSheet.setFrozenRows(1);

      // Auto-resize columns
      for (let i = 1; i <= headers.length; i++) {
        logsSheet.autoResizeColumn(i);
      }

      Logger.log("Logs sheet created with headers");
    }

    // Generate a session ID for tracking related requests
    const sessionId = Utilities.getUuid();

    // Prepare log row data
    const logRow = [
      logData.timestamp,
      logData.userName || 'Unknown',
      logData.userEmail || 'Unknown',
      logData.eventType || 'UNKNOWN_EVENT',
      logData.status || 'UNKNOWN',
      logData.durationSeconds || 0,
      logData.queryString || '',
      logData.parameters || '{}',
      logData.errorMessage || '',
      logData.errorStack || '',
      sessionId
    ];

    // Append the log entry
    logsSheet.appendRow(logRow);

    // Flush to ensure write completes
    SpreadsheetApp.flush();

    Logger.log("Log entry written successfully");

    // Optional: Keep only last 10,000 rows to prevent sheet from growing too large
    const maxRows = 10000;
    const currentRows = logsSheet.getLastRow();
    if (currentRows > maxRows + 1) { // +1 for header
      const rowsToDelete = currentRows - maxRows - 1;
      logsSheet.deleteRows(2, rowsToDelete); // Delete oldest rows (starting after header)
      Logger.log("Deleted " + rowsToDelete + " old log entries to maintain size limit");
    }

  } catch (e) {
    // If logging fails, don't break the app - just log to Apps Script console
    Logger.log("WARNING: Failed to write to Logs sheet: " + e.toString());
    Logger.log("This will not affect the web app functionality");
  }
}

/**
 * CREATE GITHUB ISSUE FROM USER FEEDBACK
 * Called from frontend via google.script.run.createGitHubIssue(issueData)
 *
 * @param {Object} issueData - The issue data from frontend
 * @param {string} issueData.title - Issue title
 * @param {string} issueData.description - User's description of the issue
 * @param {string} issueData.category - Issue category (bug, feature, question, etc.)
 * @param {Object} issueData.diagnostics - Automatically collected diagnostic data
 * @returns {Object} - Result with success status and issue URL or error message
 */
function createGitHubIssue(issueData) {
  const startTime = new Date();
  const userEmail = Session.getActiveUser().getEmail() || 'Unknown';
  const userName = getUserFullName(userEmail);

  Logger.log("========== CREATE GITHUB ISSUE ==========");
  Logger.log("User: " + userName + " (" + userEmail + ")");
  Logger.log("Category: " + issueData.category);
  Logger.log("Title: " + issueData.title);
  Logger.log("=========================================");

  try {
    // Get GitHub token from Script Properties
    const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!token) {
      Logger.log("ERROR: GitHub token not configured in Script Properties");
      throw new Error('GitHub integration not configured. Please contact the administrator.');
    }

    // Validate required fields
    if (!issueData.title || !issueData.title.trim()) {
      throw new Error('Issue title is required');
    }
    if (!issueData.description || !issueData.description.trim()) {
      throw new Error('Issue description is required');
    }

    // Build issue body with markdown formatting (use username for privacy)
    const userNameForGitHub = getUserNameFromEmail(userEmail);
    const issueBody = formatIssueBody(issueData, userNameForGitHub);

    // Determine labels based on category
    const labels = getCategoryLabels(issueData.category);

    // Format title with category prefix
    const categoryPrefix = (issueData.category || 'feedback').toUpperCase();
    const formattedTitle = '[' + categoryPrefix + '] ' + issueData.title.trim();

    // Get GitHub configuration from Script Properties
    const githubOwner = getRequiredConfig('GITHUB_OWNER', 'GitHub Owner');
    const githubRepo = getConfig('GITHUB_REPO', 'readiness-hub');
    const githubApiUrl = getConfig('GITHUB_API_URL', 'https://api.github.com');

    // Prepare API request
    const apiUrl = githubApiUrl + '/repos/' + githubOwner + '/' + githubRepo + '/issues';
    const payload = {
      title: formattedTitle,
      body: issueBody,
      labels: labels
    };

    const options = {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'CAP-Readiness-Hub'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    Logger.log("Sending request to GitHub API: " + apiUrl);
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log("GitHub API response code: " + responseCode);

    if (responseCode === 201) {
      const responseBody = JSON.parse(responseText);
      Logger.log("Issue created successfully: " + responseBody.html_url);
      Logger.log("Issue number: " + responseBody.number);

      // Log successful submission
      logWebAppAccess({
        timestamp: startTime,
        userName: userName,
        userEmail: userEmail,
        eventType: 'GITHUB_ISSUE_CREATED',
        status: 'SUCCESS',
        durationSeconds: (new Date() - startTime) / 1000,
        queryString: '',
        parameters: JSON.stringify({
          issueNumber: responseBody.number,
          category: issueData.category,
          issueUrl: responseBody.html_url
        }),
        errorMessage: '',
        errorStack: ''
      });

      Logger.log("========== GITHUB ISSUE CREATED ==========");

      // Notify IT Chatbot about the new issue
      try {
        notifyITChatbot({
          issueUrl: responseBody.html_url,
          issueNumber: responseBody.number,
          title: formattedTitle,
          description: issueData.description || '',
          category: issueData.category || 'other',
          submitterEmail: userEmail,
          submitterName: userName
        });
        Logger.log("IT Chatbot notification sent successfully");
      } catch (notifyError) {
        // Log but don't fail the main function - issue creation is the primary goal
        Logger.log("Failed to notify IT Chatbot: " + notifyError.toString());
      }

      return {
        success: true,
        issueUrl: responseBody.html_url,
        issueNumber: responseBody.number
      };

    } else {
      // Handle specific error cases
      let errorMessage = 'GitHub API error (HTTP ' + responseCode + ')';

      try {
        const errorBody = JSON.parse(responseText);
        if (errorBody.message) {
          errorMessage = errorBody.message;
          if (errorBody.documentation_url) {
            Logger.log("GitHub documentation: " + errorBody.documentation_url);
          }
        }
      } catch (parseError) {
        Logger.log("Could not parse error response: " + responseText);
      }

      Logger.log("GitHub API error: " + errorMessage);
      throw new Error(errorMessage);
    }

  } catch (error) {
    Logger.log("ERROR creating GitHub issue: " + error.toString());
    Logger.log("Stack: " + (error.stack || 'N/A'));

    // Log the failure
    logWebAppAccess({
      timestamp: startTime,
      userName: userName,
      userEmail: userEmail,
      eventType: 'GITHUB_ISSUE_CREATED',
      status: 'ERROR',
      durationSeconds: (new Date() - startTime) / 1000,
      queryString: '',
      parameters: JSON.stringify({
        category: issueData.category || 'unknown',
        titleLength: issueData.title ? issueData.title.length : 0
      }),
      errorMessage: error.toString(),
      errorStack: error.stack || 'N/A'
    });

    Logger.log("========== GITHUB ISSUE FAILED ==========");

    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * FORMAT ISSUE BODY WITH MARKDOWN
 * Creates a well-structured issue body with diagnostic information
 *
 * @param {Object} issueData - The issue data from frontend
 * @param {string} userName - The submitting user's name
 * @returns {string} - Formatted markdown body
 */
function formatIssueBody(issueData, userName) {
  const d = issueData.diagnostics || {};
  const submissionTime = new Date().toISOString();

  let body = '## Description\n\n';
  body += issueData.description + '\n\n';
  body += '---\n\n';
  body += '## Diagnostic Information\n\n';

  // Submission info
  body += '### Submission Details\n';
  body += '| Property | Value |\n';
  body += '|----------|-------|\n';
  body += '| **Submitted By** | ' + userName + ' |\n';
  body += '| **Submission Time** | ' + submissionTime + ' |\n';
  body += '| **Category** | ' + (issueData.category || 'N/A') + ' |\n\n';

  // Environment info
  body += '### Environment\n';
  body += '| Property | Value |\n';
  body += '|----------|-------|\n';
  body += '| **App Version** | ' + (d.appVersion || 'N/A') + ' |\n';
  body += '| **Browser** | ' + (d.browser || 'N/A') + ' |\n';
  body += '| **Platform** | ' + (d.platform || 'N/A') + ' |\n';
  body += '| **Screen Size** | ' + (d.screenSize || 'N/A') + ' |\n';
  body += '| **User Agent** | `' + (d.userAgent || 'N/A') + '` |\n\n';

  // Application state
  body += '### Application State\n';
  body += '| Property | Value |\n';
  body += '|----------|-------|\n';
  body += '| **Current View** | ' + (d.currentView || 'N/A') + ' |\n';
  body += '| **Selected Unit** | ' + (d.selectedUnit || 'None') + ' |\n';
  body += '| **Unit Name** | ' + (d.selectedUnitName || 'N/A') + ' |\n';
  body += '| **Sub-Units Mode** | ' + (d.showAllDescendants ? 'Enabled' : 'Disabled') + ' |\n';
  body += '| **Data Last Updated** | ' + (d.lastUpdated || 'N/A') + ' |\n\n';

  // Data context
  body += '### Data Context\n';
  body += '| Property | Value |\n';
  body += '|----------|-------|\n';
  body += '| **Total Members Loaded** | ' + (d.memberCount || 'N/A') + ' |\n';
  body += '| **Senior Members** | ' + (d.seniorCount || 'N/A') + ' |\n';
  body += '| **Cadets** | ' + (d.cadetCount || 'N/A') + ' |\n';
  body += '| **Organizations Loaded** | ' + (d.orgCount || 'N/A') + ' |\n\n';

  body += '---\n\n';
  body += '*This issue was automatically generated from the CAP Readiness Hub feedback system.*';

  return body;
}

/**
 * MAP CATEGORY TO GITHUB LABELS
 * Returns an array of labels based on the issue category
 *
 * @param {string} category - The issue category
 * @returns {Array} - Array of label strings
 */
function getCategoryLabels(category) {
  const labelMap = {
    'bug': ['bug', 'user-reported'],
    'feature': ['enhancement', 'user-reported'],
    'question': ['question', 'user-reported'],
    'data-issue': ['data', 'user-reported'],
    'ui-ux': ['ui/ux', 'user-reported'],
    'other': ['user-reported']
  };

  return labelMap[category] || ['user-reported'];
}

/**
 * NOTIFY IT CHATBOT ABOUT NEW GITHUB ISSUE
 * Sends a notification to the IT Chatbot when a new GitHub issue is created
 * The chatbot will post a card to the IT Support space and send an email to the submitter
 *
 * @param {Object} issueData - Issue information
 * @param {string} issueData.issueUrl - URL to the GitHub issue
 * @param {number} issueData.issueNumber - GitHub issue number
 * @param {string} issueData.title - Issue title
 * @param {string} issueData.description - Issue description
 * @param {string} issueData.category - Issue category (bug, feature, etc.)
 * @param {string} issueData.submitterEmail - Email of the person who submitted the issue
 * @param {string|null} issueData.submitterName - Name of the submitter (optional)
 */
function notifyITChatbot(issueData) {
  const CHATBOT_WEBAPP_URL = PropertiesService.getScriptProperties().getProperty('CHATBOT_WEBAPP_URL');
  const CHATBOT_API_KEY = PropertiesService.getScriptProperties().getProperty('CHATBOT_API_KEY');

  if (!CHATBOT_WEBAPP_URL || !CHATBOT_API_KEY) {
    Logger.log('IT Chatbot integration not configured - skipping notification');
    Logger.log('Missing: ' + (!CHATBOT_WEBAPP_URL ? 'CHATBOT_WEBAPP_URL ' : '') + (!CHATBOT_API_KEY ? 'CHATBOT_API_KEY' : ''));
    return;
  }

  const payload = {
    action: 'GITHUB_ISSUE_NOTIFICATION',
    issueData: {
      issueUrl: issueData.issueUrl,
      issueNumber: issueData.issueNumber,
      title: issueData.title,
      description: issueData.description,
      category: issueData.category,
      submitterEmail: issueData.submitterEmail,
      submitterName: issueData.submitterName
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const url = CHATBOT_WEBAPP_URL + '?apiKey=' + encodeURIComponent(CHATBOT_API_KEY);

  Logger.log('Sending notification to IT Chatbot...');
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();

  if (responseCode >= 200 && responseCode < 300) {
    Logger.log('IT Chatbot notified successfully');
  } else {
    const responseText = response.getContentText();
    Logger.log('IT Chatbot notification failed (HTTP ' + responseCode + '): ' + responseText);
    throw new Error('Chatbot notification failed: HTTP ' + responseCode);
  }
}

// ========================================
// GOOGLE WORKSPACE ADOPTION TRACKING
// ========================================

/**
 * Main function to collect Google Workspace adoption data
 * Run daily via time-based trigger (5 AM Eastern, after ORGStatistics refresh)
 */
function collectGoogleAdoptionData() {
  const startTime = new Date();
  Logger.log("========== GOOGLE ADOPTION DATA COLLECTION START ==========");
  Logger.log("Start Time: " + startTime.toISOString());

  try {
    // Step 1: Get roster counts from ORGStatistics
    Logger.log("Step 1: Getting roster counts from ORGStatistics...");
    const rosterCounts = getRosterCountsByUnit();
    Logger.log("Roster counts retrieved for " + Object.keys(rosterCounts).length + " units");

    // Step 2: Get Google Workspace user activity data
    Logger.log("Step 2: Getting Google Workspace metrics...");
    const googleMetrics = getGoogleWorkspaceMetrics();
    Logger.log("Google metrics retrieved for " + Object.keys(googleMetrics).length + " units");

    // Step 3: Calculate adoption rates and build output
    Logger.log("Step 3: Calculating adoption metrics...");
    const adoptionData = calculateAdoptionMetrics(rosterCounts, googleMetrics);
    Logger.log("Adoption metrics calculated for " + adoptionData.length + " units");

    // Step 4: Write CSV to Drive folder
    Logger.log("Step 4: Writing CSV to Drive folder...");
    writeAdoptionCSV(adoptionData);
    Logger.log("CSV written successfully");

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    Logger.log("========== GOOGLE ADOPTION DATA COLLECTION END ==========");
    Logger.log("Duration: " + duration + " seconds");

    return { success: true, unitsProcessed: adoptionData.length, duration: duration };

  } catch (error) {
    Logger.log("ERROR in collectGoogleAdoptionData: " + error.toString());
    Logger.log("Stack: " + (error.stack || 'N/A'));
    throw error;
  }
}

/**
 * Get roster counts per unit from ORGStatistics file
 * Filters to MI wing, units 001-800, operational member types
 * @returns {Object} Map of unit key (MI-###) to roster count
 */
function getRosterCountsByUnit() {
  const sourceFolderId = getRequiredConfig('SOURCE_FOLDER_ID', 'Source Folder ID');
  const folder = DriveApp.getFolderById(sourceFolderId);
  const files = folder.getFiles();

  let orgStatsContent = null;
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().includes('ORGStatistics')) {
      orgStatsContent = file.getBlob().getDataAsString();
      Logger.log("Found ORGStatistics file: " + file.getName());
      break;
    }
  }

  if (!orgStatsContent) {
    Logger.log("WARNING: ORGStatistics file not found in folder");
    return {};
  }

  // Parse CSV
  const lines = orgStatsContent.split('\n').filter(l => l.trim());
  if (lines.length === 0) return {};

  const headers = parseCSVRowToArray(lines[0]);
  Logger.log("ORGStatistics headers: " + headers.join(', '));

  const rosterCounts = {};

  // Get current month/year for filtering
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Operational member types (case-insensitive matching)
  const operationalTypes = ['CADET', 'SENIOR', 'FIFTY YEAR', 'LIFE'];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRowToObject(lines[i], headers);

    // Filter: Wing = MI, Unit between 001-800
    const wing = (row.Wing || '').toUpperCase().trim();
    const unit = (row.Unit || '').trim().padStart(3, '0');
    const unitNum = parseInt(unit);

    if (wing !== 'MI' || unitNum < 1 || unitNum > 800) continue;

    // Filter: TOTAL count type
    const cntType = (row.CntType || '').toUpperCase().trim();
    if (cntType !== 'TOTAL') continue;

    // Check date is current month (or previous month for data lag)
    const cntDate = row.CntDate;
    if (cntDate) {
      const parts = cntDate.split('/');
      if (parts.length === 3) {
        const rowMonth = parseInt(parts[0]);
        const rowYear = parseInt(parts[2]);
        // Accept current month or previous month
        const isCurrentPeriod = (rowYear === currentYear && (rowMonth === currentMonth || rowMonth === currentMonth - 1)) ||
                                (rowMonth === 12 && rowYear === currentYear - 1 && currentMonth === 1);
        if (!isCurrentPeriod) continue;
      }
    }

    // Filter: Operational member types only
    const mbrType = (row.MbrType || '').toUpperCase().trim();
    if (!operationalTypes.includes(mbrType)) continue;

    // Sum quantity for this unit
    const unitKey = 'MI-' + unit;
    const quantity = parseInt(row.Quantity) || 0;

    if (!rosterCounts[unitKey]) {
      rosterCounts[unitKey] = 0;
    }
    rosterCounts[unitKey] += quantity;
  }

  return rosterCounts;
}

/**
 * Parse a CSV row into an array of values, respecting quotes
 * @param {string} line - CSV line
 * @returns {Array} Array of values
 */
function parseCSVRowToArray(line) {
  const values = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentVal.trim().replace(/^"|"$/g, ''));
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  values.push(currentVal.trim().replace(/^"|"$/g, ''));
  return values;
}

/**
 * Parse a CSV row into an object using headers
 * @param {string} line - CSV line
 * @param {Array} headers - Column headers
 * @returns {Object} Row as object
 */
function parseCSVRowToObject(line, headers) {
  const values = parseCSVRowToArray(line);
  const row = {};
  for (let i = 0; i < headers.length && i < values.length; i++) {
    row[headers[i]] = values[i];
  }
  return row;
}

/**
 * Get Google Workspace metrics for all users in MI-### organizational units
 * Uses Admin Directory API for user data and Admin Reports API for activity
 *
 * Returns both aggregated unit metrics AND per-user details for display.
 *
 * "Active" means actually using the account - defined as:
 * - Logged in within 30 days, OR
 * - Has Gmail activity (sent emails), OR
 * - Has Drive activity (edited files)
 *
 * @returns {Object} { unitMetrics: { MI-###: {...} }, userDetails: [ {...}, ...] }
 */
function getGoogleWorkspaceMetrics() {
  const unitMetrics = {};
  const userDetails = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Regex to extract unit from OU path (handles nested structure)
  // OU structure: /MI-001/MI-705/MI-063 - we want the LAST MI-### segment
  const unitRegex = /MI-(\d{3})/g;

  try {
    // Get all users with pagination
    let pageToken = null;
    const allUsers = [];

    Logger.log("Fetching users from Admin Directory...");
    do {
      const response = AdminDirectory.Users.list({
        customer: 'my_customer',
        maxResults: 500,
        pageToken: pageToken,
        projection: 'full'
      });

      if (response.users) {
        allUsers.push(...response.users);
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    Logger.log("Total users found: " + allUsers.length);

    // Build a map of user email to user data for Reports API lookups
    const userDataMap = new Map();

    // Process each user for basic metrics
    allUsers.forEach(user => {
      // Extract unit from OU path
      // OU structure example: /MI-001/MI-705/MI-063
      const ouPath = user.orgUnitPath || '';

      // Find all MI-### matches and take the last one (the actual unit)
      const matches = ouPath.match(unitRegex);
      if (!matches || matches.length === 0) return;

      const unitKey = matches[matches.length - 1].toUpperCase(); // Last match is the unit
      const unitNum = parseInt(unitKey.split('-')[1]);

      // Filter to units 001-800
      if (unitNum < 1 || unitNum > 800) return;

      // Only count non-suspended, non-archived accounts
      if (user.suspended || user.archived) return;

      // Check if logged in within 30 days
      let hasRecentLogin = false;
      let lastLoginDate = '';
      if (user.lastLoginTime) {
        const lastLogin = new Date(user.lastLoginTime);
        hasRecentLogin = lastLogin >= thirtyDaysAgo;
        lastLoginDate = Utilities.formatDate(lastLogin, 'America/New_York', 'MM/dd/yyyy');
      }

      // Store user data for Reports API lookup and later aggregation
      const userData = {
        email: user.primaryEmail,
        fullName: user.name?.fullName || '',
        unitKey: unitKey,
        hasRecentLogin: hasRecentLogin,
        lastLoginDate: lastLoginDate,
        hasGmailActivity: false,
        hasDriveActivity: false,
        isActiveUser: hasRecentLogin // Will be updated after Reports API check
      };
      userDataMap.set(user.primaryEmail, userData);

      // Initialize unit metrics if needed
      if (!unitMetrics[unitKey]) {
        unitMetrics[unitKey] = {
          totalAccounts: 0,
          activeUsers: 0,  // Users actually using the account
          recentLogin: 0,
          gmailActive: 0,
          driveActive: 0
        };
      }

      unitMetrics[unitKey].totalAccounts++;

      if (hasRecentLogin) {
        unitMetrics[unitKey].recentLogin++;
      }
    });

    Logger.log("Processed " + userDataMap.size + " non-suspended users in MI units");

    // Get Gmail and Drive activity from Reports API
    // Reports data is delayed by 3-5 days, so we query 5 days ago to ensure data availability
    const reportDate = Utilities.formatDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), 'UTC', 'yyyy-MM-dd');
    Logger.log("Fetching usage reports for date: " + reportDate);

    try {
      let reportPageToken = null;
      let reportsProcessed = 0;

      do {
        const usageReport = AdminReports.UserUsageReport.get('all', reportDate, {
          pageToken: reportPageToken,
          parameters: 'gmail:num_emails_sent,drive:num_items_edited'
        });

        if (usageReport.usageReports) {
          usageReport.usageReports.forEach(report => {
            const email = report.entity.userEmail;
            const userData = userDataMap.get(email);
            if (!userData) return;

            const unitKey = userData.unitKey;
            if (!unitMetrics[unitKey]) return;

            reportsProcessed++;

            // Check for Gmail activity
            const params = report.parameters || [];
            const gmailParam = params.find(p => p.name === 'gmail:num_emails_sent');
            if (gmailParam && (parseInt(gmailParam.intValue || gmailParam.stringValue || '0') > 0)) {
              userData.hasGmailActivity = true;
              unitMetrics[unitKey].gmailActive++;
            }

            // Check for Drive activity
            const driveParam = params.find(p => p.name === 'drive:num_items_edited');
            if (driveParam && (parseInt(driveParam.intValue || driveParam.stringValue || '0') > 0)) {
              userData.hasDriveActivity = true;
              unitMetrics[unitKey].driveActive++;
            }
          });
        }

        reportPageToken = usageReport.nextPageToken;
      } while (reportPageToken);

      Logger.log("Processed " + reportsProcessed + " usage reports");

    } catch (reportError) {
      Logger.log("WARNING: Could not fetch usage reports: " + reportError.toString());
      Logger.log("Continuing without Gmail/Drive activity data...");
      // Continue without detailed activity data - basic metrics still available
    }

    // Now calculate "active users" - those who are actually using the account
    // Active = has recent login OR has Gmail activity OR has Drive activity
    userDataMap.forEach(userData => {
      userData.isActiveUser = userData.hasRecentLogin || userData.hasGmailActivity || userData.hasDriveActivity;

      if (userData.isActiveUser && unitMetrics[userData.unitKey]) {
        unitMetrics[userData.unitKey].activeUsers++;
      }

      // Add to user details array for CSV output
      userDetails.push(userData);
    });

    Logger.log("Calculated active users for all units");

  } catch (error) {
    Logger.log("ERROR getting Google Workspace metrics: " + error.toString());
    throw error;
  }

  return { unitMetrics, userDetails };
}

/**
 * Calculate adoption metrics by combining roster and Google data
 *
 * Adoption Rate is now calculated as: activeUsers / roster count
 * where "activeUsers" = users who logged in OR used Gmail OR used Drive
 *
 * @param {Object} rosterCounts - Map of unit key to roster count
 * @param {Object} googleData - { unitMetrics: {...}, userDetails: [...] }
 * @returns {Object} { unitStats: [...], userDetails: [...] }
 */
function calculateAdoptionMetrics(rosterCounts, googleData) {
  const unitStats = [];
  const collectionDate = Utilities.formatDate(new Date(), 'America/New_York', 'MM/dd/yyyy');

  const { unitMetrics, userDetails } = googleData;

  // Get all unique units from both sources
  const allUnits = new Set([...Object.keys(rosterCounts), ...Object.keys(unitMetrics)]);

  allUnits.forEach(unitKey => {
    const roster = rosterCounts[unitKey] || 0;
    const google = unitMetrics[unitKey] || {
      totalAccounts: 0,
      activeUsers: 0,
      recentLogin: 0,
      gmailActive: 0,
      driveActive: 0
    };

    // Calculate adoption rate (active users who are using the account / roster count)
    // "Active" = logged in within 30 days OR has Gmail activity OR has Drive activity
    let adoptionRate = 0;
    if (roster > 0) {
      adoptionRate = Math.round((google.activeUsers / roster) * 100);
      // Cap at 100% (can exceed if Google has more active users than roster)
      adoptionRate = Math.min(adoptionRate, 100);
    }

    unitStats.push({
      unit: unitKey,
      rosterCount: roster,
      totalAccounts: google.totalAccounts,
      activeUsers: google.activeUsers,
      recentLogin: google.recentLogin,
      gmailActive: google.gmailActive,
      driveActive: google.driveActive,
      adoptionRate: adoptionRate,
      collectionDate: collectionDate
    });
  });

  // Sort by unit name
  unitStats.sort((a, b) => a.unit.localeCompare(b.unit));

  // Add collection date to user details
  const userDetailsWithDate = userDetails.map(u => ({
    ...u,
    collectionDate: collectionDate
  }));

  return { unitStats, userDetails: userDetailsWithDate };
}

/**
 * Write adoption data to CSV files in source folder
 * Creates two files:
 * - GoogleAdoptionStats.csv: Unit-level summary
 * - GoogleAdoptionUsers.csv: Per-user details
 *
 * @param {Object} adoptionData - { unitStats: [...], userDetails: [...] }
 */
function writeAdoptionCSV(adoptionData) {
  const sourceFolderId = getRequiredConfig('SOURCE_FOLDER_ID', 'Source Folder ID');
  const folder = DriveApp.getFolderById(sourceFolderId);

  const { unitStats, userDetails } = adoptionData;

  // === UNIT STATS CSV ===
  const unitHeaders = [
    'Unit',
    'RosterCount',
    'TotalAccounts',
    'ActiveUsers',
    'RecentLogin',
    'GmailActive',
    'DriveActive',
    'AdoptionRate',
    'CollectionDate'
  ];

  let unitCsvContent = unitHeaders.join(',') + '\n';

  unitStats.forEach(row => {
    const line = [
      row.unit,
      row.rosterCount,
      row.totalAccounts,
      row.activeUsers,
      row.recentLogin,
      row.gmailActive,
      row.driveActive,
      row.adoptionRate,
      row.collectionDate
    ].join(',');
    unitCsvContent += line + '\n';
  });

  // Write/update unit stats file
  const unitFileName = 'GoogleAdoptionStats.csv';
  writeOrUpdateFile(folder, unitFileName, unitCsvContent);

  // === USER DETAILS CSV ===
  const userHeaders = [
    'Unit',
    'Email',
    'FullName',
    'IsActiveUser',
    'HasRecentLogin',
    'LastLoginDate',
    'HasGmailActivity',
    'HasDriveActivity',
    'CollectionDate'
  ];

  let userCsvContent = userHeaders.join(',') + '\n';

  // Sort users by unit, then by name
  userDetails.sort((a, b) => {
    const unitCompare = a.unitKey.localeCompare(b.unitKey);
    if (unitCompare !== 0) return unitCompare;
    return (a.fullName || '').localeCompare(b.fullName || '');
  });

  userDetails.forEach(user => {
    // Escape fullName in case it contains commas
    const escapedName = user.fullName.includes(',')
      ? '"' + user.fullName.replace(/"/g, '""') + '"'
      : user.fullName;

    const line = [
      user.unitKey,
      user.email,
      escapedName,
      user.isActiveUser ? 'TRUE' : 'FALSE',
      user.hasRecentLogin ? 'TRUE' : 'FALSE',
      user.lastLoginDate || '',
      user.hasGmailActivity ? 'TRUE' : 'FALSE',
      user.hasDriveActivity ? 'TRUE' : 'FALSE',
      user.collectionDate
    ].join(',');
    userCsvContent += line + '\n';
  });

  // Write/update user details file
  const userFileName = 'GoogleAdoptionUsers.csv';
  writeOrUpdateFile(folder, userFileName, userCsvContent);

  Logger.log("Wrote " + unitStats.length + " unit records and " + userDetails.length + " user records");
}

/**
 * Helper function to write or update a file in a folder
 */
function writeOrUpdateFile(folder, fileName, content) {
  const files = folder.getFilesByName(fileName);

  if (files.hasNext()) {
    const existingFile = files.next();
    existingFile.setContent(content);
    Logger.log("Updated existing " + fileName);
  } else {
    folder.createFile(fileName, content, MimeType.CSV);
    Logger.log("Created new " + fileName);
  }
}

/**
 * Set up daily trigger for Google Adoption data collection
 * Run this function once during initial setup
 */
function setupGoogleAdoptionTrigger() {
  // Remove any existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'collectGoogleAdoptionData') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log("Removed existing trigger for collectGoogleAdoptionData");
    }
  });

  // Create new daily trigger at 5 AM Eastern (after ORGStatistics refresh at ~4-5 AM)
  ScriptApp.newTrigger('collectGoogleAdoptionData')
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .nearMinute(0)
    .inTimezone('America/New_York')
    .create();

  Logger.log("Created daily trigger for collectGoogleAdoptionData at 5 AM Eastern");
}

