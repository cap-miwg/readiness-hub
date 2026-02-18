#!/usr/bin/env bash
# ============================================================
# THIS FILE IS NOT PART OF THE APPS SCRIPT PROJECT
#
# Build script for the browser-based preview version.
# Combines all source HTML files into a single index.html
# with ZIP-import and IndexedDB support for GitHub Pages.
#
# Usage: bash offline/build-preview.sh
# Output: _site/index.html
# ============================================================

set -euo pipefail

# --- Configuration -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$REPO_DIR/_site"
OUTPUT_FILE="$OUTPUT_DIR/index.html"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "=== Building CAP Readiness Hub Preview ==="
echo "Source: $REPO_DIR"
echo "Output: $OUTPUT_FILE"

mkdir -p "$OUTPUT_DIR"

# --- Phase 1: Auto-discover include order from Index.html --------------------
# Parse <?!= include('FileName') ?> tags to get the file order automatically.
# This means new files added to Index.html are picked up without editing this script.

INCLUDE_FILES=()
SEEN_FILES=()

while IFS= read -r line; do
  if [[ "$line" =~ \<\?!=\ include\(\'([^\']+)\'\)\ \?\> ]]; then
    fname="${BASH_REMATCH[1]}.html"
    # Deduplicate (Styles.html appears twice in Index.html)
    already_seen=false
    for seen in "${SEEN_FILES[@]+"${SEEN_FILES[@]}"}"; do
      if [[ "$seen" == "$fname" ]]; then
        already_seen=true
        break
      fi
    done
    if [[ "$already_seen" == "false" ]]; then
      INCLUDE_FILES+=("$fname")
      SEEN_FILES+=("$fname")
    fi
  fi
done < "$REPO_DIR/Index.html"

echo "Discovered ${#INCLUDE_FILES[@]} include files from Index.html"

# --- Phase 2: Write HTML head with CDN dependencies -------------------------

cat > "$OUTPUT_FILE" << 'HTMLHEAD'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1">
  <title>CAP Readiness Hub - Preview</title>

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- React & ReactDOM (Cloudflare CDN) -->
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>

  <!-- Babel (Cloudflare CDN) -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"></script>

  <!-- Lucide Icons (Cloudflare CDN) -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/lucide/0.263.1/lucide-react.min.js"></script>

  <!-- Utilities -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.0/jspdf.plugin.autotable.min.js"></script>

  <!-- Chart.js for data visualization -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body class="bg-slate-50 text-slate-900">
  <div id="root">
    <div class="flex h-screen flex-col items-center justify-center bg-slate-50">
      <div style="width:40px;height:40px;border:4px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;" class="mb-4"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      <h2 class="text-xl font-bold text-slate-800">Loading Preview...</h2>
      <p class="text-slate-500 text-sm mt-2">Checking local cache...</p>
    </div>
  </div>

HTMLHEAD

echo "  Wrote HTML head"

# --- Phase 3: Concatenate source files in dependency order -------------------

for fname in "${INCLUDE_FILES[@]}"; do
  filepath="$REPO_DIR/$fname"
  if [[ ! -f "$filepath" ]]; then
    echo "  WARNING: $fname not found, skipping"
    continue
  fi

  echo "  Adding $fname"

  if [[ "$fname" == "ComponentsOrgNode.html" ]]; then
    # OrgNode must be exposed globally so AppOrgChart (separate script block) can use it
    sed 's|</script>|window.OrgNode = OrgNode;\n</script>|' "$filepath" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

  elif [[ "$fname" == "AppOrgChart.html" ]]; then
    # OrgChartSection needs to get OrgNode from window
    sed 's|function OrgChartSection(props) {|function OrgChartSection(props) {\n  const OrgNode = window.OrgNode;|' "$filepath" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

  elif [[ "$fname" == "ComponentsCore.html" ]]; then
    # Include ComponentsCore, then inject PreviewComponents (ZipImportModal needs Icon)
    cat "$filepath" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "  Adding PreviewComponents.html (after ComponentsCore)"
    cat "$SCRIPT_DIR/PreviewComponents.html" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"

  else
    # All other files: include content directly
    cat "$filepath" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
  fi
done

# --- Phase 4: Inject PreviewDataLayer (before main app script) ---------------

echo "  Adding PreviewDataLayer.html"
cat "$SCRIPT_DIR/PreviewDataLayer.html" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# --- Phase 5: Extract and transform the main App script from Index.html ------
# We extract the <script type="text/babel">...</script> block, apply
# transformations for preview mode, and write it to the output.

echo "  Transforming Index.html main script for preview mode"

# Extract the script content between the babel script tags using perl
perl -0777 -ne '
  if (/<script type="text\/babel">(.*)<\/script>\s*<\/body>/s) {
    print $1;
  }
' "$REPO_DIR/Index.html" > "$TEMP_DIR/script_raw.js"

if [[ ! -s "$TEMP_DIR/script_raw.js" ]]; then
  echo "ERROR: Could not extract main script from Index.html"
  exit 1
fi

# Write the perl transformation script to a temp file.
# Using a heredoc avoids all bash quoting issues with single quotes in perl.
cat > "$TEMP_DIR/transform.pl" << 'PERLSCRIPT'
#!/usr/bin/perl
use strict;
use warnings;

# Slurp entire input
local $/;
my $s = <STDIN>;
my $changes = 0;

# 1. Add showZipImportModal state after loading state
if ($s =~ s/(const \[loading, setLoading\] = useState\(true\);)/$1\n        const [showZipImportModal, setShowZipImportModal] = useState(false);/) {
  $changes++;
  print STDERR "  [OK] Added showZipImportModal state\n";
} else {
  print STDERR "  [WARN] Could not add showZipImportModal state\n";
}

# 2. Add handleZipImport callback after isMobile state
my $handleZipImport = q{

        // Handle ZIP import completion
        const handleZipImport = useCallback((payload) => {
          setShowZipImportModal(false);
          setLoading(true);
          setLoadingStatus("Processing imported data...");
          processPayload(payload);
          setLoading(false);
        }, [processPayload]);
};
if ($s =~ s/(const \[isMobile, setIsMobile\] = useState\(\(\) => window\.matchMedia\('\(max-width: 768px\)'\)\.matches\);)/$1$handleZipImport/s) {
  $changes++;
  print STDERR "  [OK] Added handleZipImport callback\n";
} else {
  print STDERR "  [WARN] Could not add handleZipImport callback\n";
}

# 3. Replace the loadData useEffect with IndexedDB-aware version
my $newLoadData = q{useEffect(() => {
          const loadData = async () => {
            const cached = await window.CapwatchDB.load();
            if (cached && cached.payload) {
              setLoadingStatus("Loading cached data...");
              processPayload(cached.payload);
              setLoading(false);
              return;
            }
            setLoading(false);
            setShowZipImportModal(true);
          };
          loadData();
        }, [processPayload]);};
if ($s =~ s/useEffect\(\(\) => \{\s*const loadData = \(\) => \{.*?loadData\(\);\s*\}, \[fetchFromServer, processPayload\]\);/$newLoadData/s) {
  $changes++;
  print STDERR "  [OK] Replaced loadData with IndexedDB version\n";
} else {
  print STDERR "  [WARN] Could not replace loadData\n";
}

# 4. Disable google.script.run in fetchFromServer
if ($s =~ s/if \(window\.google && window\.google\.script\)/if (false \/* Disabled for preview *\/)/) {
  $changes++;
  print STDERR "  [OK] Disabled google.script.run\n";
} else {
  print STDERR "  [WARN] Could not disable google.script.run\n";
}

# 5. Add PREVIEW badge to header title
if ($s =~ s/(\{window\.APP_CONFIG\?\.appShortName \|\| APP_SHORT_NAME\})(.*?<\/h1>)/$1 <span className="text-xs font-normal bg-green-600 text-white px-1.5 py-0.5 rounded ml-1">PREVIEW<\/span>$2/s) {
  $changes++;
  print STDERR "  [OK] Added PREVIEW badge\n";
} else {
  print STDERR "  [WARN] Could not add PREVIEW badge\n";
}

# 6. Change sync timestamp to data timestamp
if ($s =~ s/Sync: \{formatSyncTime\(lastUpdated\)\}/Data: {lastUpdated ? formatSyncTime(lastUpdated) : 'Not loaded'}/) {
  $changes++;
  print STDERR "  [OK] Changed sync text to data text\n";
} else {
  print STDERR "  [WARN] Could not change sync text\n";
}

# 7. Add Import button to desktop nav (before closing </nav>)
# There is only one </nav> in the main script
my $desktopImport = q{
                   <button
                     onClick={() => setShowZipImportModal(true)}
                     className="px-3 py-1.5 rounded text-sm font-semibold whitespace-nowrap transition-all text-green-300 hover:text-white hover:bg-green-600 flex items-center gap-1"
                     title="Import new CAPWATCH data"
                   >
                     <Icon name="Upload" className="w-4 h-4" /> Import
                   </button>};
if ($s =~ s|</nav>|$desktopImport\n                 </nav>|) {
  $changes++;
  print STDERR "  [OK] Added desktop Import button\n";
} else {
  print STDERR "  [WARN] Could not add desktop Import button\n";
}

# 8. Add Import button to mobile nav
# Insert between ))} and </div> in the mobile nav section (before </header>)
my $mobileImport = q{
                  <button
                    onClick={() => {
                      setShowZipImportModal(true);
                      setIsNavOpen(false);
                    }}
                    className="px-3 py-2 rounded text-sm font-semibold text-left transition-colors text-green-300 hover:bg-green-600 flex items-center gap-2"
                  >
                    <Icon name="Upload" className="w-4 h-4" /> Import Data
                  </button>};
# Match: ))} on its own line, then </div> on next line, then )} then </header>
if ($s =~ s|(\)\)\}\n)(                </div>\n              \)\}\n            </header>)|$1$mobileImport\n$2|s) {
  $changes++;
  print STDERR "  [OK] Added mobile Import button\n";
} else {
  print STDERR "  [WARN] Could not add mobile Import button\n";
}

# 9. Add ZipImportModal before the final closing </div> of App's return
# Anchor on "const root = ReactDOM" which is unique and follows the end of App()
my $zipModal = q{
            {showZipImportModal && (
              <ZipImportModal
                isOpen={showZipImportModal}
                onImport={handleZipImport}
                onClose={null}
              />
            )}};
if ($s =~ s|(          </div>\n        \);\n      \}\n+)(      const root = ReactDOM)|$zipModal\n$1$2|s) {
  $changes++;
  print STDERR "  [OK] Added ZipImportModal to JSX\n";
} else {
  print STDERR "  [WARN] Could not add ZipImportModal to JSX\n";
}

print STDERR "  Applied $changes/9 transformations\n";
print $s;
PERLSCRIPT

# Run the transformation
perl "$TEMP_DIR/transform.pl" < "$TEMP_DIR/script_raw.js" > "$TEMP_DIR/script_transformed.js"

# Validate transformations applied
check_marker() {
  if ! grep -q "$1" "$TEMP_DIR/script_transformed.js"; then
    echo "WARNING: Transformation '$2' may not have applied (marker '$1' not found)"
  fi
}
check_marker "showZipImportModal" "Add modal state"
check_marker "handleZipImport" "Add import callback"
check_marker "CapwatchDB" "Replace loadData"
check_marker "Disabled for preview" "Disable google.script.run"
check_marker "PREVIEW" "Add PREVIEW badge"
check_marker "Not loaded" "Change sync text"

# Write the transformed script to the output file
cat >> "$OUTPUT_FILE" << 'SCRIPTOPEN'

  <!-- Main Application (Modified for Preview) -->
  <script type="text/babel">
SCRIPTOPEN

cat "$TEMP_DIR/script_transformed.js" >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" << 'SCRIPTCLOSE'
  </script>
</body>
</html>
SCRIPTCLOSE

# --- Phase 6: Report --------------------------------------------------------

FILE_SIZE=$(stat -c%s "$OUTPUT_FILE" 2>/dev/null || stat -f%z "$OUTPUT_FILE" 2>/dev/null || echo "unknown")
echo ""
echo "=== Build Complete ==="
echo "Output: $OUTPUT_FILE"
echo "Size: $FILE_SIZE bytes"
echo "Files included: ${#INCLUDE_FILES[@]} source + 2 preview components"
echo ""
echo "To test locally: open $OUTPUT_FILE in a browser"
