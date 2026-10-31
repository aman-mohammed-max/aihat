#!/usr/bin/env bash
set -euo pipefail

DIAG_DIR="${RUNNER_TEMP:-/tmp}"
LOG_FILE="$DIAG_DIR/phonon-android-logcat.txt"
SCREEN_FILE="$DIAG_DIR/phonon-android-screen.png"

capture_diagnostics() {
  timeout 20s adb exec-out screencap -p > "$SCREEN_FILE" 2>/dev/null || true
  timeout 20s adb logcat -d -t 2000 > "$LOG_FILE" 2>&1 || true
  grep -E 'PHONON_SMOKE|AndroidRuntime|FATAL|Phonon|zstd|llama' "$LOG_FILE" | tail -80 || true
}

adb install android/app/build/outputs/apk/release/app-release.apk
adb shell am start -W -n com.amanm.aihat/.MainActivity

STARTED_AT=$SECONDS
DEADLINE=$((STARTED_AT + 3600))
attempt=0
while (( SECONDS < DEADLINE )); do
  attempt=$((attempt + 1))
  timeout --kill-after=2s 8s adb shell uiautomator dump /sdcard/phonon-smoke-window.xml >/dev/null 2>&1 || true
  XML=$(timeout --kill-after=2s 8s adb exec-out cat /sdcard/phonon-smoke-window.xml 2>/dev/null || true)
  if [[ "$XML" == *PHONON_SMOKE_PASS* ]]; then
    echo "$XML"
    exit 0
  fi
  if [[ "$XML" == *PHONON_SMOKE_FAILED* ]]; then
    echo "$XML"
    capture_diagnostics
    exit 1
  fi
  if (( attempt % 6 == 0 )); then
    echo "Smoke still running after $((SECONDS - STARTED_AT)) seconds: $(printf '%s' "$XML" | grep -oE 'text=\"[^\"]*\"|content-desc=\"[^\"]*\"' | tail -8 | tr '\n' ' ')"
  fi
  sleep 5
done

capture_diagnostics
echo "Mobile model smoke test timed out after $((SECONDS - STARTED_AT)) seconds."
exit 1
