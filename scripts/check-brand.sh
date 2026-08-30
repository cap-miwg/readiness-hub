#!/usr/bin/env bash
# Brand token discipline gate (docs/design/V2-DESIGN-PLAN.md section 3).
# Color is a verdict: components consume semantic tokens (paper/ink/ink2/
# hairline/muted/symbol/scarlet/afyellow/gray20), never raw Tailwind hues,
# and gradients are banned outright.
set -euo pipefail
cd "$(dirname "$0")/.."

HUES='red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|zinc|neutral|stone'
PREFIXES='bg|text|border|ring|divide|outline|decoration|from|via|to|fill|stroke|shadow|accent|caret|placeholder'

fail=0

if grep -rnE "\b($PREFIXES)-($HUES)-[0-9]{2,3}(/[0-9]+)?\b" web/src --include='*.tsx' --include='*.ts' --include='*.css'; then
  echo "FAIL: raw Tailwind hue classes found; use the brand tokens." >&2
  fail=1
fi

if grep -rn "bg-gradient" web/src --include='*.tsx' --include='*.ts' --include='*.css'; then
  echo "FAIL: gradients are banned." >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "brand check: clean"
