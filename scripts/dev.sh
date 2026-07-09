#!/usr/bin/env bash
# Launch Next.js dev server on Morgoth territory (3010-3019).
#
# Territory (operator-declared):
#   8000        backend        — fixed, never moved
#   3010        Morgoth front  — default
#   3011-3019   Morgoth spillover — safe to set PORT= into this range
#   3000-3001   operator's other projects — NEVER touched, NEVER killed
#
# Contract:
#   - Default port comes from $MORGOTH_UI_PORT (via .env.local) with a
#     3010 fallback. Operator override wins: PORT=<n> beats the file.
#   - Reclaim rule (self-only): kill ONLY a node process whose /proc
#     cwd is THIS repo. Anything else — foreign node, python, the
#     invisible WSL relay, postgres, kernel — triggers a LOUD abort.
#     The old "kill any node on the port" rule is REVOKED — the
#     contested party is now the operator's own project.
#   - .env.local preflight, backend warn-not-block, pre-exec port-free
#     verify (no Next auto-shift, ever).
set -euo pipefail

# Load .env.local so MORGOTH_UI_PORT is picked up without exporting
# it in the shell. We only source it if it exists — the preflight
# below still enforces its presence for the wiki-reader vars.
if [[ -f .env.local ]]; then
    # shellcheck disable=SC1091
    set -a; source .env.local; set +a
fi

PORT="${PORT:-${MORGOTH_UI_PORT:-3010}}"
API="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"
REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

# ---- port reclaim (own-repo node only) -----------------------------
pids=$(ss -tlnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)

if [[ -n "$pids" ]]; then
    # Any pid whose comm we can't read at all (kernel-namespaced,
    # WSL relay, cross-user, etc.) is by definition NOT this repo's
    # node process → abort. Same for any non-node comm.
    all_own_repo=1
    holders=""
    for pid in $pids; do
        comm=$(ps -o comm= -p "$pid" 2>/dev/null || true)
        cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || true)
        # Empty comm means the process is not visible to this user
        # (Windows-side WSL relay is the classic case). NEVER kill.
        if [[ -z "$comm" ]]; then
            holders="$holders pid=$pid comm=invisible cwd=?"
            all_own_repo=0
            continue
        fi
        holders="$holders pid=$pid comm=$comm cwd=${cwd:-?}"
        # comm may be truncated (Linux caps to 15) — accept the
        # node/next-* family, but ONLY if cwd matches this repo.
        case "$comm" in
            node|next|next-*|next-server*) ;;
            *) all_own_repo=0; continue ;;
        esac
        # cwd resolution failed OR cwd is not this repo → foreign
        # process, hands off.
        if [[ -z "$cwd" || "$cwd" != "$REPO_DIR"* ]]; then
            all_own_repo=0
        fi
    done

    if [[ $all_own_repo -eq 1 ]]; then
        echo "reclaimed :$PORT from stale morgoth_ui pid(s):$holders"
        for pid in $pids; do
            kill -TERM "$pid" 2>/dev/null || true
        done
        sleep 1
        for pid in $pids; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
        sleep 1
    else
        echo "ABORT: port $PORT held by:${holders}" >&2
        echo "       — likely another project or the WSL relay." >&2
        echo "       Morgoth territory is 3010-3019 —" \
             "set PORT=3011..3019 or free the port." >&2
        exit 1
    fi
fi

# ---- env preflight -------------------------------------------------
if [[ ! -f .env.local ]]; then
    echo "ABORT: missing .env.local (NEXT_PUBLIC_API_URL, MORGOTH_UI_PORT) — create it first" >&2
    exit 1
fi

# ---- backend preflight (warn, don't block) ------------------------
if ! curl -sf --max-time 2 "$API/api/brain/status" >/dev/null 2>&1; then
    echo "WARN: backend not responding at $API — pages will error until \`morgoth start\`" >&2
fi

# ---- final port verification --------------------------------------
remaining=$(ss -tlnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
if [[ -n "$remaining" ]]; then
    holder=$(ps -o pid=,comm= -p $remaining 2>/dev/null | tr -s ' ')
    echo "ABORT: port $PORT still held after reclaim: $holder" >&2
    exit 1
fi

echo "launching next dev on :$PORT (Morgoth territory)"
exec npx next dev -p "$PORT"
