"""
Agent tool 2: check_headers

Compares the CSV headers against the ones the dashboard expects.
Reports which required / recommended columns are present or missing,
and — when a required column is missing — tries to detect a likely
typo among the headers that ARE present (e.g. "Nmae" -> "Name").

This catches the worst silent failure in the dashboard: a single
misspelled header makes parseCSV drop every row with no explanation.
"""

import difflib
from tools_inspect import inspect_structure


# Expected columns. Each canonical name maps to its accepted variants,
# so we don't falsely flag a valid alternative spelling as "missing".
REQUIRED = {
    "Name": ["Name"],
    "ID / Task / Case Number": ["ID / Task / Case Number"],
    "Date QA Completed": ["Date QA Completed"],
    "QA Status": ["QA Status"],
}

RECOMMENDED = {
    "Date": ["Date"],
    "QA Comment": ["QA Comment"],
    "QA Fix Comment": ["QA Fix Comment"],
    "QA Completed by": ["QA Completed by", "QA Completed by:"],
    "Type": ["Type", "Case Type"],
}


def _classify(expected_map: dict, headers: list, unmatched: list) -> tuple:
    """
    For a group of expected columns, split them into present vs missing.
    For each missing one, look for a likely typo among the headers that
    haven't matched anything yet.

    Returns: (present, missing, typos)
      present -> list of canonical names found
      missing -> list of canonical names not found
      typos   -> dict {canonical_name: likely_typo_in_file}
    """
    present, missing, typos = [], [], {}

    for canonical, variants in expected_map.items():
        # A column counts as present if any accepted variant is in the file
        if any(v in headers for v in variants):
            present.append(canonical)
            continue

        missing.append(canonical)

        # Try to find a close match among still-unmatched headers (typo hunt)
        candidates = difflib.get_close_matches(canonical, unmatched, n=1, cutoff=0.7)
        if candidates:
            typos[canonical] = candidates[0]

    return present, missing, typos


def check_headers(path: str) -> dict:
    """
    Check a CSV's headers against the dashboard's expected columns.

    Args:
        path: path to the CSV file.

    Returns:
        dict describing present/missing required & recommended columns,
        plus any detected typos. "ok" is False if a REQUIRED column is
        missing (the file would fail to load).
    """
    # Reuse tool 1 to read the file and get the raw headers
    structure = inspect_structure(path)
    if not structure.get("ok"):
        return {"ok": False, "error": structure.get("error", "inspect_structure failed")}

    headers = structure["headers"]

    # Headers that don't match any expected canonical/variant name.
    # These are the pool we search for typos.
    all_variants = [v for vs in REQUIRED.values() for v in vs] + \
                   [v for vs in RECOMMENDED.values() for v in vs]
    unmatched = [h for h in headers if h not in all_variants]

    req_present, req_missing, req_typos = _classify(REQUIRED, headers, unmatched)
    rec_present, rec_missing, rec_typos = _classify(RECOMMENDED, headers, unmatched)

    typos = {**req_typos, **rec_typos}

    return {
        "ok": len(req_missing) == 0,   # False if any required column is missing
        "required_present": req_present,
        "required_missing": req_missing,
        "recommended_present": rec_present,
        "recommended_missing": rec_missing,
        "typo_suggestions": typos,     # {expected: likely_typo_found}
    }


# --- Local test (runs only if you execute this file directly) ---
if __name__ == "__main__":
    import json

    # Case A: clean file, everything the dashboard needs is present
    clean = (
        "Date QA Completed;Name;ID / Task / Case Number;QA Status;Date;"
        "QA Comment;QA Fix Comment;QA Completed by:;Case Type\n"
        "1/5/25;ana@x.com;1001;Passed;1/5/25;ok;;rev1;SEO Landing Page\n"
    )
    with open("_clean.csv", "w", encoding="utf-8") as f:
        f.write(clean)

    # Case B: a typo in a required header ("Nmae") and a missing recommended
    typo = (
        "Date QA Completed;Nmae;ID / Task / Case Number;QA Status\n"
        "1/5/25;ana@x.com;1001;Passed\n"
    )
    with open("_typo.csv", "w", encoding="utf-8") as f:
        f.write(typo)

    print("=== Case A: clean file ===")
    print(json.dumps(check_headers("_clean.csv"), indent=2, ensure_ascii=False))
    print("\n=== Case B: typo + missing ===")
    print(json.dumps(check_headers("_typo.csv"), indent=2, ensure_ascii=False))