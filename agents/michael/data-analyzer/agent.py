"""
Data Analyzer Agent (Agent 1)

Wires the six deterministic tools into a LangGraph ReAct agent powered by
Gemini. The LLM does the reasoning: it decides which tools to call, reads
their results, digs deeper when something looks off, and produces a
root-cause diagnosis of whether a CSV is ready for the QA Shadow
Dashboard.

Run:  python agent.py path/to/file.csv
"""

import sys
from typing import List
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from langchain_core.tools import tool
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

# The deterministic tools we built and tested (kept as plain Python).
from tools_inspect import inspect_structure as _inspect_structure
from tools_headers import check_headers as _check_headers
from tools_profile import profile_column as _profile_column
from tools_dates import validate_dates as _validate_dates
from tools_discards import simulate_discards as _simulate_discards
from tools_qa_names import check_qa_names as _check_qa_names

load_dotenv()  # loads GOOGLE_API_KEY


# ── Tool wrappers ───────────────────────────────────────────────
# Thin @tool wrappers expose our functions to the agent. The docstring
# of each wrapper is what the LLM reads to decide when to use the tool,
# so it is written for the model, not for a human.

@tool
def inspect_structure(path: str) -> dict:
    """Get a CSV's basic structure: delimiter, row count, column count,
    and the raw header names. Call this FIRST to learn what columns exist
    before profiling or validating specific ones."""
    return _inspect_structure(path)


@tool
def check_headers(path: str) -> dict:
    """Check whether the CSV has the columns the dashboard requires and
    recommends, and detect likely typos in header names (e.g. 'Nmae' ->
    'Name'). A missing or misspelled required header makes the dashboard
    drop every row silently."""
    return _check_headers(path)


@tool
def profile_column(path: str, column: str) -> dict:
    """Profile ONE column: total values, how many are empty, how many are
    distinct, and the most frequent values. Use it to see what a column
    actually contains (e.g. unexpected values in 'QA Status' or 'Type')."""
    return _profile_column(path, column)


@tool
def validate_dates(path: str, column: str) -> dict:
    """Validate a date column (e.g. 'Date QA Completed' or 'Date') against
    the M/D/YY or M/D/YYYY format. Detects mixed 2-digit/4-digit years
    (which previously crashed the dashboard), impossible dates, and empty
    cells."""
    return _validate_dates(path, column)


@tool
def simulate_discards(path: str) -> dict:
    """Simulate the dashboard's row filter to count how many rows would be
    SILENTLY dropped on import and why (no name, no task id, In Progress).
    Use it to reveal hidden data loss."""
    return _simulate_discards(path)


@tool
def check_qa_names(path: str) -> dict:
    """Check the 'QA Completed by' reviewer names and flag any that won't
    resolve to a canonical owner (typos or ambiguous names). Unresolved
    reviewers are silently excluded from reviewer analytics."""
    return _check_qa_names(path)


TOOLS = [
    inspect_structure,
    check_headers,
    profile_column,
    validate_dates,
    simulate_discards,
    check_qa_names,
]

# ── Output schema (what the frontend renders) ───────────────────
# The agent must return an AuditReport. LangGraph validates the model
# output against these classes, so your code receives clean data.

class Finding(BaseModel):
    code: str                       # machine id, e.g. "mixed_years"
    title: str                      # short headline for the card
    detail: str                     # one or two sentences of explanation
    rows: str = ""                  # human descriptor, e.g. "rows 812, 1440" or "42 rows"
    fix: str                        # what the user should do

class Summary(BaseModel):
    rows_read: int
    would_import: int
    dropped: int

class AuditReport(BaseModel):
    verdict: str                    # "ok" | "warnings" | "blocked"
    summary: Summary
    blocking: List[Finding] = Field(default_factory=list)
    warnings: List[Finding] = Field(default_factory=list)

# ── System prompt (the domain contract) ─────────────────────────
# This teaches the agent the dashboard's real format rules so it reasons
# against the truth, not assumptions.

