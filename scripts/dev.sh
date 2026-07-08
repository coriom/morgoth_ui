#!/usr/bin/env bash
# Launch Next.js dev server with LOUD failure — no silent port drift.
#
# Failure chain this closes:
#   1. Residual node process squats :3000 (usually a prior next dev
#      that didn't shut down cleanly).
#   2. `next dev` auto-shifts to :3001 without a warning that reads
#      like a warning.
#   3. Backend CORS allowlist knew only :3000 → every fetch blocked.
#   4. Operator sees a wall of CORS errors on a working backend.
#
# Contract: 3000 (or $PORT) or LOUD failure. Next's auto-shift is
# never allowed to engage — the script pre-clears the port and
# verifies right before exec.
set -euo pipefail

PORT="${PORT:-3000}"
API="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"

# ---- port reclaim (node/next only) -----------------------------------
# Extract PIDs holding the port. ss -H hides the header; sport = :N
# is ss's own filter syntax. sort -u collapses multi-thread listings.
pids=$(ss -tlnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)

if [[ -n "$pids" ]]; then
    # Look up each PID's comm. Kill only if EVERY squatter is
    # node/next — a python/postgres/other process squatting the port
    # is an operator concern, not something a UI dev script should
    # silently murder.
    all_safe=1
    names=""
    for pid in $pids; do
        comm=$(ps -o comm= -p "$pid" 2>/dev/null || echo "?")
        names="$names $pid=$comm"
        # comm can carry a version tail, e.g. ``next-server (v14`` (Linux
        # truncates comm to 15 chars). Substring match on the safe
        # roots, not exact equality, so a residual next dev is
        # reclaimable — that's the primary failure case this script
        # exists to fix.
        case "$comm" in
            node|node[!a-zA-Z0-9-]*|next|next-*|next-server*) ;;
            *) all_safe=0 ;;
        esac
    done
    if [[ $all_safe -eq 1 ]]; then
        echo "reclaiming :$PORT from pid(s):$names"
        # SIGTERM first, then SIGKILL 1s later on stragglers.
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
        echo "ABORT: port $PORT held by non-node process(es):$names" >&2
        echo "       free the port manually or set PORT=<other> to launch elsewhere." >&2
        exit 1
    fi
fi

# ---- env preflight ---------------------------------------------------
# .env.local carries NEXT_PUBLIC_API_URL for the wiki reader; without
# it the client falls through to a default that may not match the
# operator's backend.
if [[ ! -f .env.local ]]; then
    echo "ABORT: missing .env.local (NEXT_PUBLIC_API_URL) — create it first" >&2
    exit 1
fi

# ---- backend preflight (warn, don't block) --------------------------
# Front-end dev without backend is legitimate (component work); the
# warning surfaces the eventual page errors before they happen.
if ! curl -sf --max-time 2 "$API/api/brain/status" >/dev/null 2>&1; then
    echo "WARN: backend not responding at $API — pages will error until \`morgoth start\`" >&2
fi

# ---- final port verification -----------------------------------------
# Between reclaim and exec, race window: verify the port is actually
# free NOW. If a straggler survived both signals, we exit loud —
# rather than let Next auto-shift.
remaining=$(ss -tlnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
if [[ -n "$remaining" ]]; then
    holder=$(ps -o pid=,comm= -p $remaining 2>/dev/null | tr -s ' ')
    echo "ABORT: port $PORT still held after reclaim: $holder" >&2
    exit 1
fi

# ---- launch ----------------------------------------------------------
exec npx next dev -p "$PORT"
