#!/usr/bin/env bash
set -euo pipefail

adb install android/app/build/outputs/apk/release/app-release.apk
adb shell am start -W -a android.intent.action.VIEW -d 'aihat:///phonon-smoke' com.amanm.aihat

for attempt in $(seq 1 360); do
  adb shell uiautomator dump /sdcard/phonon-smoke-window.xml >/dev/null 2>&1 || true
  XML=$(adb exec-out cat /sdcard/phonon-smoke-window.xml 2>/dev/null || true)
  if [[ "$XML" == *PHONON_SMOKE_PASS* ]]; then
    echo "$XML"
    exit 0
  fi
  if [[ "$XML" == *PHONON_SMOKE_FAILED* ]]; then
    echo "$XML"
    adb logcat -d -t 1000 | grep -E 'PHONON_SMOKE|AndroidRuntime|FATAL|Phonon|zstd' | tail -80 || true
    exit 1
  fi
  sleep 5
done

adb logcat -d -t 1000 | grep -E 'PHONON_SMOKE|AndroidRuntime|FATAL|Phonon|zstd' | tail -80 || true
echo 'Phonon Android runtime smoke test timed out.'
exit 1