SYSTEM_PROMPT = """\
You are a data-analysis agent that audits CSV files before they are
imported into the QA Shadow Dashboard (an internal DDC QA reporting tool).

The dashboard expects a SEMICOLON-delimited CSV with these columns:
- Required: Name, ID / Task / Case Number, Date QA Completed, QA Status
- Recommended: Date, QA Comment, QA Fix Comment, QA Completed by, Type

Key format rules the dashboard applies:
- Dates MUST use M/D/YY (2-digit year, no leading zeros), e.g. 4/13/26.
  This is the ONLY correct format. Mixing 2-digit and 4-digit years in one
  column previously caused a crash. When suggesting a date fix, always tell
  the user to normalize to M/D/YY (2-digit year) — never to 4-digit years.
- QA Status 'Observed' becomes 'Opportunity'; empty status becomes
  'Opportunity'. Rows with status 'In Progress' are dropped.
- A row is silently dropped if Name is empty, ID / Task / Case Number is
  empty, or status is In Progress.
- Reviewer names in 'QA Completed by' must resolve to a known owner or an
  alias, otherwise that person's work is excluded from analytics.

INVESTIGATION:
1. Start with inspect_structure to learn the file's shape and columns.
2. Then use the other tools: check headers, simulate discards, validate
   both date columns if present, and check reviewer names. Profile a
   column when a result needs a closer look.
3. If a result looks wrong, find the ROOT CAUSE (e.g. many discards + a
   missing header usually means one caused the other).

CLASSIFY every issue you find as either BLOCKING or a WARNING:
- BLOCKING (the import must not proceed): the file cannot be parsed; a
  REQUIRED header is missing or misspelled; a date column mixes 2-digit
  and 4-digit years (crash trigger).
- WARNING (import can proceed, but data quality suffers): rows that will
  be silently dropped; unresolved reviewer names; missing recommended
  headers; unexpected values; invalid or impossible individual dates.

Then produce an AuditReport:
When your investigation is complete, output ONLY a JSON object — no
markdown, no code fences, no text before or after — with EXACTLY this shape:

{
  "verdict": "ok | warnings | blocked",
  "summary": {"rows_read": 0, "would_import": 0, "dropped": 0},
  "blocking": [{"code": "", "title": "", "detail": "", "rows": "", "fix": ""}],
  "warnings": [{"code": "", "title": "", "detail": "", "rows": "", "fix": ""}]
}

Rules for the JSON:
- verdict is "blocked" if there is any blocking issue; else "warnings" if
  there are only warnings; else "ok".
- summary: rows_read = total data rows, would_import = rows kept, dropped.
- blocking and warnings are arrays of findings; use [] when there are none.
- In 'rows', use the concrete row numbers from the tools' sample_rows when
  available (e.g. "rows 3, 6, 12"). Only use a count like "42 rows" when
  there are too many to list. Avoid vague pointers like "All rows".
- Write title, detail and fix in clear, plain English.
- Output the raw JSON only.
"""


def build_agent():
    """Create the ReAct agent. It reasons, calls tools, and returns JSON."""
    model = ChatAnthropic(model="claude-sonnet-5", max_tokens=2000)
    return create_react_agent(model, TOOLS, prompt=SYSTEM_PROMPT)


def audit(path: str):
    """Run the agent and print the validated JSON the frontend would receive."""
    import json
    agent = build_agent()
    result = agent.invoke({"messages": [("user", f"Audit this CSV file: {path}")]})

    # The agent's final message IS the JSON. Gemini may return it as a
    # string or as a list of content blocks — handle both.
    content = result["messages"][-1].content
    if isinstance(content, list):
        text = "".join(b.get("text", "") for b in content if isinstance(b, dict))
    else:
        text = content

    # Extract the JSON object (robust to accidental fences / preamble)
    start, end = text.find("{"), text.rfind("}")
    data = json.loads(text[start:end + 1])

    report = AuditReport.model_validate(data)   # validate against the schema
    print(json.dumps(report.model_dump(), indent=2, ensure_ascii=False))
    return report


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent.py path/to/file.csv")
        sys.exit(1)
    audit(sys.argv[1])