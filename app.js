/* ═══════════════════════════════════════════
   QA Shadow Dashboard — app.js
   Week of Apr 13–17, 2026 · Cox Automotive
   ═══════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const WEEK_NUMBER = '';
const WEEK_RANGE  = '';

let DATA = [];  // populated via CSV upload

// ─────────────────────────────────────────────────────────────
// STATUS & CATEGORY COLORS  (single source of truth)
// Passed=green, Opportunity=yellow, Failed=orange, Critical=red
// ─────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Passed:      'var(--passed)',
  Opportunity: 'var(--observed)',
  Failed:      'var(--failed)',
  Critical:    'var(--critical)',
};

const CAT_COLORS = {
  Config:   'var(--warn)',
  Linking:  'var(--failed)',
  Content:  'var(--accent)',
  Styling:  'var(--accent2)',
  Label:    '#c084fc',
};

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
function count(arr, fn) { return arr.filter(fn).length; }

function groupBy(arr, key) {
  return arr.reduce((acc, val) => {
    const k = typeof key === 'function' ? key(val) : val[key];
    (acc[k] = acc[k] || []).push(val);
    return acc;
  }, {});
}

function sortDesc(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

function extractNameFromEmail(email) {
  if (!email || !email.includes('@')) return email || 'Unknown';
  return email.split('@')[0]
    .split('.')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getDays() {
  const days = [...new Set(DATA.map(x => x.day))];
  return days.sort((a, b) => {
    const parse = d => {
      const [m, dd, yy] = d.split('/');
      return new Date(`20${yy}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`);
    };
    return parse(a) - parse(b);
  });
}

function parseCategories(comment) {
  if (!comment) return [];
  const cats = new Set();
  const u = comment.toUpperCase();
  if (u.includes('LABEL'))                            cats.add('Label');
  if (u.includes('STYLING') || u.includes('STYLE'))  cats.add('Styling');
  if (u.includes('CONTENT'))                          cats.add('Content');
  if (u.includes('CONFIG') || u.includes('CONFGI'))  cats.add('Config');
  if (u.includes('LINK') || u.includes('LINKING'))   cats.add('Linking');
  return [...cats];
}
// ─────────────────────────────────────────────────────────────
// FIX COMMENT LOGIC
// ─────────────────────────────────────────────────────────────
/* function resolveFixStatus(status, fixComment) {
  if (!fixComment || fixComment.trim() === '') return status;
  const u = fixComment.toUpperCase();
  // Match NA or N/A as standalone word/token, not as substring of other words
  const naPattern = /\bN\/A\b|\bNA\d*\b/;
  if (naPattern.test(u)) return 'Passed';
  return status;
} */
function countBugsInSummary(summary) {
  if (!summary) return 0;
  // Each bug starts with M|D|M/D followed by | or /
  const bugPattern = /(?:^|,\s*)(M\/D|M|D)\s*[|\/]/gi;
  const matches = summary.match(bugPattern);
  return matches ? matches.length : 1;
}

function countNAsInFix(fixComment) {
  if (!fixComment) return 0;
  // Match NA, NA1, NA2, N/A, N/A1 as whole words
  const naPattern = /\bN\/?A\d*\b/gi;
  const matches = fixComment.match(naPattern);
  return matches ? matches.length : 0;
}

function resolveFixStatus(status, fixComment, summary) {
  if (!fixComment || fixComment.trim() === '') return status;

  const naCount  = countNAsInFix(fixComment);
  if (naCount === 0) return status;

  const bugCount = countBugsInSummary(summary);

  // All bugs covered by NAs → Passed
  if (naCount >= bugCount) return 'Passed';

  // Partial NAs → keep original status
  return status;
}

// ─────────────────────────────────────────────────────────────
// CSV PARSER
// ─────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    const vals = line.split(';').map(v => v.trim().replace(/"/g, ''));
    const obj  = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');

    const rawRaw    = obj['QA Status'] || 'Opportunity';
    // Normalize legacy "Observed" → "Opportunity"
    const rawStatus = rawRaw === 'Observed' ? 'Opportunity' : rawRaw;
    const comment    = obj['QA Comment'] || '';
    const fixComment = obj['QA Fix Comment'] || '';
/*     const status     = resolveFixStatus(rawStatus, fixComment); */
    const status     = resolveFixStatus(rawStatus, fixComment, comment);

    return {
      day:        obj['Date QA Completed'] || '',
      owner:      extractNameFromEmail(obj['Name'] || ''),
      task_id:    obj['ID / Task / Case Number'] || '',
      status,
      original_status: rawStatus,
      qa_by:      (obj['QA Completed by:'] || obj['QA Completed by'] || '').trim(),
      summary:    comment,
      fix_comment: fixComment,
      categories: status === 'Passed' ? [] : parseCategories(comment),
    };
  }).filter(r => r.owner && r.owner !== 'Unknown' && r.task_id && r.status !== 'In progress' && r.status !== 'In Progress');
}

// ─────────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────────
document.getElementById('csv-file-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = parseCSV(ev.target.result);
      DATA = [...parsed];
      const statusEl = document.getElementById('import-status');
      if (!parsed.length) {
        statusEl.textContent = '⚠ File loaded but no valid rows found. Check column headers.';
        statusEl.style.color = 'var(--observed)';
      } else {
        statusEl.textContent = `✓ Loaded ${parsed.length} cases across ${getDays().length} day(s).`;
        statusEl.style.color = 'var(--passed)';
      }
      rerender();
    } catch (err) {
      document.getElementById('import-status').textContent = '✗ Parse error: ' + err.message;
      document.getElementById('import-status').style.color = 'var(--critical)';
    }
  };
  reader.readAsText(file);
});

