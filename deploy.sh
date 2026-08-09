#!/usr/bin/env bash
#
# Publish the dashboard.
#
#   ./deploy.sh              merge the current branch into main and push
#   ./deploy.sh --branch     push the current branch only, don't publish
#
# Reads the GitHub token from ~/.growthops/github-token, which lives
# outside every repo so it can't be committed. The token is never passed
# on a command line — it goes into the remote URL for one call and is
# not written to .git/config.

set -euo pipefail

TOKEN_FILE="$HOME/.growthops/github-token"
REPO="github.com/growthkavya/growth-ops-dashboard.git"
cd "$(dirname "$0")"

if [[ ! -f "$TOKEN_FILE" ]]; then
    echo "No token at $TOKEN_FILE"
    echo "Create one at https://github.com/settings/tokens (classic, 'repo' scope)"
    echo "while signed in as growthkavya, then save it there on one line."
    exit 1
fi

TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
AUTH_URL="https://x-access-token:${TOKEN}@${REPO}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Never leak the token if git echoes the URL back in an error.
scrub() { sed -E 's#https://[^@]*@#https://<token>@#g'; }

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Uncommitted changes — commit them first:"
    git status --short
    exit 1
fi

echo "Pushing $BRANCH…"
git push "$AUTH_URL" "$BRANCH" 2>&1 | scrub

if [[ "${1:-}" == "--branch" ]]; then
    echo "Branch pushed. Not published — run without --branch to go live."
    exit 0
fi

if [[ "$BRANCH" != "main" ]]; then
    echo "Merging $BRANCH into main…"
    git fetch "$AUTH_URL" main:refs/remotes/origin/main 2>&1 | scrub || true
    git checkout main
    git merge --no-ff "$BRANCH" -m "Merge $BRANCH"
fi

echo "Publishing to main…"
git push "$AUTH_URL" main 2>&1 | scrub
git fetch origin 2>/dev/null || true

echo
echo "Live in about a minute: https://growthkavya.github.io/growth-ops-dashboard/"
echo "Tell the team to hard-refresh (Ctrl+Shift+R) if they have it open."
