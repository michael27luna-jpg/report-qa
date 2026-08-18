"""
Agent tool 6: check_qa_names

Checks the values in "QA Completed by" and flags any reviewer name that
the dashboard would NOT resolve to a canonical owner. Unresolved names
are silently excluded from reviewer analytics, so a single roster typo
can make a person's QA work disappear from the reports.

Faithful to canonicalOwnerFor(), a qa_by value resolves if:
  1. it is a key in QA_ALIAS, OR
  2. its lowercase matches the FIRST NAME of exactly one owner.
If it matches two+ owners it is "ambiguous"; if it matches none it is
"unknown" (a likely typo). Both cases are silently dropped by the tool.

Owners are derived from the Name column via the same email->name logic
the dashboard uses (extractNameFromEmail).
"""

import difflib
from tools_profile import _load_df   # reuse the shared loader

# Mirror of the dashboard's QA_ALIAS map (alias -> canonical owner)
QA_ALIAS = {
    "Armando":   "Diego Torrez",
    "C. Javier": "Javier Callejas",
    "A. Javier": "Javier Alcoba",
    "Gustavich": "Gustavo Pillco",
    "Diego":     "Diego Delgadillo",
}

QA_BY_VARIANTS = ["QA Completed by:", "QA Completed by"]
SAMPLE_CAP = 10


def _extract_name_from_email(raw: str) -> str:
    """Mirror of extractNameFromEmail: empty -> 'Unknown', a value with
    no '@' passes through, otherwise the local part is title-cased."""
    email = (raw or "").strip()
    if not email or "@" not in email:
        return email or "Unknown"
    local = email.split("@")[0]
    return " ".join(p[:1].upper() + p[1:] for p in local.split("."))


def check_qa_names(path: str) -> dict:
    """
    Flag reviewer names in "QA Completed by" that won't resolve to a
    canonical owner (and would be silently excluded from analytics).

    Returns:
        dict with resolved names, unresolved names split into unknown
        (likely typos, with a suggestion) and ambiguous (with candidate
        owners), and how many rows are affected.
    """
    df, err = _load_df(path)
    if err:
        return err

    # --- Build the owner universe from the Name column ---
    if "Name" not in df.columns:
        return {"ok": False, "error": "Column not found: Name",
                "available": list(df.columns)}

    owners = set()
    for raw in df["Name"].astype(str):
        owner = _extract_name_from_email(raw)
        if owner and owner != "Unknown":
            owners.add(owner)

    # First-name index: first token (lowercased) -> list of owners
    first_name_index = {}
    for o in owners:
        first = o.lower().split(" ")[0]
        first_name_index.setdefault(first, []).append(o)

    # Pool used to suggest a correction for unknown names
    suggest_pool = sorted({o.split(" ")[0] for o in owners} | set(QA_ALIAS.keys()))

    # --- Find the qa_by column ---
    qa_col = next((c for c in QA_BY_VARIANTS if c in df.columns), None)
    if qa_col is None:
        return {"ok": False, "error": "Column not found: QA Completed by",
                "available": list(df.columns)}

    # Distinct non-empty reviewer values, with how many rows each covers
    qa_series = df[qa_col].astype(str).str.strip()
    counts = qa_series[qa_series != ""].value_counts()

    resolved = []
    unknown = []       # 0 first-name matches -> likely typo
    ambiguous = []     # 2+ first-name matches -> can't disambiguate
    rows_affected = 0

    for name, n_rows in counts.items():
        n_rows = int(n_rows)

        # 1. Alias takes precedence (matches canonicalOwnerFor order)
        if name in QA_ALIAS:
            resolved.append({"name": name, "maps_to": QA_ALIAS[name], "via": "alias"})
            continue

        # 2. First-name match
        matches = first_name_index.get(name.lower(), [])
        if len(matches) == 1:
            resolved.append({"name": name, "maps_to": matches[0], "via": "first_name"})
        elif len(matches) >= 2:
            ambiguous.append({"name": name, "rows": n_rows, "candidates": sorted(matches)})
            rows_affected += n_rows
        else:
            suggestion = difflib.get_close_matches(name, suggest_pool, n=1, cutoff=0.6)
            unknown.append({"name": name, "rows": n_rows,
                            "suggestion": suggestion[0] if suggestion else None})
            rows_affected += n_rows

    return {
        "ok": len(unknown) == 0 and len(ambiguous) == 0,
        "distinct_reviewers": int(len(counts)),
        "resolved": resolved[:SAMPLE_CAP],
        "unresolved_unknown": unknown[:SAMPLE_CAP],      # likely typos
        "unresolved_ambiguous": ambiguous[:SAMPLE_CAP],  # need a fuller name
        "rows_affected": rows_affected,   # rows silently excluded from reviewer analytics
    }


# --- Local test (runs only if you execute this file directly) ---
if __name__ == "__main__":
    import json

    header = "Date QA Completed;Name;ID / Task / Case Number;QA Status;QA Completed by:\n"
    rows = [
        "1/5/25;diego.torrez@x.com;1;Passed;Armando\n",       # alias -> Diego Torrez
        "1/5/25;diego.delgadillo@x.com;2;Passed;Romel\n",     # first name -> Romel Pinto
        "1/5/25;javier.callejas@x.com;3;Failed;Javer\n",      # unknown (typo of Javier)
        "1/5/25;romel.pinto@x.com;4;Passed;Carlos\n",         # ambiguous (2 Carlos)
        "1/5/25;carlos.lopez@x.com;5;Passed;Diego\n",         # alias -> Diego Delgadillo
        "1/5/25;carlos.ruiz@x.com;6;Passed;\n",               # empty (ignored)
        "1/5/25;michael.luna@x.com;7;Passed;Javer\n",         # unknown again (row count = 2)
    ]
    with open("_qanames.csv", "w", encoding="utf-8") as f:
        f.write(header + "".join(rows))

    print(json.dumps(check_qa_names("_qanames.csv"), indent=2, ensure_ascii=False))