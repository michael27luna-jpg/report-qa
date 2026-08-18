"""
Agent tool 3: profile_column

Profiles ONE column at a time so the agent can understand what a column
actually contains (not just whether it exists). Returns totals, how many
values are empty, how many are distinct, and the value distribution.

For high-cardinality columns (where values rarely repeat, e.g.
"ID / Task / Case Number"), listing the "most frequent" values is
useless, so we skip that list and just return the unique count plus a
couple of example values.
"""

import io
import csv
import pandas as pd
from tools_inspect import inspect_structure


def _load_df(path: str):
    """
    Load the CSV into a DataFrame using the delimiter that
    inspect_structure detects (single source of truth for the delimiter).

    Returns (df, None) on success, or (None, error_dict) on failure.
    """
    structure = inspect_structure(path)
    if not structure.get("ok"):
        return None, {"ok": False, "error": structure.get("error", "inspect_structure failed")}

    delimiter = structure["delimiter"]
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            text = f.read()
        df = pd.read_csv(io.StringIO(text), sep=delimiter, dtype=str, keep_default_na=False, quoting=csv.QUOTE_NONE)
    except Exception as e:
        return None, {"ok": False, "error": f"Could not load CSV: {e}"}

    return df, None


def profile_column(path: str, column: str,
                   top_n: int = 10, high_card_threshold: float = 0.9) -> dict:
    """
    Profile a single column of a CSV.

    Args:
        path: path to the CSV file.
        column: the column name to profile.
        top_n: how many of the most frequent values to return.
        high_card_threshold: if the ratio of distinct/non-empty values is
            at or above this (0-1), the column is treated as
            high-cardinality and the frequency list is skipped.

    Returns:
        dict with total, empty, empty_pct, unique, and either top_values
        (normal columns) or sample_values (high-cardinality columns).
    """
    df, err = _load_df(path)
    if err:
        return err

    if column not in df.columns:
        return {"ok": False,
                "error": f"Column not found: {column}",
                "available": list(df.columns)}

    # Treat values as trimmed text; whitespace-only cells count as empty
    series = df[column].astype(str).str.strip()
    total = len(series)

    is_empty = series == ""
    empty = int(is_empty.sum())
    non_empty = series[~is_empty]
    unique = int(non_empty.nunique())
    empty_pct = round(empty / total * 100, 1) if total else 0.0

    result = {
        "ok": True,
        "column": column,
        "total": total,
        "empty": empty,
        "empty_pct": empty_pct,
        "unique": unique,
    }

    # Decide whether values rarely repeat (high cardinality)
    ratio = (unique / len(non_empty)) if len(non_empty) else 0
    high_cardinality = ratio >= high_card_threshold

    if high_cardinality:
        # Frequency list adds no value here; just show a few examples
        result["high_cardinality"] = True
        result["sample_values"] = non_empty.unique()[:3].tolist()
    else:
        # Normal column: show the most common values with their counts
        result["high_cardinality"] = False
        counts = non_empty.value_counts().head(top_n)
        result["top_values"] = [{"value": v, "count": int(c)} for v, c in counts.items()]

    return result


# --- Local test (runs only if you execute this file directly) ---
if __name__ == "__main__":
    import json

    # Sample with repeated statuses/types, unique IDs, and some empty cells
    sample = (
        "Date QA Completed;Name;ID / Task / Case Number;QA Status;Type\n"
        "1/5/25;ana@x.com;1001;Passed;SEO Landing Page\n"
        "1/6/25;luis@x.com;1002;Passed;Posting Case\n"
        "1/6/25;ana@x.com;1003;Failed;Blog\n"
        "1/7/25;;1004;Opportunity;\n"
        "1/7/25;mia@x.com;1005;Passed;Posting Case\n"
    )
    with open("_profile.csv", "w", encoding="utf-8") as f:
        f.write(sample)

    print("=== QA Status (normal column) ===")
    print(json.dumps(profile_column("_profile.csv", "QA Status"), indent=2, ensure_ascii=False))

    print("\n=== ID / Task / Case Number (high cardinality) ===")
    print(json.dumps(profile_column("_profile.csv", "ID / Task / Case Number"), indent=2, ensure_ascii=False))

    print("\n=== Type (has an empty cell) ===")
    print(json.dumps(profile_column("_profile.csv", "Type"), indent=2, ensure_ascii=False))

    print("\n=== Missing column (error case) ===")
    print(json.dumps(profile_column("_profile.csv", "Nope"), indent=2, ensure_ascii=False))