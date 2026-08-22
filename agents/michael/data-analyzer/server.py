"""
Local API server for the Data Analyzer agent.

Exposes POST /audit — receives a CSV upload, runs the agent, and returns
the AuditReport as JSON so the dashboard can render the audit panel.

Run locally (from the data-analyzer folder, with the venv active):

    uvicorn server:app --reload --port 8000

Then your dashboard's app.js calls  http://localhost:8000/audit
"""

import os
import tempfile
import time

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agent import audit   # the agent we already built (unchanged)

app = FastAPI(title="QA Data Analyzer")

# Allow the dashboard (served from another local origin, e.g. Live Server
# or file://) to call this server during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # fine for local development only
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Quick check that the server is up."""
    return {"status": "ok"}


@app.post("/audit")
async def audit_csv(file: UploadFile = File(...)):
    """Receive a CSV upload, run the agent on it, and return the AuditReport."""
    raw = await file.read()
    try:
        content = raw.decode("utf-8-sig")   # utf-8-sig strips Excel's BOM
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8 text.")

    # The tools read from disk, so write the upload to a temp file and
    # hand its path to the existing agent (no changes to the tools).
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False,
                                         encoding="utf-8", newline="") as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        _t = time.perf_counter()
        report = audit(tmp_path)
        print(f"[TIMING] agent1 audit: {time.perf_counter() - _t:.1f}s", flush=True)
        return report.model_dump()      # -> JSON the frontend renders
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audit failed: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

from reevaluator import reevaluate

@app.post("/reevaluate")
async def reevaluate_cases(payload: dict):
    """Receive candidate cases, return status-change verdicts."""
    cases = payload.get("cases", [])
    if not cases:
        return {"verdicts": []}
    try:
        _t = time.perf_counter()
        verdicts = reevaluate(cases)
        print(f"[TIMING] agent2 reevaluate: {time.perf_counter() - _t:.1f}s "
              f"({len(cases)} casos)", flush=True)
        return {"verdicts": verdicts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reevaluation failed: {e}")

from reporter import write_report


@app.post("/report")
async def generate_report(payload: dict):
    """Receive aggregated weekly metrics, return the written report."""
    metrics = payload.get("metrics")
    if not metrics:
        raise HTTPException(status_code=400, detail="Missing 'metrics' in body.")
    try:
        _t = time.perf_counter()
        result = write_report(metrics)
        print(f"[TIMING] agent3 report: {time.perf_counter() - _t:.1f}s", flush=True)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {e}")