// ─────────────────────────────────────────────────────────────
// DONUT CHART — full size (with legend)
// ─────────────────────────────────────────────────────────────
function drawDonut(svgId, legendId, slices) {
  const valid = slices.filter(s => s.value > 0);
  const svgEl = document.getElementById(svgId);
  const legEl = legendId ? document.getElementById(legendId) : null;
  if (!svgEl) return;

  if (!valid.length) {
    svgEl.innerHTML = '';
    if (legEl) legEl.innerHTML = '<div style="color:var(--muted);font-size:.72rem;">No data</div>';
    return;
  }

  const total = valid.reduce((s, x) => s + x.value, 0);
  const r = 42, cx = 55, cy = 55, hole = 10;
  let angle = -90, paths = '';

  valid.forEach(s => {
    const deg  = (s.value / total) * 360;
    const rad1 = angle * Math.PI / 180;
    const rad2 = (angle + deg) * Math.PI / 180;
    const x1 = cx + r * Math.cos(rad1), y1 = cy + r * Math.sin(rad1);
    const x2 = cx + r * Math.cos(rad2), y2 = cy + r * Math.sin(rad2);
    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${deg > 180 ? 1 : 0} 1 ${x2},${y2} Z" fill="${s.color}" opacity=".88"/>`;
    angle += deg;
  });
  paths += `<circle cx="${cx}" cy="${cy}" r="${r - hole}" fill="var(--surface)"/>`;
  paths += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="var(--text)" font-size="16" font-family="Space Mono,monospace" font-weight="700">${total}</text>`;

  svgEl.innerHTML = paths;
if (legEl) legEl.innerHTML = valid.map(s => {
    const pct = Math.round(s.value / total * 100);
    return `
    <div class="legend-item">
      <div class="legend-dot" style="background:${s.color};width:13px;height:13px;"></div>
      <span style="font-size:.85rem;">${s.label}
        <span style="color:var(--muted);font-family:'Space Mono',monospace;margin-left:5px;font-size:.8rem;">(${s.value})</span>
        <span style="font-family:'Space Mono',monospace;font-size:.78rem;color:${s.color};margin-left:5px;">${pct}%</span>
      </span>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// DONUT CHART — small (no legend, inline)
// ─────────────────────────────────────────────────────────────
function drawSmallDonut(svgId, slices, size = 80) {
  const el = document.getElementById(svgId);
  if (!el) return;
  const valid = slices.filter(s => s.value > 0);
  if (!valid.length) { el.innerHTML = ''; return; }

  const total = valid.reduce((s, x) => s + x.value, 0);
  const r = 32, cx = size / 2, cy = size / 2, hole = 10;
  let angle = -90, paths = '';

  valid.forEach(s => {
    const deg  = (s.value / total) * 360;
    const rad1 = angle * Math.PI / 180;
    const rad2 = (angle + deg) * Math.PI / 180;
    const x1 = cx + r * Math.cos(rad1), y1 = cy + r * Math.sin(rad1);
    const x2 = cx + r * Math.cos(rad2), y2 = cy + r * Math.sin(rad2);
    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${deg > 180 ? 1 : 0} 1 ${x2},${y2} Z" fill="${s.color}" opacity=".88"/>`;
    angle += deg;
  });
  paths += `<circle cx="${cx}" cy="${cy}" r="${r - hole}" fill="var(--surface2)"/>`;
  paths += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="var(--text)" font-size="10" font-family="Space Mono,monospace" font-weight="700">${total}</text>`;

  el.setAttribute('viewBox', `0 0 ${size} ${size}`);
  el.innerHTML = paths;
}

// ─────────────────────────────────────────────────────────────
// RENDER — OVERVIEW (charts inside Weekly Report tab)
// ─────────────────────────────────────────────────────────────
function renderOverview() {
  const d     = DATA;
  const total = d.length;
  const DAYS  = getDays();

  // Clean up QA bar chart if exists from previous render
  const oldQaBar = document.getElementById('qa-bar-chart');
  if (oldQaBar) oldQaBar.remove();
  const donutType = document.getElementById('donut-type');
  const donutLeg  = document.getElementById('donut-type-legend');
  if (donutType) donutType.style.display = '';
  if (donutLeg)  donutLeg.style.display  = '';

  if (total === 0) {
    const empty = '<div style="color:var(--muted);font-size:.78rem;padding:8px 0;">Upload a CSV to see data</div>';
    ['kpi-row','timeline','daily-bars','cat-bars','owner-bars',
     'donut-status','donut-status-legend','donut-type','donut-type-legend',
     'qa-donut-grid'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = empty;
    });
    return;
  }

  const passed      = count(d, x => x.status === 'Passed');
  const opportunity = count(d, x => x.status === 'Opportunity');
  const failed      = count(d, x => x.status === 'Failed');
  const critical    = count(d, x => x.status === 'Critical');
  const errors      = failed + critical;
  const owners      = [...new Set(d.map(x => x.owner))].length;
  const passRate    = Math.round(passed / total * 100);

  // ── KPI cards ──
  const kpis = [
    {
      label:'Total Cases',
      val: total,
      sub: `${DAYS.length} day(s) loaded`,
      color: 'var(--accent)'
    },
    {
      label:'Passed',
      val: passed,
      sub: `${((passed / total) * 100).toFixed(2)}% pass rate`,
      color: 'var(--passed)'
    },
    {
      label:'Opportunity',
      val: opportunity,
      sub: `${((opportunity / total) * 100).toFixed(2)}% of ${total} cases`,
      color: 'var(--observed)'
    },
    {
      label:'Failed',
      val: failed,
      sub: `${((failed / total) * 100).toFixed(2)}% of ${total} cases`,
      color: 'var(--failed)'
    },
    {
      label:'Critical',
      val: critical,
      sub: `${((critical / total) * 100).toFixed(2)}% of ${total} cases`,
      color: 'var(--critical)'
    },
    {
      label:'Team Members',
      val: owners,
      sub: 'reviewed this week',
      color: 'var(--accent2)'
    },
  ];
  document.getElementById('kpi-row').innerHTML = kpis.map(k => `
    <div class="kpi" style="--kpi-color:${k.color}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-val">${k.val}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  // ── Timeline ──
  const byDay  = groupBy(d, 'day');
  const counts = {};
  DAYS.forEach(day => counts[day] = byDay[day]?.length || 0);
  const maxDay = Math.max(...Object.values(counts), 1);

  document.getElementById('timeline').innerHTML = DAYS.map(day => `
    <div class="tl-day">
      <div class="tl-day-label">${day}</div>
      <div class="tl-day-count">${counts[day]}</div>
    </div>`).join('');

  // ── Stacked bar per day ──
  document.getElementById('daily-bars').innerHTML = `<div class="bar-chart">${
    DAYS.map(day => {
      const dc  = d.filter(x => x.day === day);
      const pa  = count(dc, x => x.status === 'Passed');
      const op  = count(dc, x => x.status === 'Opportunity');
      const fa  = count(dc, x => x.status === 'Failed');
      const cr  = count(dc, x => x.status === 'Critical');
      const tot = counts[day];
      return `<div class="bar-row">
        <div class="bar-name" style="min-width:72px;font-family:'Space Mono',monospace;font-size:.7rem;">${day}</div>
        <div class="bar-track" style="height:16px;"><div style="display:flex;height:100%;">
          <div title="Passed:${pa}"      style="width:${pa/maxDay*100}%;background:var(--passed);opacity:.65"></div>
          <div title="Opportunity:${op}" style="width:${op/maxDay*100}%;background:var(--observed);opacity:.85"></div>
          <div title="Failed:${fa}"      style="width:${fa/maxDay*100}%;background:var(--failed)"></div>
          <div title="Critical:${cr}"    style="width:${cr/maxDay*100}%;background:var(--critical)"></div>
        </div></div>
        <div class="bar-count">${tot}</div>
      </div>`;
    }).join('')
  }
  <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
    ${['Passed','Opportunity','Failed','Critical'].map(s =>
      `<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;">
        <span style="width:10px;height:10px;border-radius:2px;background:${STATUS_COLORS[s]};display:inline-block;opacity:.85"></span>${s}
      </span>`).join('')}
  </div></div>`;

  // ── Status donut ──
  drawDonut('donut-status', 'donut-status-legend', [
    { label:'Passed',      value: passed,      color: STATUS_COLORS.Passed },
    { label:'Opportunity', value: opportunity, color: STATUS_COLORS.Opportunity },
    { label:'Failed',      value: failed,      color: STATUS_COLORS.Failed },
    { label:'Critical',    value: critical,    color: STATUS_COLORS.Critical },
  ]);

  // ── Bug Categories bar + percentage ──
  const catCount = {};
  d.forEach(r => r.categories.forEach(c => catCount[c] = (catCount[c] || 0) + 1));

  if (!Object.keys(catCount).length) {
    document.getElementById('cat-bars').innerHTML =
      '<div style="color:var(--muted);font-size:.78rem;">No bug categories detected</div>';
  } else {
    const maxCat = Math.max(...Object.values(catCount), 1);
    document.getElementById('cat-bars').innerHTML =
      sortDesc(catCount).map(([cat, cnt]) => {
        const pct = errors > 0 ? Math.round(cnt / errors * 100) : 0;
        return `<div class="bar-row">
          <div class="bar-name">${cat}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${cnt/maxCat*100}%;background:${CAT_COLORS[cat] || 'var(--accent)'}"></div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;min-width:68px;justify-content:flex-end;">
            <span style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);">${pct}%</span>
            <span class="bar-count">${cnt}</span>
          </div>
        </div>`;
      }).join('') +
      `<div style="font-size:.63rem;color:var(--muted);margin-top:6px;font-family:'Space Mono',monospace;">% of total errors (${errors})</div>`;
  }

  // ── Top Bug Contributors ──
  // Counts only errors (Failed + Critical), Opportunity not included
  const allOwners = [...new Set(d.map(x => x.owner))];
  const bugsByOwner = {};
  allOwners.forEach(o => {
    bugsByOwner[o] = count(d.filter(x => x.owner === o), x => x.status === 'Failed' || x.status === 'Critical');
  });

  const sortedByBugs = [...allOwners].sort((a, b) => bugsByOwner[b] - bugsByOwner[a]);
  const maxBugs = Math.max(...Object.values(bugsByOwner), 1);
    const totalOwners = sortedByBugs.length;
  const getBarColor = (index, bugs) => {
    if (bugs === 0) return 'var(--passed)';
    const ratio = totalOwners <= 1 ? 0 : index / (totalOwners - 1);
    const r = Math.round(255 * ratio < 0.5 ? 1 : 2 * (1 - ratio));
    const g = Math.round(255 * (ratio < 0.5 ? 2 * ratio : 1));
    return `rgb(${Math.round(255 - 155*ratio)}, ${Math.round(120 + 105*ratio)}, ${Math.round(40 + 120*ratio)})`;
  };

  document.getElementById('owner-bars').innerHTML = sortedByBugs.map((own, i) => {
    const bugs = bugsByOwner[own];
    if (bugs === 0) {
      return `<div class="bar-row">
        <div class="bar-name" style="color:var(--muted)">${own}</div>
        <div style="flex:1;font-size:.68rem;font-family:'Space Mono',monospace;color:var(--passed);padding-left:8px;">✓ No errors — great job!</div>
        <div class="bar-count" style="color:var(--passed)">0</div>
      </div>`;
    }
    // Color by rank: top bug-makers get red/orange
    return `<div class="bar-row">
      <div class="bar-name">${own}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${bugs/maxBugs*100}%;background:${getBarColor(i, bugs)}"></div>
      </div>
      <div class="bar-count">${bugs}</div>
    </div>`;
  }).join('');

  // ── QA Shadow Workload — bar chart (sorted desc) ──
  const qaByCount = {};
  d.forEach(r => { if (r.qa_by) qaByCount[r.qa_by] = (qaByCount[r.qa_by] || 0) + 1; });
  const qaColors = ['var(--accent2)', 'var(--warn)', 'var(--accent)', 'var(--failed)'];

  const qaSorted = sortDesc(qaByCount);
  const qaMax    = qaSorted.length > 0 ? qaSorted[0][1] : 1;

  document.getElementById('donut-type').style.display        = 'none';
  document.getElementById('donut-type-legend').style.display = 'none';

  document.getElementById('donut-type-legend').insertAdjacentHTML('afterend', `
    <div id="qa-bar-chart" style="width:100%;margin-top:8px;">
      <div class="bar-chart">
        ${qaSorted.map(([name, cnt]) => {
          const personCases = d.filter(x => x.qa_by === name);
          const pa = count(personCases, x => x.status === 'Passed');
          const op = count(personCases, x => x.status === 'Opportunity');
          const fa = count(personCases, x => x.status === 'Failed');
          const cr = count(personCases, x => x.status === 'Critical');
          // Min width for Critical so it's always visible when > 0
          const crWidth = cr > 0 ? Math.max(cr / qaMax * 100, 1.5) : 0;
          return `<div class="bar-row">
            <div class="bar-name">${name}</div>
            <div class="bar-track" style="height:14px;">
              <div style="display:flex;height:100%;border-radius:2px;overflow:hidden;">
                <div title="Passed: ${pa}"      style="width:${pa/qaMax*100}%;background:var(--passed);opacity:.8"></div>
                <div title="Opportunity: ${op}" style="width:${op/qaMax*100}%;background:var(--observed);opacity:.9"></div>
                <div title="Failed: ${fa}"      style="width:${fa/qaMax*100}%;background:var(--failed)"></div>
                <div title="Critical: ${cr}"    style="width:${crWidth}%;background:var(--critical)"></div>
              </div>
            </div>
            <div class="bar-count">${cnt}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;justify-content:center;">
        ${['Passed','Opportunity','Failed','Critical'].map(s =>
          `<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;">
            <span style="width:10px;height:10px;border-radius:2px;background:${STATUS_COLORS[s]};display:inline-block;opacity:.85"></span>${s}
          </span>`).join('')}
      </div>
    </div>
  `);

  // ── QA Shadow detail grid (by-day + by-shadow error donuts) ──
  renderQADonutGrid(d, DAYS, byDay, qaByCount, qaColors);
}

// ─────────────────────────────────────────────────────────────
// QA SHADOW DETAIL GRID
// Row 1: one card per day  — cases donut + status breakdown
// Row 2: one card per QA Shadow — errors found donut
// ─────────────────────────────────────────────────────────────
function renderQADonutGrid(d, DAYS, byDay, qaByCount, qaColors) {
  const container = document.getElementById('qa-donut-grid');
  if (!container) return;

  const qaNames = Object.keys(qaByCount);

  // Day cards
  const dayCards = DAYS.map(day => {
    const dc   = byDay[day] || [];
    const pa   = count(dc, x => x.status === 'Passed');
    const op   = count(dc, x => x.status === 'Opportunity');
    const fa   = count(dc, x => x.status === 'Failed');
    const cr   = count(dc, x => x.status === 'Critical');
    const errs = fa + cr;
    const id   = 'dday-' + day.replace(/\//g, '');

    const qaSplit = {};
    dc.forEach(r => { if (r.qa_by) qaSplit[r.qa_by] = (qaSplit[r.qa_by] || 0) + 1; });

    return `<div class="qa-donut-card">
      <div class="card-title">${day}</div>
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <svg id="${id}" width="80" height="80" viewBox="0 0 80 80"></svg>
          <div style="font-size:.6rem;color:var(--muted);text-align:center;margin-top:3px;font-family:'Space Mono',monospace;">cases</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;font-size:.72rem;">
          ${[['Passed',pa,'var(--passed)'],['Opportunity',op,'var(--observed)'],['Failed',fa,'var(--failed)'],['Critical',cr,'var(--critical)']].map(([lbl,val,col])=>
            val > 0 ? `<div style="display:flex;align-items:center;gap:5px;">
              <span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span>
              <span style="color:var(--muted)">${lbl}:</span>
              <span style="font-family:'Space Mono',monospace;color:${col}">${val}</span>
            </div>` : ''
          ).join('')}
          <div style="margin-top:3px;font-size:.63rem;font-family:'Space Mono',monospace;color:${errs > 0 ? 'var(--observed)' : 'var(--passed)'};">
            ${errs > 0 ? `${errs} error(s)` : '✓ Clean day'}
          </div>
        </div>
      </div>
      ${Object.keys(qaSplit).length ? `
        <div style="margin-top:10px;font-size:.62rem;color:var(--muted);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px;">QA Shadow split</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${Object.entries(qaSplit).map(([name, c], i) => `
            <div style="display:flex;align-items:center;gap:4px;font-size:.68rem;">
              <span style="width:7px;height:7px;border-radius:50%;background:${qaColors[i % qaColors.length]};display:inline-block"></span>
              <span style="color:var(--text)">${name}</span>
              <span style="font-family:'Space Mono',monospace;color:var(--muted)">(${c})</span>
            </div>`).join('')}
        </div>` : ''}
    </div>`;
  });

  // Per-QA-shadow error cards
  const shadowCards = qaNames.map((name, i) => {
    const sc   = d.filter(x => x.qa_by === name);
    const pa   = count(sc, x => x.status === 'Passed');
    const op   = count(sc, x => x.status === 'Opportunity');
    const fa   = count(sc, x => x.status === 'Failed');
    const cr   = count(sc, x => x.status === 'Critical');
    const errs = fa + cr;
    const id   = 'dshadow-' + name.replace(/\s/g, '');

    return `<div class="qa-donut-card">
      <div class="card-title">${name} — Errors Found</div>
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <svg id="${id}" width="80" height="80" viewBox="0 0 80 80"></svg>
          <div style="font-size:.6rem;color:var(--muted);text-align:center;margin-top:3px;font-family:'Space Mono',monospace;">errors</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;font-size:.72rem;">
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="width:7px;height:7px;border-radius:50%;background:var(--passed);display:inline-block"></span>
            <span style="color:var(--muted)">Passed:</span>
            <span style="font-family:'Space Mono',monospace;color:var(--passed)">${pa}</span>
          </div>
          ${op > 0 ? `<div style="display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--observed);display:inline-block"></span><span style="color:var(--muted)">Opportunity:</span><span style="font-family:'Space Mono',monospace;color:var(--observed)">${op}</span></div>` : ''}
          ${fa > 0 ? `<div style="display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--failed);display:inline-block"></span><span style="color:var(--muted)">Failed:</span><span style="font-family:'Space Mono',monospace;color:var(--failed)">${fa}</span></div>` : ''}
          ${cr > 0 ? `<div style="display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--critical);display:inline-block"></span><span style="color:var(--muted)">Critical:</span><span style="font-family:'Space Mono',monospace;color:var(--critical)">${cr}</span></div>` : ''}
          <div style="margin-top:3px;font-size:.63rem;font-family:'Space Mono',monospace;color:var(--muted);">${sc.length} total reviewed</div>
        </div>
      </div>
    </div>`;
  });

  container.innerHTML = `
    <div style="font-size:.72rem;color:var(--muted);margin-bottom:10px;font-family:'Syne',sans-serif;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">By day</div>
    <div class="qa-donuts-row" id="qa-day-row">${dayCards.join('')}</div>
    ${shadowCards.length ? `
    <div style="font-size:.72rem;color:var(--muted);margin:20px 0 10px;font-family:'Syne',sans-serif;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">By QA Shadow</div>
    <div class="qa-donuts-row">${shadowCards.join('')}</div>` : ''}
  `;

  // Draw all mini donuts after DOM is ready
  requestAnimationFrame(() => {
    DAYS.forEach(day => {
      const dc  = (byDay[day] || []);
      drawSmallDonut('dday-' + day.replace(/\//g, ''), [
        { value: count(dc, x => x.status === 'Passed'),      color: STATUS_COLORS.Passed },
        { value: count(dc, x => x.status === 'Opportunity'), color: STATUS_COLORS.Opportunity },
        { value: count(dc, x => x.status === 'Failed'),      color: STATUS_COLORS.Failed },
        { value: count(dc, x => x.status === 'Critical'),    color: STATUS_COLORS.Critical },
      ]);
    });

    qaNames.forEach(name => {
      const sc   = d.filter(x => x.qa_by === name);
      const op   = count(sc, x => x.status === 'Opportunity');
      const fa   = count(sc, x => x.status === 'Failed');
      const cr   = count(sc, x => x.status === 'Critical');
      const errs = fa + cr;
      drawSmallDonut('dshadow-' + name.replace(/\s/g, ''),
        errs === 0
          ? [{ value: count(sc, x => x.status === 'Passed'), color: STATUS_COLORS.Passed }]
          : [
              { value: op, color: STATUS_COLORS.Opportunity },
              { value: fa, color: STATUS_COLORS.Failed },
              { value: cr, color: STATUS_COLORS.Critical },
            ]
      );
    });
  });
}

// ─────────────────────────────────────────────────────────────
// RENDER — CASE LOG + FILTER SYSTEM
// ─────────────────────────────────────────────────────────────

// ── Filter state ──
const activeFilters = {
  dateFrom:   null,   // 'MM/DD/YY'
  dateTo:     null,   // 'MM/DD/YY'
  status:     [],     // multi: ['Passed','Failed',...]
  qaby:       [],     // multi: ['Cidar','Michael',...]
  owner:      [],
  category:   [],     // multi: ['Config','Styling',...]
};

// ── Date picker state ──
let dpYear  = new Date().getFullYear();
let dpMonth = new Date().getMonth();
let dpStart = null;  // 'MM/DD/YY'
let dpEnd   = null;  // 'MM/DD/YY'
let dpSelecting = false;

// ─────────────────────────────────────────────────────────────
// DROPDOWN TOGGLE
// ─────────────────────────────────────────────────────────────
function toggleDropdown(name) {
  const allDropdowns = ['date','status','qaby','owner','category'];
  allDropdowns.forEach(n => {
    if (n === name) return;
    document.getElementById(`filter-dropdown-${n}`)?.classList.remove('open');
    document.getElementById(`filter-btn-${n}`)?.classList.remove('open');
  });
  const dd  = document.getElementById(`filter-dropdown-${name}`);
  const btn = document.getElementById(`filter-btn-${name}`);
  const isOpen = dd.classList.toggle('open');
  btn.classList.toggle('open', isOpen);

  if (name === 'date' && isOpen) renderDatePicker();
  if (name === 'qaby' && isOpen) renderDropdownOptions('qaby');
  if (name === 'owner' && isOpen) renderDropdownOptions('owner');
  if (name === 'category' && isOpen) renderDropdownOptions('category');
}

// Close dropdowns when clicking outside
document.addEventListener('click', e => {
  if (
    !e.target.closest('.filter-wrap') &&
    !e.target.closest('.filter-dropdown') &&
    !e.target.closest('.date-picker-wrap')
  ) {
    document.querySelectorAll('.filter-dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('open'));
  }
});

// ─────────────────────────────────────────────────────────────
// DROPDOWN OPTIONS (QA By + Category — dynamic from data)
// ─────────────────────────────────────────────────────────────
function renderDropdownOptions(name, searchTerm = '') {
  const container = document.getElementById(`filter-options-${name}`);
  if (!container) return;

  let options = [];
  if (name === 'qaby') {
    options = [...new Set(DATA.map(x => x.qa_by).filter(Boolean))].sort();
  } else if (name === 'owner') {
    options = [...new Set(DATA.map(x => x.owner).filter(Boolean))].sort();
  } else if (name === 'category') {
    options = [...new Set(DATA.flatMap(x => x.categories))].sort();
  }

  const filtered = searchTerm
    ? options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  const active = activeFilters[name] || activeFilters.qaby || activeFilters.category;
  // const sel    = name === 'qaby' ? activeFilters.qaby : activeFilters.category;
  const sel = activeFilters[name] || [];

  // Count per option
  const countMap = {};
  DATA.forEach(r => {
    if (name === 'qaby') {
      if (r.qa_by) countMap[r.qa_by] = (countMap[r.qa_by] || 0) + 1;
    } else if (name === 'owner') {
      if (r.owner) countMap[r.owner] = (countMap[r.owner] || 0) + 1;
    } else {
      r.categories.forEach(c => countMap[c] = (countMap[c] || 0) + 1);
    }
  });

  container.innerHTML = filtered.map(opt => `
    <div class="filter-option${sel.includes(opt) ? ' selected' : ''}"
         onclick="toggleFilterOption('${name}','${opt}')"
         id="fopt-${name}-${opt.replace(/\s/g,'-')}">
      <div class="filter-checkbox"></div>
      <span class="filter-option-label">${opt}</span>
      <span class="filter-option-count">${countMap[opt] || 0}</span>
    </div>`).join('');
}

function searchDropdown(name, val) {
  renderDropdownOptions(name, val);
}

// ─────────────────────────────────────────────────────────────
// TOGGLE FILTER OPTION (multi-select)
// ─────────────────────────────────────────────────────────────
function toggleFilterOption(name, value) {
  let arr;
  if (name === 'status')   arr = activeFilters.status;
  if (name === 'qaby')     arr = activeFilters.qaby;
  if (name === 'owner')    arr = activeFilters.owner;
  if (name === 'category') arr = activeFilters.category;

  const idx = arr.indexOf(value);
  if (idx === -1) arr.push(value);
  else            arr.splice(idx, 1);

  // Update visual state of the option
  const el = document.getElementById(`fopt-${name}-${value.replace(/\s/g,'-')}`);
  if (el) el.classList.toggle('selected', arr.includes(value));

  updateFilterUI();
  filterCases();
}

// ─────────────────────────────────────────────────────────────
// DATE PICKER
// ─────────────────────────────────────────────────────────────
function renderDatePicker() {
  const DAYS     = getDays();
  const daysSet  = new Set(DAYS);
  const months   = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

  document.getElementById('date-picker-month-label').textContent =
    `${months[dpMonth]} ${dpYear}`;

  const firstDay = new Date(dpYear, dpMonth, 1).getDay();
  const daysInMonth = new Date(dpYear, dpMonth + 1, 0).getDate();
  const dayLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const parseDay = str => {
    if (!str) return null;
    const [m, d, y] = str.split('/');
    return new Date(`20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
  };

  const fmtKey = (y, m, d) => {
    const mm = String(m+1).padStart(2,'0');
    const dd = String(d).padStart(2,'0');
    const yy = String(y).slice(-2);
    return `${mm}/${dd}/${yy}`;
  };

  const startDate = parseDay(dpStart);
  const endDate   = parseDay(dpEnd);

  let html = dayLabels.map(l => `<div class="date-picker-day-label">${l}</div>`).join('');

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="date-picker-day empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key     = fmtKey(dpYear, dpMonth, day);
    const hasData = daysSet.has(key);
    const date    = new Date(dpYear, dpMonth, day);

    let cls = 'date-picker-day';
    if (!hasData) cls += ' no-data';
    else cls += ' has-data';

    if (startDate && endDate) {
      if (date >= startDate && date <= endDate) cls += ' in-range';
    }
    if (dpStart === key) cls += ' range-start';
    if (dpEnd   === key) cls += ' range-end';

    const click = hasData ? `onclick="datePickerClick('${key}', event)"` : '';
    html += `<div class="${cls}" ${click}>${day}</div>`;
  }

  document.getElementById('date-picker-grid').innerHTML = html;
}

