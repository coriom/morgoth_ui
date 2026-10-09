"""Read bounded finalization metadata from one disposable managed Project."""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from collections.abc import Mapping, Sequence
import json
import os
import re
import sys
from uuid import UUID

import asyncpg
from loguru import logger

from core.project import current_namespace
from memory.persistent import CYCLE_FAILURE_STAGES

logger.remove()


def test_db() -> str:
    """Require the isolated test database, never a production database."""
    dsn = os.environ["MORGOTH_TEST_POSTGRES_URL"]
    if not dsn.startswith("postgresql://") or not dsn.split("?")[0].endswith("/morgoth_test"):
        raise RuntimeError("TEST_DATABASE_REQUIRED")
    return dsn


def decode_json(value: object) -> object:
    """Decode asyncpg JSONB values without changing their content."""
    return json.loads(value) if isinstance(value, str) else value


def sanitize_cycle_failures(rows: Sequence[Mapping[str, object]]) -> list[dict[str, object]]:
    """Emit only fixed-stage, bounded class metadata, ignoring every other DB field."""
    if len(rows) > 20:
        raise RuntimeError("CYCLE_FAILURE_BOUND_EXCEEDED")
    safe = []
    for row in rows:
        cycle, stage, error_class = row["cycle"], row["stage"], row["error_class"]
        if (not isinstance(cycle, int) or isinstance(cycle, bool) or cycle < 1
                or not isinstance(stage, str) or stage not in CYCLE_FAILURE_STAGES
                or not isinstance(error_class, str)
                or re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}", error_class) is None):
            raise RuntimeError("INVALID_CYCLE_FAILURE_RECORD")
        safe.append({"cycle": cycle, "stage": stage, "error_class": error_class})
    return safe


