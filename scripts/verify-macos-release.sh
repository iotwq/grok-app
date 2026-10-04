#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <target-triple>" >&2
  exit 2
fi

BUNDLE_ROOT="src-tauri/target/${TARGET}/release/bundle"
if [[ ! -d "$BUNDLE_ROOT" ]]; then
  BUNDLE_ROOT="src-tauri/target/release/bundle"
fi

APP="$(find "$BUNDLE_ROOT/macos" -maxdepth 1 -type d -name '*.app' -print -quit 2>/dev/null || true)"
DMG="$(find "$BUNDLE_ROOT/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit 2>/dev/null || true)"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "error: macOS app bundle is missing under $BUNDLE_ROOT/macos" >&2
  exit 1
fi
if [[ -z "$DMG" || ! -f "$DMG" ]]; then
  echo "error: macOS DMG is missing under $BUNDLE_ROOT/dmg" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP"
IDENTITY="$(codesign -dv --verbose=4 "$APP" 2>&1 | awk -F= '/^Authority=/{print substr($0, index($0, "=") + 1); exit}')"
case "$IDENTITY" in
  "Developer ID Application:"*) ;;
  *)
    echo "error: app is not signed with a Developer ID Application identity" >&2
    echo "       observed identity: ${IDENTITY:-<none>}" >&2
    exit 1
    ;;
esac

hdiutil verify "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"
echo "macOS signature and notarization verified: $DMG"
