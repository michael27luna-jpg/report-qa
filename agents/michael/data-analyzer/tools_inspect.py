"""
Agent tool 1: inspect_structure

Basic X-ray of a CSV: detects the delimiter, counts rows and columns,
and lists the headers exactly as they come in. It does NOT judge yet
whether anything is right or wrong; it only returns the "vital signs"
that the other tools will need later.
"""

import csv
import io
import pandas as pd


def inspect_structure(path: str) -> dict:
    """
    Inspect the basic structure of a CSV file.

    Args:
        path: path to the CSV file to inspect.

    Returns:
        dict with: delimiter, n_rows, n_columns, headers, and ok/error.
    """
    # 1. Read the raw text of the file
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            text = f.read()
    except FileNotFoundError:
        return {"ok": False, "error": f"File not found: {path}"}
    except Exception as e:
        return {"ok": False, "error": f"Could not read the file: {e}"}

    if not text.strip():
        return {"ok": False, "error": "The file is empty."}

    # 2. Detect the delimiter using the standard-library Sniffer
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        # If the Sniffer can't decide, count candidates on the first line
        first_line = text.splitlines()[0]
        counts = {d: first_line.count(d) for d in [";", ",", "\t", "|"]}
        delimiter = max(counts, key=counts.get) if max(counts.values()) > 0 else ";"

    # 3. Load with pandas using the detected delimiter
    try:
        df = pd.read_csv(io.StringIO(text), sep=delimiter, dtype=str, keep_default_na=False, quoting=csv.QUOTE_NONE)
    except Exception as e:
        return {"ok": False, "error": f"pandas could not parse the CSV: {e}",
                "delimiter": delimiter}

    # 4. Build the structural summary (compact, for the LLM)
    return {
        "ok": True,
        "delimiter": delimiter,
        "n_rows": int(df.shape[0]),       # data rows (header not counted)
        "n_columns": int(df.shape[1]),
        "headers": list(df.columns),      # raw names, exactly as they come in
    }


# --- Local test (runs only if you execute this file directly) ---
if __name__ == "__main__":
    import json

    # Sample CSV in the format the dashboard expects (delimiter ;)
    sample_csv = (
        "Date QA Completed;Name;ID / Task / Case Number;QA Status;Type\n"
        "1/5/25;ana@x.com;1001;Passed;SEO Landing Page\n"
        "1/6/25;luis@x.com;1002;Observed;Posting Case\n"
    )
    with open("_sample.csv", "w", encoding="utf-8") as f:
        f.write(sample_csv)

    result = inspect_structure("_sample.csv")
    print(json.dumps(result, indent=2, ensure_ascii=False))