async def inspect(objective_id: str) -> dict[str, object]:
    """Inspect a single Project snapshot without writing or emitting raw content."""
    namespace = current_namespace()
    schema = namespace.postgres_schema
    if namespace.is_legacy or not schema.startswith("p_"):
        raise RuntimeError("MANAGED_PROJECT_REQUIRED")
    conn = await asyncpg.connect(test_db(), server_settings={"search_path": schema})
    try:
        async with conn.transaction(isolation="repeatable_read", readonly=True):
            if await conn.fetchval("SELECT current_database()") != "morgoth_test":
                raise RuntimeError("TEST_DATABASE_REQUIRED")
            if await conn.fetchval("SELECT current_schema()") != schema:
                raise RuntimeError("PROJECT_SCHEMA_MISMATCH")
            selected_id = UUID(objective_id)
            row = await conn.fetchrow(
                "SELECT objective_id, status, generated_by, cycle_count, sources_used, "
                "jsonb_array_length(evidence) AS evidence_count "
                "FROM objectives WHERE objective_id=$1", selected_id,
            )
            if row is None:
                raise RuntimeError("OBJECTIVE_MISSING")
            if row["evidence_count"] > 40:
                raise RuntimeError("EVIDENCE_BOUND_EXCEEDED")
            failure_rows = await conn.fetch(
                "SELECT cycle, stage, error_class FROM objective_cycle_failures "
                "WHERE objective_id=$1 ORDER BY occurred_at, failure_id LIMIT 21",
                selected_id,
            )
            cycle_failures = sanitize_cycle_failures(failure_rows)
            objective_count = await conn.fetchval("SELECT count(*) FROM objectives")
            entries = await conn.fetch(
                "SELECT entry.value->>'type' AS type FROM objectives o, "
                "LATERAL jsonb_array_elements(o.evidence) AS entry(value) "
                "WHERE o.objective_id=$1", selected_id,
            )
            payload_count = sum(e["type"] == "cycle_payload" for e in entries)
            synthesis_count = sum(e["type"] == "synthesis" for e in entries)
            tool_rows = await conn.fetch(
                "SELECT tool.value->>'tool' AS name, tool.value->>'success' AS success "
                "FROM objectives o, LATERAL jsonb_array_elements(o.evidence) AS entry(value), "
                "LATERAL jsonb_array_elements(CASE WHEN entry.value->>'type'='cycle_payload' "
                "THEN coalesce(entry.value->'tool_results','[]'::jsonb) ELSE '[]'::jsonb END) AS tool(value) "
                "WHERE o.objective_id=$1 LIMIT 101", selected_id,
            )
            if len(tool_rows) > 100:
                raise RuntimeError("TOOLS_BOUND_EXCEEDED")
            tools = [
                {"name": t["name"] or "", "success": t["success"] == "true"}
                for t in tool_rows
            ]
            synthesis = await conn.fetchrow(
                "SELECT octet_length(entry.value->>'content') AS bytes, "
                "md5(entry.value->>'content') AS digest, entry.value->'sources' AS sources "
                "FROM objectives o, LATERAL jsonb_array_elements(o.evidence) AS entry(value) "
                "WHERE o.objective_id=$1 AND entry.value->>'type'='synthesis' LIMIT 1",
                selected_id,
            )
            call_count = await conn.fetchval(
                "SELECT count(*) FROM llm_calls WHERE task IN ('synthesis','thesis')"
            )
            if call_count > 20:
                raise RuntimeError("CALLS_BOUND_EXCEEDED")
            calls = await conn.fetch(
                "SELECT task, provider, outcome, response_bytes FROM llm_calls "
                "WHERE task IN ('synthesis','thesis') ORDER BY created_at, id"
            )
            fidelity = await conn.fetch(
                "SELECT subject, action, reason FROM numeric_fidelity_events WHERE objective_id=$1 LIMIT 41",
                objective_id,
            )
            if len(fidelity) > 40:
                raise RuntimeError("FIDELITY_BOUND_EXCEEDED")
            theses = await conn.fetch(
                "SELECT thesis_id, subject FROM theses WHERE objective_id=$1 "
                "ORDER BY created_at, thesis_id LIMIT 21",
                objective_id,
            )
            if len(theses) > 20:
                raise RuntimeError("THESES_BOUND_EXCEEDED")
            abstentions = await conn.fetchval(
                "SELECT count(*) FROM abstention_events WHERE objective_id=$1", objective_id,
            )
            fallbacks = await conn.fetchval("SELECT count(*) FROM llm_fallback_events")
            confusion = await conn.fetchval("SELECT count(*) FROM field_confusion_events")
            sources = decode_json(row["sources_used"]) or []
            if not isinstance(sources, list) or len(sources) > 20:
                raise RuntimeError("MALFORMED_SOURCES")
            synthesis_sources = decode_json(synthesis["sources"]) if synthesis else []
            if not isinstance(synthesis_sources, list) or len(synthesis_sources) > 20:
                raise RuntimeError("MALFORMED_SYNTHESIS_SOURCES")
            return {
                "objective_id": str(row["objective_id"]),
                "objective_count": objective_count,
                "generated_by": row["generated_by"],
                "status": row["status"],
                "cycle_count": row["cycle_count"],
                "sources_used": sources,
                "payload_count": payload_count,
                "cycle_failures": cycle_failures,
                "tools": tools,
                "synthesis_count": synthesis_count,
                "synthesis_bytes": synthesis["bytes"] if synthesis and synthesis["bytes"] else 0,
                "synthesis_md5": synthesis["digest"] if synthesis else None,
                "synthesis_sources": synthesis_sources,
                "llm_calls": [dict(call) for call in calls],
                "fallback_count": fallbacks,
                "theses": [{"id": str(t["thesis_id"])} for t in theses],
                "persisted_drop_subject_count": sum(
                    any(f["subject"] == t["subject"] and f["action"] == "drop" for f in fidelity)
                    for t in theses
                ),
                "persisted_accepted_subject_count": sum(
                    any(f["subject"] == t["subject"] and f["action"] in ("pass", "rewrite") for f in fidelity)
                    for t in theses
                ),
                "fidelity_actions": dict(Counter(f["action"] for f in fidelity)),
                "fidelity_reasons": dict(Counter(
                    reason if re.fullmatch(r"[a-z0-9_]{1,80}", reason := str(f["reason"] or "none"))
                    else "other"
                    for f in fidelity
                )),
                "field_confusion_count": confusion,
                "abstention_count": abstentions,
            }
    finally:
        await conn.close()


def main() -> None:
    """Print sanitized JSON metadata for the named disposable objective."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--objective-id", required=True)
    args = parser.parse_args()
    UUID(args.objective_id)
    print(json.dumps(asyncio.run(inspect(args.objective_id)), sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"HELPER_ERROR:{type(exc).__name__}", file=sys.stderr)
        raise SystemExit(1) from None
