#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/narrow-x}"
RELEASES_DIR="${RELEASES_DIR:-$APP_DIR/releases}"
CURRENT_LINK="${CURRENT_LINK:-$APP_DIR/current}"
HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-http://127.0.0.1/healthz}"
HEALTHCHECK_HOST="${DEPLOY_HEALTHCHECK_HOST:-example.com}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-$APP_DIR/.deploy.lock}"
TARGET_COMMIT="${ROLLBACK_TO:-}"

if [[ ! -d "$RELEASES_DIR" ]]; then
  echo "Expected release directory: $RELEASES_DIR" >&2
  exit 1
fi
if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  echo "Refusing to replace non-symlink current path: $CURRENT_LINK" >&2
  exit 1
fi

exec 9>"$LOCK_FILE"
flock -n 9 || { echo 'A deployment is already running.' >&2; exit 1; }

# A failed deploy can leave `current` missing or dangling; tolerate that and
# restore the newest complete release instead of refusing to run.
current_dir=''
if [[ -L "$CURRENT_LINK" ]]; then
  current_dir="$(realpath -e "$CURRENT_LINK" 2>/dev/null || true)"
fi
if [[ -n "$current_dir" ]]; then
  case "$current_dir" in
    "$RELEASES_DIR"/*) ;;
    *) echo "Current target is outside releases: $current_dir" >&2; exit 1 ;;
  esac
else
  echo 'Current symlink is missing or dangling; selecting the newest complete release.'
fi

if [[ -z "$TARGET_COMMIT" ]]; then
  mapfile -t release_lines < <(
    find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9a-f]{40,64}' -printf '%T@ %p\n' |
      sort -nr
  )
  current_release_dir=''
  cur_t=''
  if [[ -n "$current_dir" ]]; then
    current_release_dir="$(dirname "$current_dir")"
    for line in "${release_lines[@]}"; do
      if [[ "${line#* }" == "$current_release_dir" ]]; then
        cur_t="${line%% *}"
        break
      fi
    done
    if [[ -z "$cur_t" ]]; then
      echo "Current release $current_release_dir was not found among releases; pass ROLLBACK_TO explicitly." >&2
      exit 1
    fi
  fi
  # Pick the newest release strictly older (mtime) than the current target so
  # repeated rollbacks walk backward instead of ping-ponging between two releases.
  for line in "${release_lines[@]}"; do
    release_t="${line%% *}"
    release_path="${line#* }"
    if [[ -n "$current_dir" ]]; then
      [[ "$release_path" == "$current_release_dir" ]] && continue
      awk -v a="$release_t" -v b="$cur_t" 'BEGIN { exit !(a < b) }' || continue
    fi
    if [[ -s "$release_path/dist/index.html" ]]; then
      TARGET_COMMIT="$(basename "$release_path")"
      break
    fi
  done
  if [[ -z "$TARGET_COMMIT" ]]; then
    if [[ -n "$current_dir" ]]; then
      echo "No complete release strictly older than the current target exists; pass ROLLBACK_TO=<full-commit> to select one explicitly." >&2
    else
      echo 'No complete release is available to restore.' >&2
    fi
    exit 1
  fi
fi

if [[ ! "$TARGET_COMMIT" =~ ^[0-9a-f]{40,64}$ ]]; then
  echo 'ROLLBACK_TO must be a release commit, or an older complete release must exist.' >&2
  exit 1
fi

target_dir="$(realpath -e "$RELEASES_DIR/$TARGET_COMMIT/dist" 2>/dev/null || true)"
case "$target_dir" in
  "$RELEASES_DIR"/*) ;;
  *) echo "Rollback target is outside releases: $target_dir" >&2; exit 1 ;;
esac
if [[ ! -s "$target_dir/index.html" ]]; then
  echo "Rollback target is not a complete release: $target_dir" >&2
  exit 1
fi

link_tmp="${CURRENT_LINK}.rollback.$$"
restore_tmp="${CURRENT_LINK}.restore.$$"
cleanup() {
  rm -f -- "$link_tmp" "$restore_tmp"
}
trap cleanup EXIT

ln -s "$target_dir" "$link_tmp"
mv -Tf -- "$link_tmp" "$CURRENT_LINK"

if ! curl --fail --silent --show-error --max-time 10 -H "Host: $HEALTHCHECK_HOST" "$HEALTHCHECK_URL" >/dev/null; then
  echo 'Rollback health check failed; restoring the previous state.' >&2
  if [[ -n "$current_dir" ]]; then
    ln -s "$current_dir" "$restore_tmp"
    mv -Tf -- "$restore_tmp" "$CURRENT_LINK"
  else
    rm -f -- "$CURRENT_LINK"
  fi
  exit 1
fi

if [[ -n "$current_dir" ]]; then
  echo "Rolled back from $(basename "$(dirname "$current_dir")") to $TARGET_COMMIT"
else
  echo "Restored missing current symlink to $TARGET_COMMIT"
fi
