"""
Agent tool 5: simulate_discards

Replicates the dashboard's parseCSV row filter to reveal how many rows
would be SILENTLY dropped on import, and why. This turns an invisible
data loss into an actionable report ("23 rows would be dropped: 18 with
no task id, 5 In Progress").

Faithful to the real filter, a row is KEPT only if:
  - Name is not empty        (empty Name -> owner 'Unknown' -> dropped)
  - ID / Task / Case Number is not empty
  - QA Status is not 'In progress' / 'In Progress'
Note: empty QA Status defaults to 'Opportunity', and 'Observed' is
normalized to 'Opportunity' (both are KEPT).

Known limitation (not modeled in this basic version): parseCSV can
promote an 'In Progress' row to 'Passed' when its fix comment has NA
tokens covering all bugs; such rare rows would actually be kept.
"""

import pandas as pd
from tools_profile import _load_df   # reuse the shared loader

IN_PROGRESS = ["In progress", "In Progress"]
SAMPLE_CAP = 5   # how many example row numbers to include per reason


def simulate_discards(path: str) -> dict:
    """
    Count how many rows parseCSV would discard, broken down by reason.

    Args:
        path: path to the CSV file.

    Returns:
        dict with total_rows, kept, discarded, per-reason counts, and a
        few example row numbers (1-based data rows) per reason.
    """
    df, err = _load_df(path)
    if err:
        return err

    n = len(df)

    def col(name):
        """Return a trimmed string Series for `name`, or empty strings
        if the column is missing (mirrors parseCSV's obj[h] || '')."""
        if name in df.columns:
            return df[name].astype(str).str.strip()
        return pd.Series([""] * n, index=df.index)

    name = col("Name")
    task = col("ID / Task / Case Number")

    # Status: empty -> 'Opportunity' (default), 'Observed' -> 'Opportunity'
    status = col("QA Status").replace({"": "Opportunity", "Observed": "Opportunity"})

    # Boolean masks for each failing condition
    no_name = name == ""                 # empty Name -> owner 'Unknown'
    no_task = task == ""
    in_prog = status.isin(IN_PROGRESS)

    # Attribute each dropped row to its FIRST failing reason
    # (matches the short-circuit order of the real && filter)
    reason_no_name = no_name
    reason_no_task = (~no_name) & no_task
    reason_in_prog = (~no_name) & (~no_task) & in_prog
    kept_mask = (~no_name) & (~no_task) & (~in_prog)

    def sample_rows(mask):
        # 1-based data row numbers (header excluded)
        positions = [i for i, v in enumerate(mask.tolist()) if v]
        return [p + 1 for p in positions[:SAMPLE_CAP]]

    reasons = {
        "no_name": int(reason_no_name.sum()),
        "no_task_id": int(reason_no_task.sum()),
        "in_progress": int(reason_in_prog.sum()),
    }
    kept = int(kept_mask.sum())
    discarded = n - kept

    return {
        "ok": discarded == 0,
        "total_rows": n,
        "kept": kept,
        "discarded": discarded,
        "reasons": reasons,   # counts sum to `discarded`
        "sample_rows": {
            "no_name": sample_rows(reason_no_name),
            "no_task_id": sample_rows(reason_no_task),
            "in_progress": sample_rows(reason_in_prog),
        },
    }


# --- Local test (runs only if you execute this file directly) ---
if __name__ == "__main__":
    import json

    header = "Date QA Completed;Name;ID / Task / Case Number;QA Status\n"
    rows = [
        "1/5/25;ana@x.com;1001;Passed\n",        # kept
        "1/5/25;luis@x.com;1002;Observed\n",     # kept (Observed -> Opportunity)
        "1/5/25;;1003;Passed\n",                 # dropped: no_name
        "1/5/25;mia@x.com;;Failed\n",            # dropped: no_task_id
        "1/5/25;leo@x.com;1005;In Progress\n",   # dropped: in_progress
        "1/5/25;;;Passed\n",                     # dropped: no_name (first reason)
        "1/5/25;sam@x.com;1007;\n",              # kept (empty status -> Opportunity)
    ]
    with open("_discards.csv", "w", encoding="utf-8") as f:
        f.write(header + "".join(rows))

    print(json.dumps(simulate_discards("_discards.csv"), indent=2, ensure_ascii=False))