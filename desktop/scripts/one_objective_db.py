"""Disposable morgoth_test objective seed and bounded evidence inspection."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from uuid import UUID

import asyncpg
from loguru import logger

from core.project import current_namespace

logger.remove()  # Diagnostic output is a bounded error type, never raw DB/provider data.


TITLE = "Shenzhen MET forecast snapshot"
DESCRIPTION = (
    "Use the MET Norway forecast source for latitude 22.5431 and longitude "
    "114.0579. Gather the current forecast information with emphasis on "
    "temperature and precipitation. Use one appropriate source action."
)
FINALIZATION_TITLE = "Washington DC forecast versus observation"
FINALIZATION_DESCRIPTION = (
    "Use get_weather_forecast_met for latitude 38.8512 and longitude -77.0402, "
    "and use get_nws_weather_observation for station KDCA. Gather both real "
    "measurement sources. Compare current forecast and observed temperature/wind, "
    "respecting their timestamps and units. Do not invent a third source. "
    "After both source tools have succeeded, mark this objective done."
)


def test_db() -> str:
    """Reject every database other than the disposable named test database."""
    dsn = os.environ["MORGOTH_TEST_POSTGRES_URL"]
    if not dsn.startswith("postgresql://") or not dsn.split("?")[0].endswith("/morgoth_test"):
        raise RuntimeError("TEST_DATABASE_REQUIRED")
    return dsn


async def seed(scenario: str = "one_cycle") -> None:
    """Use the production objective service against only this test Project."""
    from core.config import load_config
    from core.objectives import Objective, ObjectiveCategory, ObjectivesManager
    from memory.persistent import PersistentMemory
    config = await load_config()
    if config.postgres_url != test_db():
        raise RuntimeError("TEST_DATABASE_REQUIRED")
    existing = await schema()
    if not existing["schema_exists"] or not existing["objectives_exists"]:
        raise RuntimeError("RUNTIME_OBJECTIVES_NOT_PROVISIONED")
    if not REQUIRED_COLUMNS.issubset(existing["columns"]):
        raise RuntimeError("RUNTIME_OBJECTIVE_COLUMNS_MISSING")
    memory = PersistentMemory(config)
    await memory.initialize()
    try:
        count = await memory.fetchrow("SELECT count(*) AS n FROM objectives")
        if count["n"] != 0:
            raise RuntimeError("OBJECTIVE_QUEUE_NOT_EMPTY")
        objective = Objective(
            title=FINALIZATION_TITLE if scenario == "finalization" else TITLE,
            description=FINALIZATION_DESCRIPTION if scenario == "finalization" else DESCRIPTION,
            category=ObjectiveCategory.RESEARCH,
            generated_by="human",
            status="pending",
        )
        await ObjectivesManager(config, memory).create_objective(objective)
        print(objective.objective_id)
    finally:
        await memory.close()


REQUIRED_COLUMNS = frozenset({
    "objective_id", "title", "description", "category", "priority",
    "generated_by", "status", "evidence", "created_at", "completed_at",
    "user_id", "cycle_count", "sources_used",
    "consecutive_network_outage_cycles", "campaign_id", "updated_at",
})


async def schema() -> dict[str, object]:
    """Inspect only the selected Project's existing schema without provisioning."""
    project = current_namespace()
    if project.is_legacy or not project.postgres_schema.startswith("p_"):
        raise RuntimeError("MANAGED_PROJECT_REQUIRED")
    conn = await asyncpg.connect(test_db())
    try:
        if await conn.fetchval("SELECT current_database()") != "morgoth_test":
            raise RuntimeError("TEST_DATABASE_REQUIRED")
        schema_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1)",
            project.postgres_schema,
        )
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema=$1 AND table_name='objectives'",
            project.postgres_schema,
        )
        columns = {row["column_name"] for row in rows}
        return {"schema_exists": schema_exists,
                "objectives_exists": bool(columns),
                "columns": sorted(columns)}
    finally:
        await conn.close()


async def inspect(objective_id: str) -> None:
    """Read only the selected Project schema and emit bounded evidence metadata."""
    schema = current_namespace().postgres_schema
    if not schema.startswith("p_"):
        raise RuntimeError("MANAGED_PROJECT_REQUIRED")
    conn = await asyncpg.connect(test_db(), server_settings={"search_path": schema})
    try:
        if await conn.fetchval("SELECT current_database()") != "morgoth_test":
            raise RuntimeError("TEST_DATABASE_REQUIRED")
        if await conn.fetchval("SELECT current_schema()") != schema:
            raise RuntimeError("PROJECT_SCHEMA_MISMATCH")
        rows = await conn.fetch(
            "SELECT objective_id, cycle_count, status, generated_by, evidence "
            "FROM objectives ORDER BY created_at, objective_id"
        )
        selected = next((r for r in rows if str(r["objective_id"]) == objective_id), None)
        if selected is None:
            raise RuntimeError("OBJECTIVE_MISSING")
        evidence = selected["evidence"]
        if isinstance(evidence, str):
            evidence = json.loads(evidence)
        payloads = [e for e in evidence if isinstance(e, dict) and e.get("type") == "cycle_payload"]
        tools = [
            {"name": str(t.get("tool") or ""), "success": t.get("success") is True}
            for p in payloads for t in p.get("tool_results", [])
        ]
        llm_results = await conn.fetchval(
            "SELECT count(*) FROM logs WHERE level='RESULT' "
            "AND agent='morgoth_core' AND user_id='morgoth_autonomous'"
        )
        print(json.dumps({
            "objective_id": objective_id,
            "objective_count": len(rows),
            "generated_by": selected["generated_by"],
            "status": selected["status"],
            "cycle_count": selected["cycle_count"],
            "payload_count": len(payloads),
            "tools": tools,
            "llm_result_logs": llm_results,
        }, sort_keys=True))
    finally:
        await conn.close()


def main() -> None:
    """Run exactly one safe test-database operation."""
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("schema", "seed", "inspect"))
    parser.add_argument("--objective-id")
    parser.add_argument("--scenario", choices=("one_cycle", "finalization"), default="one_cycle")
    args = parser.parse_args()
    if args.operation == "schema":
        print(json.dumps(asyncio.run(schema()), sort_keys=True))
    elif args.operation == "seed":
        asyncio.run(seed(args.scenario))
    else:
        if args.objective_id is None:
            parser.error("--objective-id required")
        UUID(args.objective_id)
        asyncio.run(inspect(args.objective_id))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"HELPER_ERROR:{type(exc).__name__}", file=sys.stderr)
        raise SystemExit(1) from None
