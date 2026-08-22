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

const TYPE_COLORS = { LP: 'var(--lp)', Posting: 'var(--posting)', Unknown: 'var(--muted)' };

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

// Mapea nombres de la columna "QA Completed by" a su owner canónico.
// La data de origen tiene nombres inconsistentes que no podemos cambiar upstream.
const QA_ALIAS = {
  'Armando':   'Diego Torrez',
  'C. Javier': 'Javier Callejas',
  'A. Javier': 'Javier Alcoba',
  'Gustavich': 'Gustavo Pillco',
  'Diego':     'Diego Delgadillo',
};

function extractNameFromEmail(email) {
  if (!email || !email.includes('@')) return email || 'Unknown';
  return email.split('@')[0]
    .split('.')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Normaliza cualquier fecha m/d/yy o m/d/yyyy a un formato canónico m/d/yy
function normalizeDate(str) {
  if (!str || !str.includes('/')) return str || '';
  const [m, d, y] = str.split('/');
  if (!m || !d || !y) return str;
  const yy = y.length === 4 ? y.slice(-2) : y.padStart(2, '0');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${yy}`;
}

// Convierte m/d/yy o m/d/yyyy a un objeto Date, sin importar el largo del año
function parseMDY(str) {
  const [m, d, y] = String(str).split('/');
  const year = y && y.length === 4 ? y : `20${y}`;
  return new Date(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}

function getDays() {
  const days = [...new Set(DATA.map(x => x.day))];
  return days.sort((a, b) => parseMDY(a) - parseMDY(b));
}

function getCompletedDates() {
  const dates = [...new Set(DATA.map(x => x.completed_date).filter(Boolean))];
  return dates.sort((a, b) => parseMDY(a) - parseMDY(b));
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
// TYPE NORMALIZATION
// ─────────────────────────────────────────────────────────────
function normalizeType(raw) {
  if (!raw) return 'Unknown';
  const s = raw.trim().toLowerCase();
  if (s === 'posting case' || s === 'posting html')                return 'Posting';
  if (s === 'seo landing page' || s === 'just posting landing page' || s === 'oem landing page') return 'LP';
  if (s.includes('landing page')) return 'LP';
  if (s.includes('posting'))      return 'Posting';
  return 'Unknown';
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
  window._hasDateColumn = headers.includes('Date');

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
/*    const status     = resolveFixStatus(rawStatus, fixComment, comment);*/
    const status     = rawStatus;   // Agent 2 decides Passed; resolveFixStatus stays as fallback

    return {
      day:            normalizeDate(obj['Date QA Completed'] || ''),
      completed_date: normalizeDate(obj['Date'] || ''),
      owner:      extractNameFromEmail(obj['Name'] || ''),
      task_id:    obj['ID / Task / Case Number'] || '',
      status,
      original_status: rawStatus,
      qa_by:      (obj['QA Completed by:'] || obj['QA Completed by'] || '').trim(),
      summary:    comment,
      fix_comment: fixComment,
      categories: status === 'Passed' ? [] : parseCategories(comment),
      type:       normalizeType(obj['Type'] || obj['Case Type']),
    };
  }).filter(r => r.owner && r.owner !== 'Unknown' && r.task_id && r.status !== 'In progress' && r.status !== 'In Progress');
}

// ─────────────────────────────────────────────────────────────
// CSV IMPORT + DATA ANALYZER GATE
// ─────────────────────────────────────────────────────────────
const AUDIT_API = 'http://localhost:8000';   // ← al migrar a Vercel, cambia solo esta línea

document.getElementById('csv-file-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  gateImport(file);
});

function auditEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// El chat solo vive cuando hay datos aprobados por el Agente 1.
// Archivo nuevo, bloqueado o inválido → chat fuera de servicio.
function invalidateQASession() {
  DATA = [];
  qaSessionId = null;
  try { sessionStorage.removeItem('qaSessionId'); } catch (e) {}
  qaAssistantSessionState = 'no-data';
  updateQAAssistantState();
}

// Importación real. Solo la llama el gate del Agente 1 (auto en 'ok', o por botón).
async function importCsvText(text) {
  const statusEl = document.getElementById('import-status');
  try {
    const parsed = parseCSV(text);
    DATA = [...parsed];

    if (!parsed.length) {
      statusEl.textContent = '⚠ File loaded but no valid rows found. Check column headers.';
      statusEl.style.color = 'var(--observed)';
      qaAssistantSessionState = 'no-data';
      updateQAAssistantState();
      rerender();
      return;
    }

    statusEl.textContent = '✓ Loaded ' + parsed.length + ' cases across ' + getDays().length + ' day(s).';
    statusEl.style.color = 'var(--passed)';
    rerender();

    // Agente 2: esperamos para que el chat vea los estados ya reevaluados
    await reevaluateStatuses();

    // Recién ahora se arma la sesión del chatbot
    qaAssistantSessionState = 'preparing';
    updateQAAssistantState();
    try {
      await resetQASession();
      qaAssistantSessionState = 'ready';
      console.log('[QA CHAT] AI assistant ready:', qaSessionId, '| Cases:', DATA.length);
    } catch (sessionError) {
      qaAssistantSessionState = 'error';
      console.error('[QA CHAT] Could not initialize AI session:', sessionError);
    }
    updateQAAssistantState();

  } catch (err) {
    statusEl.textContent = '✗ Parse error: ' + err.message;
    statusEl.style.color = 'var(--critical)';
    qaAssistantSessionState = 'error';
    updateQAAssistantState();
  }
}

// Punto de entrada: audita primero, luego importa según el veredicto.
async function gateImport(file) {
  const panel = document.getElementById('audit-panel');
  const statusEl = document.getElementById('import-status');
  const text = await file.text();
    // El chat queda invalidado hasta que el Agente 1 autorice la importación.
  invalidateQASession();

  panel.style.display = 'block';

  panel.style.display = 'block';
  panel.innerHTML = '<div class="card-title">Data Analyzer Agent</div>' +
    '<div class="audit-loading">Running audit… this can take a few seconds.</div>';
  statusEl.textContent = '⏳ Running audit before import…';
  statusEl.style.color = 'var(--muted)';

  let report;
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(AUDIT_API + '/audit', { method: 'POST', body: form });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    report = await res.json();
  } catch (err) {
    renderAuditUnavailable(text);   // servidor caído → fallback manual
    return;
  }
  renderAuditPanel(report, text);
}

function auditFinding(f, cls) {
  return '<div class="audit-finding audit-finding--' + cls + '">' +
    '<div class="audit-finding-head">' +
      '<span class="audit-finding-title">' + auditEsc(f.title) + '</span>' +
      '<span class="audit-finding-rows">' + auditEsc(f.rows) + '</span>' +
    '</div>' +
    '<div class="audit-finding-detail">' + auditEsc(f.detail) + '</div>' +
    (f.fix ? '<div class="audit-finding-fix"><b>Fix:</b> ' + auditEsc(f.fix) + '</div>' : '') +
  '</div>';
}

function renderAuditPanel(report, text) {
  const panel = document.getElementById('audit-panel');
  const statusEl = document.getElementById('import-status');
  const v = report.verdict || 'ok';
  const meta = ({
    blocked:  { mark:'✗', title:'Not ready to import', sub:'Fix the blocking issues before importing.' },
    warnings: { mark:'⚠', title:'Ready with warnings', sub:'You can import, but review the warnings below.' },
    ok:       { mark:'✓', title:'Ready to import', sub:'No issues found.' }
  })[v] || { mark:'•', title:v, sub:'' };

  const s = report.summary || {};
  const blocking = report.blocking || [];
  const warnings = report.warnings || [];

  let actions;
  if (v === 'ok') {
    actions = '<div class="audit-actions"><span class="audit-hint">No issues found — data imported automatically.</span></div>';
  } else if (v === 'warnings') {
    actions = '<div class="audit-actions"><button class="audit-btn audit-btn--primary" id="audit-import-btn">Import anyway</button>' +
              '<span class="audit-hint">Review the warnings above before importing.</span></div>';
  } else {
    actions = '<div class="audit-actions"><button class="audit-btn audit-btn--primary" disabled>Import anyway</button>' +
              '<span class="audit-hint">Blocked while a crash-triggering issue is present. Fix the CSV and re-upload.</span></div>';
  }

  panel.innerHTML =
    '<div class="card-title">Data Analyzer Agent</div>' +
    '<div class="audit-verdict audit-verdict--' + v + '">' +
      '<span class="audit-mark">' + meta.mark + '</span>' +
      '<div><div class="audit-verdict-title">' + auditEsc(meta.title) + '</div>' +
      '<div class="audit-verdict-sub">' + auditEsc(meta.sub) + '</div></div>' +
    '</div>' +
    '<div class="audit-strip">' +
      '<div class="audit-stat"><div class="audit-n">' + (s.rows_read ?? '–') + '</div><div class="audit-k">Rows read</div></div>' +
      '<div class="audit-stat"><div class="audit-n audit-n--ok">' + (s.would_import ?? '–') + '</div><div class="audit-k">Would import</div></div>' +
      '<div class="audit-stat"><div class="audit-n audit-n--bad">' + (s.dropped ?? '–') + '</div><div class="audit-k">Dropped</div></div>' +
    '</div>' +
    (blocking.length ? '<div class="audit-group-title">Blocking · ' + blocking.length + '</div>' + blocking.map(f => auditFinding(f,'blk')).join('') : '') +
    (warnings.length ? '<div class="audit-group-title">Warnings · ' + warnings.length + '</div>' + warnings.map(f => auditFinding(f,'wrn')).join('') : '') +
    actions;

  if (v === 'ok') {
    importCsvText(text);                    // importa automático
  } else if (v === 'warnings') {
    statusEl.textContent = '⚠ Import paused — review the audit, then click “Import anyway”.';
    statusEl.style.color = 'var(--warn)';
    const btn = document.getElementById('audit-import-btn');
    btn.addEventListener('click', () => { importCsvText(text); btn.textContent = 'Imported ✓'; btn.disabled = true; });
  } else {
    statusEl.textContent = '✗ Import blocked — fix the CSV and re-upload.';
    statusEl.style.color = 'var(--danger)';
    invalidateQASession(); 
  }
}

// Fallback cuando el agente no responde: permitir importar sin auditar.
function renderAuditUnavailable(text) {
  const panel = document.getElementById('audit-panel');
  const statusEl = document.getElementById('import-status');
  panel.style.display = 'block';
  panel.innerHTML =
    '<div class="card-title">Data Analyzer Agent</div>' +
    '<div class="audit-error">Could not reach the audit server (at ' + AUDIT_API + '). You can import without it.</div>' +
    '<div class="audit-actions"><button class="audit-btn audit-btn--ghost" id="audit-import-btn">Import without audit</button>' +
    '<span class="audit-hint">The agent isn’t available, so the file will be imported unchecked.</span></div>';
  statusEl.textContent = '⚠ Audit unavailable — import without it if needed.';
  statusEl.style.color = 'var(--warn)';
  const btn = document.getElementById('audit-import-btn');
  btn.addEventListener('click', () => { importCsvText(text); btn.textContent = 'Imported ✓'; btn.disabled = true; });
}

// ─────────────────────────────────────────────────────────────
// AGENT 2 — Status Reevaluator (authoritative; resolveFixStatus = fallback)
// ─────────────────────────────────────────────────────────────
async function reevaluateStatuses() {
  // Candidatos: tienen fix comment y NO están ya en Passed
  const candidates = DATA
    .map((r, i) => ({ i, r }))
    .filter(({ r }) => (r.fix_comment || '').trim() && r.status !== 'Passed');

  if (!candidates.length) return;

  const payload = candidates.map(({ i, r }) => ({
    case_id: String(i),
    status:  r.status,
    comment: r.summary || '',
    fix:     r.fix_comment || ''
  }));

  window.AGENT_CHANGES = window.AGENT_CHANGES || [];

  try {
    const res = await fetch(AUDIT_API + '/reevaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cases: payload })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const { verdicts } = await res.json();

    verdicts.forEach(v => {
      if (v.changed && v.new_status === 'Passed') applyPassed(Number(v.case_id), v.reason);
    });
    rerender();
  } catch (err) {
    // Servidor caído → fallback a la lógica vieja resolveFixStatus
    console.warn('Reevaluator unavailable, using fallback:', err);
    candidates.forEach(({ i, r }) => {
      if (resolveFixStatus(r.original_status, r.fix_comment, r.summary) === 'Passed')
        applyPassed(i, 'resolveFixStatus fallback');
    });
    rerender();
  }
}

// Aplica un cambio a Passed de forma consistente (vacía categorías como parseCSV)
function applyPassed(idx, reason) {
  const r = DATA[idx];
  if (!r || r.status === 'Passed') return;
  window.AGENT_CHANGES.push({ idx, original: r.status, reason });
  r.status = 'Passed';
  r.categories = [];          // los casos Passed no llevan categorías de bug
  r._agentChanged = true;
}

// Revierte un cambio del agente (botón en el Case Log)
function revertAgentChange(idx) {
  const change = (window.AGENT_CHANGES || []).find(c => c.idx === idx);
  if (!change) return;
  const r = DATA[idx];
  r.status = change.original;
  r.categories = parseCategories(r.summary);   // recalcula: ya no es Passed
  r._agentChanged = false;
  window.AGENT_CHANGES = window.AGENT_CHANGES.filter(c => c.idx !== idx);
  rerender();
}

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
    ['kpi-row','timeline','daily-bars','daily-bars-legend','cat-bars','owner-bars',
     'donut-status','donut-status-legend','donut-type','donut-type-legend',
     'donut-casetype','donut-casetype-legend',
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

  // ── Type KPI data ──
  const postingCases  = d.filter(x => x.type === 'Posting');
  const lpCases       = d.filter(x => x.type === 'LP');
  const postingTotal  = postingCases.length;
  const lpTotal       = lpCases.length;
  const postingErrors = count(postingCases, x => x.status === 'Failed' || x.status === 'Critical');
  const lpErrors      = count(lpCases,      x => x.status === 'Failed' || x.status === 'Critical');
  const postingErrRate = postingTotal > 0 ? Math.round(postingErrors / postingTotal * 100) : null;
  const lpErrRate      = lpTotal      > 0 ? Math.round(lpErrors      / lpTotal      * 100) : null;
  const postingKpiColor = postingErrRate === null ? 'var(--accent2)'
    : postingErrRate > 10 ? 'var(--critical)' : postingErrRate > 5 ? 'var(--failed)' : 'var(--accent2)';
  const lpKpiColor = lpErrRate === null ? 'var(--accent2)'
    : lpErrRate > 10 ? 'var(--critical)' : lpErrRate > 5 ? 'var(--failed)' : 'var(--accent2)';

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
      sub: `${(((passed + opportunity) / total) * 100).toFixed(2)}% pass rate`,
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
    {
      label: 'Posting Err. Rate',
      val:   postingErrRate !== null ? `${postingErrRate}%` : '—',
      sub:   postingTotal > 0 ? `${postingErrors}/${postingTotal} cases` : 'No Posting cases',
      color: postingKpiColor,
    },
    {
      label: 'LP Err. Rate',
      val:   lpErrRate !== null ? `${lpErrRate}%` : '—',
      sub:   lpTotal > 0 ? `${lpErrors}/${lpTotal} cases` : 'No LP cases',
      color: lpKpiColor,
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
  }</div>`;

  document.getElementById('daily-bars-legend').innerHTML = `
  <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
    ${['Passed','Opportunity','Failed','Critical'].map(s =>
      `<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;">
        <span style="width:10px;height:10px;border-radius:2px;background:${STATUS_COLORS[s]};display:inline-block;opacity:.85"></span>${s}
      </span>`).join('')}
  </div>`;

  // ── Status donut ──
  drawDonut('donut-status', 'donut-status-legend', [
    { label:'Passed',      value: passed,      color: STATUS_COLORS.Passed },
    { label:'Opportunity', value: opportunity, color: STATUS_COLORS.Opportunity },
    { label:'Failed',      value: failed,      color: STATUS_COLORS.Failed },
    { label:'Critical',    value: critical,    color: STATUS_COLORS.Critical },
  ]);

  // ── Cases by Type donut ──
  const typeCount = { LP: 0, Posting: 0, Unknown: 0 };
  d.forEach(r => { typeCount[r.type] = (typeCount[r.type] || 0) + 1; });
  drawDonut('donut-casetype', 'donut-casetype-legend', [
    { label: 'Landing Page', value: typeCount.LP,      color: TYPE_COLORS.LP },
    { label: 'Posting',      value: typeCount.Posting, color: TYPE_COLORS.Posting },
    { label: 'Unknown',      value: typeCount.Unknown, color: TYPE_COLORS.Unknown },
  ]);

  // // ── Bug Categories bar + percentage (stacked by type) ──
  // const catCount  = {};
  // const catByType = {};
  // d.forEach(r => r.categories.forEach(c => {
  //   catCount[c] = (catCount[c] || 0) + 1;
  //   if (!catByType[c]) catByType[c] = { LP: 0, Posting: 0, Unknown: 0 };
  //   catByType[c][r.type] = (catByType[c][r.type] || 0) + 1;
  // }));

  // if (!Object.keys(catCount).length) {
  //   document.getElementById('cat-bars').innerHTML =
  //     '<div style="color:var(--muted);font-size:.78rem;">No bug categories detected</div>';
  // } else {
  //   const maxCat = Math.max(...Object.values(catCount), 1);
  //   document.getElementById('cat-bars').innerHTML =
  //     sortDesc(catCount).map(([cat, cnt]) => {
  //       const pct = errors > 0 ? Math.round(cnt / errors * 100) : 0;
  //       const bt  = catByType[cat] || { LP: 0, Posting: 0, Unknown: 0 };
  //       return `<div class="bar-row">
  //         <div class="bar-name">${cat}</div>
  //         <div class="bar-track">
  //           <div style="display:flex;height:100%;">
  //             ${bt.LP      > 0 ? `<div title="LP: ${bt.LP}"           style="width:${bt.LP/maxCat*100}%;background:${TYPE_COLORS.LP};opacity:.85"></div>` : ''}
  //             ${bt.Posting > 0 ? `<div title="Posting: ${bt.Posting}" style="width:${bt.Posting/maxCat*100}%;background:${TYPE_COLORS.Posting};opacity:.85"></div>` : ''}
  //             ${bt.Unknown > 0 ? `<div title="Unknown: ${bt.Unknown}" style="width:${bt.Unknown/maxCat*100}%;background:${TYPE_COLORS.Unknown};opacity:.6"></div>` : ''}
  //           </div>
  //         </div>
  //         <div style="display:flex;gap:6px;align-items:center;min-width:68px;justify-content:flex-end;">
  //           <span style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);">${pct}%</span>
  //           <span class="bar-count">${cnt}</span>
  //         </div>
  //       </div>`;
  //     }).join('') +
  //     `<div style="font-size:.63rem;color:var(--muted);margin-top:6px;font-family:'Space Mono',monospace;">% of total errors (${errors})</div>` +
  //     `<div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;">
  //       ${['LP','Posting','Unknown'].map(t =>
  //         `<span style="font-size:.65rem;display:flex;align-items:center;gap:4px;">
  //           <span style="width:8px;height:8px;border-radius:2px;background:${TYPE_COLORS[t]};display:inline-block;opacity:.85"></span>${t === 'LP' ? 'Landing Page' : t}
  //         </span>`).join('')}
  //     </div>`;
  // }
  // ── Bug Categories bar + percentage ──
  const categoryAnalysis =
    getQACategoryAnalysis({
      data: d
    });

  if (!categoryAnalysis.categories.length) {
    document.getElementById('cat-bars').innerHTML =
      '<div style="color:var(--muted);font-size:.78rem;">No bug categories detected</div>';
  } else {
    const maxCategoryCount = Math.max(
      ...categoryAnalysis.categories.map(
        item => item.count
      ),
      1
    );

    document.getElementById('cat-bars').innerHTML =
      categoryAnalysis.categories.map(item => {
        const percentage = Math.round(
          item.percentageOfScope
        );

        const byType = item.byType;

        return `
          <div class="bar-row">
            <div class="bar-name">
              ${item.category}
            </div>

            <div class="bar-track">
              <div style="display:flex;height:100%;">
                ${
                  byType.LP > 0
                    ? `
                      <div
                        title="LP: ${byType.LP}"
                        style="
                          width:${byType.LP / maxCategoryCount * 100}%;
                          background:${TYPE_COLORS.LP};
                          opacity:.85;
                        "
                      ></div>
                    `
                    : ''
                }

                ${
                  byType.Posting > 0
                    ? `
                      <div
                        title="Posting: ${byType.Posting}"
                        style="
                          width:${byType.Posting / maxCategoryCount * 100}%;
                          background:${TYPE_COLORS.Posting};
                          opacity:.85;
                        "
                      ></div>
                    `
                    : ''
                }

                ${
                  byType.Unknown > 0
                    ? `
                      <div
                        title="Unknown: ${byType.Unknown}"
                        style="
                          width:${byType.Unknown / maxCategoryCount * 100}%;
                          background:${TYPE_COLORS.Unknown};
                          opacity:.6;
                        "
                      ></div>
                    `
                    : ''
                }
              </div>
            </div>

            <div
              style="
                display:flex;
                gap:6px;
                align-items:center;
                min-width:68px;
                justify-content:flex-end;
              "
            >
              <span
                style="
                  font-family:'Space Mono',monospace;
                  font-size:.65rem;
                  color:var(--muted);
                "
              >
                ${percentage}%
              </span>

              <span class="bar-count">
                ${item.count}
              </span>
            </div>
          </div>
        `;
      }).join('') +

      `
        <div
          style="
            font-size:.63rem;
            color:var(--muted);
            margin-top:6px;
            font-family:'Space Mono',monospace;
          "
        >
          % of non-passed cases
          (${categoryAnalysis.scopedCases})
        </div>

        <div
          style="
            font-size:.61rem;
            color:var(--muted);
            margin-top:4px;
            font-family:'Space Mono',monospace;
          "
        >
          One case may contain multiple categories.
        </div>

        <div
          style="
            display:flex;
            gap:12px;
            margin-top:8px;
            flex-wrap:wrap;
          "
        >
          ${
            ['LP', 'Posting', 'Unknown']
              .map(type => `
                <span
                  style="
                    font-size:.65rem;
                    display:flex;
                    align-items:center;
                    gap:4px;
                  "
                >
                  <span
                    style="
                      width:8px;
                      height:8px;
                      border-radius:2px;
                      background:${TYPE_COLORS[type]};
                      display:inline-block;
                      opacity:.85;
                    "
                  ></span>

                  ${
                    type === 'LP'
                      ? 'Landing Page'
                      : type
                  }
                </span>
              `)
              .join('')
          }
        </div>
      `;
  }

  // ── Top Bug Contributors (stacked by type) ──
  const allOwners      = [...new Set(d.map(x => x.owner))];
  const bugsByOwner     = {};
  const bugsByOwnerType = {};
  allOwners.forEach(o => {
    const ownerErrors = d.filter(x => x.owner === o && (x.status === 'Failed' || x.status === 'Critical'));
    bugsByOwner[o]     = ownerErrors.length;
    bugsByOwnerType[o] = { LP: 0, Posting: 0, Unknown: 0 };
    ownerErrors.forEach(r => { bugsByOwnerType[o][r.type] = (bugsByOwnerType[o][r.type] || 0) + 1; });
  });

  const sortedByBugs = [...allOwners].sort((a, b) => bugsByOwner[b] - bugsByOwner[a]);
  const maxBugs = Math.max(...Object.values(bugsByOwner), 1);

  document.getElementById('owner-bars').innerHTML = sortedByBugs.map(own => {
    const bugs = bugsByOwner[own];
    if (bugs === 0) {
      return `<div class="bar-row">
        <div class="bar-name" style="color:var(--muted)">${own}</div>
        <div style="flex:1;font-size:.68rem;font-family:'Space Mono',monospace;color:var(--passed);padding-left:8px;">✓ No errors — great job!</div>
        <div class="bar-count" style="color:var(--passed)">0</div>
      </div>`;
    }
    const bt = bugsByOwnerType[own];
    return `<div class="bar-row">
      <div class="bar-name">${own}</div>
      <div class="bar-track">
        <div style="display:flex;height:100%;">
          ${bt.LP      > 0 ? `<div title="LP: ${bt.LP}"           style="width:${bt.LP/maxBugs*100}%;background:${TYPE_COLORS.LP};opacity:.85"></div>` : ''}
          ${bt.Posting > 0 ? `<div title="Posting: ${bt.Posting}" style="width:${bt.Posting/maxBugs*100}%;background:${TYPE_COLORS.Posting};opacity:.85"></div>` : ''}
          ${bt.Unknown > 0 ? `<div title="Unknown: ${bt.Unknown}" style="width:${bt.Unknown/maxBugs*100}%;background:${TYPE_COLORS.Unknown};opacity:.6"></div>` : ''}
        </div>
      </div>
      <div class="bar-count">${bugs}</div>
    </div>`;
  }).join('') +
  `<div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;">
    ${['LP','Posting','Unknown'].map(t =>
      `<span style="font-size:.65rem;display:flex;align-items:center;gap:4px;">
        <span style="width:8px;height:8px;border-radius:2px;background:${TYPE_COLORS[t]};display:inline-block;opacity:.85"></span>${t === 'LP' ? 'Landing Page' : t}
      </span>`).join('')}
  </div>`;

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

  // Day cards
  const dayCards = DAYS.map(day => {
    const dc   = byDay[day] || [];
    const pa   = count(dc, x => x.status === 'Passed');
    const op   = count(dc, x => x.status === 'Opportunity');
    const fa   = count(dc, x => x.status === 'Failed');
    const cr   = count(dc, x => x.status === 'Critical');
    const errs = fa + cr;
    const id   = 'dday-' + day.replace(/\//g, '');

    // const qaSplit = {};
    // dc.forEach(r => { if (r.qa_by) qaSplit[r.qa_by] = (qaSplit[r.qa_by] || 0) + 1; });
    const qaSplit = {};

    dc.forEach(item => {
      const reviewer =
        getQAReviewerDisplayName(
          item.qa_by,
          d
        );

      if (!reviewer) return;

      qaSplit[reviewer] =
        (qaSplit[reviewer] || 0) + 1;
    });

    // return `<div class="qa-donut-card">
    //   <div class="card-title">${day}</div>
    //   <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
    //     <div>
    //       <svg id="${id}" width="80" height="80" viewBox="0 0 80 80"></svg>
    //       <div style="font-size:.6rem;color:var(--muted);text-align:center;margin-top:3px;font-family:'Space Mono',monospace;">cases</div>
    //     </div>
    //     <div style="display:flex;flex-direction:column;gap:4px;font-size:.72rem;">
    //       ${[['Passed',pa,'var(--passed)'],['Opportunity',op,'var(--observed)'],['Failed',fa,'var(--failed)'],['Critical',cr,'var(--critical)']].map(([lbl,val,col])=>
    //         val > 0 ? `<div style="display:flex;align-items:center;gap:5px;">
    //           <span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span>
    //           <span style="color:var(--muted)">${lbl}:</span>
    //           <span style="font-family:'Space Mono',monospace;color:${col}">${val}</span>
    //         </div>` : ''
    //       ).join('')}
    //       <div style="margin-top:3px;font-size:.63rem;font-family:'Space Mono',monospace;color:${errs > 0 ? 'var(--observed)' : 'var(--passed)'};">
    //         ${errs > 0 ? `${errs} error(s)` : '✓ Clean day'}
    //       </div>
    //     </div>
    //   </div>
    //   ${Object.keys(qaSplit).length ? `
    //     <div style="margin-top:10px;font-size:.62rem;color:var(--muted);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px;">QA Shadow split</div>
    //     <div style="display:flex;flex-wrap:wrap;gap:6px;">
    //       ${Object.entries(qaSplit).map(([name, c], i) => `
    //         <div style="display:flex;align-items:center;gap:4px;font-size:.68rem;">
    //           <span style="width:7px;height:7px;border-radius:50%;background:${qaColors[i % qaColors.length]};display:inline-block"></span>
    //           <span style="color:var(--text)">${name}</span>
    //           <span style="font-family:'Space Mono',monospace;color:var(--muted)">(${c})</span>
    //         </div>`).join('')}
    //     </div>` : ''}
    // </div>`;
return `
  <details class="qa-day-panel">
    <summary class="qa-day-summary">
      <span>${day}</span>
      <span style="font-family:'Space Mono',monospace;color:var(--muted);font-size:.68rem;">
        ${dc.length} cases
      </span>
    </summary>

    <div class="qa-donut-card">
      <div class="qa-day-card-content">
        <div>
          <svg id="${id}" width="80" height="80" viewBox="0 0 80 80"></svg>
          <div style="font-size:.6rem;color:var(--muted);text-align:center;margin-top:3px;font-family:'Space Mono',monospace;">cases</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:4px;font-size:.72rem;">
          ${[['Passed',pa,'var(--passed)'],['Opportunity',op,'var(--observed)'],['Failed',fa,'var(--failed)'],['Critical',cr,'var(--critical)']].map(([lbl,val,col]) =>
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

        <div class="qa-shadow-split-col">
          <div class="qa-shadow-split-title">QA Shadow split</div>

          ${
            Object.keys(qaSplit).length
              ? `<div class="qa-shadow-split-list">
                  ${Object.entries(qaSplit).map(([name, c], i) => `
                    <div class="qa-shadow-split-item">
                      <span style="width:7px;height:7px;border-radius:50%;background:${qaColors[i % qaColors.length]};display:inline-block"></span>
                      <span style="color:var(--text)">${name}</span>
                      <span style="font-family:'Space Mono',monospace;color:var(--muted)">(${c})</span>
                    </div>
                  `).join('')}
                </div>`
              : `<div style="font-size:.68rem;color:var(--muted);">No QA split</div>`
          }
        </div>
      </div>
    </div>
  </details>
`;
  });

  // container.innerHTML = `
  //   <div style="font-size:.72rem;color:var(--muted);margin-bottom:10px;font-family:'Syne',sans-serif;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">By day</div>
  //   <div class="qa-donuts-row" id="qa-day-row">${dayCards.join('')}</div>
  // `;
  container.innerHTML = `
    <div style="font-size:.72rem;color:var(--muted);margin-bottom:10px;font-family:'Syne',sans-serif;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">
      By day
    </div>
    <div class="qa-day-panels" id="qa-day-row">
      ${dayCards.join('')}
    </div>
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

  });
}

// ─────────────────────────────────────────────────────────────
// RENDER — CASE LOG + FILTER SYSTEM
// ─────────────────────────────────────────────────────────────

// ── Filter state ──
const activeFilters = {
  dateFrom:            null,   // 'MM/DD/YY'
  dateTo:              null,   // 'MM/DD/YY'
  dateCompletedFrom:   null,   // 'MM/DD/YY'
  dateCompletedTo:     null,   // 'MM/DD/YY'
  status:     [],     // multi: ['Passed','Failed',...]
  qaby:       [],     // multi: ['Cidar','Michael',...]
  owner:      [],
  category:   [],     // multi: ['Config','Styling',...]
  type:       [],     // multi: ['LP','Posting','Unknown']
};

// ── Date picker state — QA Date ──
let dpYear  = new Date().getFullYear();
let dpMonth = new Date().getMonth();
let dpStart = null;  // 'MM/DD/YY'
let dpEnd   = null;  // 'MM/DD/YY'
let dpSelecting = false;

// ── Date picker state — Completed Date ──
let dpYearDC  = new Date().getFullYear();
let dpMonthDC = new Date().getMonth();
let dpStartDC = null;  // 'MM/DD/YY'
let dpEndDC   = null;  // 'MM/DD/YY'

// ─────────────────────────────────────────────────────────────
// DROPDOWN TOGGLE
// ─────────────────────────────────────────────────────────────
function toggleDropdown(name) {
  const allDropdowns = ['datecompleted','date','status','qaby','owner','category','type'];
  allDropdowns.forEach(n => {
    if (n === name) return;
    document.getElementById(`filter-dropdown-${n}`)?.classList.remove('open');
    document.getElementById(`filter-btn-${n}`)?.classList.remove('open');
  });
  const dd  = document.getElementById(`filter-dropdown-${name}`);
  const btn = document.getElementById(`filter-btn-${name}`);
  const isOpen = dd.classList.toggle('open');
  btn.classList.toggle('open', isOpen);

  if (name === 'datecompleted' && isOpen) renderDatePickerDC();
  if (name === 'date' && isOpen)          renderDatePicker();
  if (name === 'qaby' && isOpen)          renderDropdownOptions('qaby');
  if (name === 'owner' && isOpen)         renderDropdownOptions('owner');
  if (name === 'category' && isOpen)      renderDropdownOptions('category');
  if (name === 'type' && isOpen)          renderDropdownOptions('type');
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
  } else if (name === 'type') {
    options = [...new Set(DATA.map(x => x.type).filter(Boolean))].sort();
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
    } else if (name === 'type') {
      if (r.type) countMap[r.type] = (countMap[r.type] || 0) + 1;
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
  if (name === 'type')     arr = activeFilters.type;

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

  const parseDay = str => str ? parseMDY(str) : null;

  const fmtKey = (y, m, d) => `${m+1}/${d}/${String(y).slice(-2)}`;

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
    if (parseMDY(key) < parseMDY(dpStart)) {
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
// DATE PICKER — COMPLETED DATE
// ─────────────────────────────────────────────────────────────
function renderDatePickerDC() {
  const DATES    = getCompletedDates();
  const datesSet = new Set(DATES);
  const months   = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

  document.getElementById('date-picker-month-label-dc').textContent =
    `${months[dpMonthDC]} ${dpYearDC}`;

  const firstDay    = new Date(dpYearDC, dpMonthDC, 1).getDay();
  const daysInMonth = new Date(dpYearDC, dpMonthDC + 1, 0).getDate();
  const dayLabels   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const parseDay = str => str ? parseMDY(str) : null;

  const fmtKey = (y, m, d) => `${m+1}/${d}/${String(y).slice(-2)}`;

  const startDate = parseDay(dpStartDC);
  const endDate   = parseDay(dpEndDC);

  let html = dayLabels.map(l => `<div class="date-picker-day-label">${l}</div>`).join('');

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="date-picker-day empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key     = fmtKey(dpYearDC, dpMonthDC, day);
    const hasData = datesSet.has(key);
    const date    = new Date(dpYearDC, dpMonthDC, day);

    let cls = 'date-picker-day';
    if (!hasData) cls += ' no-data';
    else cls += ' has-data';

    if (startDate && endDate) {
      if (date >= startDate && date <= endDate) cls += ' in-range';
    }
    if (dpStartDC === key) cls += ' range-start';
    if (dpEndDC   === key) cls += ' range-end';

    const click = hasData ? `onclick="datePickerClickDC('${key}', event)"` : '';
    html += `<div class="${cls}" ${click}>${day}</div>`;
  }

  document.getElementById('date-picker-grid-dc').innerHTML = html;
}

function datePickerNavDC(dir) {
  dpMonthDC += dir;
  if (dpMonthDC > 11) { dpMonthDC = 0;  dpYearDC++; }
  if (dpMonthDC < 0)  { dpMonthDC = 11; dpYearDC--; }
  renderDatePickerDC();
}

function datePickerClickDC(key, event) {
  if (event) event.stopPropagation();
  if (!dpStartDC || (dpStartDC && dpEndDC)) {
    dpStartDC = key;
    dpEndDC   = null;
  } else {
    if (parseMDY(key) < parseMDY(dpStartDC)) {
      dpEndDC   = dpStartDC;
      dpStartDC = key;
    } else {
      dpEndDC = key;
    }
  }
  renderDatePickerDC();
}

function applyDateFilterDC() {
  activeFilters.dateCompletedFrom = dpStartDC;
  activeFilters.dateCompletedTo   = dpEndDC || dpStartDC;
  toggleDropdown('datecompleted');
  updateFilterUI();
  filterCases();
}

function clearDateFilterDC() {
  dpStartDC = null;
  dpEndDC   = null;
  activeFilters.dateCompletedFrom = null;
  activeFilters.dateCompletedTo   = null;
  renderDatePickerDC();
  updateFilterUI();
  filterCases();
}

// ─────────────────────────────────────────────────────────────
// FILTER UI — pills + button states + clear all
// ─────────────────────────────────────────────────────────────
function updateFilterUI() {
  const pills    = [];
  const hasAny   = () => pills.length > 0;

  // Completed Date pill
  if (activeFilters.dateCompletedFrom) {
    const label = activeFilters.dateCompletedFrom === activeFilters.dateCompletedTo
      ? activeFilters.dateCompletedFrom
      : `${activeFilters.dateCompletedFrom} – ${activeFilters.dateCompletedTo}`;
    pills.push({ label: `📆 ${label}`, remove: () => clearDateFilterDC() });
    document.getElementById('filter-btn-datecompleted').classList.add('active');
  } else {
    document.getElementById('filter-btn-datecompleted').classList.remove('active');
  }

  // QA Date pill
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

  // Type pills
  activeFilters.type.forEach(t => {
    pills.push({ label: `📋 ${t}`, remove: () => { toggleFilterOption('type', t); } });
  });
  document.getElementById('filter-btn-type').classList.toggle('active', activeFilters.type.length > 0);

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
  dpStartDC = null;
  dpEndDC   = null;
  activeFilters.dateCompletedFrom = null;
  activeFilters.dateCompletedTo   = null;
  activeFilters.status   = [];
  activeFilters.qaby     = [];
  activeFilters.owner    = [];
  activeFilters.category = [];
  activeFilters.type     = [];

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
      `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:32px;font-size:.82rem;">Upload a CSV file in the Import tab.</td></tr>`;
    return;
  }

  // Build dynamic dropdown options
  renderDropdownOptions('qaby');
  renderDropdownOptions('owner');
  renderDropdownOptions('category');
  renderDropdownOptions('type');

  // Init QA Date picker to first month in data
  const DAYS = getDays();
  if (DAYS.length && !dpStart) {
    const [m, , y] = DAYS[0].split('/');
    dpMonth = parseInt(m) - 1;
    dpYear  = 2000 + parseInt(y);
  }

  // Init Completed Date picker to first month in data
  const CDATES = getCompletedDates();
  if (CDATES.length && !dpStartDC) {
    const [m, , y] = CDATES[0].split('/');
    dpMonthDC = parseInt(m) - 1;
    dpYearDC  = 2000 + parseInt(y);
  }

  updateFilterUI();
  filterCases();
}

// ─────────────────────────────────────────────────────────────
// FILTER CASES
// ─────────────────────────────────────────────────────────────
function filterCases() {
  const search = (document.getElementById('case-search')?.value || '').toLowerCase().trim();
  // let rows = [...DATA];

  // // ── Completed Date range filter ──
  // if (activeFilters.dateCompletedFrom) {
  //   const from = parseMDY(activeFilters.dateCompletedFrom);
  //   const to   = parseMDY(activeFilters.dateCompletedTo || activeFilters.dateCompletedFrom);
  //   rows = rows.filter(x => {
  //     if (!x.completed_date) return false;
  //     const d = parseMDY(x.completed_date);
  //     return d >= from && d <= to;
  //   });
  // }

  // // ── QA Date range filter ──
  // if (activeFilters.dateFrom) {
  //   const from = parseMDY(activeFilters.dateFrom);
  //   const to   = parseMDY(activeFilters.dateTo || activeFilters.dateFrom);
  //   rows = rows.filter(x => {
  //     const d = parseMDY(x.day);
  //     return d >= from && d <= to;
  //   });
  // }

  // // // ── Status filter (multi) ──
  // // if (activeFilters.status.length) {
  // //   rows = rows.filter(x => {
  // //     if (activeFilters.status.includes('Pending'))   return x.status !== 'Passed' && (!x.fix_comment || !x.fix_comment.trim());
  // //     if (activeFilters.status.includes('Responded')) return x.fix_comment && x.fix_comment.trim();
  // //     return activeFilters.status.includes(x.status);
  // //   });
  // // }
  // // ── Status filter (multi) ──
  // if (activeFilters.status.length) {
  //   rows = rows.filter(item =>
  //     activeFilters.status.some(
  //       selectedStatus => {
  //         if (selectedStatus === 'Pending') {
  //           return isQAPendingCase(item);
  //         }

  //         if (selectedStatus === 'Responded') {
  //           return isQARespondedCase(item);
  //         }

  //         return item.status === selectedStatus;
  //       }
  //     )
  //   );
  // }
  // // ── QA By filter (multi) ──
  // if (activeFilters.qaby.length) {
  //   rows = rows.filter(x => activeFilters.qaby.includes(x.qa_by));
  // }

  // // ── Owner filter (multi) ──
  // if (activeFilters.owner.length) {
  //   rows = rows.filter(x => activeFilters.owner.includes(x.owner));
  // }

  // // ── Category filter (multi) ──
  // if (activeFilters.category.length) {
  //   rows = rows.filter(x => activeFilters.category.some(c => x.categories.includes(c)));
  // }

  // // ── Type filter (multi) ──
  // if (activeFilters.type.length) {
  //   rows = rows.filter(x => activeFilters.type.includes(x.type));
  // }

  // // ── Text search ──
  // if (search) {
  //   rows = rows.filter(r =>
  //     r.owner.toLowerCase().includes(search)       ||
  //     r.task_id.toLowerCase().includes(search)     ||
  //     r.summary.toLowerCase().includes(search)     ||
  //     r.fix_comment.toLowerCase().includes(search) ||
  //     r.qa_by.toLowerCase().includes(search)
  //   );
  // }

  const rows =
    filterQACases({
      data: DATA,

      qaDateFrom:
        activeFilters.dateFrom,

      qaDateTo:
        activeFilters.dateTo,

      completedDateFrom:
        activeFilters.dateCompletedFrom,

      completedDateTo:
        activeFilters.dateCompletedTo,

      owners:
        activeFilters.owner,

      reviewers:
        activeFilters.qaby,

      statuses:
        activeFilters.status,

      categories:
        activeFilters.category,

      types:
        activeFilters.type,

      text:
        search
    });

  const hasActiveFilters = activeFilters.dateCompletedFrom || activeFilters.dateFrom ||
                        activeFilters.status.length || activeFilters.qaby.length ||
                        activeFilters.owner.length || activeFilters.category.length ||
                        activeFilters.type.length;
  const filterLabel = hasActiveFilters ? ' (filtered)' : '';

  document.getElementById('case-count-label').textContent =
    `${rows.length} cases${filterLabel}${search ? ` matching "${search}"` : ''}`;

  document.getElementById('case-tbody').innerHTML = rows.length === 0
    ? `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:32px;font-size:.82rem;">No cases match your filters.</td></tr>`
    : rows.map(r => `
      <tr>
        <td style="font-family:'Space Mono',monospace;font-size:.72rem;color:var(--muted);white-space:nowrap">${r.completed_date || '—'}</td>
        <td style="font-family:'Space Mono',monospace;font-size:.72rem;color:var(--muted);white-space:nowrap">${r.day}</td>
        <td style="font-weight:600;white-space:nowrap">${r.owner}</td>
        <td style="font-family:'Space Mono',monospace;font-size:.72rem;color:var(--accent2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.task_id}">${r.task_id}</td>
        <td>
          <span class="status-pill pill-${r.status}">${r.status}</span>
          ${r.original_status !== r.status
            ? `<span style="font-size:.6rem;color:var(--muted);font-family:'Space Mono',monospace;display:block;margin-top:3px;">was: ${r.original_status}</span>`
            : ''}
          ${r._agentChanged
            ? `<button class="revert-btn" onclick="revertAgentChange(${DATA.indexOf(r)})">⟲ revert agent change</button>`
            : ''}
        </td>
        <td><span class="type-pill type-${r.type}">${r.type}</span></td>
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
      const passRate    = Math.round((passed + opportunity) / total * 100);
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

  const reviewedByOwner = {};
  DATA.forEach(x => {
    const ro = canonicalOwnerFor(x.qa_by);
    if (ro) (reviewedByOwner[ro] = reviewedByOwner[ro] || []).push(x);
  });

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

    const reviewedCases  = reviewedByOwner[owner] || [];
    const rTotal         = reviewedCases.length;
    const rPassed        = count(reviewedCases, x => x.status === 'Passed');
    const rOpp           = count(reviewedCases, x => x.status === 'Opportunity');
    const rFailed        = count(reviewedCases, x => x.status === 'Failed');
    const rCritical      = count(reviewedCases, x => x.status === 'Critical');

    const cats = {};
    cases
      .filter(c => c.status === 'Failed' || c.status === 'Critical')
      .forEach(c => c.categories.forEach(cat => cats[cat] = (cats[cat] || 0) + 1));

    const postingIssues = count(cases, c =>
      c.type === 'Posting' &&
      (c.status === 'Failed' || c.status === 'Critical')
    );
    const lpIssues = count(cases, c =>
      c.type === 'LP' &&
      (c.status === 'Failed' || c.status === 'Critical')
    );

    const trendLabel = getTeamTrendLabel(trend);

    const barColor =
      trend === 'risk'
        ? 'var(--critical)'
        : trend === 'watch'
          ? 'var(--observed)'
          : 'var(--passed)';

    return `<div class="owner-card" data-flipped="false" onclick="toggleCardFlip(event, this)">
      <button class="qa-flip-link" onclick="toggleCardFlip(event, this.closest('.owner-card'))">QA ↻</button>

      <div class="owner-face owner-face-front">
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

        <div class="owner-stat" style="margin-right:12px">
          <div class="owner-stat-val" style="color:var(--critical)">${critical}</div>
          <div class="owner-stat-lbl">Critical</div>
        </div>
      </div>

      <div class="owner-bar-row">
        <div class="owner-bar-lbl">Pass rate</div>
        <div class="owner-bar-track">
          <div class="owner-bar-fill" style="width:${passRate}%;background:var(--passed);opacity:.7"></div>
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:40px;text-align:right">
          ${passed + opportunity}/${total} (${passRate}%)
        </div>
      </div>

      <div class="owner-bar-row" style="margin-top:4px">
        <div class="owner-bar-lbl">Error rate</div>
        <div class="owner-bar-track">
          <div class="owner-bar-fill" style="width:${errRate}%;background:${barColor}"></div>
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:40px;text-align:right">
          ${errors}/${total} (${errRate}%)
        </div>
      </div>

      <div style="border-top:1px solid var(--border);margin:8px 0;"></div>

      <div class="owner-bar-row">
        <div class="owner-bar-lbl">Opp. rate</div>
        <div class="owner-bar-track">
          <div class="owner-bar-fill" style="width:${oppRate}%;background:var(--observed);opacity:.75"></div>
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:40px;text-align:right">
          ${opportunity}/${total} (${oppRate}%)
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
        <div style="font-size:.62rem;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px;font-family:'Syne',sans-serif;font-weight:700;">Bug by Type</div>
        <div class="cat-tags">
          <span class="cat-tag type-LP" style="margin-right:3px">LP Error ×${lpIssues}</span>
          <span class="cat-tag type-Posting" style="margin-right:3px">Posting Error ×${postingIssues}</span>
        </div>
      </div>

      <div style="font-size:.62rem;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin:8px 0 0 0;font-family:'Syne',sans-serif;font-weight:700;">Status</div>

      <div>
        <span class="trend-badge trend-${trend}">${trendLabel}</span>
      </div>
      </div><!-- /owner-face-front -->

      <div class="owner-face owner-face-back">
        <div class="owner-name">${owner}</div>
        <div style="font-size:.62rem;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin:12px 0 8px;font-family:'Syne',sans-serif;font-weight:700;">Cases reviewed as QA</div>
        ${rTotal > 0 ? `
        <div class="qa-rev-total" style="font-size:2rem;margin-bottom:10px;">${rTotal}<span style="font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-left:5px;">total reviewed</span></div>
        <svg id="qa-donut-${owner.replace(/[^a-zA-Z0-9]/g, '')}" width="80" height="80" viewBox="0 0 80 80" style="display:block;margin:0 auto 10px;"></svg>
        <div>
          <div class="qa-rev-row"><span>✓ Passed</span><span style="color:var(--passed)">${rPassed}</span></div>
          <div class="qa-rev-row"><span>● Opportunity</span><span style="color:var(--observed)">${rOpp}</span></div>
          <div class="qa-rev-row"><span>▲ Failed</span><span style="color:var(--failed)">${rFailed}</span></div>
          <div class="qa-rev-row"><span>✕ Critical</span><span style="color:var(--critical)">${rCritical}</span></div>
        </div>`
        : `<div style="font-size:.78rem;color:var(--muted);font-family:'Space Mono',monospace;padding:8px 0;">— No reviews recorded for this member.</div>`}
        <button class="qa-flip-link" style="position:static;margin-top:14px;" onclick="toggleCardFlip(event, this.closest('.owner-card'))">← Back to owner view</button>
      </div><!-- /owner-face-back -->
    </div>`;
  });

  document.getElementById('owner-grid').innerHTML = cards.join('');

  teamRows.forEach(item => {
    const rc = reviewedByOwner[item.owner] || [];
    if (!rc.length) return;
    drawSmallDonut('qa-donut-' + item.owner.replace(/[^a-zA-Z0-9]/g, ''), [
      { value: count(rc, x => x.status === 'Passed'),      color: STATUS_COLORS.Passed },
      { value: count(rc, x => x.status === 'Opportunity'), color: STATUS_COLORS.Opportunity },
      { value: count(rc, x => x.status === 'Failed'),      color: STATUS_COLORS.Failed },
      { value: count(rc, x => x.status === 'Critical'),    color: STATUS_COLORS.Critical },
    ]);
  });
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
  const passRate    = Math.round((passed + opportunity) / total * 100);
  const owners      = [...new Set(d.map(x => x.owner))];

  // const catCount = {};
  // d.forEach(r => r.categories.forEach(c => catCount[c] = (catCount[c] || 0) + 1));
  const categoryAnalysis =
    getQACategoryAnalysis({
      data: d
    });

  const catCount = Object.fromEntries(
    categoryAnalysis.categories.map(item => [
      item.category,
      item.count
    ])
  );

  // const qaByCount = {};
  // d.forEach(r => { if (r.qa_by) qaByCount[r.qa_by] = (qaByCount[r.qa_by] || 0) + 1; });
  // const qaShadows = Object.entries(qaByCount).map(([n,c]) => `${n} (${c})`).join(', ');
  const qaReviewerAnalysis =
    getQAReviewerAnalysis({
      data: d,
      limit: 0
    });

  const qaShadows =
    qaReviewerAnalysis.reviewers
      .map(
        reviewer =>
          `${reviewer.reviewer} (${reviewer.total})`
      )
      .join(', ');

  const ownerMap = groupBy(d, 'owner');
  // const atRisk = Object.entries(ownerMap)
  //   .filter(([, cases]) => {
  //     const errRate = Math.round(count(cases, x => x.status === 'Failed' || x.status === 'Critical') / cases.length * 100);
  //     return errRate > 10;
  //   })
  //   .map(([o]) => o);

  // Pending cases: has a bug (non-Passed) but no fix_comment yet
  // const pendingCases = count(d, x => x.status !== 'Passed' && (!x.fix_comment || x.fix_comment.trim() === ''));
  // const queueStatus =
  //   pendingCases > 10 ? '🚨 At Risk'  :
  //   pendingCases >= 5 ? '⚠ Watch'    :
  //                        '✓ Stable';
  const queueAnalysis =
    getQAQueueAnalysis({
      data: d,
      limit: 0
    });

  // const pendingCases =
  //   queueAnalysis.pendingCount;

  // const queueStatus =
  //   queueAnalysis.queueStatus.label;


  const daysLabel = DAYS.length > 0
    ? `${DAYS[0]}${DAYS.length > 1 ? ' – ' + DAYS[DAYS.length - 1] : ''}`
    : WEEK_RANGE;
//  // ── Final Status logic ──
//   const criticalPct    = total > 0 ? (critical    / total) * 100 : 0;
//   const failedPct      = total > 0 ? (failed      / total) * 100 : 0;
//   const opportunityPct = total > 0 ? (opportunity / total) * 100 : 0;

//   // Opportunity no longer affects severity score — tracked separately
//   const severityScore =
//     (criticalPct > 1  ? 3 : criticalPct > 0   ? 1 : 0) +
//     (failedPct   > 3  ? 2 : failedPct   > 1.5 ? 1 : 0);

//   const pendingScore =
//     pendingCases > 20 ? 3 :
//     pendingCases >= 10 ? 2 : 1;

//   const finalScore = severityScore + pendingScore;

//   const finalStatus =
//     finalScore >= 7 ? '🚨 AT RISK' :
//     finalScore >= 4 ? '⚠ NEEDS ATTENTION' :
//     errors === 0    ? '✓ CLEAN WEEK' :
//                       'UNDER CONTROL';

  const weeklyStatusAnalysis =
    getQAWeeklyStatusAnalysis({
      data: d
    });

  const criticalPct =
    weeklyStatusAnalysis
      .metrics
      .criticalRate;

  const failedPct =
    weeklyStatusAnalysis
      .metrics
      .failedRate;

  const opportunityPct =
    weeklyStatusAnalysis
      .metrics
      .opportunityRate;

  const pendingCases =
    weeklyStatusAnalysis
      .metrics
      .pending;

  const criticalPts =
    weeklyStatusAnalysis
      .scoring
      .critical
      .points;

  const failedPts =
    weeklyStatusAnalysis
      .scoring
      .failed
      .points;

  const pendingScore =
    weeklyStatusAnalysis
      .scoring
      .pending
      .points;

  const severityScore =
    weeklyStatusAnalysis
      .scoring
      .severityScore;

  const finalScore =
    weeklyStatusAnalysis
      .scoring
      .finalScore;

  const finalStatus =
    weeklyStatusAnalysis
      .status
      .label;

  const queueStatus =
    weeklyStatusAnalysis
      .queueStatus
      .label;

  const atRisk =
    weeklyStatusAnalysis
      .riskOwners
      .map(item => item.owner);

  if (document.getElementById('daily-report')) document.getElementById('daily-report').textContent =
  `QA Shadow – Daily EOD (${daysLabel})

  • Reviewed: ${owners.length} members / ${total} cases
  • QA Shadows: ${qaShadows || 'N/A'}
  • Pass rate: ${passRate}% (${passed + opportunity}/${total})
  • Opportunities: ${opportunity}
  • Errors: ${errors} — Failed: ${failed} · Critical: ${critical}
  • Top bugs: ${sortDesc(catCount).slice(0,3).map(([c,n])=>`${c} (${n}x)`).join(', ') || 'None'}
  • At risk: ${atRisk.length ? atRisk.join(', ') : 'None'}
  • Queues: ${queueStatus} (${pendingCases} pending)
  • Status: ${finalStatus}`;
    // • Status: ${critical > 0 ? '⚠ Critical — immediate follow-up needed' : errors === 0 ? '✓ Clean' : 'Under control'}`;

  const queueRows = [
    ['Pending cases',    `${pendingCases}`,  pendingCases > 10 ? 'info-popup-risk' : pendingCases >= 5 ? 'info-popup-warn' : 'info-popup-ok'],
    ['─────────────',   '', ''],
    ['✓ Under Control', '< 5 pending',  'info-popup-ok'],
    ['⚠ Watch',         '5–10 pending', 'info-popup-warn'],
    ['🚨 At Risk',      '> 10 pending', 'info-popup-risk'],
  ];

  // const criticalPts  = criticalPct > 1  ? 3 : criticalPct > 0   ? 1 : 0;
  // const failedPts    = failedPct   > 3  ? 2 : failedPct   > 1.5 ? 1 : 0;

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
    ['✓ CLEAN WEEK', '0 errors + 0 pending', 'info-popup-ok']
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

    // TTL(' RESULTS'),
    // L(`  ✓ Passed      ${String(passed).padStart(4)}   (${passRate}%)`, 'var(--passed)'),
    // L(`  ● Opportunity ${String(opportunity).padStart(4)}   (${Math.round(opportunity/total*100)}%)`, 'var(--observed)'),
    // L(`  ▲ Failed      ${String(failed).padStart(4)}   (${Math.round(failed/total*100)}%)`, 'var(--failed)'),
    // L(`  ✕ Critical    ${String(critical).padStart(4)}   (${Math.round(critical/total*100)}%)`, 'var(--critical)'),
    // SEP(),
TTL(' RESULTS'),

L(
  `  ✓ ${'Passed'.padEnd(12)} ${String(passed).padStart(4)}   (${passRate}%)` +
  `     ● ${'Opportunity'.padEnd(12)} ${String(opportunity).padStart(4)}   (${Math.round(opportunity / total * 100)}%)`,
  'var(--passed)'
),

L(
  `  ▲ ${'Failed'.padEnd(12)} ${String(failed).padStart(4)}   (${Math.round(failed / total * 100)}%)`,
  'var(--failed)'
),

L(
  `  ✕ ${'Critical'.padEnd(12)} ${String(critical).padStart(4)}   (${Math.round(critical / total * 100)}%)`,
  'var(--critical)'
),

SEP(),
    // TTL(' BUG PATTERNS'),
    // ...(Object.keys(catCount).length
    //   ? sortDesc(catCount).map(([c,n]) => L(`  › ${c.padEnd(10)} ${String(n).padStart(3)} cases - ${errors>0?Math.round(n/errors*100):0}% of errors`, 'var(--text)'))
    //   : [L('  No bugs recorded', 'var(--text)')]),
    // SEP(),
    TTL(' BUG PATTERNS'),

    ...(categoryAnalysis.categories.length
      ? categoryAnalysis.categories.map(item =>
          L(
            `  › ${item.category.padEnd(10)} ` +
            `${String(item.count).padStart(3)} cases - ` +
            `${Math.round(item.percentageOfScope)}% of non-passed cases`,
            'var(--text)'
          )
        )
      : [
          L(
            '  No bugs recorded',
            'var(--text)'
          )
        ]
    ),

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
      .sort((a, b) => {
        const getPriority = (cases) => {
          const totalCases = cases.length;
          const errs = count(cases, x => x.status === 'Failed' || x.status === 'Critical');
          const errRate = Math.round(errs / totalCases * 100);

          if (errRate > 10) return 1; // Needs Attention
          if (errRate > 5) return 2;  // Watch
          return 3;                   // On Track
        };

        const priorityA = getPriority(a[1]);
        const priorityB = getPriority(b[1]);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return b[1].length - a[1].length;
      })
      .map(([o, cases]) => {
        const totalCases = cases.length;
        const errs = count(cases, x => x.status === 'Failed' || x.status === 'Critical');
        // const pr = Math.round(count(cases, x => x.status === 'Passed') / totalCases * 100);
        const pr = Math.round(
          count(
            cases,
            x =>
              x.status === 'Passed' ||
              x.status === 'Opportunity'
          ) / totalCases * 100
        );
        const errRate = Math.round(errs / totalCases * 100);

        const attention = errRate > 10
          ? '⚠ Needs Attention'
          : errRate > 5
            ? '◈ Watch'
            : '✓ On Track';

        const color = errRate > 10
          ? 'var(--failed)'
          : errRate > 5
            ? 'var(--observed)'
            : 'var(--passed)';

        return L(
          `${o.padEnd(22)} ${String(totalCases).padStart(3)} cases ${String(errs).padStart(2)} error(s) ${String(pr).padStart(3)}% pass ${attention}`,
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
    L(''),

    TTL(' STATUS EXPLANATION'),

    ...weeklyStatusAnalysis.reasons.map(
      reason =>
        L(
          `  › ${reason.message} (+${reason.points} pts)`,
          reason.severity === 'risk'
            ? 'var(--critical)'
            : reason.severity === 'warning'
              ? 'var(--observed)'
              : 'var(--text)'
        )
    ),

    L(''),

    TTL(' RECOMMENDED ACTIONS'),

    ...weeklyStatusAnalysis.recommendations.map(
      recommendation =>
        L(
          `  › ${recommendation.message}`,
          recommendation.priority === 'high'
            ? 'var(--critical)'
            : recommendation.priority === 'medium'
              ? 'var(--observed)'
              : 'var(--text)'
        )
    ),
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
// Índice perezoso de primer-nombre -> owner(s), reconstruido si cambia DATA.
let _firstNameIndex = null;
let _firstNameIndexLen = -1;
function _buildFirstNameIndex() {
  _firstNameIndex = {};
  const owners = [...new Set(DATA.map(x => x.owner))];
  owners.forEach(o => {
    const f = o.toLowerCase().split(' ')[0];
    (_firstNameIndex[f] = _firstNameIndex[f] || []).push(o);
  });
  _firstNameIndexLen = DATA.length;
}

function getQAOwnerNames(data = DATA) {
  const safeData = Array.isArray(data)
    ? data
    : [];

  return [
    ...new Set(
      safeData
        .map(item => item.owner)
        .filter(Boolean)
    )
  ];
}

function resolveQAReviewerIdentity(
  qaBy,
  data = DATA
) {
  const rawName =
    String(qaBy || '').trim();

  if (!rawName) {
    return {
      rawName: '',
      canonicalName: null,
      displayName: null,
      resolved: false
    };
  }

  const normalizedRaw =
    normalizeQAText(rawName);

  // Busca alias sin depender de mayúsculas o tildes
  const aliasEntry =
    Object.entries(QA_ALIAS).find(
      ([alias]) =>
        normalizeQAText(alias) ===
        normalizedRaw
    );

  if (aliasEntry) {
    return {
      rawName,
      canonicalName: aliasEntry[1],
      displayName: aliasEntry[1],
      resolved: true
    };
  }

  const owners =
    getQAOwnerNames(data);

  // Coincidencia exacta con nombre completo
  const exactOwner =
    owners.find(
      owner =>
        normalizeQAText(owner) ===
        normalizedRaw
    );

  if (exactOwner) {
    return {
      rawName,
      canonicalName: exactOwner,
      displayName: exactOwner,
      resolved: true
    };
  }

  // Coincidencia por primer nombre
  const firstNameMatches =
    owners.filter(owner => {
      const firstName =
        normalizeQAText(owner)
          .split(' ')[0];

      return firstName === normalizedRaw;
    });

  if (firstNameMatches.length === 1) {
    return {
      rawName,
      canonicalName:
        firstNameMatches[0],

      displayName:
        firstNameMatches[0],

      resolved: true
    };
  }

  // Conserva el valor original si no puede resolverlo
  return {
    rawName,
    canonicalName: null,
    displayName: rawName,
    resolved: false
  };
}

// Devuelve el owner canónico para un valor de qa_by, o null si no se resuelve.
// function canonicalOwnerFor(qaBy) {
//   const q = (qaBy || '').trim();
//   if (!q) return null;
//   if (QA_ALIAS[q]) return QA_ALIAS[q];
//   if (_firstNameIndex === null || _firstNameIndexLen !== DATA.length) _buildFirstNameIndex();
//   const m = _firstNameIndex[q.toLowerCase()];
//   return (m && m.length === 1) ? m[0] : null;  // si es ambiguo, no adivina
// }
function canonicalOwnerFor(qaBy) {
  return resolveQAReviewerIdentity(
    qaBy,
    DATA
  ).canonicalName;
}
function getQAReviewerDisplayName(
  qaBy,
  data = DATA
) {
  return resolveQAReviewerIdentity(
    qaBy,
    data
  ).displayName;
}

function ownerMatchesQaBy(ownerName, qaBy) {
  return canonicalOwnerFor(qaBy) === ownerName;
}

// Voltea una owner-card entre la cara de owner y la cara de QA reviews.
function toggleCardFlip(event, cardEl) {
  if (event) event.stopPropagation();
  if (!cardEl) return;
  const flipped = cardEl.getAttribute('data-flipped') === 'true';
  cardEl.setAttribute('data-flipped', String(!flipped));
}
let analyticsSubTab            = 'cases';
let analyticsVolGranularity    = 'day';
let analyticsVolChartType      = 'bar';
let analyticsErrGranularity    = 'day';
let analyticsErrChartType      = 'bar';
let analyticsSelectedMember    = null;
let analyticsErrSelectedMember = null;
let analyticsErrTeam           = 'general';

const ERR_TEAMS = {
  general: { label: 'Team General',    members: null },
  it:      { label: 'IT Team',         members: ['Nicole Gongora','Mikaela Cardenas','Jorge Loza','Dylan Jitton','Paulo Tintaya','Nestor Apaza','Sebastian Salazar','Jesus Macedo'] },
  rangers: { label: 'Web Rangers',     members: ['Diego Delgadillo','Javier Callejas','Romel Pinto','Michael Luna','Kattya Torrez'] },
  sin:     { label: 'Sin Nombre',      members: ['Diego Torrez','Gustavo Pillco','Richard Villalba','Ariel Vargas'] },
  slim:    { label: 'The Slim Shadys', members: ['Luis Ajhuacho','Cidar Dealencar','Ignacio Lizarazu','Ambar Rojas'] },
};

function getErrTeamData() {
  const members = ERR_TEAMS[analyticsErrTeam]?.members;
  return members ? DATA.filter(x => members.includes(x.owner)) : DATA;
}

function setErrTeam(key) {
  analyticsErrTeam = key;
  renderErrTeamFilterUI();
  renderErrTeamStats();
  renderErrTeamChart();
}

function renderErrTeamFilterUI() {
  const el = document.getElementById('analytics-err-team-filter');
  if (!el) return;
  el.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;">
    ${Object.entries(ERR_TEAMS).map(([key, t]) =>
      `<button class="atoggle-err${analyticsErrTeam === key ? ' active' : ''}" onclick="setErrTeam('${key}')">${t.label}</button>`
    ).join('')}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — SUB-TAB SWITCHER
// ─────────────────────────────────────────────────────────────
function setAnalyticsSubTab(tab) {
  analyticsSubTab = tab;
  document.querySelectorAll('.asub').forEach(b => b.classList.toggle('active', b.dataset.sub === tab));
  document.getElementById('analytics-sub-cases').style.display  = tab === 'cases'  ? '' : 'none';
  document.getElementById('analytics-sub-errors').style.display = tab === 'errors' ? '' : 'none';
  if (tab === 'cases') {
    renderTeamStats();
    renderVolChart();
    renderCompletedChart();
    renderAnalyticsMemberFilter();
    if (analyticsSelectedMember) { renderMemberStats(); renderCasesMemberErrorChart(); renderMemberReviewerChart(); }
  } else {
    renderErrTeamFilterUI();
    renderErrTeamStats();
    renderErrTeamChart();
    renderErrMemberFilter();
    if (analyticsErrSelectedMember) { renderErrMemberStats(); renderMemberErrorChart(); }
  }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — CASES SUB-TAB TOGGLES
// ─────────────────────────────────────────────────────────────
function renderCasesMemberErrorChart() {
  renderMemberErrorChart({
    member:      analyticsSelectedMember,
    gran:        analyticsVolGranularity,
    chartType:   analyticsVolChartType,
    targetId:    'analytics-cases-member-error',
    errRateMode: false,
  });
}

function setVolChartType(type) {
  analyticsVolChartType = type;
  document.querySelectorAll('.atype').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  renderVolChart();
  renderCompletedChart();
  if (analyticsSelectedMember) { renderCasesMemberErrorChart(); renderMemberReviewerChart(); }
}

function setVolGranularity(gran) {
  analyticsVolGranularity = gran;
  document.querySelectorAll('.atoggle').forEach(b => b.classList.toggle('active', b.dataset.gran === gran));
  renderVolChart();
  renderCompletedChart();
  if (analyticsSelectedMember) { renderMemberStats(); renderCasesMemberErrorChart(); renderMemberReviewerChart(); }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — ERROR SUB-TAB TOGGLES
// ─────────────────────────────────────────────────────────────
function setErrChartType(type) {
  analyticsErrChartType = type;
  document.querySelectorAll('.atype-err').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  renderErrTeamStats();
  renderErrTeamChart();
  if (analyticsErrSelectedMember) renderMemberErrorChart();
}

function setErrGranularity(gran) {
  analyticsErrGranularity = gran;
  document.querySelectorAll('.atoggle-err').forEach(b => b.classList.toggle('active', b.dataset.gran === gran));
  renderErrTeamStats();
  renderErrTeamChart();
  if (analyticsErrSelectedMember) { renderErrMemberStats(); renderMemberErrorChart(); }
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
  if (dayStr.split('/').length !== 3) return dayStr;
  const date = parseMDY(dayStr);
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
      return parseMDY(k);
    };
    return parse(a) - parse(b);
  });
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — CHART HELPERS
// ─────────────────────────────────────────────────────────────
function getAllWorkingDays(firstKey, lastKey) {
  const toKey = d =>
    `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
  const first = parseMDY(firstKey), last = parseMDY(lastKey);
  const days = [];
  const cur = new Date(first);
  let guard = 0;
  while (cur <= last) {
    if (++guard > 5000) {
      console.warn('[getAllWorkingDays] rango de fechas anómalo, abortando loop:', firstKey, '→', lastKey);
      break;
    }
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
    return parseMDY(k);
  };
  const fmt = d => gran === 'month'
    ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const first = parseKey(periods[0]);
  const last  = parseKey(periods[periods.length - 1]);
  return periods.length === 1 ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — TEAM STATS STRIP
// ─────────────────────────────────────────────────────────────
function renderTeamStats() {
  const el = document.getElementById('analytics-team-stats');
  if (!el) return;

  if (!DATA.length) { el.innerHTML = ''; return; }

  const total       = DATA.length;
  const passed      = count(DATA, x => x.status === 'Passed');
  const opportunity = count(DATA, x => x.status === 'Opportunity');
  const failed      = count(DATA, x => x.status === 'Failed');
  const critical    = count(DATA, x => x.status === 'Critical');

  el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;">
    <div class="analytics-stat-mini">
      <div class="analytics-stat-label">Total Cases</div>
      <div class="analytics-stat-val">${total}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--passed)">
      <div class="analytics-stat-label">Passed Cases</div>
      <div class="analytics-stat-val" style="color:var(--passed);">${passed}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--observed)">
      <div class="analytics-stat-label">Opportunity Cases</div>
      <div class="analytics-stat-val" style="color:var(--observed);">${opportunity}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--failed)">
      <div class="analytics-stat-label">Failed Cases</div>
      <div class="analytics-stat-val" style="color:var(--failed);">${failed}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--critical)">
      <div class="analytics-stat-label">Critical Cases</div>
      <div class="analytics-stat-val" style="color:var(--critical);">${critical}</div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — TEAM VOLUME CHART
// ─────────────────────────────────────────────────────────────
function renderVolChart() {
  const gran    = analyticsVolGranularity;
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

  if (analyticsVolChartType === 'bar') {
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
// ANALYTICS — TEAM COMPLETED CHART (Date column)
// ─────────────────────────────────────────────────────────────
function renderCompletedChart() {
  const el = document.getElementById('analytics-completed-chart');
  if (!el) return;

  if (!window._hasDateColumn) {
    el.innerHTML = '';
    return;
  }

  const gran       = analyticsVolGranularity;
  const datedCases = DATA.filter(x => x.completed_date);

  if (!datedCases.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:24px;text-align:center;">No completion date data.</div>';
    return;
  }

  const actualPeriods = [...new Set(datedCases.map(x => getPeriodKey(x.completed_date, gran)))]
    .sort((a, b) => {
      if (gran === 'day') { const pa = parseMDY(a), pb = parseMDY(b); return pa && pb ? pa - pb : 0; }
      return a < b ? -1 : a > b ? 1 : 0;
    });

  const periods = (gran === 'day' && actualPeriods.length >= 2)
    ? getAllWorkingDays(actualPeriods[0], actualPeriods[actualPeriods.length - 1])
    : actualPeriods;

  const toCanon = k => { const [mo,dy,yy]=k.split('/'); return `${mo.padStart(2,'0')}/${dy.padStart(2,'0')}/${yy}`; };

  const dataLookup = new Map();
  actualPeriods.forEach(p => {
    const key   = gran === 'day' ? toCanon(p) : p;
    const cases = datedCases.filter(x => getPeriodKey(x.completed_date, gran) === p);
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

  const yMid = (pad.top + chartH / 2).toFixed(1);
  let leftContent = `<text x="12" y="${yMid}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace" transform="rotate(-90 12 ${yMid})">Cases</text>`;
  for (let i = 0; i <= 4; i++) {
    const y   = pad.top + (i / 4) * chartH;
    const val = Math.round(maxTotal * (1 - i / 4));
    leftContent += `<text x="${leftW-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-family="Space Mono,monospace">${val}</text>`;
  }

  let rightGrid = '';
  const gridX1 = startPad.toFixed(1);
  const gridX2 = (chartBodyW - rightPad).toFixed(1);
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    rightGrid += `<line x1="${gridX1}" y1="${y}" x2="${gridX2}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
  }

  const xTitle = `<text x="${((startPad + chartBodyW - rightPad) / 2).toFixed(1)}" y="${H-8}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace">Period</text>`;
  if (!window._chartTips) window._chartTips = {};

  const header = `<div style="font-size:.72rem;color:var(--text);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;">Cases Completed Over Time</div>`;
  const legend = `<div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap;">${['Critical','Failed','Opportunity','Passed'].map(s=>`<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:${STATUS_COLORS[s]};display:inline-block;"></span>${s}</span>`).join('')}</div>`;
  const footer = `<div style="font-size:.63rem;color:var(--muted);margin-top:4px;font-family:'Space Mono',monospace;">Cases grouped by owner completion date (Date column)</div>`;

  let rightContent = '', xLbls = '';

  if (analyticsVolChartType === 'bar') {
    periodData.forEach((pd, i) => {
      const bx  = cx(i) - barW / 2;
      const key = `comp_${i}`;
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

    el.innerHTML = `${header}
      <div style="display:flex;align-items:stretch;overflow:hidden;">
        <svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg>
        <div class="completed-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;">
          <svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${rightContent}${xLbls}${xTitle}</svg>
        </div>
      </div>${legend}${footer}`;

  } else {
    let linePts = [], areaPts = [], dots = '', labels = '';
    periodData.forEach((pd, i) => {
      const x = cx(i).toFixed(1);
      const y = yS(pd.total).toFixed(1);
      const key = `comp_${i}`;
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

    el.innerHTML = `${header}
      <div style="display:flex;align-items:stretch;overflow:hidden;">
        <svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg>
        <div class="completed-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;">
          <svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${areaFull ? `<polygon points="${areaFull}" fill="var(--passed)" opacity="0.08"/>` : ''}${linePts.length > 1 ? `<polyline points="${linePts.join(' ')}" fill="none" stroke="var(--passed)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${labels}${dots}${xLbls}${xTitle}</svg>
        </div>
      </div>${legend}${footer}`;
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
  document.getElementById('analytics-person-dropdown')?.classList.remove('open');
  document.getElementById('analytics-person-btn')?.classList.remove('open');
  renderAnalyticsMemberFilter();
  renderMemberStats();
  renderCasesMemberErrorChart();
  renderMemberReviewerChart();
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — MEMBER MINI STATS
// ─────────────────────────────────────────────────────────────
function renderMemberStats() {
  const el = document.getElementById('analytics-member-stats');
  if (!el || !analyticsSelectedMember) return;

  const ownCases = DATA.filter(x => x.owner === analyticsSelectedMember);
  const reviewed = DATA.filter(x => ownerMatchesQaBy(analyticsSelectedMember, x.qa_by));
  const total    = ownCases.length;
  const critical    = count(ownCases, x => x.status === 'Critical');
  const failed      = count(ownCases, x => x.status === 'Failed');
  const passed      = count(ownCases, x => x.status === 'Passed');
  const opportunity = count(ownCases, x => x.status === 'Opportunity');

  el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;">
    <div class="analytics-stat-mini">
      <div class="analytics-stat-label">Total Cases</div>
      <div class="analytics-stat-val">${total}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--passed)">
      <div class="analytics-stat-label">Passed Cases</div>
      <div class="analytics-stat-val" style="color:var(--passed);">${passed}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--observed)">
      <div class="analytics-stat-label">Opportunity Cases</div>
      <div class="analytics-stat-val" style="color:var(--observed);">${opportunity}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--failed)">
      <div class="analytics-stat-label">Failed Cases</div>
      <div class="analytics-stat-val" style="color:var(--failed);">${failed}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--critical)">
      <div class="analytics-stat-label">Critical Cases</div>
      <div class="analytics-stat-val" style="color:var(--critical);">${critical}</div>
    </div>
    <div class="analytics-stat-mini" style="border-color:var(--accent2)">
      <div class="analytics-stat-label">QA Reviews Done</div>
      <div class="analytics-stat-val" style="color:var(--accent2);">${reviewed.length}</div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — CHART B: ERROR RATE TREND (own cases)
// opts: { member, gran, chartType, targetId }  — all optional, defaults to Errors sub-tab vars
// ─────────────────────────────────────────────────────────────
function renderMemberErrorChart(opts = {}) {
  const member      = opts.member      ?? analyticsErrSelectedMember;
  const gran        = opts.gran        ?? analyticsErrGranularity;
  const chartType   = opts.chartType   ?? analyticsErrChartType;
  const targetId    = opts.targetId    ?? 'analytics-member-error';
  const errRateMode = opts.errRateMode ?? true;

  const el = document.getElementById(targetId);
  if (!el || !member) return;

  const ownCases = DATA.filter(x => x.owner === member);

  // Requires the "Date" column = date the OWNER completed the case
  if (!window._hasDateColumn) {
    el.innerHTML = '<div style="color:var(--observed);font-size:.78rem;line-height:1.5;padding:16px;border:1px solid var(--border);border-radius:8px;">⚠ This chart needs the <strong>"Date"</strong> column (the date the owner completed the case). Please re-upload a CSV that includes it.</div>';
    return;
  }

  const datedCases = ownCases.filter(x => x.completed_date);
  if (!datedCases.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;">No completion-date data for this member.</div>';
    return;
  }

  // Periods built from completed_date (owner completion), NOT QA date
  const actualPeriods = [...new Set(datedCases.map(x => getPeriodKey(x.completed_date, gran)))]
    .filter(Boolean)
    .sort((a, b) => {
      const parse = k => {
        if (gran === 'month') { const [yr, mo] = k.split('-'); return new Date(parseInt(yr), parseInt(mo)-1, 1); }
        return parseMDY(k);
      };
      return parse(a) - parse(b);
    });

  const periods = (gran === 'day' && actualPeriods.length >= 2)
    ? getAllWorkingDays(actualPeriods[0], actualPeriods[actualPeriods.length - 1])
    : actualPeriods;

  const toCanon = k => { const [mo,dy,yy]=k.split('/'); return `${mo.padStart(2,'0')}/${dy.padStart(2,'0')}/${yy}`; };

  const dataLookup = new Map();
  actualPeriods.forEach(p => {
    const key   = gran === 'day' ? toCanon(p) : p;
    const cases = datedCases.filter(x => getPeriodKey(x.completed_date, gran) === p);
    const passed      = count(cases, x => x.status === 'Passed');
    const opportunity = count(cases, x => x.status === 'Opportunity');
    const failed      = count(cases, x => x.status === 'Failed');
    const critical    = count(cases, x => x.status === 'Critical');
    const errs        = failed + critical;
    const rate        = cases.length > 0 ? Math.round(errs / cases.length * 100) : 0;
    dataLookup.set(key, {
      label: gran === 'day' ? toCanon(p).slice(0, 5) : formatPeriodKey(p, gran),
      total: cases.length, passed, opportunity, failed, critical, errs, rate
    });
  });

  const periodData = periods.map(p =>
    dataLookup.get(p) || { label: gran === 'day' ? p.slice(0, 5) : p, total: 0, passed: 0, opportunity: 0, failed: 0, critical: 0, errs: 0, rate: 0 }
  );

  // Trend badge (still based on error rate, computed behind the scenes)
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
  const cx       = i => startPad + i * barGap;
  const errCol   = r => r === 0 ? 'var(--passed)' : r > 30 ? 'var(--critical)' : r > 15 ? 'var(--failed)' : 'var(--observed)';
  const gridX1   = startPad.toFixed(1);
  const gridX2   = (chartBodyW - rightPad).toFixed(1);
  const xTitle   = `<text x="${((startPad + chartBodyW - rightPad) / 2).toFixed(1)}" y="${H-8}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace">Period</text>`;
  if (!window._chartTips) window._chartTips = {};

  if (errRateMode) {
    // ── ERROR RATE MODE — y-axis = % ─────────────────────────
    const maxRate = Math.ceil(Math.max(...periodData.map(p => p.rate), 10) / 10) * 10;
    const yS = v => pad.top + chartH - (v / maxRate) * chartH;

    const yMid = (pad.top + chartH / 2).toFixed(1);
    let leftContent = `<text x="12" y="${yMid}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace" transform="rotate(-90 12 ${yMid})">Error %</text>`;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * chartH;
      leftContent += `<text x="${leftW-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-family="Space Mono,monospace">${Math.round(maxRate * (1 - i / 4))}%</text>`;
    }
    let rightGrid = '';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * chartH;
      rightGrid += `<line x1="${gridX1}" y1="${y}" x2="${gridX2}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
    }

    const header = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;"><div style="font-size:.72rem;color:var(--muted);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Error Rate Over Time — ${member}</div>${trendHtml}</div>`;
    const footer = `<div style="font-size:.63rem;color:var(--muted);margin-top:4px;font-family:'Space Mono',monospace;">(Failed + Critical) / Total · by owner completion date</div>`;
    const legend = `<div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap;">${[['var(--passed)','0% — Clean'],['var(--observed)','1–15%'],['var(--failed)','16–30%'],['var(--critical)','>30%']].map(([c,l])=>`<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:${c};display:inline-block;"></span>${l}</span>`).join('')}</div>`;

    let rightContent = '', xLbls = '';
    if (chartType === 'line') {
      let linePts = [], dots = '', labels = '';
      periodData.forEach((pd, i) => {
        const x = cx(i).toFixed(1), y = yS(pd.rate).toFixed(1), key = `err_${i}`;
        window._chartTips[key] = _rateTipHtml(pd);
        linePts.push(`${x},${y}`);
        const col = errCol(pd.rate);
        dots += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><circle cx="${x}" cy="${y}" r="12" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="1.5"/></g>`;
        if (pd.total > 0) labels += `<text x="${x}" y="${(parseFloat(y)-9).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.rate}%</text>`;
        const ty = (H-54).toFixed(1);
        xLbls += `<text x="${x}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${x} ${ty})">${pd.label}</text>`;
      });
      const areaFull = linePts.length > 0 ? [`${cx(0).toFixed(1)},${(pad.top+chartH).toFixed(1)}`, ...linePts, `${cx(periodData.length-1).toFixed(1)},${(pad.top+chartH).toFixed(1)}`].join(' ') : '';
      el.innerHTML = `${header}<div style="display:flex;align-items:stretch;overflow:hidden;"><svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg><div class="err-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;"><svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${areaFull?`<polygon points="${areaFull}" fill="var(--critical)" opacity="0.07"/>`:''}${linePts.length>1?`<polyline points="${linePts.join(' ')}" fill="none" stroke="var(--critical)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`:''}${labels}${dots}${xLbls}${xTitle}</svg></div></div>${legend}${footer}`;
    } else {
      periodData.forEach((pd, i) => {
        const bx = cx(i) - barW / 2, key = `err_${i}`;
        window._chartTips[key] = _rateTipHtml(pd);
        const col = errCol(pd.rate);
        if (pd.total > 0) {
          const h = Math.max(3, (pd.rate / maxRate) * chartH);
          const yTop = pad.top + chartH - h;
          rightContent += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><rect x="${bx.toFixed(1)}" y="${pad.top}" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/><rect x="${bx.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" rx="2" opacity="0.85"/><text x="${cx(i).toFixed(1)}" y="${(yTop-4).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.rate}%</text></g>`;
        } else {
          rightContent += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><rect x="${bx.toFixed(1)}" y="${pad.top}" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/></g>`;
        }
        const tx = cx(i).toFixed(1), ty = (H-54).toFixed(1);
        xLbls += `<text x="${tx}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${tx} ${ty})">${pd.label}</text>`;
      });
      el.innerHTML = `${header}<div style="display:flex;align-items:stretch;overflow:hidden;"><svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg><div class="err-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;"><svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${rightContent}${xLbls}${xTitle}</svg></div></div>${legend}${footer}`;
    }

  } else {
    // ── CASES OUTCOMES MODE — y-axis = count ─────────────────
    const maxTotal = Math.max(...periodData.map(p => p.total), 1);
    const yS = v => pad.top + chartH - (v / maxTotal) * chartH;

    const yMid = (pad.top + chartH / 2).toFixed(1);
    let leftContent = `<text x="12" y="${yMid}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace" transform="rotate(-90 12 ${yMid})">Cases</text>`;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * chartH;
      leftContent += `<text x="${leftW-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-family="Space Mono,monospace">${Math.round(maxTotal * (1 - i / 4))}</text>`;
    }
    let rightGrid = '';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * chartH;
      rightGrid += `<line x1="${gridX1}" y1="${y}" x2="${gridX2}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
    }

    const header = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;"><div style="font-size:.72rem;color:var(--muted);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Case Outcomes Over Time — ${member}</div>${trendHtml}</div>`;
    const footer = `<div style="font-size:.63rem;color:var(--muted);margin-top:4px;font-family:'Space Mono',monospace;">Cases completed by owner, classified by QA outcome</div>`;
    const legend = `<div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap;">${['Critical','Failed','Opportunity','Passed'].map(s=>`<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:${STATUS_COLORS[s]};display:inline-block;"></span>${s}</span>`).join('')}</div>`;

    let rightContent = '', xLbls = '';
    if (chartType === 'line') {
      let linePts = [], areaPts = [], dots = '', labels = '';
      periodData.forEach((pd, i) => {
        const x = cx(i).toFixed(1), y = yS(pd.total).toFixed(1), key = `err_${i}`;
        window._chartTips[key] = _statusTipHtml(pd);
        linePts.push(`${x},${y}`); areaPts.push(`${x},${y}`);
        const col = pd.rate === 0 ? 'var(--passed)' : pd.rate > 30 ? 'var(--critical)' : pd.rate > 15 ? 'var(--failed)' : 'var(--observed)';
        dots += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><circle cx="${x}" cy="${y}" r="12" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="1.5"/></g>`;
        if (pd.total > 0) labels += `<text x="${x}" y="${(parseFloat(y)-9).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.total}</text>`;
        const ty = (H-54).toFixed(1);
        xLbls += `<text x="${x}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${x} ${ty})">${pd.label}</text>`;
      });
      const areaFull = linePts.length > 0 ? [`${cx(0).toFixed(1)},${(pad.top+chartH).toFixed(1)}`, ...areaPts, `${cx(periodData.length-1).toFixed(1)},${(pad.top+chartH).toFixed(1)}`].join(' ') : '';
      el.innerHTML = `${header}<div style="display:flex;align-items:stretch;overflow:hidden;"><svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg><div class="cases-member-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;"><svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${areaFull?`<polygon points="${areaFull}" fill="var(--accent)" opacity="0.08"/>`:''}${linePts.length>1?`<polyline points="${linePts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`:''}${labels}${dots}${xLbls}${xTitle}</svg></div></div>${legend}${footer}`;
    } else {
      periodData.forEach((pd, i) => {
        const bx = cx(i) - barW / 2, key = `err_${i}`;
        window._chartTips[key] = _statusTipHtml(pd);
        const segs = [{val:pd.critical,color:'var(--critical)'},{val:pd.failed,color:'var(--failed)'},{val:pd.opportunity,color:'var(--observed)'},{val:pd.passed,color:'var(--passed)'}];
        let yOff = pad.top + chartH, topY = pad.top + chartH, barRects = '';
        segs.forEach(s => { if (!s.val) return; const h=Math.max(3,(s.val/maxTotal)*chartH); yOff-=h; topY=yOff; barRects+=`<rect x="${bx.toFixed(1)}" y="${yOff.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" rx="1"/>`;});
        const lbl = pd.total>0 ? `<text x="${cx(i).toFixed(1)}" y="${(topY-4).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.total}</text>` : '';
        rightContent += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><rect x="${bx.toFixed(1)}" y="${pad.top}" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/>${barRects}${lbl}</g>`;
        const tx = cx(i).toFixed(1), ty = (H-54).toFixed(1);
        xLbls += `<text x="${tx}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${tx} ${ty})">${pd.label}</text>`;
      });
      el.innerHTML = `${header}<div style="display:flex;align-items:stretch;overflow:hidden;"><svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg><div class="cases-member-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;"><svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${rightContent}${xLbls}${xTitle}</svg></div></div>${legend}${footer}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — CHART A: REVIEWER ACTIVITY
// ─────────────────────────────────────────────────────────────
function renderMemberReviewerChart() {
  const el = document.getElementById('analytics-member-reviewer');
  if (!el || !analyticsSelectedMember) return;

  const gran     = analyticsVolGranularity;
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

  if (analyticsVolChartType === 'bar') {
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
// ANALYTICS — ERROR SUB-TAB: TEAM STATS STRIP
// ─────────────────────────────────────────────────────────────
function showTeamTrendInfo(event) {
  if (window._trendTeamInfoRows) showInfoPopup(event, 'Error Rate Trend', window._trendTeamInfoRows);
}

function renderErrTeamStats() {
  const el = document.getElementById('analytics-err-team-stats');
  if (!el) return;

  if (!DATA.length || !window._hasDateColumn) { el.innerHTML = ''; return; }

  const gran       = analyticsErrGranularity;
  const datedCases = getErrTeamData().filter(x => x.completed_date);
  if (!datedCases.length) { el.innerHTML = ''; return; }

  const total   = datedCases.length;
  const errors  = count(datedCases, x => x.status === 'Failed' || x.status === 'Critical');
  const errRate = total > 0 ? Math.round(errors / total * 100) : 0;

  const actualPeriods = [...new Set(datedCases.map(x => getPeriodKey(x.completed_date, gran)))]
    .filter(Boolean)
    .sort((a, b) => {
      const parse = k => { if (gran === 'month') { const [yr,mo]=k.split('-'); return new Date(+yr,+mo-1,1); } return parseMDY(k); };
      return parse(a) - parse(b);
    });

  const rates = actualPeriods.map(p => {
    const cases = datedCases.filter(x => getPeriodKey(x.completed_date, gran) === p);
    return cases.length > 0 ? count(cases, x => x.status === 'Failed' || x.status === 'Critical') / cases.length * 100 : 0;
  });

  let trendEl = '';
  if (rates.length >= 4) {
    const slope    = calcLinearSlope(rates);
    const unit     = gran === 'day' ? 'day' : gran === 'week' ? 'wk' : 'mo';
    const slopeStr = (slope >= 0 ? '+' : '') + slope.toFixed(2) + '%/' + unit;

    let trendLabel, trendColor, trendCls;
    if      (slope < -1.0) { trendLabel = '↓ Improving';          trendColor = 'var(--passed)';   trendCls = 'info-popup-ok';   }
    else if (slope < -0.3) { trendLabel = '↓ Slight improvement'; trendColor = 'var(--passed)';   trendCls = 'info-popup-ok';   }
    else if (slope <= 0.3) { trendLabel = '→ Stable';             trendColor = 'var(--muted)';    trendCls = '';                }
    else if (slope <= 1.0) { trendLabel = '↑ Watch';              trendColor = 'var(--observed)'; trendCls = 'info-popup-warn'; }
    else                   { trendLabel = '↑ Worsening';          trendColor = 'var(--critical)'; trendCls = 'info-popup-risk'; }

    window._trendTeamInfoRows = [
      ['Current slope',    slopeStr,                  trendCls],
      ['Periods analyzed', `${rates.length}`,         ''],
      ['Fits a straight line through all team error rates over time. A negative slope means the error rate is falling on average across all periods.', '', 'info-popup-threshold'],
      ['↓ Improving',          '< −1.0%/period',  'info-popup-ok'],
      ['↓ Slight improvement', '−1.0% to −0.3%',  'info-popup-ok'],
      ['→ Stable',             '−0.3% to +0.3%',  ''],
      ['↑ Watch',              '+0.3% to +1.0%',  'info-popup-warn'],
      ['↑ Worsening',          '> +1.0%/period',  'info-popup-risk'],
      ['Requires at least 4 periods with data.', '', 'info-popup-threshold'],
    ];

    trendEl = `<div class="analytics-stat-mini" style="border-color:${trendColor}">
      <div class="analytics-stat-label" style="display:flex;align-items:center;gap:5px;">Trend <span class="info-icon" onclick="showTeamTrendInfo(event)">ℹ</span></div>
      <div class="analytics-stat-val" style="color:${trendColor};">${trendLabel}</div>
      <div style="font-size:.6rem;color:var(--muted);font-family:'Space Mono',monospace;margin-top:3px;">${slopeStr}</div>
    </div>`;
  } else if (actualPeriods.length > 0) {
    window._trendTeamInfoRows = [
      ['Requires at least 4 periods with data to calculate a reliable linear regression trend.', '', 'info-popup-threshold'],
      ['Periods found', `${actualPeriods.length}`, 'info-popup-warn'],
    ];
    trendEl = `<div class="analytics-stat-mini">
      <div class="analytics-stat-label" style="display:flex;align-items:center;gap:5px;">Trend <span class="info-icon" onclick="showTeamTrendInfo(event)">ℹ</span></div>
      <div class="analytics-stat-val" style="color:var(--muted);font-size:.72rem;">Not enough data</div>
      <div style="font-size:.6rem;color:var(--muted);font-family:'Space Mono',monospace;margin-top:3px;">Min. 4 periods</div>
    </div>`;
  }

  const errColor = errRate > 10 ? 'var(--critical)' : errRate > 5 ? 'var(--observed)' : 'var(--passed)';
  el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;">
    <div class="analytics-stat-mini" style="border-color:${errColor}">
      <div class="analytics-stat-label">Overall Error Rate</div>
      <div class="analytics-stat-val" style="color:${errColor};">${errRate}%</div>
    </div>
    ${trendEl}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — ERROR SUB-TAB: TEAM CHART
// ─────────────────────────────────────────────────────────────
function renderErrTeamChart() {
  const el      = document.getElementById('analytics-err-team-chart');
  const rangeEl = document.getElementById('analytics-err-range');
  if (!el) return;

  if (!window._hasDateColumn) {
    el.innerHTML = '<div style="color:var(--observed);font-size:.78rem;line-height:1.5;padding:16px;border:1px solid var(--border);border-radius:8px;">⚠ This chart needs the <strong>"Date"</strong> column (the date the owner completed the case). Please re-upload a CSV that includes it.</div>';
    if (rangeEl) rangeEl.textContent = '';
    return;
  }

  const gran       = analyticsErrGranularity;
  const datedCases = getErrTeamData().filter(x => x.completed_date);
  if (!datedCases.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:16px;">No completion-date data found.</div>';
    return;
  }

  const toCanon = k => { const [mo,dy,yy]=k.split('/'); return `${mo.padStart(2,'0')}/${dy.padStart(2,'0')}/${yy}`; };

  const actualPeriods = [...new Set(datedCases.map(x => getPeriodKey(x.completed_date, gran)))]
    .filter(Boolean)
    .sort((a, b) => {
      const parse = k => { if (gran==='month') { const [yr,mo]=k.split('-'); return new Date(+yr,+mo-1,1); } return parseMDY(k); };
      return parse(a) - parse(b);
    });

  const periods = (gran === 'day' && actualPeriods.length >= 2)
    ? getAllWorkingDays(actualPeriods[0], actualPeriods[actualPeriods.length-1])
    : actualPeriods;

  const dataLookup = new Map();
  actualPeriods.forEach(p => {
    const key   = gran === 'day' ? toCanon(p) : p;
    const cases = datedCases.filter(x => getPeriodKey(x.completed_date, gran) === p);
    const passed = count(cases, x => x.status === 'Passed');
    const opportunity = count(cases, x => x.status === 'Opportunity');
    const failed  = count(cases, x => x.status === 'Failed');
    const critical = count(cases, x => x.status === 'Critical');
    const errs = failed + critical;
    dataLookup.set(key, {
      label: gran === 'day' ? toCanon(p).slice(0,5) : formatPeriodKey(p, gran),
      total: cases.length, passed, opportunity, failed, critical,
      errs, rate: cases.length > 0 ? Math.round(errs / cases.length * 100) : 0
    });
  });

  const periodData = periods.map(p =>
    dataLookup.get(p) || { label: gran==='day' ? p.slice(0,5) : p, total:0, passed:0, opportunity:0, failed:0, critical:0, errs:0, rate:0 }
  );

  if (rangeEl) rangeEl.textContent = formatAnalyticsDateRange(actualPeriods, gran);

  // Y-axis: error rate % — scale to next 10% ceiling (min 10%)
  const maxRate = Math.ceil(Math.max(...periodData.map(p => p.rate), 10) / 10) * 10;
  const H=290, pad={top:20,bottom:80}, chartH=H-pad.top-pad.bottom, leftW=64, rightPad=20;
  let barGap, barW, startPad, chartBodyW;
  if (gran === 'day') {
    barGap=50; barW=28; startPad=barGap/2;
    chartBodyW = Math.max(startPad + periods.length*barGap + rightPad, 300);
  } else {
    const containerW = Math.max((el.clientWidth || 900) - leftW, 300);
    barGap = containerW / Math.max(periods.length,1);
    barW   = Math.min(barGap*0.5, gran==='week' ? 60 : 80);
    startPad = barGap/2; chartBodyW = containerW;
  }
  const cx     = i => startPad + i*barGap;
  const yS     = v => pad.top + chartH - (v / maxRate) * chartH;
  const errCol = r => r === 0 ? 'var(--passed)' : r > 30 ? 'var(--critical)' : r > 15 ? 'var(--failed)' : 'var(--observed)';

  const yMid = (pad.top + chartH/2).toFixed(1);
  let leftContent = `<text x="12" y="${yMid}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace" transform="rotate(-90 12 ${yMid})">Error %</text>`;
  for (let i=0; i<=4; i++) {
    const y = pad.top + (i/4)*chartH;
    leftContent += `<text x="${leftW-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-family="Space Mono,monospace">${Math.round(maxRate*(1-i/4))}%</text>`;
  }

  let rightGrid = '';
  for (let i=0; i<=4; i++) {
    const y = pad.top + (i/4)*chartH;
    rightGrid += `<line x1="${startPad.toFixed(1)}" y1="${y}" x2="${(chartBodyW-rightPad).toFixed(1)}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
  }
  const xTitle = `<text x="${((startPad+chartBodyW-rightPad)/2).toFixed(1)}" y="${H-8}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="10" font-family="Space Mono,monospace">Period</text>`;
  if (!window._chartTips) window._chartTips = {};

  const legend = `<div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap;">${[['var(--passed)','0% — Clean'],['var(--observed)','1–15%'],['var(--failed)','16–30%'],['var(--critical)','>30%']].map(([c,l])=>`<span style="font-size:.68rem;display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:${c};display:inline-block;"></span>${l}</span>`).join('')}</div>`;
  const footer = `<div style="font-size:.63rem;color:var(--muted);margin-top:4px;font-family:'Space Mono',monospace;">(Failed + Critical) / Total · grouped by owner completion date</div>`;

  let rightContent = '', xLbls = '';

  if (analyticsErrChartType === 'bar') {
    periodData.forEach((pd, i) => {
      const bx = cx(i) - barW/2, key = `eteam_${i}`;
      window._chartTips[key] = _rateTipHtml(pd);
      const col = errCol(pd.rate);
      if (pd.total > 0) {
        const h = Math.max(3, (pd.rate / maxRate) * chartH);
        const yTop = pad.top + chartH - h;
        rightContent += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><rect x="${bx.toFixed(1)}" y="${pad.top}" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/><rect x="${bx.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" rx="2" opacity="0.85"/><text x="${cx(i).toFixed(1)}" y="${(yTop-4).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.rate}%</text></g>`;
      } else {
        rightContent += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><rect x="${bx.toFixed(1)}" y="${pad.top}" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/></g>`;
      }
      const tx=cx(i).toFixed(1), ty=(H-54).toFixed(1);
      xLbls += `<text x="${tx}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${tx} ${ty})">${pd.label}</text>`;
    });
    el.innerHTML = `<div style="display:flex;align-items:stretch;overflow:hidden;"><svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg><div class="err-team-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;"><svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${rightContent}${xLbls}${xTitle}</svg></div></div>${legend}${footer}`;

  } else {
    let linePts=[], dots='', labels='';
    periodData.forEach((pd, i) => {
      const x=cx(i).toFixed(1), y=yS(pd.rate).toFixed(1), key=`eteam_${i}`;
      window._chartTips[key] = _rateTipHtml(pd);
      linePts.push(`${x},${y}`);
      const col = errCol(pd.rate);
      dots += `<g onmouseenter="showChartTip(event,window._chartTips['${key}'])" onmousemove="positionChartTip(event)" onmouseleave="hideChartTip()" style="cursor:pointer;"><circle cx="${x}" cy="${y}" r="12" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="1.5"/></g>`;
      if (pd.total>0) labels += `<text x="${x}" y="${(parseFloat(y)-9).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="Space Mono,monospace">${pd.rate}%</text>`;
      const ty=(H-54).toFixed(1);
      xLbls += `<text x="${x}" y="${ty}" text-anchor="end" fill="rgba(255,255,255,0.75)" font-size="9" font-family="Space Mono,monospace" transform="rotate(-40 ${x} ${ty})">${pd.label}</text>`;
    });
    const areaFull = linePts.length > 0 ? [`${cx(0).toFixed(1)},${(pad.top+chartH).toFixed(1)}`, ...linePts, `${cx(periodData.length-1).toFixed(1)},${(pad.top+chartH).toFixed(1)}`].join(' ') : '';
    el.innerHTML = `<div style="display:flex;align-items:stretch;overflow:hidden;"><svg width="${leftW}" height="${H}" viewBox="0 0 ${leftW} ${H}" style="flex-shrink:0;display:block;">${leftContent}</svg><div class="err-team-scroll" style="flex:1;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;"><svg width="${chartBodyW}" height="${H}" viewBox="0 0 ${chartBodyW} ${H}" style="display:block;">${rightGrid}${areaFull?`<polygon points="${areaFull}" fill="var(--critical)" opacity="0.07"/>`:''  }${linePts.length>1?`<polyline points="${linePts.join(' ')}" fill="none" stroke="var(--critical)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`:'' }${labels}${dots}${xLbls}${xTitle}</svg></div></div>${legend}${footer}`;
  }
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — ERROR SUB-TAB: MEMBER PERSON FILTER
// ─────────────────────────────────────────────────────────────
function renderErrMemberFilter(searchTerm = '') {
  const owners = [...new Set(DATA.map(x => x.owner))].sort();
  if (!analyticsErrSelectedMember || !owners.includes(analyticsErrSelectedMember)) {
    analyticsErrSelectedMember = owners[0] || null;
  }
  const container = document.getElementById('analytics-err-person-options');
  if (container) {
    const filtered = searchTerm ? owners.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase())) : owners;
    container.innerHTML = filtered.map(o => `
      <div class="filter-option${o === analyticsErrSelectedMember ? ' selected' : ''}"
           onclick="selectAnalyticsErrMember('${o}')">
        <div class="filter-checkbox"></div>
        <span class="filter-option-label">${o}</span>
      </div>`).join('');
  }
  const btn = document.getElementById('analytics-err-person-btn');
  if (btn) {
    btn.innerHTML = `👤 ${analyticsErrSelectedMember || 'Person'} <span class="filter-btn-arrow">▾</span>`;
    btn.classList.toggle('active', !!analyticsErrSelectedMember);
  }
}

function toggleAnalyticsErrPersonDropdown() {
  const dd  = document.getElementById('analytics-err-person-dropdown');
  const btn = document.getElementById('analytics-err-person-btn');
  if (!dd || !btn) return;
  const isOpen = dd.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  if (isOpen) {
    renderErrMemberFilter();
    setTimeout(() => dd.querySelector('input')?.focus(), 50);
  }
}

function searchAnalyticsErrPerson(val) { renderErrMemberFilter(val); }

function selectAnalyticsErrMember(name) {
  analyticsErrSelectedMember = name;
  document.getElementById('analytics-err-person-dropdown')?.classList.remove('open');
  document.getElementById('analytics-err-person-btn')?.classList.remove('open');
  renderErrMemberFilter();
  renderErrMemberStats();
  renderMemberErrorChart();
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — ERROR SUB-TAB: MEMBER MINI STATS
// ─────────────────────────────────────────────────────────────
function calcLinearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const sumX  = values.reduce((s, _, i) => s + i, 0);
  const sumY  = values.reduce((s, v)    => s + v, 0);
  const sumXY = values.reduce((s, v, i) => s + i * v, 0);
  const sumX2 = values.reduce((s, _, i) => s + i * i, 0);
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function showTrendInfo(event) {
  if (window._trendInfoRows) showInfoPopup(event, 'Error Rate Trend', window._trendInfoRows);
}

function renderErrMemberStats() {
  const el = document.getElementById('analytics-err-member-stats');
  if (!el || !analyticsErrSelectedMember) return;

  const gran     = analyticsErrGranularity;
  const ownCases = DATA.filter(x => x.owner === analyticsErrSelectedMember);
  const total    = ownCases.length;
  const errors   = count(ownCases, x => x.status === 'Failed' || x.status === 'Critical');
  const errRate  = total > 0 ? Math.round(errors / total * 100) : 0;

  const datedCases = ownCases.filter(x => x.completed_date);
  const periods = datedCases.length
    ? [...new Set(datedCases.map(x => getPeriodKey(x.completed_date, gran)))]
        .filter(Boolean)
        .sort((a, b) => {
          const parse = k => { if (gran==='month') { const [yr,mo]=k.split('-'); return new Date(+yr,+mo-1,1); } return parseMDY(k); };
          return parse(a) - parse(b);
        })
    : [];

  // Compute error rate per period for linear regression
  const rates = periods.map(p => {
    const cases = datedCases.filter(x => getPeriodKey(x.completed_date, gran) === p);
    return cases.length > 0 ? count(cases, x => x.status === 'Failed' || x.status === 'Critical') / cases.length * 100 : 0;
  });

  let trendEl = '';
  if (rates.length >= 4) {
    const slope    = calcLinearSlope(rates);
    const unit     = gran === 'day' ? 'day' : gran === 'week' ? 'wk' : 'mo';
    const slopeStr = (slope >= 0 ? '+' : '') + slope.toFixed(2) + '%/' + unit;

    let trendLabel, trendColor, trendCls;
    if      (slope < -1.0) { trendLabel = '↓ Improving';          trendColor = 'var(--passed)';   trendCls = 'info-popup-ok';   }
    else if (slope < -0.3) { trendLabel = '↓ Slight improvement'; trendColor = 'var(--passed)';   trendCls = 'info-popup-ok';   }
    else if (slope <= 0.3) { trendLabel = '→ Stable';             trendColor = 'var(--muted)';    trendCls = '';                }
    else if (slope <= 1.0) { trendLabel = '↑ Watch';              trendColor = 'var(--observed)'; trendCls = 'info-popup-warn'; }
    else                   { trendLabel = '↑ Worsening';          trendColor = 'var(--critical)'; trendCls = 'info-popup-risk'; }

    window._trendInfoRows = [
      ['Current slope',    slopeStr,           trendCls],
      ['Periods analyzed', `${rates.length}`,  ''],
      ['Fits a straight line through all error rates over time. A negative slope means the error rate is falling on average — not just comparing first vs last.', '', 'info-popup-threshold'],
      ['↓ Improving',          '< −1.0%/period',  'info-popup-ok'],
      ['↓ Slight improvement', '−1.0% to −0.3%',  'info-popup-ok'],
      ['→ Stable',             '−0.3% to +0.3%',  ''],
      ['↑ Watch',              '+0.3% to +1.0%',  'info-popup-warn'],
      ['↑ Worsening',          '> +1.0%/period',  'info-popup-risk'],
      ['Requires at least 4 periods with data.', '', 'info-popup-threshold'],
    ];

    trendEl = `<div class="analytics-stat-mini" style="border-color:${trendColor}">
      <div class="analytics-stat-label" style="display:flex;align-items:center;gap:5px;">Trend <span class="info-icon" onclick="showTrendInfo(event)">ℹ</span></div>
      <div class="analytics-stat-val" style="color:${trendColor};">${trendLabel}</div>
      <div style="font-size:.6rem;color:var(--muted);font-family:'Space Mono',monospace;margin-top:3px;">${slopeStr}</div>
    </div>`;
  } else if (periods.length > 0) {
    window._trendInfoRows = [
      ['Requires at least 4 periods with data to calculate a reliable linear regression trend.', '', 'info-popup-threshold'],
      ['Periods found', `${periods.length}`, 'info-popup-warn'],
    ];
    trendEl = `<div class="analytics-stat-mini">
      <div class="analytics-stat-label" style="display:flex;align-items:center;gap:5px;">Trend <span class="info-icon" onclick="showTrendInfo(event)">ℹ</span></div>
      <div class="analytics-stat-val" style="color:var(--muted);font-size:.72rem;">Not enough data</div>
      <div style="font-size:.6rem;color:var(--muted);font-family:'Space Mono',monospace;margin-top:3px;">Min. 4 periods</div>
    </div>`;
  }

  const errColor = errRate > 10 ? 'var(--critical)' : errRate > 5 ? 'var(--observed)' : 'var(--passed)';
  el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;">
    <div class="analytics-stat-mini" style="border-color:${errColor}"><div class="analytics-stat-label">Overall Error Rate</div><div class="analytics-stat-val" style="color:${errColor};">${errRate}%</div></div>
    ${trendEl}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS — MAIN RENDER
// ─────────────────────────────────────────────────────────────
function renderAnalytics() {
  if (!DATA.length) {
    const empty = '<div style="color:var(--muted);font-size:.78rem;padding:24px;text-align:center;">Upload a CSV to see analytics.</div>';
    ['analytics-team-stats','analytics-vol-chart','analytics-completed-chart','analytics-member-stats','analytics-cases-member-error','analytics-member-reviewer',
     'analytics-err-team-stats','analytics-err-team-filter','analytics-err-team-chart','analytics-err-member-stats','analytics-member-error'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = empty;
    });
    return;
  }
  if (analyticsSubTab === 'cases') {
    renderTeamStats();
    renderVolChart();
    renderCompletedChart();
    renderAnalyticsMemberFilter();
    if (analyticsSelectedMember) { renderMemberStats(); renderCasesMemberErrorChart(); renderMemberReviewerChart(); }
  } else {
    renderErrTeamFilterUI();
    renderErrTeamStats();
    renderErrTeamChart();
    renderErrMemberFilter();
    if (analyticsErrSelectedMember) { renderErrMemberStats(); renderMemberErrorChart(); }
  }
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

// ─────────────────────────────────────────────────────────────
// ANALYTICS — SYNCHRONIZED SCROLL (per sub-tab)
// Cases sub-tab: vol-scroll ↔ completed-scroll ↔ cases-member-scroll ↔ rev-scroll
// Errors sub-tab: err-team-scroll ↔ err-scroll
// ─────────────────────────────────────────────────────────────
document.addEventListener('scroll', function(e) {
  const CASES_SYNC = ['vol-scroll', 'completed-scroll', 'cases-member-scroll', 'rev-scroll'];
  const ERR_SYNC   = ['err-team-scroll', 'err-scroll'];
  const isCases = CASES_SYNC.some(c => e.target.classList && e.target.classList.contains(c));
  const isErr   = ERR_SYNC.some(c => e.target.classList && e.target.classList.contains(c));
  if (!isCases && !isErr) return;
  const SYNC = isCases ? CASES_SYNC : ERR_SYNC;
  const pos  = e.target.scrollLeft;
  SYNC.forEach(cls => {
    document.querySelectorAll('.' + cls).forEach(el => {
      if (el !== e.target && el.scrollLeft !== pos) el.scrollLeft = pos;
    });
  });
}, true);

// ======================================================
// QA AI SESSION UI STATE
// ======================================================

let qaAssistantSessionState = 'no-data';
// no-data | preparing | ready | error

let qaAssistantBusy = false;

// ═══════════════════════════════════════
// QA AI ASSISTANT — PANEL CONTROLS
// ═══════════════════════════════════════

// function updateQAAssistantState() {
//   const hasData = Array.isArray(DATA) && DATA.length > 0;

//   const status = document.getElementById('qa-ai-status');
//   const input = document.getElementById('qa-ai-input');
//   const sendButton = document.getElementById('qa-ai-send');
//   const suggestions = document.querySelectorAll('.qa-ai-suggestion');
//   const trigger = document.getElementById('qa-ai-trigger');

//   if (status) {
//     status.textContent = hasData
//       ? `Data ready · ${DATA.length} cases loaded`
//       : 'No dataset loaded';

//     status.classList.toggle('ready', hasData);
//   }

//   if (input) {
//     input.disabled = !hasData;
//     input.placeholder = hasData
//       ? 'Ask a question about QA dataset...'
//       : 'Upload a CSV before asking questions...';
//   }

//   if (sendButton) {
//     sendButton.disabled = !hasData;
//   }

//   suggestions.forEach(button => {
//     button.disabled = !hasData;
//   });

//   if (trigger) {
//     trigger.classList.toggle('ready', hasData);
//     trigger.title = hasData
//       ? `${DATA.length} QA cases available`
//       : 'Upload a CSV to enable the assistant';
//   }
//   updateQAAssistantWelcomeMessage(hasData);
//   updateQAAssistantSendState();
// }

function updateQAAssistantState() {

  const hasData =
    Array.isArray(DATA) &&
    DATA.length > 0;

  const isPreparing =
    qaAssistantSessionState === 'preparing';

  const isReady =
    hasData &&
    qaAssistantSessionState === 'ready' &&
    Boolean(qaSessionId);

  const hasError =
    qaAssistantSessionState === 'error';


  const status =
    document.getElementById(
      'qa-ai-status'
    );

  const input =
    document.getElementById(
      'qa-ai-input'
    );

  const sendButton =
    document.getElementById(
      'qa-ai-send'
    );

  const clearButton =
    document.getElementById(
      'qa-ai-clear'
    );

  const suggestions =
    document.querySelectorAll(
      '.qa-ai-suggestion'
    );

  const trigger =
    document.getElementById(
      'qa-ai-trigger'
    );


  // ====================================================
  // STATUS TEXT
  // ====================================================

  if (status) {

    if (!hasData) {

      status.textContent =
        'No dataset loaded';

    } else if (isPreparing) {

      status.textContent =
        `Preparing AI assistant · ${DATA.length} cases`;

    } else if (isReady) {

      status.textContent =
        `AI assistant ready · ${DATA.length} cases`;

    } else if (hasError) {

      status.textContent =
        'AI assistant unavailable';

    } else {

      status.textContent =
        'AI assistant not ready';
    }


    status.classList.toggle(
      'ready',
      isReady
    );
  }


  // ====================================================
  // INPUT
  // ====================================================

  if (input) {

    input.disabled =
      !isReady ||
      qaAssistantBusy;


    if (!hasData) {

      input.placeholder =
        'Upload a CSV before asking questions...';

    } else if (isPreparing) {

      input.placeholder =
        'Preparing AI assistant...';

    } else if (hasError) {

      input.placeholder =
        'AI assistant unavailable...';

    } else {

      input.placeholder =
        'Ask a question about QA dataset...';
    }
  }


  // ====================================================
  // BUTTONS
  // ====================================================

  if (sendButton) {

    sendButton.disabled =
      !isReady ||
      qaAssistantBusy;
  }


  if (clearButton) {

    clearButton.disabled =
      !hasData ||
      isPreparing ||
      qaAssistantBusy;
  }


  suggestions.forEach(button => {

    button.disabled =
      !isReady ||
      qaAssistantBusy;

  });


  // ====================================================
  // FLOATING TRIGGER
  // ====================================================

  if (trigger) {

    trigger.classList.toggle(
      'ready',
      isReady
    );

    trigger.title =
      isReady
        ? `${DATA.length} QA cases available`
        : hasData
          ? 'Preparing AI assistant'
          : 'Upload a CSV to enable the assistant';
  }


  updateQAAssistantWelcomeMessage(
    hasData
  );

  updateQAAssistantSendState();
}

// function updateQAAssistantWelcomeMessage(hasData) {
//   const messages = document.getElementById('qa-ai-messages');

//   if (!messages) return;

//   const message = hasData
//     ? `Your QA dataset is ready.\n\n${DATA.length} cases were loaded successfully. You can now ask questions about cases, team members, statuses, errors and QA activity.`
//     : 'Upload a CSV file to start asking questions about your QA data.';

//   messages.innerHTML = `
//     <div class="qa-ai-message qa-ai-message-assistant">
//       <div class="qa-ai-message-label">QA Assistant</div>

//       <div class="qa-ai-message-content">
//         ${message}
//       </div>
//     </div>
//   `;
// }
function updateQAAssistantWelcomeMessage(
  hasData
) {

  const messages =
    document.getElementById(
      'qa-ai-messages'
    );

  if (!messages) return;


  let message;


  if (!hasData) {

    message =
      'Upload a CSV file to start asking questions about your QA data.';

  } else if (
    qaAssistantSessionState ===
    'preparing'
  ) {

    message =
      `Preparing the AI assistant for ${DATA.length} QA cases...`;

  } else if (
    qaAssistantSessionState ===
    'error'
  ) {

    message =
      `The dashboard loaded ${DATA.length} QA cases successfully, but the AI assistant could not be initialized.`;

  } else {

    message =
      `Your QA dataset is ready.\n\n${DATA.length} cases were loaded successfully. You can now ask Claude questions about cases, team members, errors, categories, QA activity and performance.`;

  }


  messages.innerHTML = `
    <div class="qa-ai-message qa-ai-message-assistant">

      <div class="qa-ai-message-label">
        QA Assistant
      </div>

      <div class="qa-ai-message-content">
        ${message}
      </div>

    </div>
  `;
}

function openQAAssistant() {
  const panel = document.getElementById('qa-ai-panel');
  const overlay = document.getElementById('qa-ai-overlay');

  if (!panel || !overlay) return;

  panel.classList.add('open');
  overlay.classList.add('open');

  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeQAAssistant() {
  const panel = document.getElementById('qa-ai-panel');
  const overlay = document.getElementById('qa-ai-overlay');

  if (!panel || !overlay) return;

  panel.classList.remove('open');
  overlay.classList.remove('open');

  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// document.addEventListener('DOMContentLoaded', () => {
//   const trigger = document.getElementById('qa-ai-trigger');
//   const closeButton = document.getElementById('qa-ai-close');
//   const overlay = document.getElementById('qa-ai-overlay');

//   trigger?.addEventListener('click', openQAAssistant);
//   closeButton?.addEventListener('click', closeQAAssistant);
//   overlay?.addEventListener('click', closeQAAssistant);

//   updateQAAssistantState();
// });
document.addEventListener('DOMContentLoaded', () => {
  const trigger =
    document.getElementById('qa-ai-trigger');

  const closeButton =
    document.getElementById('qa-ai-close');

  const overlay =
    document.getElementById('qa-ai-overlay');

  const input =
    document.getElementById('qa-ai-input');

  const sendButton =
    document.getElementById('qa-ai-send');

  const clearButton =
    document.getElementById('qa-ai-clear');

  const suggestions =
    document.querySelectorAll('.qa-ai-suggestion');

  trigger?.addEventListener(
    'click',
    openQAAssistant
  );

  closeButton?.addEventListener(
    'click',
    closeQAAssistant
  );

  overlay?.addEventListener(
    'click',
    closeQAAssistant
  );

  sendButton?.addEventListener(
    'click',
    () => sendQAAssistantMessage()
  );

  clearButton?.addEventListener(
    'click',
    clearQAAssistantChat
  );

  input?.addEventListener('input', () => {
    resizeQAAssistantInput();
    updateQAAssistantSendState();
  });

  input?.addEventListener('keydown', event => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendQAAssistantMessage();
    }
  });

  suggestions.forEach(button => {
    button.addEventListener('click', () => {
      const question =
        button.dataset.question || '';

      sendQAAssistantMessage(question);
    });
  });

  updateQAAssistantState();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeQAAssistant();
  }
});

function addQAAssistantMessage(role, text) {
  const messages = document.getElementById('qa-ai-messages');

  if (!messages || !text) return;

  const message = document.createElement('div');
  const isUser = role === 'user';

  message.className = `qa-ai-message ${
    isUser
      ? 'qa-ai-message-user'
      : 'qa-ai-message-assistant'
  }`;

  const label = document.createElement('div');
  label.className = 'qa-ai-message-label';
  label.textContent = isUser ? 'You' : 'QA Assistant';

  const content = document.createElement('div');
  content.className = 'qa-ai-message-content';
  content.textContent = text;

  message.appendChild(label);
  message.appendChild(content);

  messages.appendChild(message);

  messages.scrollTop = messages.scrollHeight;
}

// function getMockQAAssistantResponse(question) {
//   const normalizedQuestion = question
//     .trim()
//     .toLowerCase();

//   if (
//     normalizedQuestion.includes('summarize') ||
//     normalizedQuestion.includes('summary')
//   ) {
//     return `The current dataset contains ${DATA.length} valid QA cases. Detailed metrics will be connected in the next development step.`;
//   }

//   if (
//     normalizedQuestion.includes('pending')
//   ) {
//     return 'Pending-case analysis is not connected yet. This question was received successfully.';
//   }

//   if (
//     normalizedQuestion.includes('error rate')
//   ) {
//     return 'Error-rate analysis is not connected yet. This question was received successfully.';
//   }

//   if (
//     normalizedQuestion.includes('bug category') ||
//     normalizedQuestion.includes('category')
//   ) {
//     return 'Bug-category analysis is not connected yet. This question was received successfully.';
//   }

//   return `I received your question: "${question}"\n\nThis is currently a simulated response.`;
// }
function getLocalQAAssistantResponse(question) {
  // const normalizedQuestion = question
  //   .trim()
  //   .toLowerCase();
  const normalizedQuestion =
  normalizeQAText(question);

  const comparisonOwners =
  findQAOwnersForComparison(
    question
  );

  const asksForMemberComparison =
    normalizedQuestion.includes('compare') ||
    normalizedQuestion.includes('comparison') ||
    normalizedQuestion.includes('versus') ||
    containsNormalizedPhrase(
      normalizedQuestion,
      'vs'
    ) ||
    normalizedQuestion.includes('difference between') ||
    normalizedQuestion.includes('who performs better') ||
    normalizedQuestion.includes('comparar') ||
    normalizedQuestion.includes('compara') ||
    normalizedQuestion.includes('comparacion') ||
    normalizedQuestion.includes('diferencia entre') ||
    normalizedQuestion.includes('quien tiene mejor rendimiento');

  const ownerResult =
    findQAOwnerInQuestion(question);

  const detectedCategory =
  findQACategoryInQuestion(question);

  const reviewerResult =
  findQAReviewerInQuestion(
    question
  );

  const combinedFilterRequest =
  parseQACombinedFilterQuestion(
    question
  );

  const asksForWeeklyStatus =
    normalizedQuestion.includes('weekly status') ||
    normalizedQuestion.includes('week status') ||
    normalizedQuestion.includes('final status') ||
    normalizedQuestion.includes('status of the week') ||
    normalizedQuestion.includes('weekly health') ||
    normalizedQuestion.includes('estado semanal') ||
    normalizedQuestion.includes('estado de la semana') ||
    normalizedQuestion.includes('estado final') ||
    normalizedQuestion.includes('como esta la semana') ||
    normalizedQuestion.includes('por que estamos at risk') ||
    normalizedQuestion.includes('por que estamos en riesgo');

  const asksForWeeklyScoringRules =
    normalizedQuestion.includes('how is the weekly status calculated') ||
    normalizedQuestion.includes('how is final status calculated') ||
    normalizedQuestion.includes('weekly scoring rules') ||
    normalizedQuestion.includes('status thresholds') ||
    normalizedQuestion.includes('como se calcula el estado semanal') ||
    normalizedQuestion.includes('como se calcula el estado final') ||
    normalizedQuestion.includes('reglas del estado semanal') ||
    normalizedQuestion.includes('umbrales del estado');



  const asksForQAReviewActivity =
    normalizedQuestion.includes('as qa') ||
    normalizedQuestion.includes('qa reviewer') ||
    normalizedQuestion.includes('qa activity') ||
    normalizedQuestion.includes('review activity') ||
    normalizedQuestion.includes('cases reviewed') ||
    normalizedQuestion.includes('reviews completed') ||
    normalizedQuestion.includes('reviewed by') ||
    normalizedQuestion.includes('did review') ||
    normalizedQuestion.includes('como qa') ||
    normalizedQuestion.includes('actividad de qa') ||
    normalizedQuestion.includes('actividad del qa') ||
    normalizedQuestion.includes('casos revisados') ||
    normalizedQuestion.includes('revisiones') ||
    normalizedQuestion.includes('reviso');

  const asksWhoReviewedMost =
    normalizedQuestion.includes('who reviewed the most') ||
    normalizedQuestion.includes('most qa reviews') ||
    normalizedQuestion.includes('highest number of reviews') ||
    normalizedQuestion.includes('quien reviso mas') ||
    normalizedQuestion.includes('mas revisiones');

  const asksWhoFoundMostErrors =
    normalizedQuestion.includes('who found the most errors') ||
    normalizedQuestion.includes('most errors found') ||
    normalizedQuestion.includes('who detected the most errors') ||
    normalizedQuestion.includes('quien encontro mas errores') ||
    normalizedQuestion.includes('quien detecto mas errores');

  const asksForQALeaderboard =
    normalizedQuestion.includes('qa reviewer activity') ||
    normalizedQuestion.includes('qa activity ranking') ||
    normalizedQuestion.includes('reviewer leaderboard') ||
    normalizedQuestion.includes('actividad de los qa') ||
    normalizedQuestion.includes('ranking de revisores');

  const asksForPending =
    normalizedQuestion.includes('pending') ||
    normalizedQuestion.includes('pendiente') ||
    normalizedQuestion.includes('without fix comment') ||
    normalizedQuestion.includes('sin fix comment') ||
    normalizedQuestion.includes('sin respuesta');

  const asksForResponded =
    normalizedQuestion.includes('responded') ||
    normalizedQuestion.includes('response') ||
    normalizedQuestion.includes('replied') ||
    normalizedQuestion.includes('answered') ||
    normalizedQuestion.includes('respondido') ||
    normalizedQuestion.includes('respondida') ||
    normalizedQuestion.includes('con respuesta') ||
    normalizedQuestion.includes('con fix comment');

  const asksForCaseList =
    normalizedQuestion.includes('show') ||
    normalizedQuestion.includes('list') ||
    normalizedQuestion.includes('which cases') ||
    normalizedQuestion.includes('details') ||
    normalizedQuestion.includes('muestra') ||
    normalizedQuestion.includes('lista') ||
    normalizedQuestion.includes('cuales') ||
    normalizedQuestion.includes('detalles');

  const asksWhoHasMostPending =
    normalizedQuestion.includes('most pending') ||
    normalizedQuestion.includes('highest number of pending') ||
    normalizedQuestion.includes('mas pendientes') ||
    normalizedQuestion.includes('mayor cantidad de pendientes');

  const asksForTopCategory =
    normalizedQuestion.includes('top bug category') ||
    normalizedQuestion.includes('top category') ||
    normalizedQuestion.includes('most common category') ||
    normalizedQuestion.includes('most frequent category') ||
    normalizedQuestion.includes('categoria principal') ||
    normalizedQuestion.includes('categoria mas comun') ||
    normalizedQuestion.includes('categoria mas frecuente');

  const asksForCategoryBreakdown =
    normalizedQuestion.includes('category breakdown') ||
    normalizedQuestion.includes('categories breakdown') ||
    normalizedQuestion.includes('bug categories') ||
    normalizedQuestion.includes('list categories') ||
    normalizedQuestion.includes('desglose de categorias') ||
    normalizedQuestion.includes('resumen de categorias') ||
    normalizedQuestion.includes('lista de categorias');

  // ── Highest error rate ──
  if (
    normalizedQuestion.includes('highest error rate') ||
    normalizedQuestion.includes('mayor tasa de error') ||
    normalizedQuestion.includes('tasa de error mas alta')
  ) {
    return buildQAHighestErrorRateResponse();
  }

  // ── Highest number of errors ──
  if (
    normalizedQuestion.includes('highest number of errors') ||
    normalizedQuestion.includes('most errors') ||
    normalizedQuestion.includes('more errors') ||
    normalizedQuestion.includes('mas errores') ||
    normalizedQuestion.includes('mayor cantidad de errores')
  ) {
    return buildQATopErrorMemberResponse();
  }

  // ── Best pass rate ──
  if (
    normalizedQuestion.includes('best pass rate') ||
    normalizedQuestion.includes('highest pass rate') ||
    normalizedQuestion.includes('mejor pass rate') ||
    normalizedQuestion.includes('mejor tasa de aprobación') ||
    normalizedQuestion.includes('mejor tasa de aprobacion')
  ) {
    return buildQABestPassRateResponse();
  }

  // ── QA reviewer with most reviews ──
  if (asksWhoReviewedMost) {
    return buildQATopReviewerResponse();
  }

  // ── QA reviewer who found most errors ──
  if (asksWhoFoundMostErrors) {
    return buildQATopErrorFinderResponse();
  }

  // ── General reviewer activity ──
  if (
    asksForQALeaderboard &&
    !reviewerResult.match
  ) {
    return buildQAReviewerLeaderboardResponse();
  }

  // ── Weekly scoring rules ──
  if (asksForWeeklyScoringRules) {
    return buildQAWeeklyScoringRulesResponse();
  }

  // ── Weekly final status ──
  if (asksForWeeklyStatus) {
    return buildQAWeeklyStatusResponse();
  }

  // ── Member comparison ──
  if (asksForMemberComparison) {
    if (comparisonOwners.ambiguous) {
      return buildQAAmbiguousMemberResponse(
        comparisonOwners.options
      );
    }

    if (comparisonOwners.matches.length < 2) {
      return [
        'I need two team members to create a comparison.',
        '',
        'Examples:',
        '• Compare Michael Luna and Cidar Dealencar',
        '• Michael vs Cidar',
        '• Compara a Michael con Cidar'
      ].join('\n');
    }

    if (comparisonOwners.matches.length > 2) {
      return [
        'I found more than two team members.',
        '',
        ...comparisonOwners.matches.map(
          owner => `• ${owner}`
        ),
        '',
        'Please select only two members.'
      ].join('\n');
    }

    return buildQAMemberComparisonResponse(
      comparisonOwners.matches[0],
      comparisonOwners.matches[1]
    );
  }

  // ── Ambiguous reviewer ──
  if (
    asksForQAReviewActivity &&
    reviewerResult.ambiguous
  ) {
    return buildQAAmbiguousMemberResponse(
      reviewerResult.options
    );
  }

  // ── Specific reviewer ──
  if (
    asksForQAReviewActivity &&
    reviewerResult.match
  ) {
    const reviewerName =
      reviewerResult.match.displayName;

    if (asksForCaseList) {
      return buildQAReviewerCasesResponse(
        reviewerName
      );
    }

    return buildQAReviewerSummaryResponse(
      reviewerName
    );
  }

  // ── Reviewer requested but name not found ──
  if (
    asksForQAReviewActivity &&
    !reviewerResult.match
  ) {
    return [
      'I could not identify the QA reviewer.',
      '',
      'Try using a full name or ask:',
      '• Who completed the most QA reviews?',
      '• Show QA reviewer activity',
      '• How many cases did Michael review as QA?'
    ].join('\n');
  }
  
  // ── Owner with most pending cases ──
  if (asksWhoHasMostPending) {
    return buildQATopPendingOwnerResponse();
  }

  if (ownerResult.ambiguous) {
    return buildQAAmbiguousMemberResponse(
      ownerResult.options
    );
  }

  if (ownerResult.match) {
    const member =
      getQAMemberMetrics(ownerResult.match);

    // ── Member pending cases ──
    if (asksForPending) {
      if (asksForCaseList) {
        return buildQAPendingListResponse({
          owner: ownerResult.match
        });
      }

      return buildQAPendingSummaryResponse({
        owner: ownerResult.match
      });
    }

    // ── Member responded cases ──
    if (asksForResponded) {
      if (asksForCaseList) {
        return buildQARespondedListResponse({
          owner: ownerResult.match
        });
      }

      return buildQARespondedSummaryResponse({
        owner: ownerResult.match
      });
    }

    // ── Member top category ──
    if (asksForTopCategory) {
      return buildQATopCategoryResponse({
        owner: ownerResult.match
      });
    }

    // ── Specific member category ──
    if (detectedCategory) {
      return buildQACategoryDetailResponse(
        detectedCategory,
        {
          owner: ownerResult.match
        }
      );
    }

    // ── Member category breakdown ──
    if (asksForCategoryBreakdown) {
      return buildQACategoryBreakdownResponse({
        owner: ownerResult.match
      });
    }

    // Member error rate
    if (
      normalizedQuestion.includes('error rate') ||
      normalizedQuestion.includes('tasa de error')
    ) {
      return [
        `${member.owner}'s error rate is ${formatQAPercentage(member.errorRate)}.`,
        '',
        `${member.failed} Failed + ${member.critical} Critical = ${member.errors} errors out of ${member.total} cases.`
      ].join('\n');
    }

    // Member pass rate
    if (
      normalizedQuestion.includes('pass rate') ||
      normalizedQuestion.includes('approval rate') ||
      normalizedQuestion.includes('tasa de aprobación') ||
      normalizedQuestion.includes('tasa de aprobacion')
    ) {
      return [
        `${member.owner}'s pass rate is ${formatQAPercentage(member.passRate)}.`,
        '',
        `${member.passed} Passed + ${member.opportunity} Opportunity = ${member.passed + member.opportunity} acceptable cases out of ${member.total}.`
      ].join('\n');
    }

    // Member errors
    if (
      normalizedQuestion.includes('how many errors') ||
      normalizedQuestion.includes('errors does') ||
      normalizedQuestion.includes('errores tiene') ||
      normalizedQuestion.includes('cuántos errores') ||
      normalizedQuestion.includes('cuantos errores')
    ) {
      return `${member.owner} has ${member.errors} errors: ${member.failed} Failed and ${member.critical} Critical.`;
    }

    // Member critical
    if (
      normalizedQuestion.includes('critical')
    ) {
      return `${member.owner} has ${member.critical} Critical cases out of ${member.total} total cases.`;
    }

    // Member failed
    if (
      normalizedQuestion.includes('failed')
    ) {
      return `${member.owner} has ${member.failed} Failed cases out of ${member.total} total cases.`;
    }

    // General member summary
    if (
      normalizedQuestion.includes('how did') ||
      normalizedQuestion.includes('performance') ||
      normalizedQuestion.includes('summary') ||
      normalizedQuestion.includes('summarize') ||
      normalizedQuestion.includes('cómo le fue') ||
      normalizedQuestion.includes('como le fue') ||
      normalizedQuestion.includes('rendimiento') ||
      normalizedQuestion.includes('resumen')
    ) {
      return buildQAMemberSummaryResponse(
        ownerResult.match
      );
    }

    return buildQAMemberSummaryResponse(
      ownerResult.match
    );
  }

  // ── Combined case filters ──
  if (combinedFilterRequest.shouldHandle) {
    if (
      combinedFilterRequest.asksForList
    ) {
      return buildQAFilteredCasesResponse(
        combinedFilterRequest.options
      );
    }

    return buildQAFilteredSummaryResponse(
      combinedFilterRequest.options
    );
  }

  // ── General pending cases ──
  if (asksForPending) {
    if (asksForCaseList) {
      return buildQAPendingListResponse();
    }

    return buildQAPendingSummaryResponse();
  }

  // ── General responded cases ──
  if (asksForResponded) {
    if (asksForCaseList) {
      return buildQARespondedListResponse();
    }

    return buildQARespondedSummaryResponse();
  }

  // ── General top category ──
  if (asksForTopCategory) {
    return buildQATopCategoryResponse();
  }

  // ── Specific category ──
  if (detectedCategory) {
    return buildQACategoryDetailResponse(
      detectedCategory
    );
  }

  // ── General category breakdown ──
  if (asksForCategoryBreakdown) {
    return buildQACategoryBreakdownResponse();
  }

  const summary = getQAGeneralSummary();

  // ── General summary ──
  if (
    normalizedQuestion.includes('summarize') ||
    normalizedQuestion.includes('summary') ||
    normalizedQuestion.includes('overview') ||
    normalizedQuestion.includes('resumen')
  ) {
    return buildQAGeneralSummaryResponse();
  }

  // ── Total cases ──
  if (
    normalizedQuestion.includes('how many cases') ||
    normalizedQuestion.includes('total cases') ||
    normalizedQuestion.includes('cases loaded') ||
    normalizedQuestion.includes('cuántos casos') ||
    normalizedQuestion.includes('cuantos casos') ||
    normalizedQuestion.includes('total de casos')
  ) {
    return `There are ${summary.total} valid QA cases in the current dataset.`;
  }

  // ── Passed ──
  if (
    normalizedQuestion.includes('how many passed') ||
    normalizedQuestion.includes('passed cases') ||
    normalizedQuestion.includes('cuántos passed') ||
    normalizedQuestion.includes('cuantos passed') ||
    normalizedQuestion.includes('casos aprobados')
  ) {
    const percentage = summary.total > 0
      ? (summary.passed / summary.total) * 100
      : 0;

    return `${summary.passed} cases have Passed status, representing ${formatQAPercentage(percentage)} of the dataset.`;
  }

  // ── Opportunity ──
  if (
    normalizedQuestion.includes('how many opportunity') ||
    normalizedQuestion.includes('opportunity cases') ||
    normalizedQuestion.includes('cuántos opportunity') ||
    normalizedQuestion.includes('cuantos opportunity')
  ) {
    const percentage = summary.total > 0
      ? (summary.opportunity / summary.total) * 100
      : 0;

    return `${summary.opportunity} cases have Opportunity status, representing ${formatQAPercentage(percentage)} of the dataset.`;
  }

  // ── Failed ──
  if (
    normalizedQuestion.includes('how many failed') ||
    normalizedQuestion.includes('failed cases') ||
    normalizedQuestion.includes('cuántos failed') ||
    normalizedQuestion.includes('cuantos failed') ||
    normalizedQuestion.includes('casos fallidos')
  ) {
    const percentage = summary.total > 0
      ? (summary.failed / summary.total) * 100
      : 0;

    return `${summary.failed} cases have Failed status, representing ${formatQAPercentage(percentage)} of the dataset.`;
  }

  // ── Critical ──
  if (
    normalizedQuestion.includes('how many critical') ||
    normalizedQuestion.includes('critical cases') ||
    normalizedQuestion.includes('cuántos critical') ||
    normalizedQuestion.includes('cuantos critical') ||
    normalizedQuestion.includes('casos críticos') ||
    normalizedQuestion.includes('casos criticos')
  ) {
    const percentage = summary.total > 0
      ? (summary.critical / summary.total) * 100
      : 0;

    return `${summary.critical} cases have Critical status, representing ${formatQAPercentage(percentage)} of the dataset.`;
  }

  // ── Pass rate ──
  if (
    normalizedQuestion.includes('pass rate') ||
    normalizedQuestion.includes('approval rate') ||
    normalizedQuestion.includes('tasa de aprobación') ||
    normalizedQuestion.includes('tasa de aprobacion')
  ) {
    return [
      `The current pass rate is ${formatQAPercentage(summary.passRate)}.`,
      '',
      `This is calculated using Passed + Opportunity:`,
      `${summary.passed} Passed + ${summary.opportunity} Opportunity = ${summary.passed + summary.opportunity} acceptable cases out of ${summary.total}.`
    ].join('\n');
  }

  // ── Error rate ──
  if (
    normalizedQuestion.includes('error rate') ||
    normalizedQuestion.includes('failure rate') ||
    normalizedQuestion.includes('tasa de error')
  ) {
    return [
      `The current error rate is ${formatQAPercentage(summary.errorRate)}.`,
      '',
      `This is calculated using Failed + Critical:`,
      `${summary.failed} Failed + ${summary.critical} Critical = ${summary.errors} errors out of ${summary.total} cases.`
    ].join('\n');
  }

  // ── Total errors ──
  if (
    normalizedQuestion.includes('how many errors') ||
    normalizedQuestion.includes('total errors') ||
    normalizedQuestion.includes('cuántos errores') ||
    normalizedQuestion.includes('cuantos errores')
  ) {
    return `${summary.errors} errors were found: ${summary.failed} Failed and ${summary.critical} Critical.`;
  }

  return [
    `I received your question: "${question}"`,
    '',
    'This local version currently supports questions about:',
    '• General dataset summary',
    '• Status counts and rates',
    '• Individual member performance',
    '• Member error and pass rates',
    '• Member with the most errors',
    '• Member with the highest error rate',
    '• Member with the highest pass rate',
    '• Top bug category',
    '• Category breakdown',
    '• Categories by team member',
    '• Pending cases and queue status',
    '• Responded cases',
    '• Responded cases that remain open',
    '• Owner with the most pending cases',
    '• QA reviews completed by each reviewer',
    '• QA activity by reviewer',
    '• Reviewer who completed the most reviews',
    '• Reviewer who found the most errors',
    '• Cases reviewed by a specific QA',
    '• Performance comparison between two team members',
    '• Weekly status, score and explanation',
    '• Weekly risks and recommended actions',
  ].join('\n');
}
function showQAAssistantTyping() {
  const messages = document.getElementById('qa-ai-messages');

  if (!messages) return;

  removeQAAssistantTyping();

  const typing = document.createElement('div');

  typing.className =
    'qa-ai-message qa-ai-message-assistant qa-ai-typing-message';

  typing.id = 'qa-ai-typing';

  typing.innerHTML = `
    <div class="qa-ai-message-label">QA Assistant</div>

    <div class="qa-ai-message-content qa-ai-typing-content">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;
}

function removeQAAssistantTyping() {
  document.getElementById('qa-ai-typing')?.remove();
}
// function sendQAAssistantMessage(questionFromSuggestion = '') {
//   const input = document.getElementById('qa-ai-input');
//   const sendButton = document.getElementById('qa-ai-send');

//   if (!input || !sendButton) return;

//   const question = (
//     questionFromSuggestion ||
//     input.value
//   ).trim();

//   if (!question) return;

//   if (!Array.isArray(DATA) || DATA.length === 0) {
//     addQAAssistantMessage(
//       'assistant',
//       'Upload a valid CSV before asking questions.'
//     );

//     return;
//   }

//   addQAAssistantMessage('user', question);

//   input.value = '';
//   resizeQAAssistantInput();
//   updateQAAssistantSendState();

//   input.disabled = true;
//   sendButton.disabled = true;

//   showQAAssistantTyping();

//   window.setTimeout(() => {
//     removeQAAssistantTyping();

//     // const response =
//     //   getMockQAAssistantResponse(question);
//     const response = getLocalQAAssistantResponse(question);

//     addQAAssistantMessage(
//       'assistant',
//       response
//     );

//     input.disabled = false;
//     // sendButton.disabled = false;
//     updateQAAssistantSendState();
//     input.focus();
//   }, 700);
// }
async function sendQAAssistantMessage(
  questionFromSuggestion = ''
) {

  const input =
    document.getElementById(
      'qa-ai-input'
    );

  const sendButton =
    document.getElementById(
      'qa-ai-send'
    );


  if (
    !input ||
    !sendButton
  ) {
    return;
  }


  // Prevent multiple simultaneous requests
  if (qaAssistantBusy) {
    return;
  }


  const question = (
    questionFromSuggestion ||
    input.value
  ).trim();


  if (!question) {
    return;
  }


  // ====================================================
  // DATA VALIDATION
  // ====================================================

  if (
    !Array.isArray(DATA) ||
    DATA.length === 0
  ) {

    addQAAssistantMessage(
      'assistant',
      'Upload a valid CSV before asking questions.'
    );

    return;
  }


  // ====================================================
  // SESSION VALIDATION
  // ====================================================

  if (
    qaAssistantSessionState !==
    'ready'
  ) {

    const message =
      qaAssistantSessionState ===
      'preparing'
        ? 'The AI assistant is still preparing the current dataset.'
        : 'The AI assistant is not available right now.';

    addQAAssistantMessage(
      'assistant',
      message
    );

    return;
  }


  // ====================================================
  // USER MESSAGE
  // ====================================================

  addQAAssistantMessage(
    'user',
    question
  );


  input.value = '';

  resizeQAAssistantInput();


  // ====================================================
  // LOCK UI
  // ====================================================

  qaAssistantBusy = true;

  input.disabled = true;

  sendButton.disabled = true;


  document
    .querySelectorAll(
      '.qa-ai-suggestion'
    )
    .forEach(
      button =>
        button.disabled = true
    );


  showQAAssistantTyping();


  // ====================================================
  // CALL REAL AI BACKEND
  // ====================================================

  try {

    const response =
      await sendQAChatMessage(
        question
      );


    removeQAAssistantTyping();


    if (
      !response ||
      !response.reply
    ) {

      throw new Error(
        'AI assistant returned an empty response.'
      );
    }


    // ==================================================
    // DISPLAY CLAUDE RESPONSE
    // ==================================================

    addQAAssistantMessage(
      'assistant',
      response.reply
    );


    // Useful during development
    console.log(
      '[QA CHAT] Tools used:',
      response.toolsUsed || []
    );


  } catch (error) {

    removeQAAssistantTyping();


    console.error(
      '[QA CHAT UI ERROR]',
      error
    );


    addQAAssistantMessage(
      'assistant',
      'I could not complete that request. Please try again.'
    );

  } finally {

    // ==================================================
    // UNLOCK UI
    // ==================================================

    qaAssistantBusy = false;


    const isReady =
      qaAssistantSessionState ===
      'ready' &&
      Boolean(qaSessionId);


    input.disabled =
      !isReady;


    document
      .querySelectorAll(
        '.qa-ai-suggestion'
      )
      .forEach(
        button =>
          button.disabled =
            !isReady
      );


    updateQAAssistantSendState();


    if (isReady) {
      input.focus();
    }
  }

}
function resizeQAAssistantInput() {
  const input = document.getElementById('qa-ai-input');

  if (!input) return;

  input.style.height = 'auto';

  input.style.height = `${Math.min(
    input.scrollHeight,
    120
  )}px`;
}
// function clearQAAssistantChat() {
//   const hasData =
//     Array.isArray(DATA) &&
//     DATA.length > 0;

//   updateQAAssistantWelcomeMessage(hasData);

//   const input =
//     document.getElementById('qa-ai-input');

//   if (input) {
//     input.value = '';
//     resizeQAAssistantInput();
//   }
// }
async function clearQAAssistantChat() {

  if (qaAssistantBusy) {
    return;
  }


  const hasData =
    Array.isArray(DATA) &&
    DATA.length > 0;


  const input =
    document.getElementById(
      'qa-ai-input'
    );


  if (input) {

    input.value = '';

    resizeQAAssistantInput();
  }


  // ====================================================
  // NO DATA
  // ====================================================

  if (!hasData) {

    qaAssistantSessionState =
      'no-data';

    updateQAAssistantState();

    return;
  }


  // ====================================================
  // RESET BACKEND CONVERSATION
  // ====================================================

  qaAssistantSessionState =
    'preparing';

  updateQAAssistantState();


  try {

    await resetQASession();


    qaAssistantSessionState =
      'ready';


    console.log(
      '[QA CHAT] Conversation cleared. New session:',
      qaSessionId
    );


  } catch (error) {

    console.error(
      '[QA CHAT] Could not reset session:',
      error
    );


    qaAssistantSessionState =
      'error';
  }


  updateQAAssistantState();
}
// function updateQAAssistantSendState() {
//   const input =
//     document.getElementById('qa-ai-input');

//   const sendButton =
//     document.getElementById('qa-ai-send');

//   if (!input || !sendButton) return;

//   const hasData =
//     Array.isArray(DATA) &&
//     DATA.length > 0;

//   const hasText =
//     input.value.trim().length > 0;

//   sendButton.disabled =
//     !hasData ||
//     !hasText ||
//     input.disabled;
// }
function updateQAAssistantSendState() {

  const input =
    document.getElementById(
      'qa-ai-input'
    );

  const sendButton =
    document.getElementById(
      'qa-ai-send'
    );


  if (
    !input ||
    !sendButton
  ) {
    return;
  }


  const hasData =
    Array.isArray(DATA) &&
    DATA.length > 0;


  const hasText =
    input.value
      .trim()
      .length > 0;


  const sessionReady =
    qaAssistantSessionState ===
      'ready' &&
    Boolean(qaSessionId);


  sendButton.disabled =
    !hasData ||
    !hasText ||
    !sessionReady ||
    qaAssistantBusy ||
    input.disabled;
}

function getQAGeneralSummary() {
  const total = DATA.length;

  const passed = DATA.filter(
    item => item.status === 'Passed'
  ).length;

  const opportunity = DATA.filter(
    item => item.status === 'Opportunity'
  ).length;

  const failed = DATA.filter(
    item => item.status === 'Failed'
  ).length;

  const critical = DATA.filter(
    item => item.status === 'Critical'
  ).length;

  const errors = failed + critical;

  const passRate = total > 0
    ? ((passed + opportunity) / total) * 100
    : 0;

  const errorRate = total > 0
    ? (errors / total) * 100
    : 0;

  const queueAnalysis =
    getQAQueueAnalysis({
      data: DATA,
      limit: 0
    });

  return {
    total,
    passed,
    opportunity,
    failed,
    critical,
    errors,
    passRate,
    errorRate,
    pending:
      queueAnalysis.pendingCount,

    responded:
      queueAnalysis.respondedCount,

    respondedOpen:
      queueAnalysis.respondedOpenCount
  };
}
function formatQAPercentage(value) {
  return `${value.toFixed(2)}%`;
}
function buildQAGeneralSummaryResponse() {
  const summary = getQAGeneralSummary();

  return [
    `The current dataset contains ${summary.total} valid QA cases.`,
    '',
    `✓ Passed: ${summary.passed}`,
    `● Opportunity: ${summary.opportunity}`,
    `▲ Failed: ${summary.failed}`,
    `✕ Critical: ${summary.critical}`,
    '',
    `Pass rate: ${formatQAPercentage(summary.passRate)}`,
    `Error rate: ${formatQAPercentage(summary.errorRate)}`,
    `⏳ Pending: ${summary.pending}`,
    `💬 Responded: ${summary.responded}`,
    `↻ Responded but open: ${summary.respondedOpen}`,
  ].join('\n');
}
// function getQAMemberMetrics(ownerName) {
//   const memberCases = DATA.filter(
//     item => item.owner === ownerName
//   );

//   const total = memberCases.length;

//   const passed = memberCases.filter(
//     item => item.status === 'Passed'
//   ).length;

//   const opportunity = memberCases.filter(
//     item => item.status === 'Opportunity'
//   ).length;

//   const failed = memberCases.filter(
//     item => item.status === 'Failed'
//   ).length;

//   const critical = memberCases.filter(
//     item => item.status === 'Critical'
//   ).length;

//   const errors = failed + critical;

//   const passRate = total > 0
//     ? ((passed + opportunity) / total) * 100
//     : 0;

//   const errorRate = total > 0
//     ? (errors / total) * 100
//     : 0;

//   return {
//     owner: ownerName,
//     total,
//     passed,
//     opportunity,
//     failed,
//     critical,
//     errors,
//     passRate,
//     errorRate,
//     cases: memberCases
//   };
// }
function getQAMemberMetrics(
  ownerName,
  data = DATA
) {
  const safeData =
    Array.isArray(data)
      ? data
      : [];

  const memberCases =
    safeData.filter(
      item => item.owner === ownerName
    );

  const total =
    memberCases.length;

  const passed =
    memberCases.filter(
      item => item.status === 'Passed'
    ).length;

  const opportunity =
    memberCases.filter(
      item =>
        item.status === 'Opportunity'
    ).length;

  const failed =
    memberCases.filter(
      item => item.status === 'Failed'
    ).length;

  const critical =
    memberCases.filter(
      item => item.status === 'Critical'
    ).length;

  const errors =
    failed + critical;

  const passRate =
    total > 0
      ? (
          (
            passed +
            opportunity
          ) /
          total
        ) * 100
      : 0;

  const errorRate =
    total > 0
      ? (
          errors /
          total
        ) * 100
      : 0;

  return {
    owner: ownerName,

    total,
    passed,
    opportunity,
    failed,
    critical,
    errors,

    passRate,
    errorRate,

    cases: memberCases
  };
}

function getQAOwners() {
  return [
    ...new Set(
      DATA
        .map(item => item.owner)
        .filter(Boolean)
    )
  ].sort();
}
function normalizeQAText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
function findQAOwnerInQuestion(question) {
  const owners = getQAOwners();

  const normalizedQuestion =
    normalizeQAText(question);

  // Primero intenta nombre completo
  const fullMatch = owners.find(owner =>
    normalizedQuestion.includes(
      normalizeQAText(owner)
    )
  );

  if (fullMatch) {
    return {
      match: fullMatch,
      ambiguous: false,
      options: []
    };
  }

  // Después intenta primer nombre
  const firstNameMatches = owners.filter(owner => {
    const firstName =
      normalizeQAText(owner).split(' ')[0];

    return normalizedQuestion.includes(firstName);
  });

  if (firstNameMatches.length === 1) {
    return {
      match: firstNameMatches[0],
      ambiguous: false,
      options: []
    };
  }

  if (firstNameMatches.length > 1) {
    return {
      match: null,
      ambiguous: true,
      options: firstNameMatches
    };
  }

  return {
    match: null,
    ambiguous: false,
    options: []
  };
}
function buildQAMemberSummaryResponse(ownerName) {
  const metrics = getQAMemberMetrics(ownerName);

  if (!metrics.total) {
    return `No QA cases were found for ${ownerName}.`;
  }

  return [
    `${metrics.owner} has ${metrics.total} QA cases.`,
    '',
    `✓ Passed: ${metrics.passed}`,
    `● Opportunity: ${metrics.opportunity}`,
    `▲ Failed: ${metrics.failed}`,
    `✕ Critical: ${metrics.critical}`,
    '',
    `Pass rate: ${formatQAPercentage(metrics.passRate)}`,
    `Error rate: ${formatQAPercentage(metrics.errorRate)}`
  ].join('\n');
}
function getQAMemberRanking() {
  return getQAOwners()
    .map(owner => getQAMemberMetrics(owner))
    .sort((a, b) => {
      if (b.errors !== a.errors) {
        return b.errors - a.errors;
      }

      return b.errorRate - a.errorRate;
    });
}
function buildQATopErrorMemberResponse() {
  const ranking = getQAMemberRanking();

  if (!ranking.length) {
    return 'No team-member data is available.';
  }

  const top = ranking[0];

  return [
    `${top.owner} has the highest number of errors.`,
    '',
    `Errors: ${top.errors}`,
    `Failed: ${top.failed}`,
    `Critical: ${top.critical}`,
    `Total cases: ${top.total}`,
    `Error rate: ${formatQAPercentage(top.errorRate)}`
  ].join('\n');
}

function getQAHighestErrorRateMember() {
  const ranking = getQAOwners()
    .map(owner => getQAMemberMetrics(owner))
    .filter(member => member.total > 0)
    .sort((a, b) => {
      if (b.errorRate !== a.errorRate) {
        return b.errorRate - a.errorRate;
      }

      if (b.errors !== a.errors) {
        return b.errors - a.errors;
      }

      return b.total - a.total;
    });

  return ranking[0] || null;
}

function buildQAHighestErrorRateResponse() {
  const top = getQAHighestErrorRateMember();

  if (!top) {
    return 'No team-member data is available.';
  }

  return [
    `${top.owner} has the highest error rate.`,
    '',
    `Error rate: ${formatQAPercentage(top.errorRate)}`,
    `Errors: ${top.errors}`,
    `Failed: ${top.failed}`,
    `Critical: ${top.critical}`,
    `Total cases: ${top.total}`
  ].join('\n');
}

function getQABestPassRateMember() {
  const ranking = getQAOwners()
    .map(owner => getQAMemberMetrics(owner))
    .filter(member => member.total > 0)
    .sort((a, b) => {
      if (b.passRate !== a.passRate) {
        return b.passRate - a.passRate;
      }

      return b.total - a.total;
    });

  return ranking[0] || null;
}
function buildQABestPassRateResponse() {
  const top = getQABestPassRateMember();

  if (!top) {
    return 'No team-member data is available.';
  }

  return [
    `${top.owner} has the highest pass rate.`,
    '',
    `Pass rate: ${formatQAPercentage(top.passRate)}`,
    `Acceptable cases: ${top.passed + top.opportunity}`,
    `Total cases: ${top.total}`,
    `Errors: ${top.errors}`
  ].join('\n');
}
function buildQAAmbiguousMemberResponse(options) {
  return [
    'I found more than one matching team member.',
    '',
    ...options.map(name => `• ${name}`),
    '',
    'Please use the full name.'
  ].join('\n');
}

function getQACategoryAnalysis({
  data = DATA,
  owner = null,
  statuses = ['Opportunity', 'Failed', 'Critical'],
  type = null
} = {}) {
  const safeData = Array.isArray(data)
    ? data
    : [];

  const safeStatuses = Array.isArray(statuses)
    ? statuses
    : [];

  // Casos que entran en el análisis
  const scopedCases = safeData.filter(item => {
    if (owner && item.owner !== owner) {
      return false;
    }

    if (type && item.type !== type) {
      return false;
    }

    if (
      safeStatuses.length > 0 &&
      !safeStatuses.includes(item.status)
    ) {
      return false;
    }

    return true;
  });

  // Casos que realmente tienen categorías detectadas
  const categorizedCases = scopedCases.filter(item =>
    Array.isArray(item.categories) &&
    item.categories.length > 0
  );

  const categoryMap = new Map();

  categorizedCases.forEach(item => {
    // Evita contar dos veces la misma categoría
    // dentro de un mismo caso
    const uniqueCategories = [
      ...new Set(
        item.categories.filter(Boolean)
      )
    ];

    uniqueCategories.forEach(category => {
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          count: 0,

          byType: {
            LP: 0,
            Posting: 0,
            Unknown: 0
          },

          cases: []
        });
      }

      const entry = categoryMap.get(category);
      const caseType = item.type || 'Unknown';

      entry.count += 1;

      entry.byType[caseType] =
        (entry.byType[caseType] || 0) + 1;

      entry.cases.push({
        task_id: item.task_id,
        owner: item.owner,
        status: item.status,
        type: item.type,
        qa_by: item.qa_by,
        day: item.day,
        completed_date: item.completed_date
      });
    });
  });

  const totalOccurrences = [
    ...categoryMap.values()
  ].reduce(
    (total, item) => total + item.count,
    0
  );

  const categories = [
    ...categoryMap.values()
  ]
    .map(item => ({
      ...item,

      percentageOfScope:
        scopedCases.length > 0
          ? (item.count / scopedCases.length) * 100
          : 0,

      percentageOfCategorizedCases:
        categorizedCases.length > 0
          ? (
              item.count /
              categorizedCases.length
            ) * 100
          : 0,

      percentageOfOccurrences:
        totalOccurrences > 0
          ? (
              item.count /
              totalOccurrences
            ) * 100
          : 0
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return a.category.localeCompare(
        b.category
      );
    });

  return {
    filters: {
      owner,
      statuses: [...safeStatuses],
      type
    },

    sourceCases: safeData.length,
    scopedCases: scopedCases.length,
    categorizedCases: categorizedCases.length,

    uncategorizedCases:
      scopedCases.length -
      categorizedCases.length,

    totalOccurrences,
    categories,

    topCategory:
      categories[0] || null
  };
}
function findQACategoryInQuestion(question) {
  const normalizedQuestion =
    normalizeQAText(question);

  const categoryAliases = [
    {
      category: 'Content',
      aliases: [
        'content',
        'contenido'
      ]
    },
    {
      category: 'Styling',
      aliases: [
        'styling',
        'style',
        'estilo'
      ]
    },
    {
      category: 'Config',
      aliases: [
        'config',
        'configuration',
        'configuracion'
      ]
    },
    {
      category: 'Linking',
      aliases: [
        'linking',
        'links',
        'link',
        'enlaces',
        'enlace'
      ]
    },
    {
      category: 'Label',
      aliases: [
        'label',
        'labels',
        'etiqueta',
        'etiquetas'
      ]
    }
  ];

  const match = categoryAliases.find(item =>
    item.aliases.some(alias =>
      normalizedQuestion.includes(alias)
    )
  );

  return match
    ? match.category
    : null;
}
function buildQATopCategoryResponse(
  options = {}
) {
  const analysis =
    getQACategoryAnalysis(options);

  const top =
    analysis.topCategory;

  const scopeName =
    analysis.filters.owner ||
    'the current dataset';

  if (!analysis.scopedCases) {
    return `No non-passed QA cases were found for ${scopeName}.`;
  }

  if (!top) {
    return `No bug categories were detected for ${scopeName}.`;
  }

  return [
    `The most frequent category for ${scopeName} is ${top.category}.`,
    '',
    `Cases: ${top.count}`,
    `Percentage of non-passed cases: ${formatQAPercentage(top.percentageOfScope)}`,
    `Categorized cases analyzed: ${analysis.categorizedCases}`,
    `Non-passed cases analyzed: ${analysis.scopedCases}`,
    '',
    'A case may contain more than one category.'
  ].join('\n');
}
function buildQACategoryBreakdownResponse(
  options = {}
) {
  const analysis =
    getQACategoryAnalysis(options);

  const scopeName =
    analysis.filters.owner ||
    'the current dataset';

  if (!analysis.scopedCases) {
    return `No non-passed QA cases were found for ${scopeName}.`;
  }

  if (!analysis.categories.length) {
    return `No bug categories were detected for ${scopeName}.`;
  }

  const categoryLines =
    analysis.categories.map(
      (item, index) =>
        `${index + 1}. ${item.category}: ` +
        `${item.count} cases ` +
        `(${formatQAPercentage(item.percentageOfScope)})`
    );

  return [
    `Bug category breakdown for ${scopeName}:`,
    '',
    ...categoryLines,
    '',
    `Non-passed cases analyzed: ${analysis.scopedCases}`,
    `Cases with detected categories: ${analysis.categorizedCases}`,
    `Cases without a detected category: ${analysis.uncategorizedCases}`,
    '',
    'Percentages use all non-passed cases in the selected scope. A case may contain multiple categories.'
  ].join('\n');
}
function buildQACategoryDetailResponse(
  categoryName,
  options = {}
) {
  const analysis =
    getQACategoryAnalysis(options);

  const normalizedCategory =
    normalizeQAText(categoryName);

  const category =
    analysis.categories.find(item =>
      normalizeQAText(item.category) ===
      normalizedCategory
    );

  const scopeName =
    analysis.filters.owner ||
    'the current dataset';

  if (!category) {
    return `${categoryName} was not detected in the selected QA cases for ${scopeName}.`;
  }

  return [
    `${category.category} appears in ${category.count} QA cases for ${scopeName}.`,
    '',
    `Percentage of non-passed cases: ${formatQAPercentage(category.percentageOfScope)}`,
    `Landing Page cases: ${category.byType.LP || 0}`,
    `Posting cases: ${category.byType.Posting || 0}`,
    `Unknown type: ${category.byType.Unknown || 0}`,
    '',
    `Non-passed cases analyzed: ${analysis.scopedCases}`
  ].join('\n');
}
// ═══════════════════════════════════════
// QA QUEUE — PENDING & RESPONDED CASES
// ═══════════════════════════════════════

function hasQAFixResponse(item) {
  return Boolean(
    String(item?.fix_comment || '').trim()
  );
}

function isQAPendingCase(item) {
  if (!item) return false;

  return (
    item.status !== 'Passed' &&
    !hasQAFixResponse(item)
  );
}

function isQARespondedCase(item) {
  if (!item) return false;

  return hasQAFixResponse(item);
}
function getQAQueueStatus(pendingCount) {
  if (pendingCount > 10) {
    return {
      key: 'risk',
      label: '🚨 At Risk'
    };
  }

  if (pendingCount >= 5) {
    return {
      key: 'watch',
      label: '⚠ Watch'
    };
  }

  return {
    key: 'stable',
    label: '✓ Stable'
  };
}
function truncateQAText(text, maxLength = 100) {
  const cleanText = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  return `${cleanText.slice(0, maxLength - 1)}…`;
}

function toQAQueueEvidence(item) {
  return {
    task_id: item.task_id,
    owner: item.owner,
    status: item.status,
    original_status: item.original_status,
    type: item.type,
    category: Array.isArray(item.categories)
      ? [...item.categories]
      : [],
    qa_by: item.qa_by,
    qa_date: item.day,
    completed_date: item.completed_date,
    summary: item.summary,
    fix_comment: item.fix_comment
  };
}
function getQAQueueAnalysis({
  data = DATA,
  owner = null,
  type = null,
  category = null,
  limit = 20
} = {}) {
  const safeData = Array.isArray(data)
    ? data
    : [];

  const safeLimit =
    Number.isFinite(limit) && limit >= 0
      ? Math.floor(limit)
      : 20;

  // ── Scope filters ──
  const scopedCases = safeData.filter(item => {
    if (owner && item.owner !== owner) {
      return false;
    }

    if (type && item.type !== type) {
      return false;
    }

    if (
      category &&
      !(
        Array.isArray(item.categories) &&
        item.categories.includes(category)
      )
    ) {
      return false;
    }

    return true;
  });

  // Casos que originalmente llegaron con una observación
  const issueCases = scopedCases.filter(item =>
    item.original_status !== 'Passed'
  );

  // No Passed + sin respuesta
  const pendingCases = scopedCases.filter(
    isQAPendingCase
  );

  // Cualquier caso con QA Fix Comment
  const respondedCases = scopedCases.filter(
    isQARespondedCase
  );

  // Respondidos que continúan abiertos
  const respondedOpenCases =
    respondedCases.filter(item =>
      item.status !== 'Passed'
    );

  // Casos originalmente no Passed que ahora están Passed
  const resolvedByResponseCases =
    respondedCases.filter(item =>
      item.status === 'Passed' &&
      item.original_status !== 'Passed'
    );

  // Respuestas sobre casos que originalmente tenían issue
  const respondedIssueCases =
    issueCases.filter(isQARespondedCase);

  const responseRate =
    issueCases.length > 0
      ? (
          respondedIssueCases.length /
          issueCases.length
        ) * 100
      : 0;

  // ── Pending by final status ──
  const pendingByStatus = {
    Opportunity: pendingCases.filter(
      item => item.status === 'Opportunity'
    ).length,

    Failed: pendingCases.filter(
      item => item.status === 'Failed'
    ).length,

    Critical: pendingCases.filter(
      item => item.status === 'Critical'
    ).length
  };

  // ── Queue metrics by owner ──
  const owners = [
    ...new Set(
      scopedCases
        .map(item => item.owner)
        .filter(Boolean)
    )
  ];

  const byOwner = owners
    .map(ownerName => {
      const ownerCases =
        scopedCases.filter(item =>
          item.owner === ownerName
        );

      const ownerPending =
        ownerCases.filter(isQAPendingCase);

      const ownerResponded =
        ownerCases.filter(isQARespondedCase);

      const ownerRespondedOpen =
        ownerResponded.filter(item =>
          item.status !== 'Passed'
        );

      return {
        owner: ownerName,
        total: ownerCases.length,
        pending: ownerPending.length,
        responded: ownerResponded.length,
        respondedOpen:
          ownerRespondedOpen.length
      };
    })
    .sort((a, b) => {
      if (b.pending !== a.pending) {
        return b.pending - a.pending;
      }

      if (b.respondedOpen !== a.respondedOpen) {
        return b.respondedOpen - a.respondedOpen;
      }

      return b.total - a.total;
    });

  const queueStatus =
    getQAQueueStatus(pendingCases.length);

  return {
    filters: {
      owner,
      type,
      category
    },

    scopedCases: scopedCases.length,

    issueCases: issueCases.length,

    pendingCount:
      pendingCases.length,

    respondedCount:
      respondedCases.length,

    respondedIssueCount:
      respondedIssueCases.length,

    respondedOpenCount:
      respondedOpenCases.length,

    resolvedByResponseCount:
      resolvedByResponseCases.length,

    responseRate,

    pendingByStatus,

    queueStatus,

    byOwner,

    pendingCases:
      pendingCases
        .slice(0, safeLimit)
        .map(toQAQueueEvidence),

    respondedCases:
      respondedCases
        .slice(0, safeLimit)
        .map(toQAQueueEvidence),

    respondedOpenCases:
      respondedOpenCases
        .slice(0, safeLimit)
        .map(toQAQueueEvidence),

    resolvedByResponseCases:
      resolvedByResponseCases
        .slice(0, safeLimit)
        .map(toQAQueueEvidence),

    pendingTruncated:
      pendingCases.length > safeLimit,

    respondedTruncated:
      respondedCases.length > safeLimit
  };
}
function buildQAPendingSummaryResponse(
  options = {}
) {
  const analysis =
    getQAQueueAnalysis(options);

  const scopeName =
    analysis.filters.owner ||
    'the current dataset';

  if (!analysis.scopedCases) {
    return `No QA cases were found for ${scopeName}.`;
  }

  const topOwner =
    !analysis.filters.owner
      ? analysis.byOwner.find(
          item => item.pending > 0
        )
      : null;

  return [
    `${analysis.pendingCount} pending QA cases were found for ${scopeName}.`,
    '',
    `Queue status: ${analysis.queueStatus.label}`,
    '',
    `Opportunity pending: ${analysis.pendingByStatus.Opportunity}`,
    `Failed pending: ${analysis.pendingByStatus.Failed}`,
    `Critical pending: ${analysis.pendingByStatus.Critical}`,
    '',
    topOwner
      ? `Owner with the most pending cases: ${topOwner.owner} (${topOwner.pending})`
      : null,
    '',
    'A pending case is non-Passed and has no QA Fix Comment.'
  ]
    .filter(line => line !== null)
    .join('\n');
}
function formatQAQueueCase(
  item,
  {
    includeFixComment = false
  } = {}
) {
  const categories =
    item.category?.length
      ? item.category.join(', ')
      : 'No category';

  const lines = [
    `• ${item.task_id || 'No Task ID'}`,
    `  Owner: ${item.owner || 'Unknown'}`,
    `  Status: ${item.status}`,
    `  Type: ${item.type || 'Unknown'}`,
    `  Category: ${categories}`,
    `  QA date: ${item.qa_date || 'N/A'}`
  ];

  if (includeFixComment) {
    lines.push(
      `  Response: ${
        truncateQAText(
          item.fix_comment,
          120
        ) || 'No response'
      }`
    );
  }

  return lines.join('\n');
}

function buildQAPendingListResponse(
  options = {},
  maxItems = 10
) {
  const analysis =
    getQAQueueAnalysis({
      ...options,
      limit: maxItems
    });

  const scopeName =
    analysis.filters.owner ||
    'the current dataset';

  if (!analysis.pendingCount) {
    return `No pending QA cases were found for ${scopeName}.`;
  }

  const caseLines =
    analysis.pendingCases.map(item =>
      formatQAQueueCase(item)
    );

  return [
    `${analysis.pendingCount} pending QA cases were found for ${scopeName}.`,
    '',
    `Showing ${analysis.pendingCases.length} of ${analysis.pendingCount}:`,
    '',
    ...caseLines,
    '',
    analysis.pendingTruncated
      ? `Only the first ${maxItems} pending cases are shown.`
      : 'All pending cases are shown.'
  ].join('\n');
}
function buildQARespondedSummaryResponse(
  options = {}
) {
  const analysis =
    getQAQueueAnalysis(options);

  const scopeName =
    analysis.filters.owner ||
    'the current dataset';

  if (!analysis.scopedCases) {
    return `No QA cases were found for ${scopeName}.`;
  }

  return [
    `${analysis.respondedCount} QA cases have a Fix Comment for ${scopeName}.`,
    '',
    `Responses on originally non-Passed cases: ${analysis.respondedIssueCount}`,
    `Responded but still open: ${analysis.respondedOpenCount}`,
    `Resolved after a response: ${analysis.resolvedByResponseCount}`,
    '',
    `Response coverage for originally non-Passed cases: ${formatQAPercentage(analysis.responseRate)}`,
    '',
    'Responded means a QA Fix Comment exists. It does not always mean the case is resolved.'
  ].join('\n');
}
function buildQARespondedListResponse(
  options = {},
  maxItems = 10
) {
  const analysis =
    getQAQueueAnalysis({
      ...options,
      limit: maxItems
    });

  const scopeName =
    analysis.filters.owner ||
    'the current dataset';

  if (!analysis.respondedCount) {
    return `No responded QA cases were found for ${scopeName}.`;
  }

  const caseLines =
    analysis.respondedCases.map(item =>
      formatQAQueueCase(
        item,
        {
          includeFixComment: true
        }
      )
    );

  return [
    `${analysis.respondedCount} responded QA cases were found for ${scopeName}.`,
    '',
    `Showing ${analysis.respondedCases.length} of ${analysis.respondedCount}:`,
    '',
    ...caseLines,
    '',
    analysis.respondedTruncated
      ? `Only the first ${maxItems} responded cases are shown.`
      : 'All responded cases are shown.'
  ].join('\n');
}
function buildQATopPendingOwnerResponse() {
  const analysis =
    getQAQueueAnalysis({
      limit: 0
    });

  if (!analysis.pendingCount) {
    return 'There are no pending QA cases in the current dataset.';
  }

  const maximum =
    Math.max(
      ...analysis.byOwner.map(
        item => item.pending
      )
    );

  const leaders =
    analysis.byOwner.filter(
      item =>
        item.pending === maximum &&
        item.pending > 0
    );

  if (leaders.length > 1) {
    return [
      `There is a tie for the highest number of pending cases:`,
      '',
      ...leaders.map(
        item =>
          `• ${item.owner}: ${item.pending} pending cases`
      )
    ].join('\n');
  }

  const top = leaders[0];

  return [
    `${top.owner} has the highest number of pending cases.`,
    '',
    `Pending cases: ${top.pending}`,
    `Responded cases: ${top.responded}`,
    `Responded but still open: ${top.respondedOpen}`,
    `Total QA cases: ${top.total}`
  ].join('\n');
}
function containsNormalizedPhrase(
  text,
  phrase
) {
  const normalizedText =
    normalizeQAText(text)
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const normalizedPhrase =
    normalizeQAText(phrase)
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  if (!normalizedPhrase) {
    return false;
  }

  return (
    ` ${normalizedText} `
      .includes(
        ` ${normalizedPhrase} `
      )
  );
}
function getQAReviewerDirectory(
  data = DATA
) {
  const safeData = Array.isArray(data)
    ? data
    : [];

  const reviewerMap = new Map();

  safeData.forEach(item => {
    if (!String(item.qa_by || '').trim()) {
      return;
    }

    const identity =
      resolveQAReviewerIdentity(
        item.qa_by,
        safeData
      );

    if (!identity.displayName) {
      return;
    }

    const key =
      normalizeQAText(
        identity.displayName
      );

    if (!reviewerMap.has(key)) {
      reviewerMap.set(key, {
        displayName:
          identity.displayName,

        canonicalName:
          identity.canonicalName,

        resolved:
          identity.resolved,

        rawNames: new Set()
      });
    }

    reviewerMap
      .get(key)
      .rawNames
      .add(identity.rawName);
  });

  return [
    ...reviewerMap.values()
  ]
    .map(item => ({
      ...item,
      rawNames: [...item.rawNames]
    }))
    .sort((a, b) =>
      a.displayName.localeCompare(
        b.displayName
      )
    );
}
function findQAReviewerInQuestion(
  question
) {
  const directory =
    getQAReviewerDirectory();

  const directMatches =
    directory.filter(reviewer => {
      const possibleNames = [
        reviewer.displayName,
        reviewer.canonicalName,
        ...reviewer.rawNames
      ].filter(Boolean);

      return possibleNames.some(name =>
        containsNormalizedPhrase(
          question,
          name
        )
      );
    });

  if (directMatches.length === 1) {
    return {
      match: directMatches[0],
      ambiguous: false,
      options: []
    };
  }

  if (directMatches.length > 1) {
    return {
      match: null,
      ambiguous: true,
      options: directMatches.map(
        item => item.displayName
      )
    };
  }

  // Busca por primer nombre cuando no hubo match directo
  const normalizedQuestion =
    normalizeQAText(question);

  const firstNameMatches =
    directory.filter(reviewer => {
      const firstName =
        normalizeQAText(
          reviewer.displayName
        ).split(' ')[0];

      return containsNormalizedPhrase(
        normalizedQuestion,
        firstName
      );
    });

  if (firstNameMatches.length === 1) {
    return {
      match: firstNameMatches[0],
      ambiguous: false,
      options: []
    };
  }

  if (firstNameMatches.length > 1) {
    return {
      match: null,
      ambiguous: true,
      options: firstNameMatches.map(
        item => item.displayName
      )
    };
  }

  return {
    match: null,
    ambiguous: false,
    options: []
  };
}
function toQAReviewerEvidence(
  item,
  data = DATA
) {
  const identity =
    resolveQAReviewerIdentity(
      item.qa_by,
      data
    );

  return {
    task_id: item.task_id,
    owner: item.owner,

    reviewer:
      identity.displayName,

    reviewer_raw:
      identity.rawName,

    reviewer_resolved:
      identity.resolved,

    status: item.status,
    original_status:
      item.original_status,

    type: item.type,

    categories:
      Array.isArray(item.categories)
        ? [...item.categories]
        : [],

    qa_date: item.day,

    completed_date:
      item.completed_date,

    summary: item.summary
  };
}
function getQAReviewerAnalysis({
  data = DATA,
  reviewer = null,
  owner = null,
  statuses = [],
  type = null,
  category = null,
  limit = 20
} = {}) {
  const safeData = Array.isArray(data)
    ? data
    : [];

  const safeStatuses =
    Array.isArray(statuses)
      ? statuses
      : [];

  const safeLimit =
    Number.isFinite(limit) &&
    limit >= 0
      ? Math.floor(limit)
      : 20;

  const normalizedReviewer =
    reviewer
      ? normalizeQAText(reviewer)
      : null;

  const scopedCases =
    safeData.filter(item => {
      if (!String(item.qa_by || '').trim()) {
        return false;
      }

      const identity =
        resolveQAReviewerIdentity(
          item.qa_by,
          safeData
        );

      if (normalizedReviewer) {
        const possibleNames = [
          identity.displayName,
          identity.canonicalName,
          identity.rawName
        ]
          .filter(Boolean)
          .map(normalizeQAText);

        if (
          !possibleNames.includes(
            normalizedReviewer
          )
        ) {
          return false;
        }
      }

      if (
        owner &&
        item.owner !== owner
      ) {
        return false;
      }

      if (
        safeStatuses.length > 0 &&
        !safeStatuses.includes(
          item.status
        )
      ) {
        return false;
      }

      if (
        type &&
        item.type !== type
      ) {
        return false;
      }

      if (
        category &&
        !(
          Array.isArray(item.categories) &&
          item.categories.includes(category)
        )
      ) {
        return false;
      }

      return true;
    });

  const reviewerMap = new Map();

  scopedCases.forEach(item => {
    const identity =
      resolveQAReviewerIdentity(
        item.qa_by,
        safeData
      );

    const displayName =
      identity.displayName;

    if (!displayName) {
      return;
    }

    const key =
      normalizeQAText(displayName);

    if (!reviewerMap.has(key)) {
      reviewerMap.set(key, {
        reviewer: displayName,

        canonicalName:
          identity.canonicalName,

        resolved:
          identity.resolved,

        rawNames: new Set(),

        cases: []
      });
    }

    const entry =
      reviewerMap.get(key);

    entry.rawNames.add(
      identity.rawName
    );

    entry.cases.push(item);
  });

  const reviewers = [
    ...reviewerMap.values()
  ]
    .map(entry => {
      const cases = entry.cases;
      const total = cases.length;

      const passed = cases.filter(
        item =>
          item.status === 'Passed'
      ).length;

      const opportunity = cases.filter(
        item =>
          item.status === 'Opportunity'
      ).length;

      const failed = cases.filter(
        item =>
          item.status === 'Failed'
      ).length;

      const critical = cases.filter(
        item =>
          item.status === 'Critical'
      ).length;

      const errorsFound =
        failed + critical;

      const findings =
        opportunity +
        failed +
        critical;

      const passRate =
        total > 0
          ? (
              (
                passed +
                opportunity
              ) /
              total
            ) * 100
          : 0;

      const errorFindingRate =
        total > 0
          ? (
              errorsFound /
              total
            ) * 100
          : 0;

      const findingRate =
        total > 0
          ? (
              findings /
              total
            ) * 100
          : 0;

      const byType = {
        LP: cases.filter(
          item => item.type === 'LP'
        ).length,

        Posting: cases.filter(
          item =>
            item.type === 'Posting'
        ).length,

        Unknown: cases.filter(
          item =>
            item.type === 'Unknown'
        ).length
      };

      const ownerCounts = {};

      cases.forEach(item => {
        if (!item.owner) return;

        ownerCounts[item.owner] =
          (ownerCounts[item.owner] || 0) +
          1;
      });

      const reviewedOwners =
        Object.entries(ownerCounts)
          .map(([ownerName, count]) => ({
            owner: ownerName,
            count
          }))
          .sort(
            (a, b) =>
              b.count - a.count
          );

      return {
        reviewer: entry.reviewer,

        canonicalName:
          entry.canonicalName,

        resolved:
          entry.resolved,

        rawNames:
          [...entry.rawNames],

        total,
        passed,
        opportunity,
        failed,
        critical,

        errorsFound,
        findings,

        passRate,
        errorFindingRate,
        findingRate,

        uniqueOwnersReviewed:
          reviewedOwners.length,

        reviewedOwners,
        byType,

        cases:
          cases
            .slice(0, safeLimit)
            .map(item =>
              toQAReviewerEvidence(
                item,
                safeData
              )
            ),

        casesTruncated:
          cases.length > safeLimit
      };
    })
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }

      if (
        b.errorsFound !==
        a.errorsFound
      ) {
        return (
          b.errorsFound -
          a.errorsFound
        );
      }

      return a.reviewer.localeCompare(
        b.reviewer
      );
    });

  const topByVolume =
    reviewers[0] || null;

  const topByErrorsFound =
    [...reviewers]
      .sort((a, b) => {
        if (
          b.errorsFound !==
          a.errorsFound
        ) {
          return (
            b.errorsFound -
            a.errorsFound
          );
        }

        return b.total - a.total;
      })[0] || null;

  return {
    filters: {
      reviewer,
      owner,
      statuses: [...safeStatuses],
      type,
      category
    },

    totalReviews:
      scopedCases.length,

    reviewerCount:
      reviewers.length,

    reviewers,

    topByVolume,
    topByErrorsFound
  };
}
function buildQAReviewerSummaryResponse(
  reviewerName
) {
  const analysis =
    getQAReviewerAnalysis({
      reviewer: reviewerName,
      limit: 0
    });

  const reviewer =
    analysis.reviewers[0];

  if (!reviewer) {
    return `No QA review activity was found for ${reviewerName}.`;
  }

  return [
    `${reviewer.reviewer} completed ${reviewer.total} QA reviews.`,
    '',
    `✓ Passed: ${reviewer.passed}`,
    `● Opportunity: ${reviewer.opportunity}`,
    `▲ Failed: ${reviewer.failed}`,
    `✕ Critical: ${reviewer.critical}`,
    '',
    `Errors found: ${reviewer.errorsFound}`,
    `Error finding rate: ${formatQAPercentage(reviewer.errorFindingRate)}`,
    `Pass rate: ${formatQAPercentage(reviewer.passRate)}`,
    '',
    `Different owners reviewed: ${reviewer.uniqueOwnersReviewed}`,
    `Landing Pages reviewed: ${reviewer.byType.LP}`,
    `Posting cases reviewed: ${reviewer.byType.Posting}`,
    '',
    'These metrics describe cases reviewed as QA, not the reviewer’s own production cases.'
  ].join('\n');
}
function formatQAReviewerCase(item) {
  const categories =
    item.categories?.length
      ? item.categories.join(', ')
      : 'No category';

  return [
    `• ${item.task_id || 'No Task ID'}`,
    `  Owner: ${item.owner || 'Unknown'}`,
    `  Status: ${item.status}`,
    `  Type: ${item.type || 'Unknown'}`,
    `  Categories: ${categories}`,
    `  QA date: ${item.qa_date || 'N/A'}`
  ].join('\n');
}
function buildQAReviewerCasesResponse(
  reviewerName,
  maxItems = 10
) {
  const analysis =
    getQAReviewerAnalysis({
      reviewer: reviewerName,
      limit: maxItems
    });

  const reviewer =
    analysis.reviewers[0];

  if (!reviewer) {
    return `No QA review activity was found for ${reviewerName}.`;
  }

  return [
    `${reviewer.reviewer} completed ${reviewer.total} QA reviews.`,
    '',
    `Showing ${reviewer.cases.length} of ${reviewer.total}:`,
    '',
    ...reviewer.cases.map(
      formatQAReviewerCase
    ),
    '',
    reviewer.casesTruncated
      ? `Only the first ${maxItems} reviews are shown.`
      : 'All reviewed cases are shown.'
  ].join('\n');
}
function buildQATopReviewerResponse() {
  const analysis =
    getQAReviewerAnalysis({
      limit: 0
    });

  if (!analysis.reviewers.length) {
    return 'No QA review activity is available.';
  }

  const maximum =
    Math.max(
      ...analysis.reviewers.map(
        item => item.total
      )
    );

  const leaders =
    analysis.reviewers.filter(
      item => item.total === maximum
    );

  if (leaders.length > 1) {
    return [
      'There is a tie for the highest number of QA reviews:',
      '',
      ...leaders.map(
        item =>
          `• ${item.reviewer}: ${item.total} reviews`
      )
    ].join('\n');
  }

  const top = leaders[0];

  return [
    `${top.reviewer} completed the most QA reviews.`,
    '',
    `Total reviews: ${top.total}`,
    `Passed: ${top.passed}`,
    `Opportunity: ${top.opportunity}`,
    `Failed: ${top.failed}`,
    `Critical: ${top.critical}`,
    `Different owners reviewed: ${top.uniqueOwnersReviewed}`
  ].join('\n');
}
function buildQATopErrorFinderResponse() {
  const analysis =
    getQAReviewerAnalysis({
      limit: 0
    });

  if (!analysis.reviewers.length) {
    return 'No QA review activity is available.';
  }

  const maximum =
    Math.max(
      ...analysis.reviewers.map(
        item => item.errorsFound
      )
    );

  const leaders =
    analysis.reviewers.filter(
      item =>
        item.errorsFound === maximum
    );

  if (leaders.length > 1) {
    return [
      'There is a tie for the highest number of errors found during QA reviews:',
      '',
      ...leaders.map(
        item =>
          `• ${item.reviewer}: ${item.errorsFound} errors found`
      ),
      '',
      'Errors found means Failed + Critical outcomes.'
    ].join('\n');
  }

  const top = leaders[0];

  return [
    `${top.reviewer} found the highest number of errors during QA reviews.`,
    '',
    `Errors found: ${top.errorsFound}`,
    `Failed: ${top.failed}`,
    `Critical: ${top.critical}`,
    `Total reviews: ${top.total}`,
    `Error finding rate: ${formatQAPercentage(top.errorFindingRate)}`,
    '',
    'This describes the outcomes of assigned reviews; it is not a negative performance score for the reviewer.'
  ].join('\n');
}
function buildQAReviewerLeaderboardResponse() {
  const analysis =
    getQAReviewerAnalysis({
      limit: 0
    });

  if (!analysis.reviewers.length) {
    return 'No QA review activity is available.';
  }

  const rows =
    analysis.reviewers.map(
      (item, index) =>
        `${index + 1}. ${item.reviewer}: ` +
        `${item.total} reviews · ` +
        `${item.errorsFound} errors found`
    );

  return [
    'QA reviewer activity:',
    '',
    ...rows,
    '',
    `Total reviews: ${analysis.totalReviews}`,
    `QA reviewers detected: ${analysis.reviewerCount}`
  ].join('\n');
}
// ═══════════════════════════════════════
// QA CASE FILTERS
// ═══════════════════════════════════════

function toQAFilterArray(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean);
  }

  if (value === null || value === undefined) {
    return [];
  }

  const stringValue =
    String(value).trim();

  return stringValue
    ? [stringValue]
    : [];
}

function normalizeQAStatusFilterValue(value) {
  const normalized =
    normalizeQAText(value);

  const statusMap = {
    passed: 'Passed',
    opportunity: 'Opportunity',
    observed: 'Opportunity',
    failed: 'Failed',
    critical: 'Critical',
    pending: 'Pending',
    responded: 'Responded'
  };

  return (
    statusMap[normalized] ||
    String(value || '').trim()
  );
}

function normalizeQATypeFilterValue(value) {
  const normalized =
    normalizeQAText(value);

  if (
    normalized === 'lp' ||
    normalized === 'landing page' ||
    normalized === 'landing pages'
  ) {
    return 'LP';
  }

  if (
    normalized === 'posting' ||
    normalized === 'posting case' ||
    normalized === 'posting cases'
  ) {
    return 'Posting';
  }

  if (
    normalized === 'unknown' ||
    normalized === 'desconocido'
  ) {
    return 'Unknown';
  }

  return String(value || '').trim();
}

function getQADateTimestamp(value) {
  const cleanValue =
    normalizeDate(
      String(value || '').trim()
    );

  if (!cleanValue) {
    return null;
  }

  const parsedDate =
    parseMDY(cleanValue);

  const timestamp =
    parsedDate.getTime();

  return Number.isNaN(timestamp)
    ? null
    : timestamp;
}

function isQADateInRange(
  value,
  from = null,
  to = null
) {
  if (!from && !to) {
    return true;
  }

  const currentTimestamp =
    getQADateTimestamp(value);

  if (currentTimestamp === null) {
    return false;
  }

  let fromTimestamp =
    from !== null
      ? getQADateTimestamp(from)
      : null;

  let toTimestamp =
    to !== null
      ? getQADateTimestamp(to)
      : null;

  if (
    fromTimestamp !== null &&
    toTimestamp !== null &&
    fromTimestamp > toTimestamp
  ) {
    [
      fromTimestamp,
      toTimestamp
    ] = [
      toTimestamp,
      fromTimestamp
    ];
  }

  if (
    fromTimestamp !== null &&
    currentTimestamp < fromTimestamp
  ) {
    return false;
  }

  if (
    toTimestamp !== null &&
    currentTimestamp > toTimestamp
  ) {
    return false;
  }

  return true;
}

function matchesQAReviewerFilter(
  item,
  reviewerFilter,
  data = DATA
) {
  const itemIdentity =
    resolveQAReviewerIdentity(
      item.qa_by,
      data
    );

  const requestedIdentity =
    resolveQAReviewerIdentity(
      reviewerFilter,
      data
    );

  const itemNames = [
    itemIdentity.rawName,
    itemIdentity.displayName,
    itemIdentity.canonicalName
  ]
    .filter(Boolean)
    .map(normalizeQAText);

  const requestedNames = [
    reviewerFilter,
    requestedIdentity.rawName,
    requestedIdentity.displayName,
    requestedIdentity.canonicalName
  ]
    .filter(Boolean)
    .map(normalizeQAText);

  return requestedNames.some(name =>
    itemNames.includes(name)
  );
}
function filterQACases({
  data = DATA,

  qaDateFrom = null,
  qaDateTo = null,

  completedDateFrom = null,
  completedDateTo = null,

  owners = [],
  reviewers = [],
  statuses = [],
  categories = [],
  types = [],

  text = ''
} = {}) {
  const safeData =
    Array.isArray(data)
      ? data
      : [];

  const ownerFilters =
    toQAFilterArray(owners)
      .map(normalizeQAText);

  const reviewerFilters =
    toQAFilterArray(reviewers);

  const statusFilters =
    toQAFilterArray(statuses)
      .map(normalizeQAStatusFilterValue);

  const categoryFilters =
    toQAFilterArray(categories)
      .map(normalizeQAText);

  const typeFilters =
    toQAFilterArray(types)
      .map(normalizeQATypeFilterValue);

  const normalizedText =
    normalizeQAText(text);

  return safeData.filter(item => {
    // ── QA Date ──
    if (
      (qaDateFrom || qaDateTo) &&
      !isQADateInRange(
        item.day,
        qaDateFrom,
        qaDateTo
      )
    ) {
      return false;
    }

    // ── Completed Date ──
    if (
      (
        completedDateFrom ||
        completedDateTo
      ) &&
      !isQADateInRange(
        item.completed_date,
        completedDateFrom,
        completedDateTo
      )
    ) {
      return false;
    }

    // ── Owner ──
    if (
      ownerFilters.length > 0 &&
      !ownerFilters.includes(
        normalizeQAText(item.owner)
      )
    ) {
      return false;
    }

    // ── QA Reviewer ──
    if (
      reviewerFilters.length > 0 &&
      !reviewerFilters.some(
        reviewer =>
          matchesQAReviewerFilter(
            item,
            reviewer,
            safeData
          )
      )
    ) {
      return false;
    }

    // ── Status ──
    if (
      statusFilters.length > 0 &&
      !statusFilters.some(status => {
        if (status === 'Pending') {
          return isQAPendingCase(item);
        }

        if (status === 'Responded') {
          return isQARespondedCase(item);
        }

        return item.status === status;
      })
    ) {
      return false;
    }

    // ── Category ──
    if (categoryFilters.length > 0) {
      const itemCategories =
        Array.isArray(item.categories)
          ? item.categories.map(
              normalizeQAText
            )
          : [];

      const categoryMatches =
        categoryFilters.some(category =>
          itemCategories.includes(category)
        );

      if (!categoryMatches) {
        return false;
      }
    }

    // ── Type ──
    if (
      typeFilters.length > 0 &&
      !typeFilters.includes(item.type)
    ) {
      return false;
    }

    // ── Text search ──
    if (normalizedText) {
      const searchableText =
        normalizeQAText([
          item.owner,
          item.task_id,
          item.status,
          item.original_status,
          item.type,
          item.qa_by,
          item.summary,
          item.fix_comment,
          ...(item.categories || [])
        ].join(' '));

      if (
        !searchableText.includes(
          normalizedText
        )
      ) {
        return false;
      }
    }

    return true;
  });
}
function toQACaseFilterEvidence(
  item,
  data = DATA
) {
  return {
    task_id: item.task_id,

    owner: item.owner,

    reviewer:
      getQAReviewerDisplayName(
        item.qa_by,
        data
      ),

    reviewer_raw:
      item.qa_by,

    status: item.status,

    original_status:
      item.original_status,

    type: item.type,

    categories:
      Array.isArray(item.categories)
        ? [...item.categories]
        : [],

    qa_date:
      item.day,

    completed_date:
      item.completed_date,

    pending:
      isQAPendingCase(item),

    responded:
      isQARespondedCase(item),

    summary:
      truncateQAText(
        item.summary,
        180
      ),

    fix_comment:
      truncateQAText(
        item.fix_comment,
        180
      )
  };
}
function getQACasesByFilters({
  data = DATA,

  qaDateFrom = null,
  qaDateTo = null,

  completedDateFrom = null,
  completedDateTo = null,

  owners = [],
  reviewers = [],
  statuses = [],
  categories = [],
  types = [],

  text = '',
  limit = 20
} = {}) {
  const safeData =
    Array.isArray(data)
      ? data
      : [];

  const safeLimit =
    Number.isFinite(limit) &&
    limit >= 0
      ? Math.floor(limit)
      : 20;

  const filteredCases =
    filterQACases({
      data: safeData,

      qaDateFrom,
      qaDateTo,

      completedDateFrom,
      completedDateTo,

      owners,
      reviewers,
      statuses,
      categories,
      types,

      text
    });

  const total =
    filteredCases.length;

  const passed =
    filteredCases.filter(
      item => item.status === 'Passed'
    ).length;

  const opportunity =
    filteredCases.filter(
      item =>
        item.status === 'Opportunity'
    ).length;

  const failed =
    filteredCases.filter(
      item => item.status === 'Failed'
    ).length;

  const critical =
    filteredCases.filter(
      item => item.status === 'Critical'
    ).length;

  const pending =
    filteredCases.filter(
      isQAPendingCase
    ).length;

  const responded =
    filteredCases.filter(
      isQARespondedCase
    ).length;

  const errors =
    failed + critical;

  const passRate =
    total > 0
      ? (
          (
            passed +
            opportunity
          ) /
          total
        ) * 100
      : 0;

  const errorRate =
    total > 0
      ? (
          errors /
          total
        ) * 100
      : 0;

  // ── Breakdown by owner ──
  const ownerCounts = {};

  filteredCases.forEach(item => {
    if (!item.owner) return;

    ownerCounts[item.owner] =
      (ownerCounts[item.owner] || 0) +
      1;
  });

  const byOwner =
    Object.entries(ownerCounts)
      .map(([owner, count]) => ({
        owner,
        count
      }))
      .sort(
        (a, b) =>
          b.count - a.count
      );

  // ── Breakdown by type ──
  const byType = {
    LP: filteredCases.filter(
      item => item.type === 'LP'
    ).length,

    Posting: filteredCases.filter(
      item => item.type === 'Posting'
    ).length,

    Unknown: filteredCases.filter(
      item => item.type === 'Unknown'
    ).length
  };

  // ── Breakdown by category ──
  const categoryCounts = {};

  filteredCases.forEach(item => {
    const uniqueCategories = [
      ...new Set(
        item.categories || []
      )
    ];

    uniqueCategories.forEach(category => {
      categoryCounts[category] =
        (categoryCounts[category] || 0) +
        1;
    });
  });

  const byCategory =
    Object.entries(categoryCounts)
      .map(([category, count]) => ({
        category,
        count
      }))
      .sort(
        (a, b) =>
          b.count - a.count
      );

  const reviewerAnalysis =
    getQAReviewerAnalysis({
      data: filteredCases,
      limit: 0
    });

  return {
    filters: {
      qaDateFrom,
      qaDateTo,

      completedDateFrom,
      completedDateTo,

      owners:
        toQAFilterArray(owners),

      reviewers:
        toQAFilterArray(reviewers),

      statuses:
        toQAFilterArray(statuses)
          .map(
            normalizeQAStatusFilterValue
          ),

      categories:
        toQAFilterArray(categories),

      types:
        toQAFilterArray(types)
          .map(
            normalizeQATypeFilterValue
          ),

      text
    },

    sourceCount:
      safeData.length,

    matchedCount:
      total,

    summary: {
      total,
      passed,
      opportunity,
      failed,
      critical,
      errors,
      pending,
      responded,
      passRate,
      errorRate
    },

    uniqueOwners:
      byOwner.length,

    uniqueReviewers:
      reviewerAnalysis.reviewerCount,

    byOwner,
    byReviewer:
      reviewerAnalysis.reviewers,

    byType,
    byCategory,

    cases:
      filteredCases
        .slice(0, safeLimit)
        .map(item =>
          toQACaseFilterEvidence(
            item,
            safeData
          )
        ),

    truncated:
      filteredCases.length >
      safeLimit
  };
}
function buildQAFilterDescription(
  filters
) {
  const lines = [];

  if (filters.owners.length) {
    lines.push(
      `Owner: ${filters.owners.join(', ')}`
    );
  }

  if (filters.reviewers.length) {
    lines.push(
      `QA reviewer: ${filters.reviewers.join(', ')}`
    );
  }

  if (filters.statuses.length) {
    lines.push(
      `Status: ${filters.statuses.join(', ')}`
    );
  }

  if (filters.types.length) {
    lines.push(
      `Type: ${filters.types.join(', ')}`
    );
  }

  if (filters.categories.length) {
    lines.push(
      `Category: ${filters.categories.join(', ')}`
    );
  }

  if (
    filters.qaDateFrom ||
    filters.qaDateTo
  ) {
    lines.push(
      `QA date: ${
        filters.qaDateFrom || 'Any'
      } – ${
        filters.qaDateTo ||
        filters.qaDateFrom ||
        'Any'
      }`
    );
  }

  if (
    filters.completedDateFrom ||
    filters.completedDateTo
  ) {
    lines.push(
      `Completed date: ${
        filters.completedDateFrom ||
        'Any'
      } – ${
        filters.completedDateTo ||
        filters.completedDateFrom ||
        'Any'
      }`
    );
  }

  if (filters.text) {
    lines.push(
      `Text: "${filters.text}"`
    );
  }

  return lines;
}

function buildQAFilteredSummaryResponse(
  options = {}
) {
  const analysis =
    getQACasesByFilters({
      ...options,
      limit: 0
    });

  const filterLines =
    buildQAFilterDescription(
      analysis.filters
    );

  if (!analysis.matchedCount) {
    return [
      'No QA cases matched the selected filters.',
      '',
      ...filterLines.map(
        line => `• ${line}`
      )
    ].join('\n');
  }

  const summary =
    analysis.summary;

  return [
    `${analysis.matchedCount} QA cases matched the selected filters.`,
    '',
    'Filters:',
    ...filterLines.map(
      line => `• ${line}`
    ),
    '',
    `✓ Passed: ${summary.passed}`,
    `● Opportunity: ${summary.opportunity}`,
    `▲ Failed: ${summary.failed}`,
    `✕ Critical: ${summary.critical}`,
    '',
    `⏳ Pending: ${summary.pending}`,
    `💬 Responded: ${summary.responded}`,
    '',
    `Pass rate: ${formatQAPercentage(summary.passRate)}`,
    `Error rate: ${formatQAPercentage(summary.errorRate)}`
  ].join('\n');
}

function formatQAFilteredCase(item) {
  const categories =
    item.categories.length
      ? item.categories.join(', ')
      : 'No category';

  return [
    `• ${item.task_id || 'No Task ID'}`,
    `  Owner: ${item.owner || 'Unknown'}`,
    `  QA reviewer: ${item.reviewer || 'Unknown'}`,
    `  Status: ${item.status}`,
    `  Type: ${item.type || 'Unknown'}`,
    `  Categories: ${categories}`,
    `  QA date: ${item.qa_date || 'N/A'}`,
    `  Completed date: ${item.completed_date || 'N/A'}`
  ].join('\n');
}

function buildQAFilteredCasesResponse(
  options = {},
  maxItems = 10
) {
  const analysis =
    getQACasesByFilters({
      ...options,
      limit: maxItems
    });

  const filterLines =
    buildQAFilterDescription(
      analysis.filters
    );

  if (!analysis.matchedCount) {
    return [
      'No QA cases matched the selected filters.',
      '',
      ...filterLines.map(
        line => `• ${line}`
      )
    ].join('\n');
  }

  return [
    `${analysis.matchedCount} QA cases matched the selected filters.`,
    '',
    'Filters:',
    ...filterLines.map(
      line => `• ${line}`
    ),
    '',
    `Showing ${analysis.cases.length} of ${analysis.matchedCount}:`,
    '',
    ...analysis.cases.map(
      formatQAFilteredCase
    ),
    '',
    analysis.truncated
      ? `Only the first ${maxItems} cases are shown.`
      : 'All matching cases are shown.'
  ].join('\n');
}

function extractQAStatusFiltersFromQuestion(
  question
) {
  const normalized =
    normalizeQAText(question);

  const statuses = [];

  if (
    normalized.includes('non passed') ||
    normalized.includes('not passed') ||
    normalized.includes('no aprobados')
  ) {
    return [
      'Opportunity',
      'Failed',
      'Critical'
    ];
  }

  if (
    normalized.includes('pending') ||
    normalized.includes('pendiente')
  ) {
    statuses.push('Pending');
  }

  if (
    normalized.includes('responded') ||
    normalized.includes('respondido') ||
    normalized.includes('con respuesta')
  ) {
    statuses.push('Responded');
  }

  if (normalized.includes('critical')) {
    statuses.push('Critical');
  }

  if (normalized.includes('failed')) {
    statuses.push('Failed');
  }

  if (
    normalized.includes('opportunity') ||
    normalized.includes('observed')
  ) {
    statuses.push('Opportunity');
  }

  if (
    normalized.includes('passed') &&
    !normalized.includes('non passed') &&
    !normalized.includes('not passed')
  ) {
    statuses.push('Passed');
  }

  return [...new Set(statuses)];
}

function extractQATypeFiltersFromQuestion(
  question
) {
  const normalized =
    normalizeQAText(question);

  const types = [];

  if (
    containsNormalizedPhrase(
      normalized,
      'landing page'
    ) ||
    containsNormalizedPhrase(
      normalized,
      'lp'
    )
  ) {
    types.push('LP');
  }

  if (
    normalized.includes('posting')
  ) {
    types.push('Posting');
  }

  if (
    normalized.includes('unknown type') ||
    normalized.includes('tipo desconocido')
  ) {
    types.push('Unknown');
  }

  return [...new Set(types)];
}
function extractQADateFiltersFromQuestion(
  question
) {
  const normalized =
    normalizeQAText(question);

  const dateMatches =
    String(question).match(
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g
    ) || [];

  const dates =
    dateMatches
      .map(normalizeDate)
      .filter(Boolean);

  const usesCompletedDate =
    normalized.includes('completed date') ||
    normalized.includes('completion date') ||
    normalized.includes('fecha completada') ||
    normalized.includes('fecha de completado');

  if (!dates.length) {
    return {};
  }

  const from =
    dates[0];

  const to =
    dates[1] || dates[0];

  if (usesCompletedDate) {
    return {
      completedDateFrom: from,
      completedDateTo: to
    };
  }

  return {
    qaDateFrom: from,
    qaDateTo: to
  };
}

function parseQACombinedFilterQuestion(
  question
) {
  const normalized =
    normalizeQAText(question);

  const statuses =
    extractQAStatusFiltersFromQuestion(
      question
    );

  const types =
    extractQATypeFiltersFromQuestion(
      question
    );

  const detectedCategory =
    findQACategoryInQuestion(
      question
    );

  const dateFilters =
    extractQADateFiltersFromQuestion(
      question
    );

  const ownerResult =
    findQAOwnerInQuestion(
      question
    );

  const reviewerResult =
    findQAReviewerInQuestion(
      question
    );

  const reviewerContext =
    normalized.includes('reviewed by') ||
    normalized.includes('qa reviewer') ||
    normalized.includes('qa by') ||
    normalized.includes('as qa') ||
    normalized.includes('revisado por') ||
    normalized.includes('como qa');

  const owners = [];
  const reviewers = [];

  if (
    reviewerContext &&
    reviewerResult.match
  ) {
    reviewers.push(
      reviewerResult.match.displayName
    );
  } else if (ownerResult.match) {
    owners.push(
      ownerResult.match
    );
  }

  const options = {
    owners,
    reviewers,
    statuses,

    categories:
      detectedCategory
        ? [detectedCategory]
        : [],

    types,

    ...dateFilters
  };

  const activeFilterCount = [
    owners.length > 0,
    reviewers.length > 0,
    statuses.length > 0,
    Boolean(detectedCategory),
    types.length > 0,
    Boolean(
      dateFilters.qaDateFrom ||
      dateFilters.completedDateFrom
    )
  ].filter(Boolean).length;

  const asksForCount =
    normalized.includes('how many') ||
    normalized.includes('count') ||
    normalized.includes('total') ||
    normalized.includes('cuantos') ||
    normalized.includes('cantidad');

  const asksForList =
    normalized.includes('show') ||
    normalized.includes('list') ||
    normalized.includes('which cases') ||
    normalized.includes('details') ||
    normalized.includes('muestra') ||
    normalized.includes('lista') ||
    normalized.includes('cuales') ||
    normalized.includes('detalles');

  return {
    options,
    activeFilterCount,
    asksForCount,
    asksForList,

    shouldHandle:
      activeFilterCount >= 2 &&
      (
        asksForCount ||
        asksForList
      )
  };
}

function resolveQAOwnerName(
  ownerName,
  data = DATA
) {
  const requestedName =
    String(ownerName || '').trim();

  if (!requestedName) {
    return {
      match: null,
      ambiguous: false,
      options: []
    };
  }

  const owners =
    getQAOwnerNames(data);

  const normalizedRequested =
    normalizeQAText(requestedName);

  // ── Nombre completo exacto ──
  const exactMatch =
    owners.find(
      owner =>
        normalizeQAText(owner) ===
        normalizedRequested
    );

  if (exactMatch) {
    return {
      match: exactMatch,
      ambiguous: false,
      options: []
    };
  }

  // ── Primer nombre ──
  const firstNameMatches =
    owners.filter(owner => {
      const firstName =
        normalizeQAText(owner)
          .split(' ')[0];

      return (
        firstName ===
        normalizedRequested
      );
    });

  if (firstNameMatches.length === 1) {
    return {
      match: firstNameMatches[0],
      ambiguous: false,
      options: []
    };
  }

  if (firstNameMatches.length > 1) {
    return {
      match: null,
      ambiguous: true,
      options: firstNameMatches
    };
  }

  return {
    match: null,
    ambiguous: false,
    options: []
  };
}
function getQAMemberCategorySnapshot(
  ownerName,
  data = DATA
) {
  const analysis =
    getQACategoryAnalysis({
      data,
      owner: ownerName
    });

  return {
    categorizedCases:
      analysis.categorizedCases,

    uncategorizedCases:
      analysis.uncategorizedCases,

    topCategory:
      analysis.topCategory
        ? {
            category:
              analysis.topCategory.category,

            count:
              analysis.topCategory.count,

            percentage:
              analysis.topCategory
                .percentageOfScope
          }
        : null,

    categories:
      analysis.categories.map(item => ({
        category: item.category,
        count: item.count,

        percentage:
          item.percentageOfScope
      }))
  };
}
function compareQAMetric(
  memberA,
  memberB,
  metric,
  direction = 'higher'
) {
  const valueA =
    Number(memberA[metric] || 0);

  const valueB =
    Number(memberB[metric] || 0);

  if (valueA === valueB) {
    return {
      metric,
      direction,
      tie: true,
      winner: null,
      loser: null,
      valueA,
      valueB,
      difference: 0
    };
  }

  const aWins =
    direction === 'lower'
      ? valueA < valueB
      : valueA > valueB;

  return {
    metric,
    direction,
    tie: false,

    winner:
      aWins
        ? memberA.owner
        : memberB.owner,

    loser:
      aWins
        ? memberB.owner
        : memberA.owner,

    valueA,
    valueB,

    difference:
      Math.abs(valueA - valueB)
  };
}
function compareQAMembers({
  data = DATA,
  memberA,
  memberB
} = {}) {
  const safeData =
    Array.isArray(data)
      ? data
      : [];

  if (!memberA || !memberB) {
    return {
      ok: false,
      error: 'TWO_MEMBERS_REQUIRED',
      message:
        'Two team members are required.'
    };
  }

  const resolvedA =
    resolveQAOwnerName(
      memberA,
      safeData
    );

  const resolvedB =
    resolveQAOwnerName(
      memberB,
      safeData
    );

  if (resolvedA.ambiguous) {
    return {
      ok: false,
      error: 'MEMBER_A_AMBIGUOUS',
      message:
        `${memberA} matches more than one member.`,

      options:
        resolvedA.options
    };
  }

  if (resolvedB.ambiguous) {
    return {
      ok: false,
      error: 'MEMBER_B_AMBIGUOUS',
      message:
        `${memberB} matches more than one member.`,

      options:
        resolvedB.options
    };
  }

  if (!resolvedA.match) {
    return {
      ok: false,
      error: 'MEMBER_A_NOT_FOUND',
      message:
        `No team member was found for ${memberA}.`
    };
  }

  if (!resolvedB.match) {
    return {
      ok: false,
      error: 'MEMBER_B_NOT_FOUND',
      message:
        `No team member was found for ${memberB}.`
    };
  }

  if (resolvedA.match === resolvedB.match) {
    return {
      ok: false,
      error: 'SAME_MEMBER',
      message:
        'Select two different team members.'
    };
  }

  const metricsA =
    getQAMemberMetrics(
      resolvedA.match,
      safeData
    );

  const metricsB =
    getQAMemberMetrics(
      resolvedB.match,
      safeData
    );

  const queueA =
    getQAQueueAnalysis({
      data: safeData,
      owner: resolvedA.match,
      limit: 0
    });

  const queueB =
    getQAQueueAnalysis({
      data: safeData,
      owner: resolvedB.match,
      limit: 0
    });

  const categoriesA =
    getQAMemberCategorySnapshot(
      resolvedA.match,
      safeData
    );

  const categoriesB =
    getQAMemberCategorySnapshot(
      resolvedB.match,
      safeData
    );

  const resultA = {
    ...metricsA,

    pending:
      queueA.pendingCount,

    responded:
      queueA.respondedCount,

    respondedOpen:
      queueA.respondedOpenCount,

    resolvedByResponse:
      queueA.resolvedByResponseCount,

    topCategory:
      categoriesA.topCategory,

    categories:
      categoriesA.categories
  };

  const resultB = {
    ...metricsB,

    pending:
      queueB.pendingCount,

    responded:
      queueB.respondedCount,

    respondedOpen:
      queueB.respondedOpenCount,

    resolvedByResponse:
      queueB.resolvedByResponseCount,

    topCategory:
      categoriesB.topCategory,

    categories:
      categoriesB.categories
  };

  const comparisons = {
    volume:
      compareQAMetric(
        resultA,
        resultB,
        'total',
        'higher'
      ),

    passRate:
      compareQAMetric(
        resultA,
        resultB,
        'passRate',
        'higher'
      ),

    errorRate:
      compareQAMetric(
        resultA,
        resultB,
        'errorRate',
        'lower'
      ),

    errors:
      compareQAMetric(
        resultA,
        resultB,
        'errors',
        'lower'
      ),

    pending:
      compareQAMetric(
        resultA,
        resultB,
        'pending',
        'lower'
      )
  };

  return {
    ok: true,

    members: {
      memberA: resultA,
      memberB: resultB
    },

    comparisons,

    differences: {
      total:
        resultA.total -
        resultB.total,

      passed:
        resultA.passed -
        resultB.passed,

      opportunity:
        resultA.opportunity -
        resultB.opportunity,

      failed:
        resultA.failed -
        resultB.failed,

      critical:
        resultA.critical -
        resultB.critical,

      errors:
        resultA.errors -
        resultB.errors,

      passRate:
        resultA.passRate -
        resultB.passRate,

      errorRate:
        resultA.errorRate -
        resultB.errorRate,

      pending:
        resultA.pending -
        resultB.pending
    }
  };
}

function buildQAComparisonInsight(
  comparison,
  label,
  formatter = value => String(value)
) {
  if (comparison.tie) {
    return (
      `${label}: tie at ` +
      `${formatter(comparison.valueA)}.`
    );
  }

  return (
    `${label}: ${comparison.winner} leads ` +
    `by ${formatter(comparison.difference)}.`
  );
  // value =>
  // formatQAPercentage(value)
}
function buildQAMemberComparisonResponse(
  memberA,
  memberB
) {
  const comparison =
    compareQAMembers({
      memberA,
      memberB
    });

  if (!comparison.ok) {
    if (
      comparison.error ===
        'MEMBER_A_AMBIGUOUS' ||
      comparison.error ===
        'MEMBER_B_AMBIGUOUS'
    ) {
      return buildQAAmbiguousMemberResponse(
        comparison.options
      );
    }

    return comparison.message;
  }

  const a =
    comparison.members.memberA;

  const b =
    comparison.members.memberB;

  const aTopCategory =
    a.topCategory
      ? (
          `${a.topCategory.category} ` +
          `(${a.topCategory.count})`
        )
      : 'None detected';

  const bTopCategory =
    b.topCategory
      ? (
          `${b.topCategory.category} ` +
          `(${b.topCategory.count})`
        )
      : 'None detected';

  return [
    `QA performance comparison: ${a.owner} vs ${b.owner}`,
    '',

    `── ${a.owner} ──`,
    `Total cases: ${a.total}`,
    `Passed: ${a.passed}`,
    `Opportunity: ${a.opportunity}`,
    `Failed: ${a.failed}`,
    `Critical: ${a.critical}`,
    `Errors: ${a.errors}`,
    `Pass rate: ${formatQAPercentage(a.passRate)}`,
    `Error rate: ${formatQAPercentage(a.errorRate)}`,
    `Pending: ${a.pending}`,
    `Responded: ${a.responded}`,
    `Top category: ${aTopCategory}`,
    '',

    `── ${b.owner} ──`,
    `Total cases: ${b.total}`,
    `Passed: ${b.passed}`,
    `Opportunity: ${b.opportunity}`,
    `Failed: ${b.failed}`,
    `Critical: ${b.critical}`,
    `Errors: ${b.errors}`,
    `Pass rate: ${formatQAPercentage(b.passRate)}`,
    `Error rate: ${formatQAPercentage(b.errorRate)}`,
    `Pending: ${b.pending}`,
    `Responded: ${b.responded}`,
    `Top category: ${bTopCategory}`,
    '',

    '── Key differences ──',

    buildQAComparisonInsight(
      comparison.comparisons.volume,
      'Higher case volume'
    ),

    buildQAComparisonInsight(
      comparison.comparisons.passRate,
      'Higher pass rate',
      formatQAPercentage
    ),

    buildQAComparisonInsight(
      comparison.comparisons.errorRate,
      'Lower error rate',
      formatQAPercentage
    ),

    buildQAComparisonInsight(
      comparison.comparisons.errors,
      'Fewer errors'
    ),

    buildQAComparisonInsight(
      comparison.comparisons.pending,
      'Fewer pending cases'
    ),

    '',
    'The comparison reports each metric separately and does not assign a single overall winner.'
  ].join('\n');
}

function findQAOwnersForComparison(
  question,
  data = DATA
) {
  const owners =
    getQAOwnerNames(data);

  const matches = [];
  const ambiguousOptions = [];

  // ── Primero nombres completos ──
  owners.forEach(owner => {
    if (
      containsNormalizedPhrase(
        question,
        owner
      )
    ) {
      matches.push(owner);
    }
  });

  // ── Luego primeros nombres únicos ──
  owners.forEach(owner => {
    if (matches.includes(owner)) {
      return;
    }

    const firstName =
      normalizeQAText(owner)
        .split(' ')[0];

    if (
      !containsNormalizedPhrase(
        question,
        firstName
      )
    ) {
      return;
    }

    const sameFirstName =
      owners.filter(candidate => {
        const candidateFirstName =
          normalizeQAText(candidate)
            .split(' ')[0];

        return (
          candidateFirstName ===
          firstName
        );
      });

    if (sameFirstName.length === 1) {
      matches.push(owner);
    } else {
      ambiguousOptions.push(
        ...sameFirstName
      );
    }
  });

  return {
    matches: [...new Set(matches)],

    ambiguous:
      ambiguousOptions.length > 0,

    options:
      [...new Set(ambiguousOptions)]
  };
}

// ═══════════════════════════════════════
// QA WEEKLY STATUS
// ═══════════════════════════════════════

const QA_WEEKLY_STATUS_RULES = Object.freeze({
  critical: {
    highThreshold: 1,
    mediumThreshold: 0,
    highPoints: 3,
    mediumPoints: 1,
    lowPoints: 0
  },

  failed: {
    highThreshold: 3,
    mediumThreshold: 1.5,
    highPoints: 2,
    mediumPoints: 1,
    lowPoints: 0
  },

  pending: {
    highThreshold: 20,
    mediumThreshold: 10,
    highPoints: 3,
    mediumPoints: 2,
    lowPoints: 1
  },

  final: {
    atRiskMinimum: 7,
    needsAttentionMinimum: 4,
    maximumScore: 8
  }
});

function getQACriticalWeeklyPoints(
  criticalRate
) {
  const rules =
    QA_WEEKLY_STATUS_RULES.critical;

  if (
    criticalRate >
    rules.highThreshold
  ) {
    return rules.highPoints;
  }

  if (
    criticalRate >
    rules.mediumThreshold
  ) {
    return rules.mediumPoints;
  }

  return rules.lowPoints;
}

function getQAFailedWeeklyPoints(
  failedRate
) {
  const rules =
    QA_WEEKLY_STATUS_RULES.failed;

  if (
    failedRate >
    rules.highThreshold
  ) {
    return rules.highPoints;
  }

  if (
    failedRate >
    rules.mediumThreshold
  ) {
    return rules.mediumPoints;
  }

  return rules.lowPoints;
}

function getQAPendingWeeklyPoints(
  pendingCount
) {
  const rules =
    QA_WEEKLY_STATUS_RULES.pending;

  if (
    pendingCount >
    rules.highThreshold
  ) {
    return rules.highPoints;
  }

  if (
    pendingCount >=
    rules.mediumThreshold
  ) {
    return rules.mediumPoints;
  }

  return rules.lowPoints;
}


function getQAWeeklyFinalStatus({
  finalScore,
  errors,
  pending
}) {
  const rules =
    QA_WEEKLY_STATUS_RULES.final;

  if (
    errors === 0 &&
    pending === 0
  ) {
    return {
      key: 'clean',
      label: '✓ CLEAN WEEK',
      shortLabel: 'Clean Week',
      level: 0
    };
  }

  if (
    finalScore >=
    rules.atRiskMinimum
  ) {
    return {
      key: 'risk',
      label: '🚨 AT RISK',
      shortLabel: 'At Risk',
      level: 3
    };
  }

  if (
    finalScore >=
    rules.needsAttentionMinimum
  ) {
    return {
      key: 'attention',
      label: '⚠ NEEDS ATTENTION',
      shortLabel: 'Needs Attention',
      level: 2
    };
  }

  return {
    key: 'control',
    label: '✓ UNDER CONTROL',
    shortLabel: 'Under Control',
    level: 1
  };
}

function getQAWeeklyPeriod(
  data = DATA
) {
  const safeData =
    Array.isArray(data)
      ? data
      : [];

  const days = [
    ...new Set(
      safeData
        .map(item => item.day)
        .filter(Boolean)
    )
  ].sort(
    (a, b) =>
      parseMDY(a) - parseMDY(b)
  );

  const from =
    days[0] || null;

  const to =
    days[days.length - 1] || null;

  return {
    from,
    to,

    daysLoaded:
      days.length,

    days,

    label:
      !from
        ? 'No period'
        : from === to
          ? from
          : `${from} – ${to}`
  };
}

function buildQAWeeklyStatusReasons({
  criticalRate,
  failedRate,
  pending,
  criticalPoints,
  failedPoints,
  pendingPoints
}) {
  const reasons = [];

  if (criticalRate > 1) {
    reasons.push({
      key: 'critical_high',
      severity: 'risk',

      message:
        `Critical cases represent ` +
        `${formatQAPercentage(criticalRate)}, ` +
        `which is above the 1% threshold.`,

      points:
        criticalPoints
    });
  } else if (criticalRate > 0) {
    reasons.push({
      key: 'critical_present',
      severity: 'warning',

      message:
        `Critical cases represent ` +
        `${formatQAPercentage(criticalRate)}.`,

      points:
        criticalPoints
    });
  } else {
    reasons.push({
      key: 'critical_clean',
      severity: 'ok',

      message:
        'No Critical cases were found.',

      points:
        criticalPoints
    });
  }

  if (failedRate > 3) {
    reasons.push({
      key: 'failed_high',
      severity: 'risk',

      message:
        `Failed cases represent ` +
        `${formatQAPercentage(failedRate)}, ` +
        `which is above the 3% threshold.`,

      points:
        failedPoints
    });
  } else if (failedRate > 1.5) {
    reasons.push({
      key: 'failed_medium',
      severity: 'warning',

      message:
        `Failed cases represent ` +
        `${formatQAPercentage(failedRate)}, ` +
        `which is above the 1.5% threshold.`,

      points:
        failedPoints
    });
  } else {
    reasons.push({
      key: 'failed_controlled',
      severity: 'ok',

      message:
        `Failed cases represent ` +
        `${formatQAPercentage(failedRate)}, ` +
        `within the 1.5% threshold.`,

      points:
        failedPoints
    });
  }

  if (pending > 20) {
    reasons.push({
      key: 'pending_high',
      severity: 'risk',

      message:
        `${pending} cases are pending, ` +
        `which is above the limit of 20.`,

      points:
        pendingPoints
    });
  } else if (pending >= 10) {
    reasons.push({
      key: 'pending_medium',
      severity: 'warning',

      message:
        `${pending} cases are pending, ` +
        `within the 10–20 warning range.`,

      points:
        pendingPoints
    });
  } else {
    reasons.push({
      key: 'pending_controlled',
      severity: pending === 0
        ? 'ok'
        : 'info',

      message:
        pending === 0
          ? 'There are no pending cases.'
          : `${pending} cases are pending, below the threshold of 10.`,

      points:
        pendingPoints
    });
  }

  return reasons;
}

function buildQAWeeklyRecommendations({
  critical,
  failedRate,
  pending,
  topCategory,
  riskOwners
}) {
  const recommendations = [];

  if (critical > 0) {
    recommendations.push({
      priority: 'high',
      key: 'review_critical',

      message:
        'Review Critical cases immediately and confirm their follow-up status.'
    });
  }

  if (pending > 20) {
    recommendations.push({
      priority: 'high',
      key: 'reduce_pending_high',

      message:
        'Prioritize the pending queue and assign owners for immediate resolution.'
    });
  } else if (pending >= 10) {
    recommendations.push({
      priority: 'medium',
      key: 'reduce_pending_medium',

      message:
        'Review pending cases and prevent the queue from exceeding 20.'
    });
  }

  if (failedRate > 3) {
    recommendations.push({
      priority: 'high',
      key: 'investigate_failed',

      message:
        'Investigate repeated Failed patterns and verify whether additional guidance is needed.'
    });
  } else if (failedRate > 1.5) {
    recommendations.push({
      priority: 'medium',
      key: 'monitor_failed',

      message:
        'Monitor Failed cases and verify whether the same issue is repeating.'
    });
  }

  if (topCategory) {
    recommendations.push({
      priority: 'medium',
      key: 'review_top_category',

      message:
        `Review the most frequent category: ` +
        `${topCategory.category} ` +
        `(${topCategory.count} cases).`
    });
  }

  if (riskOwners.length > 0) {
    recommendations.push({
      priority: 'medium',
      key: 'review_risk_owners',

      message:
        `Review members above the 10% error-rate threshold: ` +
        `${riskOwners
          .map(item => item.owner)
          .join(', ')}.`
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      priority: 'low',
      key: 'maintain_controls',

      message:
        'Maintain current QA controls and continue monitoring the pending queue.'
    });
  }

  return recommendations;
}
function getQAWeeklyStatusAnalysis({
  data = DATA
} = {}) {
  const safeData =
    Array.isArray(data)
      ? data
      : [];

  if (!safeData.length) {
    return {
      ok: false,
      error: 'NO_DATA',
      message:
        'No QA data is available.'
    };
  }

  const total =
    safeData.length;

  const passed =
    safeData.filter(
      item => item.status === 'Passed'
    ).length;

  const opportunity =
    safeData.filter(
      item =>
        item.status === 'Opportunity'
    ).length;

  const failed =
    safeData.filter(
      item => item.status === 'Failed'
    ).length;

  const critical =
    safeData.filter(
      item => item.status === 'Critical'
    ).length;

  const errors =
    failed + critical;

  const passRate =
    total > 0
      ? (
          (
            passed +
            opportunity
          ) /
          total
        ) * 100
      : 0;

  const errorRate =
    total > 0
      ? (
          errors /
          total
        ) * 100
      : 0;

  const criticalRate =
    total > 0
      ? (
          critical /
          total
        ) * 100
      : 0;

  const failedRate =
    total > 0
      ? (
          failed /
          total
        ) * 100
      : 0;

  const opportunityRate =
    total > 0
      ? (
          opportunity /
          total
        ) * 100
      : 0;

  const queueAnalysis =
    getQAQueueAnalysis({
      data: safeData,
      limit: 0
    });

  const pending =
    queueAnalysis.pendingCount;

  const criticalPoints =
    getQACriticalWeeklyPoints(
      criticalRate
    );

  const failedPoints =
    getQAFailedWeeklyPoints(
      failedRate
    );

  const pendingPoints =
    getQAPendingWeeklyPoints(
      pending
    );

  const severityScore =
    criticalPoints +
    failedPoints;

  const finalScore =
    severityScore +
    pendingPoints;

  const status =
    getQAWeeklyFinalStatus({
      finalScore,
      errors,
      pending
    });

  const categoryAnalysis =
    getQACategoryAnalysis({
      data: safeData
    });

  const topCategory =
    categoryAnalysis.topCategory
      ? {
          category:
            categoryAnalysis
              .topCategory
              .category,

          count:
            categoryAnalysis
              .topCategory
              .count,

          percentage:
            categoryAnalysis
              .topCategory
              .percentageOfScope
        }
      : null;

  const owners =
    getQAOwnerNames(
      safeData
    );

  const ownerMetrics =
    owners.map(owner =>
      getQAMemberMetrics(
        owner,
        safeData
      )
    );

  const riskOwners =
    ownerMetrics
      .filter(
        member =>
          member.errorRate > 10
      )
      .sort(
        (a, b) =>
          b.errorRate -
          a.errorRate
      )
      .map(member => ({
        owner: member.owner,
        total: member.total,
        errors: member.errors,
        errorRate: member.errorRate
      }));

  const reasons =
    buildQAWeeklyStatusReasons({
      criticalRate,
      failedRate,
      pending,
      criticalPoints,
      failedPoints,
      pendingPoints
    });

  const recommendations =
    buildQAWeeklyRecommendations({
      critical,
      failedRate,
      pending,
      topCategory,
      riskOwners
    });

  return {
    ok: true,

    period:
      getQAWeeklyPeriod(
        safeData
      ),

    metrics: {
      total,
      passed,
      opportunity,
      failed,
      critical,
      errors,

      pending,

      responded:
        queueAnalysis.respondedCount,

      respondedOpen:
        queueAnalysis
          .respondedOpenCount,

      passRate,
      errorRate,
      criticalRate,
      failedRate,
      opportunityRate
    },

    scoring: {
      critical: {
        value: criticalRate,
        points: criticalPoints,
        maximumPoints: 3
      },

      failed: {
        value: failedRate,
        points: failedPoints,
        maximumPoints: 2
      },

      pending: {
        value: pending,
        points: pendingPoints,
        maximumPoints: 3
      },

      severityScore,

      finalScore,

      maximumScore:
        QA_WEEKLY_STATUS_RULES
          .final
          .maximumScore
    },

    status,

    queueStatus:
      queueAnalysis.queueStatus,

    topCategory,

    riskOwners,

    reasons,

    recommendations,

    thresholds:
      QA_WEEKLY_STATUS_RULES
  };
}
function buildQAWeeklyStatusResponse() {
  const analysis =
    getQAWeeklyStatusAnalysis();

  if (!analysis.ok) {
    return analysis.message;
  }

  const metrics =
    analysis.metrics;

  const scoring =
    analysis.scoring;

  const reasonLines =
    analysis.reasons.map(
      reason =>
        `• ${reason.message} ` +
        `(+${reason.points} pts)`
    );

  const recommendationLines =
    analysis.recommendations.map(
      recommendation =>
        `• ${recommendation.message}`
    );

  const topCategoryLine =
    analysis.topCategory
      ? (
          `${analysis.topCategory.category} ` +
          `(${analysis.topCategory.count} cases)`
        )
      : 'None detected';

  return [
    `Weekly QA status: ${analysis.status.label}`,
    '',
    `Period: ${analysis.period.label}`,
    `Cases analyzed: ${metrics.total}`,
    `Days loaded: ${analysis.period.daysLoaded}`,
    '',
    `Final score: ${scoring.finalScore}/${scoring.maximumScore}`,
    '',
    'Score breakdown:',
    `• Critical: ${formatQAPercentage(metrics.criticalRate)} → +${scoring.critical.points} pts`,
    `• Failed: ${formatQAPercentage(metrics.failedRate)} → +${scoring.failed.points} pts`,
    `• Pending: ${metrics.pending} → +${scoring.pending.points} pts`,
    `• Opportunity: ${formatQAPercentage(metrics.opportunityRate)} → informational`,
    '',
    'Why:',
    ...reasonLines,
    '',
    `Pass rate: ${formatQAPercentage(metrics.passRate)}`,
    `Error rate: ${formatQAPercentage(metrics.errorRate)}`,
    `Queue status: ${analysis.queueStatus.label}`,
    `Top category: ${topCategoryLine}`,
    `Members above 10% error rate: ${analysis.riskOwners.length}`,
    '',
    'Recommended actions:',
    ...recommendationLines
  ].join('\n');
}
function buildQAWeeklyScoringRulesResponse() {
  return [
    'Weekly QA status scoring rules:',
    '',
    'Critical:',
    '• More than 1% → +3 points',
    '• More than 0% and up to 1% → +1 point',
    '• 0% → +0 points',
    '',
    'Failed:',
    '• More than 3% → +2 points',
    '• More than 1.5% and up to 3% → +1 point',
    '• Up to 1.5% → +0 points',
    '',
    'Pending:',
    '• More than 20 → +3 points',
    '• From 10 to 20 → +2 points',
    '• Fewer than 10 → +1 point',
    '',
    'Final result:',
    '• 7–8 points → 🚨 AT RISK',
    '• 4–6 points → ⚠ NEEDS ATTENTION',
    '• Fewer than 4 points → ✓ UNDER CONTROL',
    '• No errors and no pending cases → ✓ CLEAN WEEK',
    '',
    'Opportunity is informational and does not add severity points.'
  ].join('\n');
}
// ======================================================
// STEP 13
// QA CHAT BACKEND + TEMPORARY SESSION
// ======================================================

const QA_API_BASE_URL = 'http://localhost:3000/api';

let qaSessionId = sessionStorage.getItem('qaSessionId');


// ======================================================
// CREATE QA SESSION
// ======================================================

async function createQASession() {
  try {
    // const response = await fetch(
    //   `${QA_API_BASE_URL}/sessions`,
    //   {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json'
    //     }
    //   }
    // );
    const response = await fetch(
      `${QA_API_BASE_URL}/sessions`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          cases: DATA
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Could not create QA session: ${response.status}`
      );
    }

    const data = await response.json();

    qaSessionId = data.sessionId;

    sessionStorage.setItem(
      'qaSessionId',
      qaSessionId
    );

    console.log(
      '[QA CHAT] Session created:',
      qaSessionId,
      '| Cases stored:',
      data.caseCount
    );

    return qaSessionId;

  } catch (error) {
    console.error(
      '[QA CHAT] Error creating session:',
      error
    );

    throw error;
  }
}


// ======================================================
// GET OR CREATE SESSION
// ======================================================

async function ensureQASession() {
  if (qaSessionId) {
    return qaSessionId;
  }

  return await createQASession();
}


// ======================================================
// SEND MESSAGE TO BACKEND
// ======================================================

async function sendQAChatMessage(message, retry = true) {
  try {
    const sessionId = await ensureQASession();

    const response = await fetch(
      `${QA_API_BASE_URL}/chat`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          sessionId,
          message
        })
      }
    );

    const data = await response.json();

    // Session expired or backend restarted
    if (
      response.status === 404 &&
      data.code === 'SESSION_NOT_FOUND_OR_EXPIRED' &&
      retry
    ) {
      console.warn(
        '[QA CHAT] Session expired. Creating new session...'
      );

      qaSessionId = null;

      sessionStorage.removeItem(
        'qaSessionId'
      );

      await createQASession();

      return sendQAChatMessage(
        message,
        false
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error || 'QA Chat request failed'
      );
    }

    console.log(
      '[QA CHAT] Response:',
      data
    );

    return data;

  } catch (error) {
    console.error(
      '[QA CHAT] Error:',
      error
    );

    throw error;
  }
}


// ======================================================
// RESET QA SESSION
// ======================================================

async function resetQASession() {
  try {

    if (qaSessionId) {
      await fetch(
        `${QA_API_BASE_URL}/sessions/${qaSessionId}`,
        {
          method: 'DELETE'
        }
      );
    }

  } catch (error) {
    console.warn(
      '[QA CHAT] Could not delete backend session:',
      error
    );
  }

  qaSessionId = null;

  sessionStorage.removeItem(
    'qaSessionId'
  );

  console.log(
    '[QA CHAT] Session reset'
  );

  return createQASession();
}

// ═════════════════════════════════════════════════════════════
// AGENT 3 — AI Weekly Report
// Pegar al final de app.js (usa AUDIT_API, ya definido para los Agentes 1 y 2)
// ═════════════════════════════════════════════════════════════

// ── Helper: llamada segura a los analizadores existentes ──
function _a3Safe(fn, arg, fallback) {
  try { return typeof fn === 'function' ? fn(arg) : fallback; }
  catch (e) { return fallback; }
}

function _a3Pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// ─────────────────────────────────────────────────────────────
// PAYLOAD — agregados, nunca los casos crudos
//
// Una semana normal (270 casos) pesa ~30-40k tokens si se manda cruda.
// Este payload pesa ~2k y contiene todo lo que el informe necesita.
// ─────────────────────────────────────────────────────────────
function buildReportPayload() {
  const d = DATA;
  const total = d.length;
  if (!total) return null;

  const by = s => d.filter(x => x.status === s).length;
  const passed = by('Passed');
  const opportunity = by('Opportunity');
  const failed = by('Failed');
  const critical = by('Critical');
  const errors = failed + critical;

  const pending = d.filter(
    x => x.status !== 'Passed' && !(x.fix_comment || '').trim()
  ).length;

  const DAYS = getDays();

  // ── Categorías de bug ──
  const catCount = {};
  d.forEach(r => (r.categories || []).forEach(c => {
    catCount[c] = (catCount[c] || 0) + 1;
  }));
  const nonPassed = total - passed;
  const categories = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, count]) => ({
      category, count, pct: _a3Pct(count, nonPassed)
    }));

  // ── Por persona (owner) ──
  const ownerMap = {};
  d.forEach(r => (ownerMap[r.owner] = ownerMap[r.owner] || []).push(r));
  const members = Object.entries(ownerMap)
    .map(([owner, rows]) => {
      const e = rows.filter(
        x => x.status === 'Failed' || x.status === 'Critical'
      ).length;
      const p = rows.filter(
        x => x.status === 'Passed' || x.status === 'Opportunity'
      ).length;
      return {
        owner,
        cases: rows.length,
        errors: e,
        errorRate: _a3Pct(e, rows.length),
        passRate: _a3Pct(p, rows.length)
      };
    })
    .sort((a, b) => b.errors - a.errors || b.errorRate - a.errorRate)
    .slice(0, 12);   // el resto no aporta al informe y sí cuesta tokens

  // ── Por reviewer (QA Shadow) ──
  const revCount = {};
  d.forEach(r => { if (r.qa_by) revCount[r.qa_by] = (revCount[r.qa_by] || 0) + 1; });
  const reviewers = Object.entries(revCount)
    .sort((a, b) => b[1] - a[1])
    .map(([reviewer, count]) => ({ reviewer, total: count }));

  // ── Por día ──
  const dayMap = {};
  d.forEach(r => (dayMap[r.day] = dayMap[r.day] || []).push(r));
  const byDay = DAYS.map(day => {
    const rows = dayMap[day] || [];
    const e = rows.filter(
      x => x.status === 'Failed' || x.status === 'Critical'
    ).length;
    return {
      day, cases: rows.length, errors: e, errorRate: _a3Pct(e, rows.length)
    };
  });

  // ── Por tipo de caso ──
  const typeMap = {};
  d.forEach(r => (typeMap[r.type] = typeMap[r.type] || []).push(r));
  const byType = Object.entries(typeMap).map(([type, rows]) => ({
    type,
    cases: rows.length,
    errors: rows.filter(
      x => x.status === 'Failed' || x.status === 'Critical'
    ).length
  }));

  // ── Estado semanal (reusa el analizador del dashboard si existe) ──
  const wk = _a3Safe(
    typeof getQAWeeklyStatusAnalysis !== 'undefined'
      ? getQAWeeklyStatusAnalysis : null,
    { data: d },
    null
  );

  const status = wk && wk.metrics ? {
    label: wk.status && wk.status.label,
    score: wk.scoring && wk.scoring.finalScore,
    queue: wk.queueStatus && wk.queueStatus.label,
    criticalRate: wk.metrics.criticalRate,
    failedRate: wk.metrics.failedRate,
    opportunityRate: wk.metrics.opportunityRate
  } : {
    label: null,
    score: null,
    queue: null,
    criticalRate: +(critical / total * 100).toFixed(2),
    failedRate: +(failed / total * 100).toFixed(2),
    opportunityRate: +(opportunity / total * 100).toFixed(2)
  };

  return {
    period: {
      label: DAYS.length
        ? DAYS[0] + (DAYS.length > 1 ? ' – ' + DAYS[DAYS.length - 1] : '')
        : 'N/A',
      days: DAYS.length
    },
    totals: {
      cases: total,
      members: Object.keys(ownerMap).length,
      passed, opportunity, failed, critical, errors, pending,
      passRate: _a3Pct(passed + opportunity, total),
      errorRate: _a3Pct(errors, total)
    },
    status,
    categories,
    members,
    reviewers,
    byDay,
    byType,
    agent_reevaluated: (window.AGENT_CHANGES || []).length
  };
}

// ─────────────────────────────────────────────────────────────
// LLAMADA AL AGENTE 3
// ─────────────────────────────────────────────────────────────
window.currentAIReport = null;

async function generateAIReport() {
  const btn = document.getElementById('ai-report-btn');
  const payload = buildReportPayload();

  if (!payload) {
    alert('Upload a CSV first — there is no data to report on.');
    return;
  }

  const originalLabel = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '✦ Writing report…'; }

  openAIReportModal();
  document.getElementById('ai-report-content').innerHTML =
    '<div class="ai-report-loading">Agent 3 is analyzing ' +
    payload.totals.cases + ' cases…</div>';

  try {
    const res = await fetch(AUDIT_API + '/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: payload })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const report = await res.json();
    window.currentAIReport = report;
    renderAIReport(report, payload);

  } catch (err) {
    console.warn('[AGENT 3] Report agent unavailable:', err);
    document.getElementById('ai-report-content').innerHTML =
      '<div class="ai-report-error">' +
        '<strong>Report agent unavailable.</strong><br>' +
        'Could not reach ' + auditEsc(AUDIT_API) + '/report — ' +
        auditEsc(err.message) + '.<br><br>' +
        'The plain weekly summary in the dashboard is still available; ' +
        'close this and use <em>Print / Save PDF</em> instead.' +
      '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
  }
}

// ─────────────────────────────────────────────────────────────
// RENDER — nosotros armamos el HTML, no el modelo.
// Las cifras salen del payload real, así no pueden desviarse.
// ─────────────────────────────────────────────────────────────
function renderAIReport(report, p) {
  const E = auditEsc;

  const kpi = (label, val, sub, color) =>
    '<div class="ai-kpi" style="--ai-kpi-color:' + color + '">' +
      '<div class="ai-kpi-label">' + label + '</div>' +
      '<div class="ai-kpi-val">' + val + '</div>' +
      (sub ? '<div class="ai-kpi-sub">' + sub + '</div>' : '') +
    '</div>';

  const findingBlock = (items, cls) =>
    (items || []).map(f =>
      '<div class="ai-finding ' + cls + '">' +
        '<div class="ai-finding-title">' + E(f.title) + '</div>' +
        '<div class="ai-finding-detail">' + E(f.detail) + '</div>' +
        (f.evidence
          ? '<div class="ai-finding-evidence">' + E(f.evidence) + '</div>'
          : '') +
      '</div>'
    ).join('');

  const recBlock = (report.recommendations || []).map(r => {
    const pr = (r.priority || '').toLowerCase();
    const cls = pr.indexOf('high') === 0 ? 'high'
              : pr.indexOf('med') === 0 ? 'med' : 'low';
    return '<div class="ai-rec ai-rec--' + cls + '">' +
      '<span class="ai-rec-pill">' + E(r.priority) + '</span>' +
      '<div><div class="ai-rec-action">' + E(r.action) + '</div>' +
      '<div class="ai-rec-why">' + E(r.rationale) + '</div></div>' +
    '</div>';
  }).join('');

  const catRows = p.categories.map(c =>
    '<div class="ai-bar-row">' +
      '<span class="ai-bar-name">' + E(c.category) + '</span>' +
      '<span class="ai-bar-track"><span class="ai-bar-fill" style="width:' +
        Math.max(2, c.pct) + '%"></span></span>' +
      '<span class="ai-bar-count">' + c.count + ' · ' + c.pct + '%</span>' +
    '</div>'
  ).join('');

  const memberRows = p.members.slice(0, 8).map(m =>
    '<tr><td>' + E(m.owner) + '</td><td>' + m.cases + '</td>' +
    '<td>' + m.errors + '</td><td>' + m.errorRate + '%</td>' +
    '<td>' + m.passRate + '%</td></tr>'
  ).join('');

  document.getElementById('ai-report-content').innerHTML =
    '<div class="ai-report">' +

      '<div class="ai-report-head">' +
        '<div class="ai-report-week">' + E(p.period.label) +
          '  ·  ' + p.period.days + ' days  ·  ' + p.totals.cases + ' cases</div>' +
        '<h1 class="ai-report-headline">' + E(report.headline) + '</h1>' +
      '</div>' +

      '<div class="ai-kpi-row">' +
        kpi('Pass rate', p.totals.passRate + '%',
            p.totals.passed + p.totals.opportunity + '/' + p.totals.cases,
            'var(--passed)') +
        kpi('Errors', p.totals.errors,
            p.totals.failed + ' failed · ' + p.totals.critical + ' critical',
            'var(--critical)') +
        kpi('Opportunities', p.totals.opportunity,
            p.status.opportunityRate + '% of cases', 'var(--observed)') +
        kpi('Pending', p.totals.pending,
            p.status.queue || 'awaiting fix', 'var(--accent2)') +
      '</div>' +

      '<h2 class="ai-h2">Executive Summary</h2>' +
      '<p class="ai-p">' + E(report.executive_summary) + '</p>' +

      '<h2 class="ai-h2">Key Findings</h2>' +
      findingBlock(report.findings, 'ai-finding--info') +

      '<h2 class="ai-h2">Bug Categories</h2>' +
      '<div class="ai-bars">' + catRows + '</div>' +

      ((report.risks && report.risks.length)
        ? '<h2 class="ai-h2">Risks</h2>' +
          findingBlock(report.risks, 'ai-finding--risk')
        : '') +

      '<h2 class="ai-h2">Team Breakdown</h2>' +
      '<table class="ai-table"><thead><tr>' +
        '<th>Owner</th><th>Cases</th><th>Errors</th>' +
        '<th>Error rate</th><th>Pass rate</th>' +
      '</tr></thead><tbody>' + memberRows + '</tbody></table>' +

      '<h2 class="ai-h2">Recommendations</h2>' +
      recBlock +

      '<h2 class="ai-h2">Conclusion</h2>' +
      '<p class="ai-p">' + E(report.conclusion) + '</p>' +

      '<div class="ai-report-foot">' +
        'Generated by QA Shadow Agent 3 from ' + p.totals.cases +
        ' reviewed cases' +
        (p.agent_reevaluated
          ? ' · ' + p.agent_reevaluated + ' statuses reevaluated by Agent 2'
          : '') +
        '. All figures are computed from the dataset, not by the model.' +
      '</div>' +

    '</div>';
}

// ─────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────
function openAIReportModal() {
  const m = document.getElementById('ai-report-modal');
  if (!m) return;
  m.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAIReportModal() {
  const m = document.getElementById('ai-report-modal');
  if (!m) return;
  m.classList.remove('active');
  document.body.style.overflow = '';
}

function printCurrentAIReport() {
  document.body.classList.add('printing-ai-report');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-ai-report'), 500);
}

// Cerrar con overlay o Escape
document.addEventListener('click', e => {
  if (e.target && e.target.classList
      && e.target.classList.contains('ai-modal-overlay')) {
    closeAIReportModal();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAIReportModal();
});

// ======================================================
// CONSOLE TEST HELPERS
// ======================================================

window.createQASession = createQASession;
window.ensureQASession = ensureQASession;
window.sendQAChatMessage = sendQAChatMessage;
window.resetQASession = resetQASession;