function datePickerNav(dir) {
  dpMonth += dir;
  if (dpMonth > 11) { dpMonth = 0;  dpYear++; }
  if (dpMonth < 0)  { dpMonth = 11; dpYear--; }
  renderDatePicker();
}

function datePickerClick(key, event) {
  if (event) event.stopPropagation();
  if (!dpStart || (dpStart && dpEnd)) {
    // Start new selection
    dpStart = key;
    dpEnd   = null;
  } else {
    // Set end — ensure start <= end
    const parseDay = str => {
      const [m,d,y] = str.split('/');
      return new Date(`20${y}-${m}-${d}`);
    };
    if (parseDay(key) < parseDay(dpStart)) {
      dpEnd   = dpStart;
      dpStart = key;
    } else {
      dpEnd = key;
    }
  }
  renderDatePicker();
}

function applyDateFilter() {
  activeFilters.dateFrom = dpStart;
  activeFilters.dateTo   = dpEnd || dpStart; // single day if no end
  toggleDropdown('date');
  updateFilterUI();
  filterCases();
}

function clearDateFilter() {
  dpStart = null;
  dpEnd   = null;
  activeFilters.dateFrom = null;
  activeFilters.dateTo   = null;
  renderDatePicker();
  updateFilterUI();
  filterCases();
}

// ─────────────────────────────────────────────────────────────
// FILTER UI — pills + button states + clear all
// ─────────────────────────────────────────────────────────────
function updateFilterUI() {
  const pills    = [];
  const hasAny   = () => pills.length > 0;

  // Date pill
  if (activeFilters.dateFrom) {
    const label = activeFilters.dateFrom === activeFilters.dateTo
      ? activeFilters.dateFrom
      : `${activeFilters.dateFrom} – ${activeFilters.dateTo}`;
    pills.push({ label: `📅 ${label}`, remove: () => clearDateFilter() });
    document.getElementById('filter-btn-date').classList.add('active');
  } else {
    document.getElementById('filter-btn-date').classList.remove('active');
  }

  // Status pills
  activeFilters.status.forEach(s => {
    pills.push({ label: `● ${s}`, remove: () => { toggleFilterOption('status', s); } });
  });
  document.getElementById('filter-btn-status').classList.toggle('active', activeFilters.status.length > 0);

  // QA By pills
  activeFilters.qaby.forEach(q => {
    pills.push({ label: `👤 ${q}`, remove: () => { toggleFilterOption('qaby', q); } });
  });
  document.getElementById('filter-btn-qaby').classList.toggle('active', activeFilters.qaby.length > 0);

  // Owner pills
  activeFilters.owner.forEach(o => {
    pills.push({ label: `👥 ${o}`, remove: () => { toggleFilterOption('owner', o); } });
  });
  document.getElementById('filter-btn-owner').classList.toggle('active', activeFilters.owner.length > 0);

  // Category pills
  activeFilters.category.forEach(c => {
    pills.push({ label: `🏷 ${c}`, remove: () => { toggleFilterOption('category', c); } });
  });
  document.getElementById('filter-btn-category').classList.toggle('active', activeFilters.category.length > 0);

  // Render pills
  const pillsEl = document.getElementById('filter-pills');
  pillsEl.innerHTML = pills.map((p, i) => `
    <div class="filter-pill">
      ${p.label}
      <span class="filter-pill-remove" onclick="removePill(${i})">×</span>
    </div>`).join('');
  pillsEl.classList.toggle('visible', pills.length > 0);

  // Store removers for onclick
  window._filterPillRemovers = pills.map(p => p.remove);

  // Clear all button
  document.getElementById('filter-clear-all').classList.toggle('visible', pills.length > 0);
}

function removePill(i) {
  if (window._filterPillRemovers?.[i]) window._filterPillRemovers[i]();
}

function clearAllFilters() {
  dpStart = null;
  dpEnd   = null;
  activeFilters.dateFrom = null;
  activeFilters.dateTo   = null;
  activeFilters.status   = [];
  activeFilters.qaby     = [];
  activeFilters.owner    = [];
  activeFilters.category = [];

  // Reset visual state of all options
  document.querySelectorAll('.filter-option').forEach(el => el.classList.remove('selected'));

  // Clear search input
  const searchEl = document.getElementById('case-search');
  if (searchEl) searchEl.value = '';

  updateFilterUI();
  filterCases();
}

// ─────────────────────────────────────────────────────────────
// RENDER CASES
// ─────────────────────────────────────────────────────────────
function renderCases() {
  if (!DATA.length) {
    document.getElementById('case-count-label').textContent = 'No data loaded';
    document.getElementById('case-tbody').innerHTML =
      `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px;font-size:.82rem;">Upload a CSV file in the Import tab.</td></tr>`;
    return;
  }

  // Build dynamic dropdown options
  renderDropdownOptions('qaby');
  renderDropdownOptions('owner');
  renderDropdownOptions('category');

  // Init date picker to first month in data
  const DAYS = getDays();
  if (DAYS.length && !dpStart) {
    const [m, , y] = DAYS[0].split('/');
    dpMonth = parseInt(m) - 1;
    dpYear  = 2000 + parseInt(y);
  }

  updateFilterUI();
  filterCases();
}

