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


def test_db() -> str:
    """Reject every database other than the disposable named test database."""
    dsn = os.environ["MORGOTH_TEST_POSTGRES_URL"]
    if not dsn.startswith("postgresql://") or not dsn.split("?")[0].endswith("/morgoth_test"):
        raise RuntimeError("TEST_DATABASE_REQUIRED")
    return dsn


async def seed() -> None:
    """Use the production objective service against only this test Project."""
    from core.config import load_config
    from core.objectives import Objective, ObjectiveCategory, ObjectivesManager
    from memory.persistent import PersistentMemory
    from scripts.init_db import main as initialize_extra_tables

    config = await load_config()
    if config.postgres_url != test_db():
        raise RuntimeError("TEST_DATABASE_REQUIRED")
    # objectives is deliberately provisioned by the existing explicit init_db
    # entrypoint, not by Brain's PAUSED PersistentMemory.initialize(). Run it
    # only inside this disposable test Project, then reapply column migrations.
    await initialize_extra_tables()
    memory = PersistentMemory(config)
    await memory.initialize()
    try:
        count = await memory.fetchrow("SELECT count(*) AS n FROM objectives")
        if count["n"] != 0:
            raise RuntimeError("OBJECTIVE_QUEUE_NOT_EMPTY")
        objective = Objective(
            title=TITLE,
            description=DESCRIPTION,
            category=ObjectiveCategory.RESEARCH,
            generated_by="human",
            status="pending",
        )
        await ObjectivesManager(config, memory).create_objective(objective)
        print(objective.objective_id)
    finally:
        await memory.close()


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
    parser.add_argument("operation", choices=("seed", "inspect"))
    parser.add_argument("--objective-id")
    args = parser.parse_args()
    if args.operation == "seed":
        asyncio.run(seed())
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
