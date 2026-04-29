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
// Passed=green, Observed=yellow, Failed=orange, Critical=red
// ─────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Passed:   'var(--passed)',
  Observed: 'var(--observed)',
  Failed:   'var(--failed)',
  Critical: 'var(--critical)',
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
function resolveFixStatus(status, fixComment) {
  if (!fixComment || fixComment.trim() === '') return status;
  const u = fixComment.toUpperCase();
  // Match NA or N/A as standalone word/token, not as substring of other words
  const naPattern = /\bN\/A\b|\bNA\d*\b/;
  if (naPattern.test(u)) return 'Passed';
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

    const rawStatus  = obj['QA Status'] || 'Observed';
    const comment    = obj['QA Comment'] || '';
    const fixComment = obj['QA Fix Comment'] || '';
    const status     = resolveFixStatus(rawStatus, fixComment);

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
  }).filter(r => r.owner && r.owner !== 'Unknown' && r.task_id);
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

  const passed   = count(d, x => x.status === 'Passed');
  const observed = count(d, x => x.status === 'Observed');
  const failed   = count(d, x => x.status === 'Failed');
  const critical = count(d, x => x.status === 'Critical');
  const errors   = observed + failed + critical;
  const owners   = [...new Set(d.map(x => x.owner))].length;
  const passRate = Math.round(passed / total * 100);

  // ── KPI cards ──
  const kpis = [
    { label:'Total Cases',  val: total,    sub: `${DAYS.length} day(s) loaded`,      color: 'var(--accent)' },
    { label:'Passed',       val: passed,   sub: `${passRate}% pass rate`,             color: 'var(--passed)' },
    { label:'Observed',     val: observed, sub: `${Math.round(observed/total*100)}% of ${total} cases`, color: 'var(--observed)' },
    { label:'Failed',       val: failed,   sub: `${Math.round(failed/total*100)}% of ${total} cases`,   color: 'var(--failed)' },
    { label:'Critical',     val: critical, sub: 'immediate action',                   color: 'var(--critical)' },
    { label:'Team Members', val: owners,   sub: 'reviewed this week',                 color: 'var(--accent2)' },
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
      const ob  = count(dc, x => x.status === 'Observed');
      const fa  = count(dc, x => x.status === 'Failed');
      const cr  = count(dc, x => x.status === 'Critical');
      const tot = counts[day];
      return `<div class="bar-row">
        <div class="bar-name" style="min-width:72px;font-family:'Space Mono',monospace;font-size:.7rem;">${day}</div>
        <div class="bar-track" style="height:16px;"><div style="display:flex;height:100%;">
          <div title="Passed:${pa}"   style="width:${pa/maxDay*100}%;background:var(--passed);opacity:.65"></div>
          <div title="Observed:${ob}" style="width:${ob/maxDay*100}%;background:var(--observed);opacity:.85"></div>
          <div title="Failed:${fa}"   style="width:${fa/maxDay*100}%;background:var(--failed)"></div>
          <div title="Critical:${cr}" style="width:${cr/maxDay*100}%;background:var(--critical)"></div>
        </div></div>
        <div class="bar-count">${tot}</div>
      </div>`;
    }).join('')
  }
  <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
    ${['Passed','Observed','Failed','Critical'].map(s =>
      `<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;">
        <span style="width:10px;height:10px;border-radius:2px;background:${STATUS_COLORS[s]};display:inline-block;opacity:.85"></span>${s}
      </span>`).join('')}
  </div></div>`;

  // ── Status donut ──
  drawDonut('donut-status', 'donut-status-legend', [
    { label:'Passed',   value: passed,   color: STATUS_COLORS.Passed },
    { label:'Observed', value: observed, color: STATUS_COLORS.Observed },
    { label:'Failed',   value: failed,   color: STATUS_COLORS.Failed },
    { label:'Critical', value: critical, color: STATUS_COLORS.Critical },
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
  // Counts only errors (Observed + Failed + Critical), all members shown
  const allOwners = [...new Set(d.map(x => x.owner))];
  const bugsByOwner = {};
  allOwners.forEach(o => {
    bugsByOwner[o] = count(d.filter(x => x.owner === o), x => x.status !== 'Passed');
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

  // ── QA Shadow Workload main donut ──
  const qaByCount = {};
  d.forEach(r => { if (r.qa_by) qaByCount[r.qa_by] = (qaByCount[r.qa_by] || 0) + 1; });
  const qaColors = ['var(--accent2)', 'var(--warn)', 'var(--accent)', 'var(--failed)'];
  drawDonut('donut-type', 'donut-type-legend',
    Object.entries(qaByCount).map(([name, val], i) => ({
      label: name, value: val, color: qaColors[i % qaColors.length]
    }))
  );

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
    const ob   = count(dc, x => x.status === 'Observed');
    const fa   = count(dc, x => x.status === 'Failed');
    const cr   = count(dc, x => x.status === 'Critical');
    const errs = ob + fa + cr;
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
          ${[['Passed',pa,'var(--passed)'],['Observed',ob,'var(--observed)'],['Failed',fa,'var(--failed)'],['Critical',cr,'var(--critical)']].map(([lbl,val,col])=>
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
    const ob   = count(sc, x => x.status === 'Observed');
    const fa   = count(sc, x => x.status === 'Failed');
    const cr   = count(sc, x => x.status === 'Critical');
    const errs = ob + fa + cr;
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
          ${ob > 0 ? `<div style="display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--observed);display:inline-block"></span><span style="color:var(--muted)">Observed:</span><span style="font-family:'Space Mono',monospace;color:var(--observed)">${ob}</span></div>` : ''}
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
        { value: count(dc, x => x.status === 'Passed'),   color: STATUS_COLORS.Passed },
        { value: count(dc, x => x.status === 'Observed'), color: STATUS_COLORS.Observed },
        { value: count(dc, x => x.status === 'Failed'),   color: STATUS_COLORS.Failed },
        { value: count(dc, x => x.status === 'Critical'), color: STATUS_COLORS.Critical },
      ]);
    });

    qaNames.forEach(name => {
      const sc   = d.filter(x => x.qa_by === name);
      const ob   = count(sc, x => x.status === 'Observed');
      const fa   = count(sc, x => x.status === 'Failed');
      const cr   = count(sc, x => x.status === 'Critical');
      const errs = ob + fa + cr;
      drawSmallDonut('dshadow-' + name.replace(/\s/g, ''),
        errs === 0
          ? [{ value: count(sc, x => x.status === 'Passed'), color: STATUS_COLORS.Passed }]
          : [
              { value: ob, color: STATUS_COLORS.Observed },
              { value: fa, color: STATUS_COLORS.Failed },
              { value: cr, color: STATUS_COLORS.Critical },
            ]
      );
    });
  });
}

// ─────────────────────────────────────────────────────────────
// RENDER — CASE LOG
// ─────────────────────────────────────────────────────────────
let activeDay = 'All';

function renderCases() {
  const DAYS = getDays();

  if (!DATA.length) {
    document.getElementById('day-filters').innerHTML = '';
    document.getElementById('case-count-label').textContent = 'No data loaded';
    document.getElementById('case-tbody').innerHTML =
      `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px;font-size:.82rem;">Upload a CSV file in the Import tab.</td></tr>`;
    return;
  }

  if (activeDay !== 'All' && !DAYS.includes(activeDay)) activeDay = 'All';

  document.getElementById('day-filters').innerHTML = ['All', ...DAYS].map(d => `
    <div class="day-btn${d === activeDay ? ' active' : ''}" onclick="setDay('${d}')">${d}</div>`).join('');

  const rows = activeDay === 'All' ? DATA : DATA.filter(x => x.day === activeDay);
  document.getElementById('case-count-label').textContent = `${activeDay} — ${rows.length} cases`;

  document.getElementById('case-tbody').innerHTML = rows.map(r => `
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

function setDay(d) { activeDay = d; renderCases(); }

// ─────────────────────────────────────────────────────────────
// RENDER — TEAM ANALYSIS
// ─────────────────────────────────────────────────────────────
function renderTeam() {
  if (!DATA.length) {
    document.getElementById('owner-grid').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:48px;font-size:.85rem;">Upload a CSV to see team analysis.</div>`;
    return;
  }

  const ownerMap = groupBy(DATA, 'owner');

  const cards = Object.entries(ownerMap)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([owner, cases]) => {
      const total    = cases.length;
      const passed   = count(cases, x => x.status === 'Passed');
      const observed = count(cases, x => x.status === 'Observed');
      const failed   = count(cases, x => x.status === 'Failed');
      const critical = count(cases, x => x.status === 'Critical');
      const errors   = observed + failed + critical;
      const passRate = Math.round(passed / total * 100);
      const errRate  = Math.round(errors / total * 100);

      const cats = {};
      cases.forEach(c => c.categories.forEach(cat => cats[cat] = (cats[cat] || 0) + 1));

      const trend      = errRate >= 40 ? 'risk' : errRate >= 20 ? 'watch' : 'ok';
      const trendLabel = trend === 'risk' ? '⚠ Needs Attention' : trend === 'watch' ? '◈ Watch' : '✓ On Track';
      const barColor   = errRate >= 40 ? 'var(--critical)' : errRate >= 20 ? 'var(--observed)' : 'var(--passed)';

      return `<div class="owner-card">
        <div class="owner-name">${owner}</div>
        <div class="owner-stats">
          <div class="owner-stat" style="margin-right:12px"><div class="owner-stat-val" style="color:var(--text)">${total}</div><div class="owner-stat-lbl">Total</div></div>
          <div class="owner-stat" style="margin-right:12px"><div class="owner-stat-val" style="color:var(--passed)">${passed}</div><div class="owner-stat-lbl">Passed</div></div>
          <div class="owner-stat" style="margin-right:12px"><div class="owner-stat-val" style="color:var(--observed)">${observed}</div><div class="owner-stat-lbl">Observed</div></div>
          <div class="owner-stat" style="margin-right:12px"><div class="owner-stat-val" style="color:var(--failed)">${failed}</div><div class="owner-stat-lbl">Failed</div></div>
          <div class="owner-stat"><div class="owner-stat-val" style="color:var(--critical)">${critical}</div><div class="owner-stat-lbl">Critical</div></div>
        </div>

        <div class="owner-bar-row">
          <div class="owner-bar-lbl">Error rate</div>
          <div class="owner-bar-track"><div class="owner-bar-fill" style="width:${errRate}%;background:${barColor}"></div></div>
          <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:40px;text-align:right">${errors}/${total}</div>
        </div>
        <div class="owner-bar-row" style="margin-top:4px">
          <div class="owner-bar-lbl">Pass rate</div>
          <div class="owner-bar-track"><div class="owner-bar-fill" style="width:${passRate}%;background:var(--passed);opacity:.7"></div></div>
          <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:40px;text-align:right">${passRate}%</div>
        </div>

        ${errors > 0
          ? `<div style="margin-top:10px;">
              <div style="font-size:.62rem;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px;font-family:'Syne',sans-serif;font-weight:700;">Bug categories</div>
              <div class="cat-tags">${Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,n])=>`<span class="cat-tag cat-${cat}" style="margin-right:3px">${cat} ×${n}</span>`).join('')}</div>
            </div>`
          : `<div style="margin-top:10px;font-size:.72rem;color:var(--passed);font-family:'Space Mono',monospace;">✓ Great job — no errors found</div>`}

        <div style="margin-top:10px;"><span class="trend-badge trend-${trend}">${trendLabel}</span></div>
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

  const passed   = count(d, x => x.status === 'Passed');
  const observed = count(d, x => x.status === 'Observed');
  const failed   = count(d, x => x.status === 'Failed');
  const critical = count(d, x => x.status === 'Critical');
  const errors   = observed + failed + critical;
  const passRate = Math.round(passed / total * 100);
  const owners   = [...new Set(d.map(x => x.owner))];

  const catCount = {};
  d.forEach(r => r.categories.forEach(c => catCount[c] = (catCount[c] || 0) + 1));

  const qaByCount = {};
  d.forEach(r => { if (r.qa_by) qaByCount[r.qa_by] = (qaByCount[r.qa_by] || 0) + 1; });
  const qaShadows = Object.entries(qaByCount).map(([n,c]) => `${n} (${c})`).join(', ');

  const ownerMap = groupBy(d, 'owner');
  const atRisk = Object.entries(ownerMap)
    .filter(([, cases]) => cases.length >= 3 && count(cases, x => x.status !== 'Passed') / cases.length >= 0.4)
    .map(([o]) => o);

  const daysLabel = DAYS.length > 0
    ? `${DAYS[0]}${DAYS.length > 1 ? ' – ' + DAYS[DAYS.length - 1] : ''}`
    : WEEK_RANGE;

if (document.getElementById('daily-report')) document.getElementById('daily-report').textContent =
`QA Shadow – Daily EOD (${daysLabel})

