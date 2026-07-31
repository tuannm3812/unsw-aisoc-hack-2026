"""Create the Spatial Brain Mistral agent roster via the official SDK.

Run once (or after resetting agents in Studio):

    python -m scripts.provision_agents

Prints agent ids and appends them to the repo .env so the app can reference them.
Authenticate Atlassian + GitHub connectors in https://console.mistral.ai before
the Reviewer can call those tools live.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mistralai import Mistral  # noqa: E402
from mistralai.models import (  # noqa: E402
    CodeInterpreterTool,
    ImageGenerationTool,
    WebSearchTool,
)

from app.config import settings  # noqa: E402

MODEL = settings.mistral_text_model
ENV_PATH = ROOT / ".env"

AGENTS = [
    {
        "key": "MISTRAL_AGENT_COORDINATOR",
        "name": "spatial-coordinator",
        "description": "Routes Spatial Brain canvas actions to specialist agents.",
        "instructions": (
            "You coordinate specialists for a multi-disciplinary knowledge canvas. "
            "Hand off align to the arbiter, present to the narrator, review to the "
            "reviewer, tabular sense-making to the data analyst, and document sense "
            "to the archivist. Never invent graph facts."
        ),
        "tools": [],
    },
    {
        "key": "MISTRAL_AGENT_SENSE",
        "name": "spatial-archivist",
        "description": "Proposes findings, constraints, and follow-up tasks from documents.",
        "instructions": (
            "You extract discrete, citable findings and constraints, and suggest "
            "actionable tasks that follow from them. Propose only; never claim nodes "
            "were written to the canvas without a human promote or an explicit create."
        ),
        "tools": [WebSearchTool(type="web_search")],
    },
    {
        "key": "MISTRAL_AGENT_DATA",
        "name": "spatial-data-analyst",
        "description": "Turns spreadsheets into proposed metric findings and thresholds.",
        "instructions": (
            "Analyse tabular data and propose quantitative findings and threshold "
            "constraints a product team could promote onto a knowledge graph."
        ),
        "tools": [CodeInterpreterTool(type="code_interpreter")],
    },
    {
        "key": "MISTRAL_AGENT_ALIGN",
        "name": "spatial-arbiter",
        "description": "Finds contradictions among nodes feeding a task.",
        "instructions": (
            "Compare connected findings and constraints. Report only real "
            "contradictions with cited node ids. Suggest decide/defer/reject options."
        ),
        "tools": [WebSearchTool(type="web_search")],
    },
    {
        "key": "MISTRAL_AGENT_PRESENT",
        "name": "spatial-narrator",
        "description": "Turns task lineage into a stakeholder presentation.",
        "instructions": (
            "Produce a short multi-disciplinary narrative: headline, audience "
            "summary, ordered beats, open risks, citations. Optionally generate a "
            "one-pager image."
        ),
        "tools": [ImageGenerationTool(type="image_generation")],
    },
    {
        "key": "MISTRAL_AGENT_REVIEW",
        "name": "spatial-reviewer",
        "description": "Checks Jira/GitHub work against lineage constraints.",
        "instructions": (
            "Given a task, its constraints, and a pull request, produce a pass/fail/"
            "unknown checklist. Use Atlassian and GitHub connectors when authenticated."
        ),
        # Connectors are authenticated in Studio; typed as generic tool dicts.
        "tools": [
            {"type": "connector", "connector_id": "atlassian"},
            {"type": "connector", "connector_id": "github_app"},
        ],
    },
]


def _write_env(values: dict[str, str]) -> None:
    existing = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else ""
    lines = existing.splitlines()
    keys = set(values)
    kept = [line for line in lines if line.split("=", 1)[0] not in keys]
    kept.extend(f"{key}={value}" for key, value in values.items())
    ENV_PATH.write_text("\n".join(kept).rstrip() + "\n", encoding="utf-8")


async def main() -> None:
    if not settings.mistral_api_key:
        raise SystemExit("Set MISTRAL_API_KEY first")

    client = Mistral(api_key=settings.mistral_api_key)
    created: dict[str, str] = {}

    for spec in AGENTS:
        print(f"Creating {spec['name']}...")
        try:
            agent = await client.beta.agents.create_async(
                model=MODEL,
                name=spec["name"],
                description=spec["description"],
                instructions=spec["instructions"],
                tools=spec["tools"] or None,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  failed: {exc}")
            if spec["name"] == "spatial-reviewer":
                agent = await client.beta.agents.create_async(
                    model=MODEL,
                    name=spec["name"],
                    description=spec["description"],
                    instructions=spec["instructions"],
                    tools=None,
                )
                print(f"  created without connectors: {agent.id}")
            else:
                continue
        else:
            print(f"  -> {agent.id}")
        created[spec["key"]] = agent.id

    coord = created.get("MISTRAL_AGENT_COORDINATOR")
    others = [
        created[k]
        for k in (
            "MISTRAL_AGENT_SENSE",
            "MISTRAL_AGENT_DATA",
            "MISTRAL_AGENT_ALIGN",
            "MISTRAL_AGENT_PRESENT",
            "MISTRAL_AGENT_REVIEW",
        )
        if k in created
    ]
    if coord and others:
        try:
            await client.beta.agents.update_async(agent_id=coord, handoffs=others)
            print(f"Wired coordinator handoffs → {len(others)} specialists")
        except Exception as exc:  # noqa: BLE001
            print(f"Warning: could not wire handoffs ({exc}); set them in Studio if needed.")

    if created:
        _write_env(created)
        print(f"\nWrote {len(created)} agent ids to {ENV_PATH}")
    else:
        print("No agents created.")


if __name__ == "__main__":
    asyncio.run(main())
