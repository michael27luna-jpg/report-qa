"""
Agent 3 — Weekly Report Writer

Receives a PRE-AGGREGATED metrics payload (never the raw cases) and writes
the narrative sections of the weekly QA report.

Why aggregated input:
    Sending the 270 raw rows of a normal week costs ~30-40k input tokens per
    run. The dashboard already computes every number it needs, so we send
    only those aggregates (~2k tokens) and let the model do what it is
    actually good at: reading the pattern and writing it up.

Why structured output instead of HTML:
    The model returns JSON sections, not markup. The frontend renders them
    with the dashboard's own styles, so the layout is always consistent, the
    numbers in the tables come from the real data (never retyped by the
    model, so they cannot drift), and there is no model-authored HTML to
    sanitize. It also cuts output tokens roughly in half.

Cost per run: ~2k in / ~1k out. One call per report.

Run locally:
    python reporter.py
"""

import json
import os
from typing import List

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_anthropic import ChatAnthropic

load_dotenv()  # ANTHROPIC_API_KEY

# Este agente elige su modelo por su cuenta. Los Agentes 1 y 2 (agent.py,
# reevaluator.py) y el chatbot (backendCidar/server.js) tienen su propia
# constante y NO se ven afectados por lo que se ponga acá.
#
# Haiku por defecto: este agente hace UNA llamada por informe sobre datos ya
# agregados, así que no necesita el músculo de Sonnet.
# Para volver a Sonnet: REPORT_MODEL=claude-sonnet-5 en el .env
MODEL = os.getenv("REPORT_MODEL", "claude-haiku-4-5")


# ── Output schema ───────────────────────────────────────────────
class Finding(BaseModel):
    title: str                       # short label, e.g. "Config bugs dominate"
    detail: str                      # 1-2 sentences explaining it
    evidence: str = ""               # the numbers this is based on


class Recommendation(BaseModel):
    priority: str                    # "High" | "Medium" | "Low"
    action: str                      # what to do
    rationale: str                   # why, tied to the data


class WeeklyReport(BaseModel):
    headline: str                                                  # one line, the week in a sentence
    executive_summary: str                                         # 2-4 sentences
    findings: List[Finding] = Field(default_factory=list)
    risks: List[Finding] = Field(default_factory=list)
    recommendations: List[Recommendation] = Field(default_factory=list)
    conclusion: str = ""


SYSTEM_PROMPT = """\
You are a Senior QA Lead writing the weekly report for the QA Shadow
Dashboard at a dealer-website team. Your reader is the team lead and their
manager. Write in ENGLISH.

You receive ONLY aggregated metrics — no raw cases. Everything you can say
must come from those aggregates.

HARD RULES:
- Never invent a number, name, date, percentage or trend. If it is not in
  the payload, you cannot say it.
- Never restate the full metric table — the report renders it separately.
  Reference numbers only as evidence for a point you are making.
- Distinguish owner (person responsible for the case) from reviewer
  (the QA Shadow who reviewed it, field `reviewers`).
- Errors = Failed + Critical. Opportunity is NOT an error; it is a
  styling-level improvement.
- Pass rate here counts Passed + Opportunity, matching the dashboard.
- Pending = a non-Passed case with no fix comment yet.
- Do not name a person as a problem unless their numbers clearly stand out
  against the team. When you do, state the number alongside the name and
  keep the tone factual, not punitive.
- If `agent_reevaluated` is present, some statuses were corrected by the
  reevaluation agent. Mention it only if it is material to a conclusion.

WHAT TO WRITE:
- headline: one sentence capturing the week. No emoji.
- executive_summary: 2-4 sentences. Overall quality state and the single
  most important thing that happened.
- findings: 2-4 items. The patterns that actually matter — concentration of
  a bug category, a day that broke trend, a gap between volume and quality.
  Not a restatement of the KPIs.
- risks: 1-3 items. What could get worse and the concrete impact. If there
  is genuinely no risk, return an empty list rather than inventing one.
- recommendations: 2-4 items, ordered High -> Low. Each must be an action
  someone can take next week, tied to a finding. No generic advice like
  "continue monitoring" or "improve quality".
- conclusion: one short paragraph.

Be concise and specific. A short report that says something true is worth
more than a long one that hedges.
"""


