#!/usr/bin/env bash
# Deploy the StudyAlign example apps: pull, rebuild, restart. Triggered by a
# webhook on push to main. Caddy and the webhook daemon are configured once on
# the VM; this touches neither. Safe to run by hand too. Expect a few seconds of
# downtime on restart.
set -Eeuo pipefail

REPO=/opt/studyalign/app-examples
BRANCH=main
HEALTH_TIMEOUT=180
LOCK_FILE=/tmp/deploy-studyalign-examples.lock

log()  { printf '==> %s\n' "$*"; }
warn() { printf '!!! %s\n' "$*" >&2; }
die()  { printf 'ERR %s\n' "$*" >&2; exit 1; }

# Single-flight: two pushes landing together must not interleave builds.
exec 9>"$LOCK_FILE"
flock -n 9 || die "another deploy is already running"

cd "$REPO" 2>/dev/null || die "no checkout at $REPO"

# `docker compose` reads $REPO/.env itself (with COMPOSE_FILE set there). Just
# fail early with a clear message if it is missing.
[ -f "$REPO/.env" ] || die "$REPO/.env is missing (gitignored -- create it on the server)"

PREVIOUS=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)

# --- source (skip the pull with DEPLOY_SKIP_GIT=1) ---------------------------
if [ "${DEPLOY_SKIP_GIT:-0}" = "1" ]; then
    warn "DEPLOY_SKIP_GIT=1 -- deploying the working tree, not origin/$BRANCH"
else
    log "pulling origin/$BRANCH"
    git fetch --prune origin "$BRANCH"
    # Hard reset, not merge: the server checkout is a build artefact.
    git reset --hard "origin/$BRANCH"
fi
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)

# --- build and restart (--wait gates on the healthchecks) --------------------
log "deploying $TAG (was $PREVIOUS)"
if ! docker compose up -d --build --remove-orphans \
        --wait --wait-timeout "$HEALTH_TIMEOUT"; then
    warn "stack did not come up healthy"
    docker compose logs --tail 40 || true
    warn "to go back:  git -C $REPO reset --hard $PREVIOUS && $0"
    exit 1
fi

# --- confirm it actually serves, through the proxy container -----------------
log "checking the reverse proxy responds"
for _ in $(seq 1 10); do
    if docker compose exec -T proxy wget -q -O /dev/null http://127.0.0.1/ 2>/dev/null; then
        docker image prune -f >/dev/null || true
        log "done: serving $TAG"
        exit 0
    fi
    sleep 2
done

warn "health check never passed"
docker compose logs --tail 40 || true
warn "to go back:  git -C $REPO reset --hard $PREVIOUS && $0"
exit 1
