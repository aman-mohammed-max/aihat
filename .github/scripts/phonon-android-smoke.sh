#!/usr/bin/env bash
set -euo pipefail

DIAG_DIR="${RUNNER_TEMP:-/tmp}"
LOG_FILE="$DIAG_DIR/phonon-android-logcat.txt"
SCREEN_FILE="$DIAG_DIR/phonon-android-screen.png"
PROGRESS_FILE="$DIAG_DIR/phonon-android-progress.txt"
ACTIVITY_FILE="$DIAG_DIR/phonon-android-activity.txt"
SMOKE_TIMEOUT_SECONDS=1200
APP_UI_TIMEOUT_SECONDS=120
TIMEOUT_BIN=timeout
if ! command -v "$TIMEOUT_BIN" >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout; fi
command -v "$TIMEOUT_BIN" >/dev/null

record_progress() {
  local xml="$1"
  local status
  status=$(printf '%s' "$xml" | grep -oE 'text="PHONON_SMOKE[^"]*"|content-desc="PHONON_SMOKE[^"]*"' | sed -E 's/^[^=]+="//; s/"$//' | tail -1 || true)
  if [[ -n "$status" && "$status" != "${LAST_STATUS:-}" ]]; then
    LAST_STATUS="$status"
    printf '%s %s\n' "$(date -u +%FT%TZ)" "$status" | tee -a "$PROGRESS_FILE"
  fi
}

capture_diagnostics() {
  "$TIMEOUT_BIN" --kill-after=2s 20s adb exec-out screencap -p > "$SCREEN_FILE" 2>/dev/null || true
  "$TIMEOUT_BIN" --kill-after=2s 30s adb logcat -b all -d > "$LOG_FILE" 2>&1 || true
  {
    echo '=== app process ==='
    "$TIMEOUT_BIN" --kill-after=2s 10s adb shell pidof com.amanm.aihat || true
    echo '=== resumed activity ==='
    "$TIMEOUT_BIN" --kill-after=2s 15s adb shell dumpsys activity activities |
      grep -E 'ResumedActivity|mResumedActivity|topResumedActivity|com\.amanm\.aihat' | tail -30 || true
    echo '=== focused window ==='
    "$TIMEOUT_BIN" --kill-after=2s 15s adb shell dumpsys window windows |
      grep -E 'mCurrentFocus|mFocusedApp|com\.amanm\.aihat' | tail -30 || true
  } > "$ACTIVITY_FILE" 2>&1
  grep -E 'PHONON_SMOKE|AndroidRuntime|FATAL|Phonon|zstd|llama' "$LOG_FILE" | tail -120 || true
  cat "$ACTIVITY_FILE"
}

"$TIMEOUT_BIN" --kill-after=2s 10s adb logcat -c || true
if ! adb install android/app/build/outputs/apk/release/app-release.apk; then
  echo 'Could not install the ARM64 release APK on the Android emulator.'
  capture_diagnostics
  exit 1
fi
if ! adb shell am start -W -n com.amanm.aihat/.MainActivity; then
  echo 'Could not launch the app activity on the Android emulator.'
  capture_diagnostics
  exit 1
fi
LAST_STATUS=''

STARTED_AT=$SECONDS
DEADLINE=$((STARTED_AT + SMOKE_TIMEOUT_SECONDS))
attempt=0
APP_UI_READY=0
while (( SECONDS < DEADLINE )); do
  attempt=$((attempt + 1))
  "$TIMEOUT_BIN" --kill-after=2s 8s adb shell uiautomator dump /sdcard/phonon-smoke-window.xml >/dev/null 2>&1 || true
  XML=$("$TIMEOUT_BIN" --kill-after=2s 8s adb exec-out cat /sdcard/phonon-smoke-window.xml 2>/dev/null || true)
  record_progress "$XML"
  if [[ "$XML" == *PHONON_SMOKE_DISABLED* ]]; then
    echo 'Phonon smoke route is present but disabled in the Android release bundle.'
    capture_diagnostics
    exit 1
  fi
  if [[ "$XML" == *PHONON_SMOKE_* ]]; then APP_UI_READY=1; fi
  if [[ "$XML" == *PHONON_SMOKE_PASS* ]]; then
    echo "$XML"
    exit 0
  fi
  if [[ "$XML" == *PHONON_SMOKE_FAILED* ]]; then
    echo "$XML"
    capture_diagnostics
    exit 1
  fi
  if (( APP_UI_READY == 0 && SECONDS - STARTED_AT >= APP_UI_TIMEOUT_SECONDS )); then
    echo "The Android app did not show its smoke screen within ${APP_UI_TIMEOUT_SECONDS} seconds."
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
