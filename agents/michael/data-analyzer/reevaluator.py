"""
Agent 2 — Status Reevaluator

Reads each candidate case (QA Comment + QA Fix Comment + current status)
and decides whether the fix comment is a COHERENT "does not apply"
justification. If ALL bugs in a case are validly justified as not
applicable, the status is changed to 'Passed'. If any bug was fixed, or
the justification is missing/incoherent/ambiguous, the status is left
unchanged.

This replaces the fragile literal-'NA' detection with real reasoning.
Runs in batches with a single structured call per batch (no tool loop),
so it is fast and cheap.
"""

import json
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_anthropic import ChatAnthropic

load_dotenv()  # ANTHROPIC_API_KEY

BATCH_SIZE = 20
MODEL = "claude-sonnet-5"   # switch to "claude-haiku-4-5-20251001" to cut cost ~50%


# ── Output schema ───────────────────────────────────────────────
class CaseVerdict(BaseModel):
    case_id: str
    changed: bool                      # True only if status should become Passed
    new_status: str                    # "Passed" when changed, else the original status
    reason: str                        # free-text justification of the decision
    ambiguous: bool = False            # True if too unclear to decide (left unchanged)

class BatchResult(BaseModel):
    verdicts: List[CaseVerdict] = Field(default_factory=list)


SYSTEM_PROMPT = """\
You reevaluate QA case statuses for the QA Shadow Dashboard.

Each case has a bug report (QA Comment), a build response (QA Fix Comment),
and a current status. Some cases contain MULTIPLE bugs in one QA Comment,
separated by commas (e.g. "D/M | Issue | Styling | wrong style, D/M | Issue
| Content | Double H1 tag").

Your ONLY job: decide if the status should change to 'Passed' because the
bug(s) genuinely DID NOT APPLY.

RULES:
- Change to 'Passed' ONLY IF every bug in the case is justified as NOT
  APPLICABLE with a COHERENT reason (e.g. "N/A, not a bug — default section
  configs", "Wrong QA, model is X not Y", "NA | specialist asked not to
  modify", "N/A (path from OEM)", "intentional / by design", "client
  removed it").
- If a bug was FIXED (e.g. "Fixed", "Fixed, confirmed with specialist"),
  the bug DID apply — DO NOT change the status. A fixed bug still counts.
- In multi-bug cases, ALL bugs must be validly "not applicable". If even one
  was fixed or unjustified (e.g. "NA 1, Fixed 2"), DO NOT change the status.
- If the fix comment is empty, vague ("no time", "please check"), or the
  justification is incoherent, DO NOT change the status.
- If it is genuinely too ambiguous to judge, set ambiguous=true and DO NOT
  change the status.
- Never change a status to anything other than 'Passed'. You only move
  toward 'Passed', never away from it.

For each case return: case_id, changed (true/false), new_status ('Passed'
if changed, otherwise the original status), a short reason, and ambiguous.
Only set changed=true when you are confident the justification is valid.
"""


def _format_batch(cases: list) -> str:
    lines = []
    for c in cases:
        lines.append(
            f"case_id: {c['case_id']}\n"
            f"current_status: {c['status']}\n"
            f"QA Comment: {c['comment']}\n"
            f"QA Fix Comment: {c['fix']}\n---"
        )
    return "\n".join(lines)


def reevaluate_batch(model, cases: list) -> List[CaseVerdict]:
    """Send one batch of candidate cases and get structured verdicts."""
    msg = (
        "Reevaluate these cases. Return ONLY a JSON object with this exact "
        'shape, no other text: {"verdicts": [{"case_id": "", "changed": false, '
        '"new_status": "", "reason": "", "ambiguous": false}]}\n\n'
        + _format_batch(cases)
    )
    raw = model.invoke([("system", SYSTEM_PROMPT), ("user", msg)])

    # Gemini/Claude may return content as string or blocks; normalize to text
    content = raw.content
    if isinstance(content, list):
        text = "".join(b.get("text", "") for b in content if isinstance(b, dict))
    else:
        text = content

    # Extract the JSON object (robust to fences / preamble)
    start, end = text.find("{"), text.rfind("}")
    data = json.loads(text[start:end + 1])

    # Validate each verdict against the schema
    return [CaseVerdict.model_validate(v) for v in data.get("verdicts", [])]


def reevaluate(cases: list) -> List[dict]:
    """
    Reevaluate all candidate cases in batches.

    Args:
        cases: list of dicts with keys: case_id, status, comment, fix
    Returns:
        list of verdict dicts (only the ones that CHANGED are actionable,
        but all are returned so the caller can log/inspect).
    """
    model = ChatAnthropic(model=MODEL, max_tokens=4000)
    all_verdicts = []
    for i in range(0, len(cases), BATCH_SIZE):
        batch = cases[i:i + BATCH_SIZE]
        try:
            verdicts = reevaluate_batch(model, batch)
            all_verdicts.extend(v.model_dump() for v in verdicts)
        except Exception as e:
            # On a batch error, leave those cases unchanged (safe default)
            for c in batch:
                all_verdicts.append({
                    "case_id": c["case_id"], "changed": False,
                    "new_status": c["status"], "reason": f"batch error: {e}",
                    "ambiguous": True,
                })
    return all_verdicts


# ── Local test ──────────────────────────────────────────────────
if __name__ == "__main__":
    # A few real-shaped cases to sanity-check the reasoning
    sample = [
        {"case_id": "1", "status": "Observed",
         "comment": "Some images have 2025 on the title instead of 2026", "fix": "Fixed"},
        {"case_id": "2", "status": "Opportunity",
         "comment": "Images and content should be aligned",
         "fix": "Wrong QA, model is mustang mach-e, not expedition"},
        {"case_id": "3", "status": "Failed",
         "comment": "D | Issue | Styling | wrong style, D | Issue | Content | Double H1 tag",
         "fix": "NA 1, Fixed 2"},
        {"case_id": "4", "status": "Observed",
         "comment": "Config | View Inventory CTA not anchored",
         "fix": "N/A, not a bug. default section configs"},
    ]
    for v in reevaluate(sample):
        print(json.dumps(v, ensure_ascii=False))