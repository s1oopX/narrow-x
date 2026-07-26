#!/usr/bin/env bash
set -euo pipefail

is_maintenance_path() {
  case "$1" in
    server/*|deploy/*.service|deploy/nginx.conf) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ "${1:-}" == "--policy-self-test" ]]; then
  is_maintenance_path server/oauth.mjs
  is_maintenance_path deploy/example.service
  is_maintenance_path deploy/nginx.conf
  ! is_maintenance_path docs/vps.md
  ! is_maintenance_path scripts/deploy-vps.sh
  echo 'Deploy maintenance policy self-test passed.'
  exit 0
fi

# The webhook runs this script from the deploy checkout, and the deploy
# itself rewrites that checkout (git reset --hard). Wrapping the body in a
# function forces bash to parse the whole script before executing any of
# it, so a mid-run rewrite can never change what this invocation executes.
main() {
  APP_DIR="${APP_DIR:-/var/www/narrow-x}"
  REPO_DIR="${REPO_DIR:-$APP_DIR}"
  RELEASES_DIR="${RELEASES_DIR:-$APP_DIR/releases}"
  CURRENT_LINK="${CURRENT_LINK:-$APP_DIR/current}"
  DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
  DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
  KEEP_RELEASES="${KEEP_RELEASES:-3}"
  LOCK_FILE="${DEPLOY_LOCK_FILE:-$APP_DIR/.deploy.lock}"
  HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-http://127.0.0.1/healthz}"
  HEALTHCHECK_HOST="${DEPLOY_HEALTHCHECK_HOST:-example.com}"
  SITE_CHECK_URL="${DEPLOY_SITE_CHECK_URL:-http://127.0.0.1/}"
  DEPLOY_HOME="${DEPLOY_HOME:-$RELEASES_DIR/.home}"
  ALLOW_MAINTENANCE="${DEPLOY_ALLOW_MAINTENANCE:-0}"
  MIN_FREE_MB="${DEPLOY_MIN_FREE_MB:-2048}"
  export HOME="$DEPLOY_HOME"
  export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$RELEASES_DIR/.config}"
  export ASTRO_TELEMETRY_DISABLED="${ASTRO_TELEMETRY_DISABLED:-1}"

  health_gate() {
    if ! curl --fail --silent --show-error --max-time 10 -H "Host: $HEALTHCHECK_HOST" "$HEALTHCHECK_URL" >/dev/null; then
      echo "Health endpoint check failed: $HEALTHCHECK_URL" >&2
      return 1
    fi
    local home_response home_status home_body
    if ! home_response="$(curl --silent --show-error --max-time 10 -o - -w $'\n%{http_code}' -H "Host: $HEALTHCHECK_HOST" "$SITE_CHECK_URL")"; then
      echo "Site root check failed: $SITE_CHECK_URL" >&2
      return 1
    fi
    home_status="${home_response##*$'\n'}"
    home_body="${home_response%$'\n'*}"
    if [[ "$home_status" != '200' ]]; then
      echo "Site root returned HTTP $home_status, expected 200: $SITE_CHECK_URL" >&2
      return 1
    fi
    if ! grep -qi '<html' <<<"$home_body"; then
      echo "Site root response does not look like an HTML page: $SITE_CHECK_URL" >&2
      return 1
    fi
    return 0
  }

  mkdir -p "$RELEASES_DIR"
  mkdir -p "$HOME" "$XDG_CONFIG_HOME"
  chmod 700 "$HOME" "$XDG_CONFIG_HOME"

  if ! [[ "$MIN_FREE_MB" =~ ^[0-9]+$ ]]; then
    echo "DEPLOY_MIN_FREE_MB must be a non-negative integer, got: $MIN_FREE_MB" >&2
    exit 1
  fi
  free_mb="$(df -Pm "$RELEASES_DIR" | awk 'NR==2 {print $4}')"
  if ! [[ "$free_mb" =~ ^[0-9]+$ ]] || (( free_mb < MIN_FREE_MB )); then
    echo "Refusing to deploy: ${free_mb:-unknown} MiB free on the filesystem of $RELEASES_DIR, need at least $MIN_FREE_MB MiB (DEPLOY_MIN_FREE_MB)." >&2
    exit 1
  fi

  exec 9>"$LOCK_FILE"
  flock -n 9 || { echo "Another deployment holds the lock ($LOCK_FILE); refusing to run concurrently." >&2; exit 1; }

  cd "$REPO_DIR"
  timeout 300 git fetch --quiet "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"
  commit="$(git rev-parse "$DEPLOY_REMOTE/$DEPLOY_BRANCH")"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Refusing to deploy with tracked changes in $REPO_DIR" >&2
    exit 1
  fi
  current_commit="$(git rev-parse HEAD)"
  maintenance_changes=()
  while IFS= read -r changed_path; do
    if is_maintenance_path "$changed_path"; then
      maintenance_changes+=("$changed_path")
    fi
  done < <(git diff --name-only "$current_commit" "$commit" --)
  if (( ${#maintenance_changes[@]} )) && [[ "$ALLOW_MAINTENANCE" != '1' ]]; then
    printf 'Refusing webhook deployment with maintenance changes:\n' >&2
    printf '  %s\n' "${maintenance_changes[@]}" >&2
    echo 'Run a maintenance deployment with DEPLOY_ALLOW_MAINTENANCE=1, then install changed service/Nginx config and restart the affected services.' >&2
    exit 1
  fi
  # The deploy checkout is disposable: force it to match the remote branch so
  # force-pushed history never wedges the deploy (no merge semantics required).
  git reset --hard "$commit" >/dev/null
  release_dir="$RELEASES_DIR/$commit"
  temp_dir="$RELEASES_DIR/.${commit}.tmp.$$"
  link_tmp="${CURRENT_LINK}.next.$$"
  previous_target=''

  cleanup() {
    if [[ -n "$temp_dir" && -d "$temp_dir" ]]; then
      case "$temp_dir" in
        "$RELEASES_DIR"/.*) rm -rf -- "$temp_dir" ;;
        *) echo "Refusing to remove unexpected temporary path: $temp_dir" >&2; exit 1 ;;
      esac
    fi
    if [[ -L "$link_tmp" ]]; then
      rm -f -- "$link_tmp"
    fi
    return 0
  }
  trap cleanup EXIT

  if [[ ! -s "$release_dir/dist/index.html" ]]; then
    mkdir "$temp_dir"
    git archive "$commit" | tar -x -C "$temp_dir"
    cd "$temp_dir"

    pnpm install --frozen-lockfile
    pnpm run typecheck
    pnpm run oauth:self-test
    pnpm run deploy:self-test
    ASTRO_SITE="${ASTRO_SITE:-https://example.com}" pnpm build
    pnpm run links:self-test
  pnpm run csp:self-test
    test -s dist/index.html
    test -s dist/healthz
    test -s dist/sitemap.xml

    cd "$REPO_DIR"
    mv -- "$temp_dir" "$release_dir"
    temp_dir=''
  else
    echo "Using existing release $commit."
  fi

  if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
    echo "Refusing to replace non-symlink current path: $CURRENT_LINK" >&2
    exit 1
  fi

  if [[ -L "$CURRENT_LINK" ]]; then
    previous_target="$(readlink "$CURRENT_LINK")"
  fi

  ln -s "$release_dir/dist" "$link_tmp"
  mv -Tf -- "$link_tmp" "$CURRENT_LINK"

  if ! health_gate; then
    echo 'Deployment health check failed; restoring the previous release.' >&2
    if [[ -n "$previous_target" ]]; then
      rollback_link="${CURRENT_LINK}.rollback.$$"
      ln -s "$previous_target" "$rollback_link"
      mv -Tf -- "$rollback_link" "$CURRENT_LINK"
    else
      rm -f -- "$CURRENT_LINK"
    fi
    exit 1
  fi

  mapfile -t releases < <(
    find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9a-f]{40,64}' -printf '%T@ %p\n' |
      sort -nr |
      cut -d' ' -f2-
  )
  keep_count=$((KEEP_RELEASES < 1 ? 1 : KEEP_RELEASES))
  old_release_count=$((keep_count - 1))
  for release in "${releases[@]}"; do
    [[ "$release" == "$release_dir" ]] && continue
    if (( old_release_count > 0 )); then
      old_release_count=$((old_release_count - 1))
      continue
    fi
    case "$release" in
      # Removes the entire release directory, including its node_modules.
      "$RELEASES_DIR"/[0-9a-f]*) rm -rf -- "$release" ;;
      *) echo "Refusing to remove unexpected release path: $release" >&2; exit 1 ;;
    esac
  done

  # Drop store entries that no longer back any release's node_modules.
  if ! pnpm store prune; then
    echo 'Warning: pnpm store prune failed; the deploy itself succeeded.' >&2
  fi

  if (( ${#maintenance_changes[@]} )); then
    printf 'Maintenance deployment completed for:\n'
    printf '  %s\n' "${maintenance_changes[@]}"
    echo 'Install changed service/Nginx config and restart the affected services before accepting this release.'
  fi

  echo "Deployed $commit"
}

main "$@"