def _user_message(metrics: dict) -> str:
    return (
        "Write the weekly QA report from these aggregated metrics.\n"
        "Return ONLY a JSON object with this exact shape, no other text:\n"
        '{"headline": "", "executive_summary": "", '
        '"findings": [{"title": "", "detail": "", "evidence": ""}], '
        '"risks": [{"title": "", "detail": "", "evidence": ""}], '
        '"recommendations": [{"priority": "", "action": "", "rationale": ""}], '
        '"conclusion": ""}\n\n'
        "METRICS:\n"
        + json.dumps(metrics, ensure_ascii=False, indent=1)
    )


def write_report(metrics: dict) -> dict:
    """
    Args:
        metrics: the aggregated payload built by the dashboard
                 (buildReportPayload() in app.js)
    Returns:
        dict matching WeeklyReport, ready to send to the frontend.
    """
    model = ChatAnthropic(model=MODEL, max_tokens=3000)
    print(f"[AGENT 3] Writing report with {MODEL}")

    raw = model.invoke([("system", SYSTEM_PROMPT), ("user", _user_message(metrics))])

    # Claude may return content as a string or as content blocks
    content = raw.content
    if isinstance(content, list):
        text = "".join(b.get("text", "") for b in content if isinstance(b, dict))
    else:
        text = content

    # Extract the JSON object (robust to fences / preamble)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Model did not return a JSON object.")

    data = json.loads(text[start:end + 1])

    return WeeklyReport.model_validate(data).model_dump()


# ── Local test ──────────────────────────────────────────────────
if __name__ == "__main__":
    sample = {
        "period": {"label": "5/25/26 - 5/27/26", "days": 3},
        "totals": {
            "cases": 270, "members": 23, "passed": 201, "opportunity": 20,
            "failed": 46, "critical": 3, "errors": 49,
            "passRate": 82, "errorRate": 18, "pending": 12,
        },
        "status": {
            "label": "NEEDS ATTENTION", "score": 5, "queue": "At Risk",
            "criticalRate": 1.11, "failedRate": 17.04, "opportunityRate": 7.41,
        },
        "categories": [
            {"category": "Config", "count": 40, "pct": 58},
            {"category": "Linking", "count": 26, "pct": 38},
            {"category": "Content", "count": 12, "pct": 17},
            {"category": "Styling", "count": 7, "pct": 10},
        ],
        "members": [
            {"owner": "Sebastian Salazar", "cases": 20, "errors": 4, "errorRate": 20, "passRate": 80},
            {"owner": "Dylan Jitton", "cases": 25, "errors": 7, "errorRate": 28, "passRate": 67},
            {"owner": "Javier Alcoba", "cases": 18, "errors": 7, "errorRate": 39, "passRate": 61},
        ],
        "reviewers": [
            {"reviewer": "Diego Torrez", "total": 147},
            {"reviewer": "Ignacio Lizarazu", "total": 123},
        ],
        "byDay": [
            {"day": "5/25/26", "cases": 95, "errors": 12, "errorRate": 13},
            {"day": "5/26/26", "cases": 88, "errors": 14, "errorRate": 16},
            {"day": "5/27/26", "cases": 87, "errors": 23, "errorRate": 26},
        ],
        "byType": [
            {"type": "Posting", "cases": 160, "errors": 21},
            {"type": "LP", "cases": 110, "errors": 28},
        ],
        "agent_reevaluated": 8,
    }
    print(json.dumps(write_report(sample), ensure_ascii=False, indent=2))