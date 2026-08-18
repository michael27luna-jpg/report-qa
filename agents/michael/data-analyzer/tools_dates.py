"""
Agent tool 4: validate_dates

Validates a date column against the format the dashboard expects
(M/D/YY or M/D/YYYY) and — most importantly — detects the mixed
2-digit / 4-digit year situation that caused the OOM crash.

It also flags impossible dates (month > 12, day > 31) and counts empty
cells. Works on one date column at a time (e.g. "Date QA Completed"
or "Date"), the same pattern as profile_column.
"""

import re
from tools_profile import _load_df   # reuse the shared loader

# M/D/YY or M/D/YYYY, with or without leading zeros.
# Groups: 1 = month, 2 = day, 3 = year (2 or 4 digits)
DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})$")

SAMPLE_CAP = 5   # how many example values to include per problem type


def validate_dates(path: str, column: str) -> dict:
    """
    Validate a single date column.

    Args:
        path: path to the CSV file.
        column: the date column to validate (e.g. "Date QA Completed").

    Returns:
        dict with counts of valid / invalid / impossible / empty dates,
        the 2- vs 4-digit year breakdown, and mixed_years (the OOM
        trigger). "ok" is False if there is any problem.
    """
    df, err = _load_df(path)
    if err:
        return err

    if column not in df.columns:
        return {"ok": False,
                "error": f"Column not found: {column}",
                "available": list(df.columns)}

    series = df[column].astype(str).str.strip()
    total = len(series)

    is_empty = series == ""
    empty = int(is_empty.sum())
    non_empty = series[~is_empty]

    valid = 0
    year_2digit = 0
    year_4digit = 0
    invalid_count = 0
    impossible_count = 0
    invalid_samples = []
    impossible_samples = []

    for value in non_empty:
        match = DATE_RE.match(value)
        if not match:
            # Doesn't even look like M/D/Y (wrong format entirely)
            invalid_count += 1
            if len(invalid_samples) < SAMPLE_CAP:
                invalid_samples.append(value)
            continue

        month = int(match.group(1))
        day = int(match.group(2))
        year = match.group(3)

        # Format matches, but is the date actually plausible?
        if month < 1 or month > 12 or day < 1 or day > 31:
            impossible_count += 1
            if len(impossible_samples) < SAMPLE_CAP:
                impossible_samples.append(value)
            continue

        valid += 1
        if len(year) == 2:
            year_2digit += 1
        else:
            year_4digit += 1

    # THE critical check: both year formats present in the same column
    mixed_years = year_2digit > 0 and year_4digit > 0

    no_problems = (
        invalid_count == 0
        and impossible_count == 0
        and not mixed_years
    )

    return {
        "ok": no_problems,
        "column": column,
        "total": total,
        "empty": empty,
        "valid": valid,
        "invalid_count": invalid_count,
        "invalid_samples": invalid_samples,
        "impossible_count": impossible_count,
        "impossible_samples": impossible_samples,
        "year_2digit": year_2digit,
        "year_4digit": year_4digit,
        "mixed_years": mixed_years,   # True = the pattern that caused the OOM
    }


# --- Local test (runs only if you execute this file directly) ---
if __name__ == "__main__":
    import json

    def write(name, rows):
        header = "Date QA Completed;Name;ID / Task / Case Number;QA Status\n"
        with open(name, "w", encoding="utf-8") as f:
            f.write(header + "".join(rows))

    # Case A: clean, all 2-digit years
    write("_d_clean.csv", [
        "1/5/25;a@x.com;1;Passed\n",
        "1/6/25;b@x.com;2;Passed\n",
        "12/31/25;c@x.com;3;Failed\n",
    ])

    # Case B: MIXED years (the OOM trigger) — some YY, some YYYY
    write("_d_mixed.csv", [
        "1/5/25;a@x.com;1;Passed\n",
        "1/6/2025;b@x.com;2;Passed\n",
        "2/1/25;c@x.com;3;Failed\n",
    ])

    # Case C: bad format + impossible date + an empty cell
    write("_d_bad.csv", [
        "2025-01-05;a@x.com;1;Passed\n",   # ISO format -> invalid
        "13/45/25;b@x.com;2;Passed\n",     # month 13, day 45 -> impossible
        ";c@x.com;3;Failed\n",             # empty date
    ])

    for label, path in [("A: clean", "_d_clean.csv"),
                        ("B: mixed years (OOM)", "_d_mixed.csv"),
                        ("C: bad + impossible + empty", "_d_bad.csv")]:
        print(f"=== {label} ===")
        print(json.dumps(validate_dates(path, "Date QA Completed"),
                        indent=2, ensure_ascii=False))
        print()