• Reviewed: ${owners.length} members / ${total} cases
• QA Shadows: ${qaShadows || 'N/A'}
• Pass rate: ${passRate}% (${passed}/${total})
• Errors: ${errors} — Observed: ${observed} · Failed: ${failed} · Critical: ${critical}
• Top bugs: ${sortDesc(catCount).slice(0,3).map(([c,n])=>`${c} (${n}x)`).join(', ') || 'None'}
• At risk: ${atRisk.length ? atRisk.join(', ') : 'None'}
• Queues: Stable (verify in WOMS)
• Status: ${critical > 0 ? '⚠ Critical — immediate follow-up needed' : errors === 0 ? '✓ Clean' : 'Under control'}`;

  document.getElementById('weekly-report').textContent =
`▎ QA SHADOW — WEEKLY SUMMARY
▎ Week ${WEEK_RANGE}  ·  ${DAYS.length}/5 days loaded
${'─'.repeat(52)}
 COVERAGE
  Team members : ${owners.length}
  Total cases  : ${total}
  QA Shadows   : ${qaShadows || 'N/A'}
  Days worked  : ${DAYS.join('  ·  ')}

 RESULTS
  ✓ Passed   ${String(passed).padStart(4)}   (${passRate}%)
  ● Observed ${String(observed).padStart(4)}   (${Math.round(observed/total*100)}%)
  ▲ Failed   ${String(failed).padStart(4)}   (${Math.round(failed/total*100)}%)
  ✕ Critical ${String(critical).padStart(4)}   (${Math.round(critical/total*100)}%)