// ─────────────────────────────────────────────────────────────
// FILTER CASES
// ─────────────────────────────────────────────────────────────
function filterCases() {
  const search = (document.getElementById('case-search')?.value || '').toLowerCase().trim();
  let rows = [...DATA];

  // ── Date range filter ──
  if (activeFilters.dateFrom) {
    const parseD = str => {
      const [m,d,y] = str.split('/');
      return new Date(`20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    };
    const from = parseD(activeFilters.dateFrom);
    const to   = parseD(activeFilters.dateTo || activeFilters.dateFrom);
    rows = rows.filter(x => {
      const d = parseD(x.day);
      return d >= from && d <= to;
    });
  }

  // ── Status filter (multi) ──
  if (activeFilters.status.length) {
    rows = rows.filter(x => {
      if (activeFilters.status.includes('Pending'))   return x.status !== 'Passed' && (!x.fix_comment || !x.fix_comment.trim());
      if (activeFilters.status.includes('Responded')) return x.fix_comment && x.fix_comment.trim();
      return activeFilters.status.includes(x.status);
    });
  }

  // ── QA By filter (multi) ──
  if (activeFilters.qaby.length) {
    rows = rows.filter(x => activeFilters.qaby.includes(x.qa_by));
  }

  // ── Owner filter (multi) ──
  if (activeFilters.owner.length) {
    rows = rows.filter(x => activeFilters.owner.includes(x.owner));
  }

  // ── Category filter (multi) ──
  if (activeFilters.category.length) {
    rows = rows.filter(x => activeFilters.category.some(c => x.categories.includes(c)));
  }

  // ── Text search ──
  if (search) {
    rows = rows.filter(r =>
      r.owner.toLowerCase().includes(search)       ||
      r.task_id.toLowerCase().includes(search)     ||
      r.summary.toLowerCase().includes(search)     ||
      r.fix_comment.toLowerCase().includes(search) ||
      r.qa_by.toLowerCase().includes(search)
    );
  }

  const hasActiveFilters = activeFilters.dateFrom || activeFilters.status.length ||
                        activeFilters.qaby.length || activeFilters.owner.length ||
                        activeFilters.category.length;
  const filterLabel = hasActiveFilters ? ' (filtered)' : '';

  document.getElementById('case-count-label').textContent =
    `${rows.length} cases${filterLabel}${search ? ` matching "${search}"` : ''}`;

  document.getElementById('case-tbody').innerHTML = rows.length === 0
    ? `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px;font-size:.82rem;">No cases match your filters.</td></tr>`
    : rows.map(r => `
      <tr>
        <td style="font-family:'Space Mono',monospace;font-size:.72rem;color:var(--muted);white-space:nowrap">${r.day}</td>
        <td style="font-weight:600;white-space:nowrap">${r.owner}</td>
        <td style="font-family:'Space Mono',monospace;font-size:.72rem;color:var(--accent2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.task_id}">${r.task_id}</td>
        <td>
          <span class="status-pill pill-${r.status}">${r.status}</span>
          ${r.original_status !== r.status
            ? `<span style="font-size:.6rem;color:var(--muted);font-family:'Space Mono',monospace;display:block;margin-top:3px;">was: ${r.original_status}</span>`
            : ''}
        </td>
        <td style="font-size:.72rem;color:var(--muted);white-space:nowrap">${r.qa_by || '—'}</td>
        <td><div class="cat-tags">${r.categories.map(c => `<span class="cat-tag cat-${c}">${c}</span>`).join('') || '<span style="color:var(--muted);font-size:.65rem;">—</span>'}</div></td>
        <td style="font-size:.75rem;color:var(--muted);max-width:300px">${r.summary}</td>
        <td style="font-size:.75rem;max-width:200px">${r.fix_comment
          ? `<span style="color:var(--passed);font-family:'Space Mono',monospace;">${r.fix_comment}</span>`
          : '<span style="color:var(--muted);">—</span>'
        }</td>
      </tr>`).join('');
}
// ─────────────────────────────────────────────────────────────
// TEAM ANALYSIS FILTERS
// ─────────────────────────────────────────────────────────────
const teamFilters = {
  members: [],
  trends: []
};

function getTeamTrend(errRate) {
  if (errRate > 10) return 'risk';
  if (errRate > 5) return 'watch';
  return 'ok';
}

function getTeamTrendLabel(trend) {
  if (trend === 'risk') return '⚠ Needs Attention';
  if (trend === 'watch') return '◈ Watch';
  return '✓ On Track';
}

function toggleTeamDropdown(name) {
  ['member', 'trend'].forEach(n => {
    if (n === name) return;
    document.getElementById(`team-filter-dropdown-${n}`)?.classList.remove('open');
    document.getElementById(`team-filter-btn-${n}`)?.classList.remove('open');
  });

  const dd = document.getElementById(`team-filter-dropdown-${name}`);
  const btn = document.getElementById(`team-filter-btn-${name}`);
  if (!dd || !btn) return;

  const isOpen = dd.classList.toggle('open');
  btn.classList.toggle('open', isOpen);

  if (name === 'member' && isOpen) renderTeamMemberOptions();
}

function renderTeamMemberOptions(searchTerm = '') {
  const container = document.getElementById('team-filter-options-member');
  if (!container) return;

  const owners = [...new Set(DATA.map(x => x.owner).filter(Boolean))].sort();

  const filtered = searchTerm
    ? owners.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()))
    : owners;

  const countMap = {};
  DATA.forEach(r => {
    if (r.owner) countMap[r.owner] = (countMap[r.owner] || 0) + 1;
  });

  container.innerHTML = filtered.map(owner => `
    <div class="filter-option${teamFilters.members.includes(owner) ? ' selected' : ''}"
         onclick="toggleTeamMemberFilter('${owner.replace(/'/g, "\\'")}')"
         id="team-fopt-member-${owner.replace(/\s/g,'-')}">
      <div class="filter-checkbox"></div>
      <span class="filter-option-label">${owner}</span>
      <span class="filter-option-count">${countMap[owner] || 0}</span>
    </div>
  `).join('');
}

function toggleTeamMemberFilter(owner) {
  const idx = teamFilters.members.indexOf(owner);

  if (idx === -1) teamFilters.members.push(owner);
  else teamFilters.members.splice(idx, 1);

  updateTeamFilterUI();
  renderTeam();
}

function toggleTeamTrendFilter(trend) {
  const idx = teamFilters.trends.indexOf(trend);

  if (idx === -1) teamFilters.trends.push(trend);
  else teamFilters.trends.splice(idx, 1);

  updateTeamFilterUI();
  renderTeam();
}

function updateTeamFilterUI() {
  const pills = [];

  teamFilters.members.forEach(owner => {
    pills.push({
      label: `👤 ${owner}`,
      remove: () => toggleTeamMemberFilter(owner)
    });
  });

  teamFilters.trends.forEach(trend => {
    pills.push({
      label: getTeamTrendLabel(trend),
      remove: () => toggleTeamTrendFilter(trend)
    });
  });

  const pillsEl = document.getElementById('team-filter-pills');
  if (pillsEl) {
    pillsEl.innerHTML = pills.map((p, i) => `
      <div class="filter-pill">
        ${p.label}
        <span class="filter-pill-remove" onclick="removeTeamPill(${i})">×</span>
      </div>
    `).join('');

    pillsEl.classList.toggle('visible', pills.length > 0);
  }

  window._teamFilterPillRemovers = pills.map(p => p.remove);

  document.getElementById('team-filter-btn-member')?.classList.toggle('active', teamFilters.members.length > 0);
  document.getElementById('team-filter-btn-trend')?.classList.toggle('active', teamFilters.trends.length > 0);

  ['risk', 'watch', 'ok'].forEach(t => {
    document.getElementById(`team-fopt-trend-${t}`)?.classList.toggle('selected', teamFilters.trends.includes(t));
  });

  document.getElementById('team-filter-clear-all')?.classList.toggle('visible', pills.length > 0 || !!document.getElementById('team-search')?.value);
}

function removeTeamPill(i) {
  if (window._teamFilterPillRemovers?.[i]) window._teamFilterPillRemovers[i]();
}

function clearTeamFilters() {
  teamFilters.members = [];
  teamFilters.trends = [];

  const searchEl = document.getElementById('team-search');
  if (searchEl) searchEl.value = '';

  document.querySelectorAll('[id^="team-fopt-"]').forEach(el => el.classList.remove('selected'));

  updateTeamFilterUI();
  renderTeam();
}

// ─────────────────────────────────────────────────────────────
// RENDER — TEAM ANALYSIS
// ─────────────────────────────────────────────────────────────
function renderTeam() {
  if (!DATA.length) {
    document.getElementById('owner-grid').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:48px;font-size:.85rem;">Upload a CSV to see team analysis.</div>`;
    return;
  }

  const search = (document.getElementById('team-search')?.value || '').toLowerCase().trim();

  const ownerMap = groupBy(DATA, 'owner');

  let teamRows = Object.entries(ownerMap)
    .map(([owner, cases]) => {
      const total       = cases.length;
      const passed      = count(cases, x => x.status === 'Passed');
      const opportunity = count(cases, x => x.status === 'Opportunity');
      const failed      = count(cases, x => x.status === 'Failed');
      const critical    = count(cases, x => x.status === 'Critical');
      const errors      = failed + critical;
      const passRate    = Math.round(passed / total * 100);
      const errRate     = Math.round(errors / total * 100);
      const oppRate     = Math.round(opportunity / total * 100);

      const trend = getTeamTrend(errRate);

      return {
        owner,
        cases,
        total,
        passed,
        opportunity,
        failed,
        critical,
        errors,
        passRate,
        errRate,
        oppRate,
        trend
      };
    });

  // General search by name
  if (search) {
    teamRows = teamRows.filter(x => x.owner.toLowerCase().includes(search));
  }

  // Member filter
  if (teamFilters.members.length) {
    teamRows = teamRows.filter(x => teamFilters.members.includes(x.owner));
  }

  // Trend filter: Needs Attention / Watch / On Track
  if (teamFilters.trends.length) {
    teamRows = teamRows.filter(x => teamFilters.trends.includes(x.trend));
  }

  teamRows.sort((a, b) => b.total - a.total);

  renderTeamMemberOptions();
  updateTeamFilterUI();

  const hasFilters = search || teamFilters.members.length || teamFilters.trends.length;

  const countLabel = document.getElementById('team-count-label');
  if (countLabel) {
    countLabel.textContent = `${teamRows.length} team member(s)${hasFilters ? ' filtered' : ''}`;
  }

  if (!teamRows.length) {
    document.getElementById('owner-grid').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:48px;font-size:.85rem;">No team members match your filters.</div>`;
    return;
  }

  const cards = teamRows.map(item => {
    const {
      owner,
      cases,
      total,
      passed,
      opportunity,
      failed,
      critical,
      errors,
      passRate,
      errRate,
      oppRate,
      trend
    } = item;

    const cats = {};
    cases.forEach(c => c.categories.forEach(cat => cats[cat] = (cats[cat] || 0) + 1));

    const trendLabel = getTeamTrendLabel(trend);

    const barColor =
      trend === 'risk'
        ? 'var(--critical)'
        : trend === 'watch'
          ? 'var(--observed)'
          : 'var(--passed)';

    return `<div class="owner-card">
      <div class="owner-name">${owner}</div>

      <div class="owner-stats">
        <div class="owner-stat" style="margin-right:12px">
          <div class="owner-stat-val" style="color:var(--text)">${total}</div>
          <div class="owner-stat-lbl">Total</div>
        </div>

        <div class="owner-stat" style="margin-right:12px">
          <div class="owner-stat-val" style="color:var(--passed)">${passed}</div>
          <div class="owner-stat-lbl">Passed</div>
        </div>

        <div class="owner-stat" style="margin-right:12px">
          <div class="owner-stat-val" style="color:var(--observed)">${opportunity}</div>
          <div class="owner-stat-lbl">Opportunity</div>
        </div>

        <div class="owner-stat" style="margin-right:12px">
          <div class="owner-stat-val" style="color:var(--failed)">${failed}</div>
          <div class="owner-stat-lbl">Failed</div>
        </div>

        <div class="owner-stat">
          <div class="owner-stat-val" style="color:var(--critical)">${critical}</div>
          <div class="owner-stat-lbl">Critical</div>
        </div>
      </div>

      <div class="owner-bar-row">
        <div class="owner-bar-lbl">Error rate</div>
        <div class="owner-bar-track">
          <div class="owner-bar-fill" style="width:${errRate}%;background:${barColor}"></div>
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:40px;text-align:right">
          ${errors}/${total} (${errRate}%)
        </div>
      </div>

      <div class="owner-bar-row" style="margin-top:4px">
        <div class="owner-bar-lbl">Opp. rate</div>
        <div class="owner-bar-track">
          <div class="owner-bar-fill" style="width:${oppRate}%;background:var(--observed);opacity:.75"></div>
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:40px;text-align:right">
          ${opportunity}/${total} (${oppRate}%)
        </div>
      </div>

      <div class="owner-bar-row" style="margin-top:4px">
        <div class="owner-bar-lbl">Pass rate</div>
        <div class="owner-bar-track">
          <div class="owner-bar-fill" style="width:${passRate}%;background:var(--passed);opacity:.7"></div>
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:40px;text-align:right">
          ${passRate}%
        </div>
      </div>

      ${errors > 0
        ? `<div style="margin-top:10px;">
            <div style="font-size:.62rem;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px;font-family:'Syne',sans-serif;font-weight:700;">Bug categories</div>
            <div class="cat-tags">
              ${Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,n]) =>
                `<span class="cat-tag cat-${cat}" style="margin-right:3px">${cat} ×${n}</span>`
              ).join('')}
            </div>
          </div>`
        : `<div style="margin-top:10px;font-size:.72rem;color:var(--passed);font-family:'Space Mono',monospace;">✓ Great job — no errors found</div>`}

      <div style="margin-top:10px;">
        <span class="trend-badge trend-${trend}">${trendLabel}</span>
      </div>
    </div>`;
  });

  document.getElementById('owner-grid').innerHTML = cards.join('');
}

