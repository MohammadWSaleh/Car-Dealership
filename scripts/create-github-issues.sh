#!/usr/bin/env bash
# Run once, from the repo root, after `gh auth login` and after the repo exists.
# Usage: scripts/create-github-issues.sh OWNER/REPO
# Replace the five usernames below first.
set -euo pipefail
R="${1:?usage: $0 OWNER/REPO}"
WAJIH="github-user-1"; BADIH="github-user-2"; MUSTAFA="github-user-3"; MARIAM="github-user-4"; ALI="github-user-5"

gh label create feature -R "$R" -c 1558c7 -f >/dev/null
gh label create bug -R "$R" -c d73a4a -f >/dev/null
gh label create docs -R "$R" -c 0ea5e9 -f >/dev/null
gh label create demo -R "$R" -c f59e0b -f >/dev/null

for m in "M1 Core system (done)" "M2 Demo features" "M3 Testing and report" "M4 Presentation"; do
  gh api "repos/$R/milestones" -f title="$m" >/dev/null 2>&1 || true
done

mk() { gh issue create -R "$R" -t "$1" -b "$2" -l "$3" -m "$4" -a "$5" >/dev/null && echo "created: $1"; }

mk "F1 Budget-first car finder (monthly installment slider)" "Slider re-sorts cards live; settings for rate, term, down payment." "feature,demo" "M2 Demo features" "$BADIH"
mk "F2 Lebanon EV savings calculator" "Staff-set fuel and electricity prices; 5-year cost chart on EV pages." "feature,demo" "M2 Demo features" "$MUSTAFA"
mk "F3 Price history chart and 7-day price lock badge" "Chart on car page from price_history." "feature,demo" "M2 Demo features" "$WAJIH"
mk "F4 Instant trade-in estimate" "Formula range, saved request, consultant confirms offer valid 7 days." "feature,demo" "M2 Demo features" "$ALI"
mk "F5 QR test-drive pass with staff check-in" "QR on booking; staff scans or types code." "feature,demo" "M2 Demo features" "$MUSTAFA"
mk "F6 Smart order tracker" "Estimated delivery date, journey animation, notification per stage, delivery-day checklist." "feature,demo" "M2 Demo features" "$MARIAM"
mk "Full re-test and update TEST-REPORT" "Run all suites; update docs/TEST-REPORT.md." "docs" "M3 Testing and report" "$ALI"
mk "OpenProject: tasks, assignments and exported report" "Create tasks per member, export report for submission." "docs" "M3 Testing and report" "$WAJIH"
mk "Presentation deck and rehearsal" "Five parts, one per member; rehearse timing." "docs" "M4 Presentation" "$BADIH"
mk "Arabic native-speaker review" "Check all AR strings." "docs" "M3 Testing and report" "$MARIAM"
