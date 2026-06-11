# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**QA Shadow Dashboard** — a fully static, zero-build web app (HTML + CSS + JS, no framework) used internally at Cox Automotive to visualize weekly QA review data. All logic runs client-side; there is no server, bundler, or test suite.

Open `index.html` directly in a browser to run it. No build step required.

## Architecture

Three files contain the entire application:

| File | Role |
|------|------|
| `index.html` | Shell, tab panels, and filter UI markup |
| `styles.css` | Dark-theme design system via CSS variables; all layout |
| `app.js` | All data parsing, rendering, and interactivity |

### Data flow

1. User uploads a semicolon-delimited CSV via the **Import** tab.
2. `parseCSV()` in `app.js` normalizes the raw rows into a `DATA` array of case objects.
3. `rerender()` calls every render function in sequence whenever data or filters change.

### Tabs and their render functions

| Tab | Render function |
|-----|----------------|
| Weekly Report | `renderReport()` |
| Team Analysis | `renderTeam()` |
| Analytics | `renderAnalytics()` (in `app.js`) |
| Guidelines | static HTML only |
| Case Log | `renderCases()` → `filterCases()` |
| Import Data | file input listener |

### Key design decisions

**Status normalization**: The legacy status value `"Observed"` is mapped to `"Opportunity"` during CSV parse. The four canonical statuses are `Passed`, `Opportunity`, `Failed`, `Critical`.

**Fix comment logic** (`resolveFixStatus`): A bug status can be promoted to `Passed` if the `QA Fix Comment` column contains enough `NA`/`N/A` tokens to cover every bug described in the summary comment. Partial NA coverage keeps the original status.

**QA alias map** (`QA_ALIAS`): Source data has inconsistent names in the `"QA Completed by"` column. The alias map translates them to canonical names for the Team Analysis back-of-card view. Add new aliases here when new QA shadow names appear with inconsistent spellings.

**Date format**: All dates are stored internally as `M/D/YY` (short year). `normalizeDate()` and `parseMDY()` handle both `M/D/YY` and `M/D/YYYY` inputs. The date pickers use `getDays()` / `getCompletedDates()` to discover which calendar days have data, then highlight only those cells.

**Charts**: Donut charts (`drawDonut` for full-size with legend, `drawSmallDonut` for inline) are drawn directly as SVG path strings — no charting library. Bar charts are plain `div` elements with percentage widths.

**Team card flip**: Each card in Team Analysis is a CSS 3D flip card. The front shows the owner's bug stats; the back (triggered by the "QA ↻" button) shows how many cases that person reviewed as a QA shadow.

### CSS variables (single source of truth)

Status colors are defined once in `:root` in `styles.css` and mirrored as JS constants in `STATUS_COLORS` / `CAT_COLORS` / `TYPE_COLORS` at the top of `app.js`. When changing a color, update both places.

## CSV format expected

Semicolon-delimited (`;`), first row is headers. Key columns:

- `Date QA Completed` — day the QA review happened (mapped to `day`)
- `Date` — case completion date (mapped to `completed_date`)
- `Name` — owner email or display name
- `ID / Task / Case Number` — task identifier
- `QA Status` — raw status value
- `QA Comment` — bug summary (used for category parsing and bug count)
- `QA Fix Comment` — fix response (used by `resolveFixStatus`)
- `QA Completed by:` or `QA Completed by` — QA shadow name
- `Type` or `Case Type` — normalized to `LP`, `Posting`, or `Unknown`