// ─────────────────────────────────────────────────────────────
// RENDER — WEEKLY REPORT
// ─────────────────────────────────────────────────────────────
function renderReport() {
  const d     = DATA;
  const total = d.length;
  const DAYS  = getDays();

  if (!total) {
     if (document.getElementById('daily-report')) document.getElementById('daily-report').textContent = 'Upload a CSV to generate the daily report.';
    document.getElementById('weekly-report').textContent = 'Upload a CSV to generate the weekly summary.';
    return;
  }

  const passed      = count(d, x => x.status === 'Passed');
  const opportunity = count(d, x => x.status === 'Opportunity');
  const failed      = count(d, x => x.status === 'Failed');
  const critical    = count(d, x => x.status === 'Critical');
  const errors      = failed + critical;
  const passRate    = Math.round(passed / total * 100);
  const owners      = [...new Set(d.map(x => x.owner))];

  const catCount = {};
  d.forEach(r => r.categories.forEach(c => catCount[c] = (catCount[c] || 0) + 1));

  const qaByCount = {};
  d.forEach(r => { if (r.qa_by) qaByCount[r.qa_by] = (qaByCount[r.qa_by] || 0) + 1; });
  const qaShadows = Object.entries(qaByCount).map(([n,c]) => `${n} (${c})`).join(', ');

  const ownerMap = groupBy(d, 'owner');
  const atRisk = Object.entries(ownerMap)
    .filter(([, cases]) => {
      const errRate = Math.round(count(cases, x => x.status === 'Failed' || x.status === 'Critical') / cases.length * 100);
      return errRate > 10;
    })
    .map(([o]) => o);

  // Pending cases: has a bug (non-Passed) but no fix_comment yet
  const pendingCases = count(d, x => x.status !== 'Passed' && (!x.fix_comment || x.fix_comment.trim() === ''));
  const queueStatus =
    pendingCases > 10 ? '🚨 At Risk'  :
    pendingCases >= 5 ? '⚠ Watch'    :
                         '✓ Stable';

  const daysLabel = DAYS.length > 0
    ? `${DAYS[0]}${DAYS.length > 1 ? ' – ' + DAYS[DAYS.length - 1] : ''}`
    : WEEK_RANGE;
 // ── Final Status logic ──
  const criticalPct    = total > 0 ? (critical    / total) * 100 : 0;
  const failedPct      = total > 0 ? (failed      / total) * 100 : 0;
  const opportunityPct = total > 0 ? (opportunity / total) * 100 : 0;

  // Opportunity no longer affects severity score — tracked separately
  const severityScore =
    (criticalPct > 1  ? 3 : criticalPct > 0   ? 1 : 0) +
    (failedPct   > 3  ? 2 : failedPct   > 1.5 ? 1 : 0);

  const pendingScore =
    pendingCases > 20 ? 3 :
    pendingCases >= 10 ? 2 : 1;

  const finalScore = severityScore + pendingScore;

  const finalStatus =
    finalScore >= 7 ? '🚨 AT RISK' :
    finalScore >= 4 ? '⚠ NEEDS ATTENTION' :
    errors === 0    ? '✓ CLEAN WEEK' :
                      'UNDER CONTROL';

if (document.getElementById('daily-report')) document.getElementById('daily-report').textContent =
`QA Shadow – Daily EOD (${daysLabel})

• Reviewed: ${owners.length} members / ${total} cases
• QA Shadows: ${qaShadows || 'N/A'}
• Pass rate: ${passRate}% (${passed}/${total})
• Opportunities: ${opportunity}
• Errors: ${errors} — Failed: ${failed} · Critical: ${critical}
• Top bugs: ${sortDesc(catCount).slice(0,3).map(([c,n])=>`${c} (${n}x)`).join(', ') || 'None'}
• At risk: ${atRisk.length ? atRisk.join(', ') : 'None'}
• Queues: Stable (verify in WOMS)
• Status: ${critical > 0 ? '⚠ Critical — immediate follow-up needed' : errors === 0 ? '✓ Clean' : 'Under control'}`;

  const queueRows = [
    ['Pending cases',    `${pendingCases}`,  pendingCases > 10 ? 'info-popup-risk' : pendingCases >= 5 ? 'info-popup-warn' : 'info-popup-ok'],
    ['─────────────',   '', ''],
    ['✓ Under Control', '< 5 pending',  'info-popup-ok'],
    ['⚠ Watch',         '5–10 pending', 'info-popup-warn'],
    ['🚨 At Risk',      '> 10 pending', 'info-popup-risk'],
  ];

  const criticalPts  = criticalPct > 1  ? 3 : criticalPct > 0   ? 1 : 0;
  const failedPts    = failedPct   > 3  ? 2 : failedPct   > 1.5 ? 1 : 0;

  const finalRows = [
    // ── Severity ──
    ['── SEVERITY ──',             '',                  ''],
    [`Critical  ${criticalPct.toFixed(2)}%`,  `● +${criticalPts} pts`,  criticalPts >= 3 ? 'info-popup-risk' : criticalPts >= 1 ? 'info-popup-warn' : 'info-popup-ok'],
    ['  > 1%  →  +3 pts',          '',                  'info-popup-threshold'],
    ['  > 0% – ≤ 1%  →  +1 pt',   '',                  'info-popup-threshold'],
    ['  = 0%  →  +0 pts',          '',                  'info-popup-threshold'],

    [`Failed    ${failedPct.toFixed(2)}%`,    `● +${failedPts} pts`,    failedPts >= 2 ? 'info-popup-risk' : failedPts >= 1 ? 'info-popup-warn' : 'info-popup-ok'],
    ['  > 3%  →  +2 pts',          '',                  'info-popup-threshold'],
    ['  > 1.5% – ≤ 3%  →  +1 pt', '',                  'info-popup-threshold'],
    ['  ≤ 1.5%  →  +0 pts',        '',                  'info-popup-threshold'],

    [`Opportunity ${opportunityPct.toFixed(2)}%`, '● informational', 'info-popup-warn'],
    ['  (not counted in severity score)', '', 'info-popup-threshold'],

    // ── Pending ──
    ['── PENDING ──',              '',                  ''],
    [`${pendingCases} cases pending to fix`, `● +${pendingScore} pts`, pendingScore >= 3 ? 'info-popup-risk' : pendingScore >= 2 ? 'info-popup-warn' : 'info-popup-ok'],
    ['  > 20  →  +3 pts',          '',                  'info-popup-threshold'],
    ['  10–20  →  +2 pts',         '',                  'info-popup-threshold'],
    ['  < 10  →  +1 pt',           '',                  'info-popup-threshold'],

    // ── Result ──
    ['─────────────',              '',                  ''],
    [`Total: ${finalScore} pts`,   finalStatus,         finalScore >= 7 ? 'info-popup-risk' : finalScore >= 4 ? 'info-popup-warn' : 'info-popup-ok'],
    ['─────────────',              '',                  ''],
    ['🚨 AT RISK',                 '≥ 7 pts',           'info-popup-risk'],
    ['⚠ NEEDS ATTENTION',         '4–6 pts',           'info-popup-warn'],
    ['✓ UNDER CONTROL',           '< 4 pts',           'info-popup-ok'],
  ];

  setTimeout(() => {
    const qBtn = document.getElementById('queue-info-btn');
    const fBtn = document.getElementById('final-info-btn');
    if (qBtn) qBtn.onclick = e => showInfoPopup(e, 'Queue & Control', queueRows);
    if (fBtn) fBtn.onclick = e => showInfoPopup(e, 'Final Status', finalRows);
  }, 50);

const L  = (txt, color='var(--text)') => `<div style="font-family:'Space Mono',monospace;white-space:pre-wrap;line-height:1.8;color:${color};">${txt}</div>`;
  const SEP = ()                         => L('─'.repeat(52), 'var(--border)');
  const TTL = (txt, icon='')             => `<div style="font-family:'Space Mono',monospace;line-height:1.8;color:var(--accent);font-weight:700;display:flex;align-items:center;gap:6px;">${txt}${icon}</div>`;
  const INFO = (id)                      => `<span class="info-icon" id="${id}">ℹ</span>`;

  document.getElementById('weekly-report').innerHTML = [
    L('▎ QA SHADOW — WEEKLY SUMMARY', 'var(--accent)'),
    L(`▎ Week ${WEEK_RANGE || (DAYS.length ? DAYS[0]+' – '+DAYS[DAYS.length-1] : 'N/A')}  ·  ${DAYS.length} days loaded`, 'var(--text)'),
    SEP(),

    TTL(' COVERAGE'),
    L(`  Team members : ${owners.length}`, 'var(--text)'),
    L(`  Total cases  : ${total}`, 'var(--text)'),
    L(`  QA Shadows   : ${qaShadows || 'N/A'}`, 'var(--text)'),
    L(`  Days worked  : ${DAYS.length} days (${DAYS[0]} – ${DAYS[DAYS.length-1]})`, 'var(--text)'),
    L(''),

    TTL(' RESULTS'),
    L(`  ✓ Passed      ${String(passed).padStart(4)}   (${passRate}%)`, 'var(--passed)'),
    L(`  ● Opportunity ${String(opportunity).padStart(4)}   (${Math.round(opportunity/total*100)}%)`, 'var(--observed)'),
    L(`  ▲ Failed      ${String(failed).padStart(4)}   (${Math.round(failed/total*100)}%)`, 'var(--failed)'),
    L(`  ✕ Critical    ${String(critical).padStart(4)}   (${Math.round(critical/total*100)}%)`, 'var(--critical)'),
    SEP(),

    TTL(' BUG PATTERNS'),
    ...(Object.keys(catCount).length
      ? sortDesc(catCount).map(([c,n]) => L(`  › ${c.padEnd(10)} ${String(n).padStart(3)} cases - ${errors>0?Math.round(n/errors*100):0}% of errors`, 'var(--text)'))
      : [L('  No bugs recorded', 'var(--text)')]),
    SEP(),

    // TTL(' TEAM PERFORMANCE  (top 8 by volume)'),
    // ...Object.entries(ownerMap).sort((a,b)=>b[1].length-a[1].length).slice(0,8).map(([o,cases]) => {
    //   const errs = count(cases, x=>x.status!=='Passed');
    //   const pr   = Math.round(count(cases,x=>x.status==='Passed')/cases.length*100);
    //   return L(`  ${o.padEnd(22)} ${cases.length} cases  ${errs} error(s)  ${pr}% pass`, 'var(--text)');
    // }),
    // SEP(),
    TTL(' TEAM PERFORMANCE'),
    ...Object.entries(ownerMap)
      .sort((a,b) => b[1].length - a[1].length)
      .map(([o, cases]) => {
        const totalCases = cases.length;
        const errs = count(cases, x => x.status === 'Failed' || x.status === 'Critical');
        const pr = Math.round(count(cases, x => x.status === 'Passed') / totalCases * 100);
        const errRate = Math.round(errs / totalCases * 100);

        const attention =
          errRate > 10 ? '⚠ Needs Attention' :
          errRate > 5  ? '◈ Watch' :
                        '✓ On Track';

        const color =
          errRate > 10 ? 'var(--failed)' :
          errRate > 5  ? 'var(--observed)' :
                        'var(--passed)';

        return L(
          `  ${o.padEnd(22)} ${String(totalCases).padStart(3)} cases  ${String(errs).padStart(2)} error(s)  ${String(pr).padStart(3)}% pass  ${attention}`,
          color
        );
      }),
    SEP(),

    TTL(' QUEUE &amp; CONTROL', INFO('queue-info-btn')),
    L(`  Status  : ${queueStatus} (${pendingCases} pending cases to fix)`, 'var(--text)'),
    L(`  WOMS    : Verify pending/rework queues`, 'var(--text)'),
    L(`  ${DAYS.length < 5 ? `${5-DAYS.length} day(s) pending — updates on re-upload` : 'Full week loaded'}`, 'var(--text)'),
    L(''),

    // TTL(' NEEDS ATTENTION'),
    // ...(atRisk.length ? atRisk.map(o => L(`  ⚠ ${o}`, 'var(--observed)')) : [L('  None', 'var(--text)')]),
    // SEP(),

    TTL(` FINAL STATUS: ${finalStatus}`, INFO('final-info-btn')),
    L(`  Critical    : ${criticalPct.toFixed(2)}% (threshold 1%)`,    criticalPct    > 1  ? 'var(--critical)' : 'var(--passed)'),
    L(`  Failed      : ${failedPct.toFixed(2)}% (threshold 3%)`,      failedPct      > 3  ? 'var(--failed)'   : 'var(--passed)'),
    L(`  Opportunity : ${opportunityPct.toFixed(2)}% (informational)`, opportunityPct > 8  ? 'var(--observed)' : 'var(--passed)'),
  ].join('');

  // Bind tooltip icons — hover (stays open while hovering popup)
  setTimeout(() => {
    const popup = document.getElementById('info-popup');
    const qBtn  = document.getElementById('queue-info-btn');
    const fBtn  = document.getElementById('final-info-btn');

    let hideTimer = null;

    const scheduleHide = () => {
      hideTimer = setTimeout(hideInfoPopup, 120);
    };
    const cancelHide = () => {
      clearTimeout(hideTimer);
    };

    if (qBtn) {
      qBtn.addEventListener('mouseenter', e => { cancelHide(); showInfoPopup(e, 'Queue & Control', queueRows); });
      qBtn.addEventListener('mouseleave', scheduleHide);
    }
    if (fBtn) {
      fBtn.addEventListener('mouseenter', e => { cancelHide(); showInfoPopup(e, 'Final Status', finalRows); });
      fBtn.addEventListener('mouseleave', scheduleHide);
    }
    if (popup) {
      popup.addEventListener('mouseenter', cancelHide);
      popup.addEventListener('mouseleave', scheduleHide);
    }
  }, 50);
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — STATE
// ─────────────────────────────────────────────────────────────
// qa_by stores short names ("Michael") while owner is full name ("Michael Luna").
// This checks if any part of the qa_by value appears in the full owner name.
function ownerMatchesQaBy(ownerName, qaBy) {
  if (!ownerName || !qaBy) return false;
  return ownerName.toLowerCase().includes(qaBy.toLowerCase().trim());
}
let analyticsGranularity     = 'day';
let analyticsSelectedMember  = null;
let analyticsChartType       = 'bar';

// ─────────────────────────────────────────────────────────────
// ANALYTICS — CHART TYPE TOGGLE
// ─────────────────────────────────────────────────────────────
function setAnalyticsChartType(type) {
  analyticsChartType = type;
  document.querySelectorAll('.atype').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  renderVolChart();
  if (analyticsSelectedMember) {
    renderMemberErrorChart();
    renderMemberReviewerChart();
  }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — SHARED TOOLTIP
// ─────────────────────────────────────────────────────────────
function showChartTip(e, html) {
  if (!html) return;
  const t = document.getElementById('analytics-tooltip');
  if (!t) return;
  t.innerHTML = html;
  t.style.display = 'block';
  positionChartTip(e);
}
function positionChartTip(e) {
  const t = document.getElementById('analytics-tooltip');
  if (!t || t.style.display === 'none') return;
  const x = e.clientX + 14;
  const y = e.clientY - t.offsetHeight / 2;
  t.style.left = Math.min(x, window.innerWidth - t.offsetWidth - 12) + 'px';
  t.style.top  = Math.max(8, y) + 'px';
}
function hideChartTip() {
  const t = document.getElementById('analytics-tooltip');
  if (t) t.style.display = 'none';
}

function _statusTipHtml(pd) {
  if (pd.total === 0) return `<div class="ct-period">${pd.label}</div><div class="ct-empty">No data</div>`;
  const statuses = [
    { label: 'Passed',      val: pd.passed,      color: 'var(--passed)'   },
    { label: 'Opportunity', val: pd.opportunity, color: 'var(--observed)'  },
    { label: 'Failed',      val: pd.failed,      color: 'var(--failed)'   },
    { label: 'Critical',    val: pd.critical,    color: 'var(--critical)'  },
  ];
  const rows = statuses.filter(s => s.val > 0)
    .map(s => `<div class="ct-row"><span class="ct-dot" style="background:${s.color}"></span><span class="ct-name">${s.label}</span><span class="ct-val">${s.val}</span></div>`)
    .join('');
  return `<div class="ct-period">${pd.label}</div>${rows}<div class="ct-total"><span>Total</span><span>${pd.total}</span></div>`;
}

function _rateTipHtml(pd) {
  if (pd.total === 0) return `<div class="ct-period">${pd.label}</div><div class="ct-empty">No data</div>`;
  const col = pd.rate === 0 ? 'var(--passed)' : pd.rate > 30 ? 'var(--critical)' : pd.rate > 15 ? 'var(--failed)' : 'var(--observed)';
  return `<div class="ct-period">${pd.label}</div><div class="ct-row"><span class="ct-name">Error rate</span><span class="ct-val" style="color:${col}">${pd.rate}%</span></div><div class="ct-row"><span class="ct-name">Errors</span><span class="ct-val">${pd.errs} / ${pd.total}</span></div>`;
}

function getPeriodKey(dayStr, gran) {
  if (!dayStr) return '';
  const parts = dayStr.split('/');
  if (parts.length !== 3) return dayStr;
  const [m, d, y] = parts;
  const date = new Date(`20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
  if (gran === 'day')   return dayStr;
  if (gran === 'month') return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  // week → key = Monday of that week
  const dow    = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((dow + 6) % 7));
  const mm = String(monday.getMonth()+1).padStart(2,'0');
  const dd = String(monday.getDate()).padStart(2,'0');
  const yy = String(monday.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function formatPeriodKey(key, gran) {
  if (gran === 'month') {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [, m] = key.split('-');
    return `${MONTHS[parseInt(m)-1]}`;
  }
  return key;
}

function getSortedPeriods(gran) {
  const periods = [...new Set(DATA.map(x => getPeriodKey(x.day, gran)))].filter(Boolean);
  return periods.sort((a, b) => {
    const parse = k => {
      if (gran === 'month') {
        const [yr, mo] = k.split('-');
        return new Date(parseInt(yr), parseInt(mo)-1, 1);
      }
      const [mo, dy, yy] = k.split('/');
      return new Date(`20${yy}-${mo.padStart(2,'0')}-${dy.padStart(2,'0')}`);
    };
    return parse(a) - parse(b);
  });
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — CHART HELPERS
// ─────────────────────────────────────────────────────────────
function getAllWorkingDays(firstKey, lastKey) {
  const parseKey = k => {
    const [mo, dy, yy] = k.split('/');
    return new Date(`20${yy}-${mo.padStart(2,'0')}-${dy.padStart(2,'0')}`);
  };
  const toKey = d =>
    `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
  const first = parseKey(firstKey), last = parseKey(lastKey);
  const days = [];
  const cur = new Date(first);
  while (cur <= last) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days.push(toKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function formatAnalyticsDateRange(periods, gran) {
  if (!periods.length) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parseKey = k => {
    if (gran === 'month') { const [yr, mo] = k.split('-'); return new Date(parseInt(yr), parseInt(mo)-1, 1); }
    const [mo, dy, yy] = k.split('/');
    return new Date(`20${yy}-${mo.padStart(2,'0')}-${dy.padStart(2,'0')}`);
  };
  const fmt = d => gran === 'month'
    ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const first = parseKey(periods[0]);
  const last  = parseKey(periods[periods.length - 1]);
  return periods.length === 1 ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — TEAM VOLUME CHART
// ─────────────────────────────────────────────────────────────
function renderVolChart() {
  const gran    = analyticsGranularity;
  const el      = document.getElementById('analytics-vol-chart');
  if (!el) return;

  const actualPeriods = getSortedPeriods(gran);
  const rangeEl       = document.getElementById('analytics-vol-range');

  if (!actualPeriods.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:24px;text-align:center;">No data loaded.</div>';
    if (rangeEl) rangeEl.textContent = '';
    return;
  }

  const periods = (gran === 'day' && actualPeriods.length >= 2)
    ? getAllWorkingDays(actualPeriods[0], actualPeriods[actualPeriods.length - 1])
    : actualPeriods;

  const toCanon = k => { const [mo,dy,yy]=k.split('/'); return `${mo.padStart(2,'0')}/${dy.padStart(2,'0')}/${yy}`; };

  const dataLookup = new Map();
  actualPeriods.forEach(p => {
    const key   = gran === 'day' ? toCanon(p) : p;
    const cases = DATA.filter(x => getPeriodKey(x.day, gran) === p);
    dataLookup.set(key, {
      label:       gran === 'day' ? toCanon(p).slice(0, 5) : formatPeriodKey(p, gran),
      total:       cases.length,
      passed:      count(cases, x => x.status === 'Passed'),
      opportunity: count(cases, x => x.status === 'Opportunity'),
      failed:      count(cases, x => x.status === 'Failed'),
      critical:    count(cases, x => x.status === 'Critical'),
    });
  });

  const periodData = periods.map(p =>
    dataLookup.get(p) || { label: gran === 'day' ? p.slice(0, 5) : p, total: 0, passed: 0, opportunity: 0, failed: 0, critical: 0 }
  );

  if (rangeEl) rangeEl.textContent = formatAnalyticsDateRange(actualPeriods, gran);

  const maxTotal = Math.max(...periodData.map(p => p.total), 1);
  const H        = 290;
  const pad      = { top: 20, bottom: 80 };
  const chartH   = H - pad.top - pad.bottom;
  const leftW    = 64;
  const rightPad = 20;
  let barGap, barW, startPad, chartBodyW;
  if (gran === 'day') {
    barGap     = 50;
    barW       = 28;
    startPad   = barGap / 2;
    chartBodyW = Math.max(startPad + periods.length * barGap + rightPad, 300);
  } else {
    const containerW = Math.max((el.clientWidth || 900) - leftW, 300);
    barGap     = containerW / periods.length;
    barW       = Math.min(barGap * 0.5, gran === 'week' ? 60 : 80);
    startPad   = 0;
    chartBodyW = containerW;
  }
  const cx = i => startPad + i * barGap + barGap / 2;
  const yS = v => pad.top + chartH - (v / maxTotal) * chartH;

  // ── Left y-axis ───────────────────────────────────────────
  const yMid = (pad.top + chartH / 2).toFixed(1);
  let leftContent = `<text x="12" y="${yMid}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace" transform="rotate(-90 12 ${yMid})">Cases</text>`;
  for (let i = 0; i <= 4; i++) {
    const y   = pad.top + (i / 4) * chartH;
    const val = Math.round(maxTotal * (1 - i / 4));
    leftContent += `<text x="${leftW-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-family="Space Mono,monospace">${val}</text>`;
  }

  // ── Grid ─────────────────────────────────────────────────
  let rightGrid = '';
  const gridX1 = startPad.toFixed(1);
  const gridX2 = (chartBodyW - rightPad).toFixed(1);
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    rightGrid += `<line x1="${gridX1}" y1="${y}" x2="${gridX2}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
  }

  const xTitle = `<text x="${((startPad + chartBodyW - rightPad) / 2).toFixed(1)}" y="${H-8}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace">Period</text>`;
  if (!window._chartTips) window._chartTips = {};

  const legend = `<div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap;">
    ${['Critical','Failed','Opportunity','Passed'].map(s =>
      `<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:${STATUS_COLORS[s]};display:inline-block;"></span>${s}</span>`
    ).join('')}</div>`;

  let rightContent = '', xLbls = '';

  if (analyticsChartType === 'bar') {
    // ── BAR MODE ─────────────────────────────────────────────
    periodData.forEach((pd, i) => {
      const bx  = cx(i) - barW / 2;
      const key = `vol_${i}`;
      window._chartTips[key] = _statusTipHtml(pd);
      const segs = [
        { val: pd.critical,    color: 'var(--critical)' },
        { val: pd.failed,      color: 'var(--failed)'   },
        { val: pd.opportunity, color: 'var(--observed)'  },
        { val: pd.passed,      color: 'var(--passed)'    },
      ];
      let yOff = pad.top + chartH, topY = pad.top + chartH, barRects = '';
      segs.forEach(s => {
        if (!s.val) return;
        const h = Math.max(3, (s.val / maxTotal) * chartH);
        yOff -= h; topY = yOff;
        barRects += `<rect x="${bx.toFixed(1)}" y="${yOff.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" rx="1"/>`;
      });
      const lbl = pd.total > 0 ? `<text x="${cx(i).toFixed(1)}" y="${(topY-4).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.total}</text>` : '';
      rightContent += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><rect x="${bx.toFixed(1)}" y="${pad.top}" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/>${barRects}${lbl}</g>`;
      const tx = cx(i).toFixed(1), ty = (H-54).toFixed(1);
      xLbls += `<text x="${tx}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${tx} ${ty})">${pd.label}</text>`;
    });

    el.innerHTML = `
      <div style="display:flex;align-items:stretch;overflow:hidden;">
        <svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg>
        <div class="vol-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;">
          <svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${rightContent}${xLbls}${xTitle}</svg>
        </div>
      </div>${legend}`;

  } else {
    // ── LINE MODE ─────────────────────────────────────────────
    let linePts = [], areaPts = [], dots = '', labels = '';
    periodData.forEach((pd, i) => {
      const x = cx(i).toFixed(1);
      const y = yS(pd.total).toFixed(1);
      const key = `vol_${i}`;
      window._chartTips[key] = _statusTipHtml(pd);
      linePts.push(`${x},${y}`);
      areaPts.push(`${x},${y}`);
      const errs = pd.failed + pd.critical;
      const errRate = pd.total > 0 ? errs / pd.total : 0;
      const col = errRate === 0 ? 'var(--passed)' : errRate > 0.3 ? 'var(--critical)' : errRate > 0.15 ? 'var(--failed)' : 'var(--observed)';
      dots += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><circle cx="${x}" cy="${y}" r="12" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="1.5"/></g>`;
      if (pd.total > 0) labels += `<text x="${x}" y="${(parseFloat(y)-9).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.total}</text>`;
      const ty = (H-54).toFixed(1);
      xLbls += `<text x="${x}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${x} ${ty})">${pd.label}</text>`;
    });
    const areaFull = linePts.length > 0
      ? [`${cx(0).toFixed(1)},${(pad.top+chartH).toFixed(1)}`, ...areaPts, `${cx(periodData.length-1).toFixed(1)},${(pad.top+chartH).toFixed(1)}`].join(' ')
      : '';

    el.innerHTML = `
      <div style="display:flex;align-items:stretch;overflow:hidden;">
        <svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg>
        <div class="vol-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;">
          <svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${areaFull ? `<polygon points="${areaFull}" fill="var(--accent)" opacity="0.08"/>` : ''}${linePts.length > 1 ? `<polyline points="${linePts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${labels}${dots}${xLbls}${xTitle}</svg>
        </div>
      </div>${legend}`;
  }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — PERSON FILTER (dropdown with search)
// ─────────────────────────────────────────────────────────────
function renderAnalyticsMemberFilter(searchTerm = '') {
  const owners = [...new Set(DATA.map(x => x.owner))].sort();
  if (!analyticsSelectedMember || !owners.includes(analyticsSelectedMember)) {
    analyticsSelectedMember = owners[0] || null;
  }

  const container = document.getElementById('analytics-person-options');
  if (container) {
    const filtered = searchTerm
      ? owners.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()))
      : owners;
    container.innerHTML = filtered.map(o => `
      <div class="filter-option${o === analyticsSelectedMember ? ' selected' : ''}"
           onclick="selectAnalyticsMember('${o}')">
        <div class="filter-checkbox"></div>
        <span class="filter-option-label">${o}</span>
      </div>`).join('');
  }

  const btn = document.getElementById('analytics-person-btn');
  if (btn) {
    btn.innerHTML = `👤 ${analyticsSelectedMember || 'Person'} <span class="filter-btn-arrow">▾</span>`;
    btn.classList.toggle('active', !!analyticsSelectedMember);
  }
}

function toggleAnalyticsPersonDropdown() {
  // Close any case-log dropdowns that might be open
  ['date','status','qaby','category'].forEach(n => {
    document.getElementById(`filter-dropdown-${n}`)?.classList.remove('open');
    document.getElementById(`filter-btn-${n}`)?.classList.remove('open');
  });

  const dd  = document.getElementById('analytics-person-dropdown');
  const btn = document.getElementById('analytics-person-btn');
  if (!dd || !btn) return;
  const isOpen = dd.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  if (isOpen) {
    renderAnalyticsMemberFilter();
    setTimeout(() => dd.querySelector('input')?.focus(), 50);
  }
}

function searchAnalyticsPerson(val) {
  renderAnalyticsMemberFilter(val);
}

function selectAnalyticsMember(name) {
  analyticsSelectedMember = name;
  // Close dropdown
  document.getElementById('analytics-person-dropdown')?.classList.remove('open');
  document.getElementById('analytics-person-btn')?.classList.remove('open');
  renderAnalyticsMemberFilter();
  renderMemberStats();
  renderMemberErrorChart();
  renderMemberReviewerChart();
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — MEMBER MINI STATS
// ─────────────────────────────────────────────────────────────
function renderMemberStats() {
  const el = document.getElementById('analytics-member-stats');
  if (!el || !analyticsSelectedMember) return;

  const gran        = analyticsGranularity;
  const ownCases    = DATA.filter(x => x.owner === analyticsSelectedMember);
  const reviewed    = DATA.filter(x => ownerMatchesQaBy(analyticsSelectedMember, x.qa_by));
  const total       = ownCases.length;
  const errors      = count(ownCases, x => x.status === 'Failed' || x.status === 'Critical');
  const errRate     = total > 0 ? Math.round(errors / total * 100) : 0;

  const periods = getSortedPeriods(gran).filter(p =>
    ownCases.some(x => getPeriodKey(x.day, gran) === p)
  );

  let deltaEl = '';
  if (periods.length >= 2) {
    const firstCases = ownCases.filter(x => getPeriodKey(x.day, gran) === periods[0]);
    const lastCases  = ownCases.filter(x => getPeriodKey(x.day, gran) === periods[periods.length-1]);
    const r0 = firstCases.length > 0 ? Math.round(count(firstCases, x => x.status === 'Failed' || x.status === 'Critical') / firstCases.length * 100) : 0;
    const r1 = lastCases.length  > 0 ? Math.round(count(lastCases,  x => x.status === 'Failed' || x.status === 'Critical') / lastCases.length  * 100) : 0;
    const delta = r1 - r0;
    const col   = delta <= 0 ? 'var(--passed)' : 'var(--critical)';
    const sign  = delta <= 0 ? '' : '+';
    deltaEl = `<div class="analytics-stat-mini" style="border-color:${col}">
      <div class="analytics-stat-label">Trend (first → last)</div>
      <div class="analytics-stat-val" style="color:${col};">${sign}${delta}%</div>
    </div>`;
  }

  const errColor = errRate > 10 ? 'var(--critical)' : errRate > 5 ? 'var(--observed)' : 'var(--passed)';

  el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;">
    <div class="analytics-stat-mini">
      <div class="analytics-stat-label">Total Cases</div>
      <div class="analytics-stat-val">${total}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:${errColor}">
      <div class="analytics-stat-label">Overall Error Rate</div>
      <div class="analytics-stat-val" style="color:${errColor};">${errRate}%</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--accent2)">
      <div class="analytics-stat-label">QA Reviews Done</div>
      <div class="analytics-stat-val" style="color:var(--accent2);">${reviewed.length}</div>
    </div>
    ${deltaEl}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — CHART B: ERROR RATE TREND (own cases)
// ─────────────────────────────────────────────────────────────
function renderMemberErrorChart() {
  const el = document.getElementById('analytics-member-error');
  if (!el || !analyticsSelectedMember) return;

  const gran     = analyticsGranularity;
  const ownCases = DATA.filter(x => x.owner === analyticsSelectedMember);
  const actualPeriods = getSortedPeriods(gran).filter(p =>
    ownCases.some(x => getPeriodKey(x.day, gran) === p)
  );

  if (!actualPeriods.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;">No case data for this member.</div>';
    return;
  }

  const periods = (gran === 'day' && actualPeriods.length >= 2)
    ? getAllWorkingDays(actualPeriods[0], actualPeriods[actualPeriods.length - 1])
    : actualPeriods;

  const toCanon = k => { const [mo,dy,yy]=k.split('/'); return `${mo.padStart(2,'0')}/${dy.padStart(2,'0')}/${yy}`; };

  const dataLookup = new Map();
  actualPeriods.forEach(p => {
    const key   = gran === 'day' ? toCanon(p) : p;
    const cases = ownCases.filter(x => getPeriodKey(x.day, gran) === p);
    const errs  = count(cases, x => x.status === 'Failed' || x.status === 'Critical');
    const rate  = cases.length > 0 ? Math.round(errs / cases.length * 100) : 0;
    dataLookup.set(key, { label: gran === 'day' ? toCanon(p).slice(0, 5) : formatPeriodKey(p, gran), total: cases.length, errs, rate });
  });

  const periodData = periods.map(p =>
    dataLookup.get(p) || { label: gran === 'day' ? p.slice(0, 5) : p, total: 0, errs: 0, rate: 0 }
  );

  // Trend badge
  let trendHtml = '';
  const active = periodData.filter(p => p.total > 0);
  if (active.length >= 3) {
    const mid  = Math.floor(active.length / 2);
    const avg1 = active.slice(0, mid).reduce((s, p) => s + p.rate, 0) / mid;
    const avg2 = active.slice(mid).reduce((s, p) => s + p.rate, 0) / (active.length - mid);
    const improving = avg2 < avg1;
    const col   = improving ? 'var(--passed)' : 'var(--critical)';
    const label = improving ? '↓ Improving' : '↑ Needs attention';
    trendHtml = `<span style="font-size:.75rem;font-family:'Space Mono',monospace;color:${col};font-weight:700;">${label}</span>`;
  }

  const H        = 280;
  const pad      = { top: 20, bottom: 80 };
  const chartH   = H - pad.top - pad.bottom;
  const leftW    = 64;
  const maxRate  = Math.max(...periodData.map(p => p.rate), 10);
  const rightPad = 20;
  let barGap, barW, startPad, chartBodyW;
  if (gran === 'day') {
    barGap     = 50;
    barW       = 28;
    startPad   = barGap / 2;
    chartBodyW = Math.max(startPad + periods.length * barGap + rightPad, 300);
  } else {
    const containerW = Math.max((el.clientWidth || 900) - leftW, 300);
    barGap     = containerW / Math.max(periods.length, 1);
    barW       = Math.min(barGap * 0.5, gran === 'week' ? 60 : 80);
    startPad   = barGap / 2;
    chartBodyW = containerW;
  }
  const cx = i => startPad + i * barGap;
  const yS = v => pad.top + chartH - (v / maxRate) * chartH;

  // ── Left y-axis ───────────────────────────────────────────
  const yMid = (pad.top + chartH / 2).toFixed(1);
  let leftContent = `<text x="12" y="${yMid}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace" transform="rotate(-90 12 ${yMid})">Error Rate</text>`;
  for (let i = 0; i <= 4; i++) {
    const y   = pad.top + (i / 4) * chartH;
    const val = Math.round(maxRate * (1 - i / 4));
    leftContent += `<text x="${leftW-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-family="Space Mono,monospace">${val}%</text>`;
  }

  // ── Grid ──────────────────────────────────────────────────
  let rightGrid = '';
  const errGridX1 = startPad.toFixed(1);
  const errGridX2 = (chartBodyW - rightPad).toFixed(1);
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    rightGrid += `<line x1="${errGridX1}" y1="${y}" x2="${errGridX2}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
  }

  const xTitle = `<text x="${((startPad + chartBodyW - rightPad) / 2).toFixed(1)}" y="${H-8}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace">Period</text>`;
  if (!window._chartTips) window._chartTips = {};

  const header = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
    <div style="font-size:.72rem;color:var(--muted);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Error Rate Over Time — ${analyticsSelectedMember}</div>
    ${trendHtml}</div>`;
  const footer = `<div style="font-size:.63rem;color:var(--muted);margin-top:4px;font-family:'Space Mono',monospace;">% of own cases that had errors (Failed + Critical only)</div>`;

  let rightContent = '', xLbls = '';

  if (analyticsChartType === 'line') {
    // ── LINE MODE ────────────────────────────────────────────
    let linePts = [], areaPts = [], dots = '';
    periodData.forEach((pd, i) => {
      const x = cx(i).toFixed(1);
      const y = yS(pd.rate).toFixed(1);
      const key = `err_${i}`;
      window._chartTips[key] = _rateTipHtml(pd);
      linePts.push(`${x},${y}`);
      areaPts.push(`${x},${y}`);
      const col = pd.rate === 0 ? 'var(--passed)' : pd.rate > 30 ? 'var(--critical)' : pd.rate > 15 ? 'var(--failed)' : 'var(--observed)';
      dots += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><circle cx="${x}" cy="${y}" r="12" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="1.5"/></g>`;
      const ty = (H-54).toFixed(1);
      xLbls += `<text x="${x}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${x} ${ty})">${pd.label}</text>`;
    });
    const areaFull = [`${cx(0).toFixed(1)},${(pad.top+chartH).toFixed(1)}`, ...areaPts, `${cx(periodData.length-1).toFixed(1)},${(pad.top+chartH).toFixed(1)}`].join(' ');

    el.innerHTML = `${header}
      <div style="display:flex;align-items:stretch;overflow:hidden;">
        <svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg>
        <div class="err-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;">
          <svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}<polygon points="${areaFull}" fill="var(--observed)" opacity="0.12"/>${linePts.length > 1 ? `<polyline points="${linePts.join(' ')}" fill="none" stroke="var(--observed)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${dots}${xLbls}${xTitle}</svg>
        </div>
      </div>${footer}`;

  } else {
    // ── BAR MODE ─────────────────────────────────────────────
    periodData.forEach((pd, i) => {
      const bx  = cx(i) - barW / 2;
      const key = `err_${i}`;
      window._chartTips[key] = _rateTipHtml(pd);
      const col = pd.rate === 0 ? 'var(--passed)' : pd.rate > 30 ? 'var(--critical)' : pd.rate > 15 ? 'var(--failed)' : 'var(--observed)';
      const h   = pd.rate > 0 ? Math.max(3, (pd.rate / maxRate) * chartH) : 0;
      const topY = pad.top + chartH - h;
      const barRect = h > 0 ? `<rect x="${bx.toFixed(1)}" y="${topY.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" rx="1"/>` : '';
      const lbl = pd.total > 0 ? `<text x="${cx(i).toFixed(1)}" y="${(topY-4).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.rate}%</text>` : '';
      rightContent += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><rect x="${bx.toFixed(1)}" y="${pad.top}" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/>${barRect}${lbl}</g>`;
      const tx = cx(i).toFixed(1), ty = (H-54).toFixed(1);
      xLbls += `<text x="${tx}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${tx} ${ty})">${pd.label}</text>`;
    });

    el.innerHTML = `${header}
      <div style="display:flex;align-items:stretch;overflow:hidden;">
        <svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg>
        <div class="err-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;">
          <svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${rightContent}${xLbls}${xTitle}</svg>
        </div>
      </div>${footer}`;
  }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — CHART A: REVIEWER ACTIVITY
// ─────────────────────────────────────────────────────────────
function renderMemberReviewerChart() {
  const el = document.getElementById('analytics-member-reviewer');
  if (!el || !analyticsSelectedMember) return;

  const gran     = analyticsGranularity;
  const reviewed = DATA.filter(x => ownerMatchesQaBy(analyticsSelectedMember, x.qa_by));

  if (!reviewed.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:.78rem;">${analyticsSelectedMember} has no QA review activity in the loaded data.</div>`;
    return;
  }

  const allDataPeriods = getSortedPeriods(gran);
  const actualPeriods  = allDataPeriods.filter(p =>
    reviewed.some(x => getPeriodKey(x.day, gran) === p)
  );

  const periods = (gran === 'day' && allDataPeriods.length >= 2)
    ? getAllWorkingDays(allDataPeriods[0], allDataPeriods[allDataPeriods.length - 1])
    : allDataPeriods;

  const toCanon = k => { const [mo,dy,yy]=k.split('/'); return `${mo.padStart(2,'0')}/${dy.padStart(2,'0')}/${yy}`; };

  const dataLookup = new Map();
  actualPeriods.forEach(p => {
    const key   = gran === 'day' ? toCanon(p) : p;
    const cases = reviewed.filter(x => getPeriodKey(x.day, gran) === p);
    dataLookup.set(key, {
      label:       gran === 'day' ? toCanon(p).slice(0, 5) : formatPeriodKey(p, gran),
      total:       cases.length,
      passed:      count(cases, x => x.status === 'Passed'),
      opportunity: count(cases, x => x.status === 'Opportunity'),
      failed:      count(cases, x => x.status === 'Failed'),
      critical:    count(cases, x => x.status === 'Critical'),
    });
  });

  const periodData = periods.map(p =>
    dataLookup.get(p) || { label: gran === 'day' ? p.slice(0, 5) : p, total: 0, passed: 0, opportunity: 0, failed: 0, critical: 0 }
  );

  const maxTotal = Math.max(...periodData.map(p => p.total), 1);
  const H        = 290;
  const pad      = { top: 20, bottom: 80 };
  const chartH   = H - pad.top - pad.bottom;
  const leftW    = 64;
  const rightPad = 20;
  let barGap, barW, startPad, chartBodyW;
  if (gran === 'day') {
    barGap     = 50;
    barW       = 28;
    startPad   = barGap / 2;
    chartBodyW = Math.max(startPad + periods.length * barGap + rightPad, 300);
  } else {
    const containerW = Math.max((el.clientWidth || 900) - leftW, 300);
    barGap     = containerW / periods.length;
    barW       = Math.min(barGap * 0.5, gran === 'week' ? 60 : 80);
    startPad   = 0;
    chartBodyW = containerW;
  }
  const cx = i => startPad + i * barGap + barGap / 2;
  const yS = v => pad.top + chartH - (v / maxTotal) * chartH;

  // ── Left y-axis ───────────────────────────────────────────
  const yMid = (pad.top + chartH / 2).toFixed(1);
  let leftContent = `<text x="12" y="${yMid}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace" transform="rotate(-90 12 ${yMid})">Cases</text>`;
  for (let i = 0; i <= 4; i++) {
    const y   = pad.top + (i / 4) * chartH;
    const val = Math.round(maxTotal * (1 - i / 4));
    leftContent += `<text x="${leftW-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-family="Space Mono,monospace">${val}</text>`;
  }

  // ── Grid ──────────────────────────────────────────────────
  let rightGrid = '';
  const revGridX1 = startPad.toFixed(1);
  const revGridX2 = (chartBodyW - rightPad).toFixed(1);
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    rightGrid += `<line x1="${revGridX1}" y1="${y}" x2="${revGridX2}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
  }

  const xTitle = `<text x="${((startPad + chartBodyW - rightPad) / 2).toFixed(1)}" y="${H-8}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace">Period</text>`;
  if (!window._chartTips) window._chartTips = {};

  const chartHeader = `<div style="font-size:.72rem;color:var(--muted);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;">Cases Reviewed by ${analyticsSelectedMember}</div>`;
  const legend = `<div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap;">
    ${['Critical','Failed','Opportunity','Passed'].map(s =>
      `<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:${STATUS_COLORS[s]};display:inline-block;"></span>${s}</span>`
    ).join('')}</div>`;

  let rightContent = '', xLbls = '';

  if (analyticsChartType === 'bar') {
    // ── BAR MODE ─────────────────────────────────────────────
    periodData.forEach((pd, i) => {
      const bx  = cx(i) - barW / 2;
      const key = `rev_${i}`;
      window._chartTips[key] = _statusTipHtml(pd);
      const segs = [
        { val: pd.critical,    color: 'var(--critical)' },
        { val: pd.failed,      color: 'var(--failed)'   },
        { val: pd.opportunity, color: 'var(--observed)'  },
        { val: pd.passed,      color: 'var(--passed)'    },
      ];
      let yOff = pad.top + chartH, topY = pad.top + chartH, barRects = '';
      segs.forEach(s => {
        if (!s.val) return;
        const h = Math.max(3, (s.val / maxTotal) * chartH);
        yOff -= h; topY = yOff;
        barRects += `<rect x="${bx.toFixed(1)}" y="${yOff.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" rx="1"/>`;
      });
      const lbl = pd.total > 0 ? `<text x="${cx(i).toFixed(1)}" y="${(topY-4).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.total}</text>` : '';
      rightContent += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><rect x="${bx.toFixed(1)}" y="${pad.top}" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/>${barRects}${lbl}</g>`;
      const tx = cx(i).toFixed(1), ty = (H-54).toFixed(1);
      xLbls += `<text x="${tx}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${tx} ${ty})">${pd.label}</text>`;
    });

    el.innerHTML = `${chartHeader}
      <div style="display:flex;align-items:stretch;overflow:hidden;">
        <svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg>
        <div class="rev-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;">
          <svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${rightContent}${xLbls}${xTitle}</svg>
        </div>
      </div>${legend}`;

  } else {
    // ── LINE MODE ─────────────────────────────────────────────
    let linePts = [], areaPts = [], dots = '', labels = '';
    periodData.forEach((pd, i) => {
      const x = cx(i).toFixed(1);
      const y = yS(pd.total).toFixed(1);
      const key = `rev_${i}`;
      window._chartTips[key] = _statusTipHtml(pd);
      linePts.push(`${x},${y}`);
      areaPts.push(`${x},${y}`);
      const errs = pd.failed + pd.critical;
      const errRate = pd.total > 0 ? errs / pd.total : 0;
      const col = errRate === 0 ? 'var(--passed)' : errRate > 0.3 ? 'var(--critical)' : errRate > 0.15 ? 'var(--failed)' : 'var(--observed)';
      dots += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><circle cx="${x}" cy="${y}" r="12" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="1.5"/></g>`;
      if (pd.total > 0) labels += `<text x="${x}" y="${(parseFloat(y)-9).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.total}</text>`;
      const ty = (H-54).toFixed(1);
      xLbls += `<text x="${x}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${x} ${ty})">${pd.label}</text>`;
    });
    const areaFull = linePts.length > 0
      ? [`${cx(0).toFixed(1)},${(pad.top+chartH).toFixed(1)}`, ...areaPts, `${cx(periodData.length-1).toFixed(1)},${(pad.top+chartH).toFixed(1)}`].join(' ')
      : '';

    el.innerHTML = `${chartHeader}
      <div style="display:flex;align-items:stretch;overflow:hidden;">
        <svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg>
        <div class="rev-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;">
          <svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${areaFull ? `<polygon points="${areaFull}" fill="var(--accent2)" opacity="0.08"/>` : ''}${linePts.length > 1 ? `<polyline points="${linePts.join(' ')}" fill="none" stroke="var(--accent2)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${labels}${dots}${xLbls}${xTitle}</svg>
        </div>
      </div>${legend}`;
  }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — GRANULARITY TOGGLE
// ─────────────────────────────────────────────────────────────
function setAnalyticsGranularity(gran) {
  analyticsGranularity = gran;
  document.querySelectorAll('.analytics-toggle .atoggle').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gran === gran);
  });
  document.querySelectorAll('.atype').forEach(b => b.classList.toggle('active', b.dataset.type === analyticsChartType));
  renderVolChart();
  if (analyticsSelectedMember) {
    renderMemberStats();
    renderMemberErrorChart();
    renderMemberReviewerChart();
  }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — MAIN RENDER
// ─────────────────────────────────────────────────────────────
function renderAnalytics() {
  if (!DATA.length) {
    const empty = '<div style="color:var(--muted);font-size:.78rem;padding:24px;text-align:center;">Upload a CSV to see analytics.</div>';
    ['analytics-vol-chart','analytics-member-selector','analytics-member-stats',
     'analytics-member-error','analytics-member-reviewer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = empty;
    });
    return;
  }
  renderVolChart();
  renderAnalyticsMemberFilter();
  renderMemberStats();
  renderMemberErrorChart();
  renderMemberReviewerChart();
}

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────
function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
  event.target.classList.add('active');
  if (id === 'report')    { renderReport(); renderOverview(); }
  if (id === 'team')      renderTeam();
  if (id === 'analytics') renderAnalytics();
  if (id === 'cases')     renderCases();
}

function copyText(id) {
  const txt = document.getElementById(id).innerText;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = event.target, orig = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

function rerender() {
  renderReport();
  renderOverview();
  const active = document.querySelector('.panel.active')?.id?.replace('panel-', '');
  if (active === 'team')      renderTeam();
  if (active === 'analytics') renderAnalytics();
  if (active === 'cases')     renderCases();
}
// ─────────────────────────────────────────────────────────────
// INFO TOOLTIP
// ─────────────────────────────────────────────────────────────
function showInfoPopup(event, title, rows) {
  const popup = document.getElementById('info-popup');
  document.getElementById('info-popup-title').textContent = title;
  document.getElementById('info-popup-body').innerHTML = rows.map(([label, val, cls]) => {
    if (cls === 'info-popup-threshold') {
      return `<div class="info-popup-threshold-row">${label}</div>`;
    }
    return `<div class="info-popup-row">
      <span class="info-popup-label">${label}</span>
      <span class="info-popup-val ${cls || ''}">${val}</span>
    </div>`;
  }).join('');

  const x = event.clientX, y = event.clientY;
  const pw = 300;
  const vw = window.innerWidth, vh = window.innerHeight;
  popup.style.left = (x + pw + 16 > vw ? x - pw - 8 : x + 12) + 'px';
  popup.style.top  = (y + 200 > vh ? vh - 220 : y) + 'px';
  popup.classList.add('active');
  event.stopPropagation();
}

function hideInfoPopup() {
  document.getElementById('info-popup')?.classList.remove('active');
}

// ─────────────────────────────────────────────────────────────
// PRINT / SAVE PDF
// ─────────────────────────────────────────────────────────────
function printReport() {
  window.print();
}
// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
function renderAppVersion() {
  const versionEl = document.getElementById('app-version');
  if (!versionEl) return;

  versionEl.textContent = `Version ${window.APP_VERSION || 'dev'}`;
}

renderAppVersion();
renderReport();
renderOverview();