${'─'.repeat(52)}
 BUG PATTERNS
${Object.keys(catCount).length
  ? sortDesc(catCount).map(([c,n]) => `  › ${c.padEnd(10)} ${String(n).padStart(3)} cases - ${errors>0?Math.round(n/errors*100):0}% of errors`).join('\n')
  : '  No bugs recorded'}
${'─'.repeat(52)}
 TEAM PERFORMANCE  (top 8 by volume)
${Object.entries(ownerMap).sort((a,b)=>b[1].length-a[1].length).slice(0,8)
  .map(([o,cases])=>{
    const errs = count(cases, x=>x.status!=='Passed');
    const pr   = Math.round(count(cases,x=>x.status==='Passed')/cases.length*100);
    return `  ${o.padEnd(22)} ${cases.length} cases  ${errs} error(s)  ${pr}% pass`;
  }).join('\n')}
${'─'.repeat(52)}
 QUEUE & CONTROL
  Status  : ${critical > 0 ? '⚠ At Risk' : 'Stable'}
  WOMS    : Verify pending/rework queues
  ${DAYS.length < 5 ? `${5-DAYS.length} day(s) pending — updates on re-upload` : 'Full week loaded'}

 NEEDS ATTENTION
${atRisk.length ? atRisk.map(o=>`  ⚠ ${o}`).join('\n') : '  None'}
${'─'.repeat(52)}
 FINAL STATUS: ${critical > 0 ? '⚠ AT RISK' : errors > 0 ? 'UNDER CONTROL' : '✓ CLEAN WEEK'}`;
}

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────
function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
  event.target.classList.add('active');
  if (id === 'report') { renderReport(); renderOverview(); }
  if (id === 'team')   renderTeam();
  if (id === 'cases')  renderCases();
}

function copyText(id) {
  const txt = document.getElementById(id).textContent;
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
  if (active === 'team')  renderTeam();
  if (active === 'cases') renderCases();
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
renderReport();
renderOverview();
