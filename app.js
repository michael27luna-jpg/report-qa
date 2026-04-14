/* ═══════════════════════════════════════════
   QA Shadow Dashboard — app.js
   Week of Apr 6–10, 2026 · Cox Automotive
   ═══════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────
// DATA  (extracted from Excel — Apr 6–10, 2026)
// ─────────────────────────────────────────────────────────────
let DATA = [
  // ── Apr 7 ──
  { day:"Apr 7", owner:"Javier Callejas",  task_id:"D-36300",       status:"Observed", type:"LP",      summary:"M | Issue | Content | H1 and content appears below the map widget only on mobile view",                                                                                      categories:["Content"] },
  { day:"Apr 7", owner:"Javier Callejas",  task_id:"MS0326208217",   status:"Observed", type:"LP",      summary:"D | Issue | Linking | Research CTA button should use # anchoring when going to section in the same page",                                                                    categories:["Linking"] },
  { day:"Apr 7", owner:"Diego Torrez",     task_id:"D-36245",        status:"Observed", type:"LP",      summary:"M | Issue | Styling | Text content container got not left padding",                                                                                                          categories:["Styling"] },
  { day:"Apr 7", owner:"Javier Callejas",  task_id:"MS0326208411",   status:"Observed", type:"LP",      summary:"D | Issue | Config | Inventory on page shows less vehicles than in new inventory page filtered to show only Tahoe model",                                                    categories:["Config"] },
  { day:"Apr 7", owner:"Edmundo Morales",  task_id:"D-36227",        status:"Observed", type:"LP",      summary:"D | Issue | Config | View Inventory CTA button has not been anchored to any section",                                                                                        categories:["Config"] },
  { day:"Apr 7", owner:"Alexander Sosa",   task_id:"D-35530",        status:"Observed", type:"LP",      summary:"D | Issue | Styling | Way too much space between sections",                                                                                                                  categories:["Styling"] },
  { day:"Apr 7", owner:"Diego Torrez",     task_id:"D-46678",        status:"Failed",   type:"LP",      summary:"D | Issue | Config | Inventory mismatch with used inventory filter to SUV body style",                                                                                       categories:["Config"] },
  { day:"Apr 7", owner:"Nestor Apaza",     task_id:"D-44108",        status:"Failed",   type:"Posting", summary:"D | Issue | Content | missing content",                                                                                                                                      categories:["Content"] },

  // ── Apr 8 ──
  { day:"Apr 8", owner:"Romel Pinto",      task_id:"D-35627",        status:"Failed",   type:"LP",      summary:"M | Issue | Styling | different image and missing some ones\nM/D | Issue | Config | Inventory is showing 2025 model",                                                        categories:["Styling","Config"] },
  { day:"Apr 8", owner:"Diego Torrez",     task_id:"D-36788",        status:"Observed", type:"LP",      summary:"M | Issue | Styling | \"Learn More\" CTA button overflows its container in mobile view\nM | Issue | Styling | Background image in text section gets blurred and vehicle cropped", categories:["Styling"] },
  { day:"Apr 8", owner:"Romel Pinto",      task_id:"D-36036",        status:"Observed", type:"LP",      summary:"D/M | Issue | Styling | incorrect segment distribution",                                                                                                                     categories:["Styling"] },
  { day:"Apr 8", owner:"Michael Luna",     task_id:"D-36248",        status:"Failed",   type:"LP",      summary:"D/M | Issue | Config | inventory config",                                                                                                                                    categories:["Config"] },
  { day:"Apr 8", owner:"Alexander Sosa",   task_id:"D-35920",        status:"Failed",   type:"LP",      summary:"D/M | Issue | Config | inventory config\nM/D | Issue | Styling | the first right content with image needs to be black",                                                      categories:["Styling","Config"] },
  { day:"Apr 8", owner:"Ariel Vargas",     task_id:"D-45300",        status:"Observed", type:"LP",      summary:"M | Issue | Styling | image cut mobile view",                                                                                                                                categories:["Styling"] },
  { day:"Apr 8", owner:"Alexander Sosa",   task_id:"D-36120",        status:"Critical", type:"LP",      summary:"M/D | Issue | Content | the PM ask for inventory under header",                                                                                                               categories:["Content"] },
  { day:"Apr 8", owner:"Alexander Sosa",   task_id:"D-36052",        status:"Failed",   type:"LP",      summary:"M/D | Issue | Config | inventory config",                                                                                                                                    categories:["Config"] },
  { day:"Apr 8", owner:"Alexander Sosa",   task_id:"D-36251",        status:"Observed", type:"LP",      summary:"D | Issue | Styling | empty space",                                                                                                                                          categories:["Styling"] },
  { day:"Apr 8", owner:"Alexander Sosa",   task_id:"D-36424",        status:"Observed", type:"LP",      summary:"M/D | Question | Styling | why you dont use the same left/right image for technology and trim levels?",                                                                       categories:["Question"] },
  { day:"Apr 8", owner:"Ambar Rojas",      task_id:"D-46057",        status:"Failed",   type:"Posting", summary:"D | Issue | Config | one content is not showing",                                                                                                                             categories:["Config"] },

  // ── Apr 9 ──
  { day:"Apr 9", owner:"Javier Callejas",  task_id:"MS0326208214",   status:"Observed", type:"LP",      summary:"D | Issue | Content | Same image repeated across sections\nD | Issue | Content | H1 doesn't match the page title given in the task description",                              categories:["Content"] },
  { day:"Apr 9", owner:"Kattya Torrez",    task_id:"D-45490",        status:"Failed",   type:"Posting", summary:"D | Issue | Config | All campaigns don't have trim filter although it was instructed in case details",                                                                        categories:["Config"] },
  { day:"Apr 9", owner:"Javier Callejas",  task_id:"MS0426209436",   status:"Failed",   type:"LP",      summary:"M/D | Issue | Config | inventory config\nM/D | Issue | Linking | the last button of the page redirect a empty page",                                                         categories:["Config","Linking"] },
  { day:"Apr 9", owner:"Kattya Torrez",    task_id:"D-40813",        status:"Observed", type:"LP",      summary:"D | Issue | Styling | empty space",                                                                                                                                          categories:["Styling"] },
  { day:"Apr 9", owner:"Richard Villalba", task_id:"D-36678",        status:"Observed", type:"LP",      summary:"D | Issue | Linking | Most \"Shop Now\" CTA buttons on trims section only goes to model new inventory 2025",                                                                  categories:["Linking"] },
  { day:"Apr 9", owner:"Javier Callejas",  task_id:"MS0326208415",   status:"Observed", type:"LP",      summary:"D | Issue | Config | Inventory mismatch with new inventory filtered to model\nM | Issue | Content | Hero image in page title is different in mobile view",                    categories:["Config","Content"] },
  { day:"Apr 9", owner:"Richard Villalba", task_id:"D-47027",        status:"Observed", type:"Posting", summary:"D | Issue | Config | Campaign 5 not showing on inventory SRP due to wrong config on its model. Its correct model is Escalade ESV",                                           categories:["Config"] },
  { day:"Apr 9", owner:"Nicole Gongora",   task_id:"D-45479",        status:"Observed", type:"LP",      summary:"D | Issue | Content | couldn't find the post",                                                                                                                               categories:["Content"] },
  { day:"Apr 9", owner:"Michael Luna",     task_id:"D-36660",        status:"Failed",   type:"LP",      summary:"D | Issue | Config | Inventory configuration doesn't match the new inventory page filtered to ADX model",                                                                     categories:["Config"] },
  { day:"Apr 9", owner:"Javier Callejas",  task_id:"MS0326208300",   status:"Failed",   type:"LP",      summary:"D/M | Issue | Config | inventory config",                                                                                                                                    categories:["Config"] },
  { day:"Apr 9", owner:"Javier Alcoba",    task_id:"D-36391",        status:"Observed", type:"LP",      summary:"M | Issue | Styling | Most text section with colored background doesn't have padding on x-axis\nD | Issue | Content | Breadcrumb was not added although it also appears in page example", categories:["Styling","Content"] },
  { day:"Apr 9", owner:"Nicole Gongora",   task_id:"D-36973",        status:"Observed", type:"LP",      summary:"M | Issue | Styling | content cut",                                                                                                                                          categories:["Styling"] },
  { day:"Apr 9", owner:"Sebastian Salazar",task_id:"D-36340",        status:"Failed",   type:"LP",      summary:"D/M | Issue | Config | inventory config\nD | Issue | Styling | too much space between widgets",                                                                               categories:["Styling","Config"] },
  { day:"Apr 9", owner:"Jesus Macedo",     task_id:"D-44881",        status:"Critical", type:"Posting", summary:"D | Critical | Config | the last content in not showing in the specials page",                                                                                                categories:["Config"] },
  { day:"Apr 9", owner:"Jesus Macedo",     task_id:"D-45104",        status:"Observed", type:"Posting", summary:"D | Question | Content | posting missing",                                                                                                                                   categories:["Content"] },
  { day:"Apr 9", owner:"Michael Luna",     task_id:"D-44755",        status:"Observed", type:"Posting", summary:"D | Issue | Config | Postings are not displayed on the specials page",                                                                                                        categories:["Config"] },

  // ── Apr 10 ──
  { day:"Apr 10", owner:"Dylan Jitton",     task_id:"D-46017",       status:"Failed",   type:"LP",      summary:"D/M | Issue | Linking | a button leads to an empty page",                                                                                                                    categories:["Linking"] },
  { day:"Apr 10", owner:"Richard Villalba", task_id:"D-45755",       status:"Failed",   type:"Posting", summary:"D | Issue | Config | Campaigns not filtering correctly, they go to inventories showing 0 vehicles",                                                                           categories:["Config"] },
  { day:"Apr 10", owner:"Sebastian Salazar",task_id:"D-37068",       status:"Observed", type:"LP",      summary:"D/M | Issue | Styling | Way too much empty space after trim section",                                                                                                        categories:["Styling"] },
  { day:"Apr 10", owner:"Nicole Gongora",   task_id:"D-36444",       status:"Observed", type:"LP",      summary:"D/M | Issue | Styling | the lead form should go under the inventory like example page",                                                                                      categories:["Styling"] },
  { day:"Apr 10", owner:"Javier Callejas",  task_id:"D-37234",       status:"Observed", type:"LP",      summary:"M | Issue | Styling | Service center text widget container has a fixed height which makes it overflow its content in mobile view",                                            categories:["Styling"] },
  { day:"Apr 10", owner:"Javier Callejas",  task_id:"D-37217",       status:"Observed", type:"LP",      summary:"D | Issue | Content | Double h1 tag with different content",                                                                                                                 categories:["Content"] },
  { day:"Apr 10", owner:"Edmundo Morales",  task_id:"D-46034",       status:"Observed", type:"LP",      summary:"D | Issue | Styling | Hyperlinked text gets lost in background with the same color",                                                                                         categories:["Styling"] },
  { day:"Apr 10", owner:"Michael Luna",     task_id:"D-37048",       status:"Failed",   type:"LP",      summary:"D | Issue | Content | Instructed CTAs in case details not found in page",                                                                                                    categories:["Content"] },
  { day:"Apr 10", owner:"Javier Callejas",  task_id:"MS0426209479",  status:"Observed", type:"LP",      summary:"D | Issue | Linking | When referencing a section in the same page we should use # anchoring",                                                                                categories:["Linking"] },
  { day:"Apr 10", owner:"Romel Pinto",      task_id:"D-36941",       status:"Failed",   type:"LP",      summary:"D | Issue | Config | Inventory filter incorrect model, showing EX30 instead of EX30 Cross Country",                                                                          categories:["Config"] },
  { day:"Apr 10", owner:"Ariel Vargas",     task_id:"D-37426",       status:"Failed",   type:"LP",      summary:"D/M | Issue | Linking | the first button anchor direct to the wrong part",                                                                                                   categories:["Linking"] },
  { day:"Apr 10", owner:"Javier Callejas",  task_id:"MS0426209524",  status:"Failed",   type:"LP",      summary:"D | Issue | Config | Inventory not properly configured, not showing any vehicle when there is stock available",                                                               categories:["Config"] },
  { day:"Apr 10", owner:"Kattya Torrez",    task_id:"D-42580",       status:"Observed", type:"LP",      summary:"D/M | Issue | Styling | empty widget",                                                                                                                                       categories:["Styling"] },
  { day:"Apr 10", owner:"Javier Alcoba",    task_id:"D-38342",       status:"Observed", type:"LP",      summary:"M | Issue | Styling | Hero image not properly placed on mobile view",                                                                                                        categories:["Styling"] },
  { day:"Apr 10", owner:"Jesus Macedo",     task_id:"D-36910",       status:"Observed", type:"LP",      summary:"D | Question | Styling | why you leave this empty space?",                                                                                                                   categories:["Styling"] }
];

// Note: Apr 6 had 8 cases (counted from weekly chart data — all Observed)
const DAYS = ["Apr 6", "Apr 7", "Apr 8", "Apr 9", "Apr 10"];

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

function count(arr, fn) {
  return arr.filter(fn).length;
}

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

// ─────────────────────────────────────────────────────────────
// DONUT CHART (SVG)
// ─────────────────────────────────────────────────────────────

function drawDonut(svgId, legendId, slices) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 42, cx = 55, cy = 55, stroke = 14;
  let angle = -90;
  let paths = '';

  slices.forEach(s => {
    const pct  = s.value / total;
    const deg  = pct * 360;
    const rad1 = angle * Math.PI / 180;
    const rad2 = (angle + deg) * Math.PI / 180;
    const x1   = cx + r * Math.cos(rad1);
    const y1   = cy + r * Math.sin(rad1);
    const x2   = cx + r * Math.cos(rad2);
    const y2   = cy + r * Math.sin(rad2);
    const lg   = deg > 180 ? 1 : 0;
    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${lg} 1 ${x2},${y2} Z" fill="${s.color}" opacity=".85"/>`;
    angle += deg;
  });

  // inner hole + center label
  paths += `<circle cx="${cx}" cy="${cy}" r="${r - stroke}" fill="var(--surface)"/>`;
  paths += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="var(--text)" font-size="13" font-family="Space Mono,monospace" font-weight="700">${total}</text>`;

  document.getElementById(svgId).innerHTML = paths;

  document.getElementById(legendId).innerHTML = slices.map(s => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${s.color}"></div>
      <span>${s.label} <span style="color:var(--muted);font-family:'Space Mono',monospace">(${s.value})</span></span>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────────
// RENDER — OVERVIEW
// ─────────────────────────────────────────────────────────────

function renderOverview() {
  const d       = DATA;
  const total   = d.length;
  const failed  = count(d, x => x.status === 'Failed');
  const critical= count(d, x => x.status === 'Critical');
  const observed= count(d, x => x.status === 'Observed');
  const owners  = [...new Set(d.map(x => x.owner))].length;

  // KPI cards
  const kpis = [
    { label:'Total Cases',    val: total,    sub: 'this week',                    color: 'var(--accent)' },
    { label:'Observed',       val: observed, sub: `${Math.round(observed/total*100)}% of cases`, color: 'var(--observed)' },
    { label:'Failed',         val: failed,   sub: `${Math.round(failed/total*100)}% of cases`,  color: 'var(--failed)' },
    { label:'Critical',       val: critical, sub: 'high priority',                color: 'var(--critical)' },
    { label:'Team Members',   val: owners,   sub: 'reviewed',                     color: 'var(--accent2)' },
  ];

  document.getElementById('kpi-row').innerHTML = kpis.map(k => `
    <div class="kpi" style="--kpi-color:${k.color}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-val">${k.val}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');

  // Day counts (Apr 6 from chart data = 8)
  const byDay = groupBy(d, 'day');
  const counts = {
    "Apr 6":  8,
    "Apr 7":  byDay["Apr 7"]?.length  || 0,
    "Apr 8":  byDay["Apr 8"]?.length  || 0,
    "Apr 9":  byDay["Apr 9"]?.length  || 0,
    "Apr 10": byDay["Apr 10"]?.length || 0,
  };

  // Timeline strip
  document.getElementById('timeline').innerHTML = DAYS.map(day => `
    <div class="tl-day">
      <div class="tl-day-label">${day}</div>
      <div class="tl-day-count">${counts[day] || 0}</div>
    </div>`).join('');

  // Stacked bar per day
  const maxDay = Math.max(...Object.values(counts));
  document.getElementById('daily-bars').innerHTML = `<div class="bar-chart">${
    DAYS.map(day => {
      const dc   = d.filter(x => x.day === day);
      const f    = count(dc, x => x.status === 'Failed');
      const cr   = count(dc, x => x.status === 'Critical');
      const ob   = count(dc, x => x.status === 'Observed');
      const tot  = counts[day] || 0;
      return `<div class="bar-row">
        <div class="bar-name" style="min-width:56px;">${day}</div>
        <div class="bar-track" style="height:16px;">
          <div style="display:flex;height:100%;">
            <div style="width:${ob/maxDay*100}%;background:var(--observed);opacity:.7"></div>
            <div style="width:${f/maxDay*100}%;background:var(--failed);opacity:.8"></div>
            <div style="width:${cr/maxDay*100}%;background:var(--critical)"></div>
          </div>
        </div>
        <div class="bar-count">${tot}</div>
      </div>`;
    }).join('')
  }</div>`;

  // Status donut
  drawDonut('donut-status', 'donut-status-legend', [
    { label:'Observed', value: observed, color:'var(--observed)' },
    { label:'Failed',   value: failed,   color:'var(--failed)' },
    { label:'Critical', value: critical, color:'var(--critical)' },
  ]);

  // Category bar chart
  const catCount = {};
  d.forEach(r => r.categories.forEach(c => catCount[c] = (catCount[c] || 0) + 1));
  const catColors = { Styling:'var(--accent2)', Content:'var(--accent)', Config:'var(--warn)', Linking:'var(--failed)', Question:'var(--muted)' };
  const maxCat = Math.max(...Object.values(catCount));

  document.getElementById('cat-bars').innerHTML = sortDesc(catCount).map(([cat, cnt]) => `
    <div class="bar-row">
      <div class="bar-name">${cat}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${cnt/maxCat*100}%;background:${catColors[cat] || 'var(--accent)'}"></div></div>
      <div class="bar-count">${cnt}</div>
    </div>`).join('');

  // Owner bar chart
  const ownerCount = {};
  d.forEach(r => ownerCount[r.owner] = (ownerCount[r.owner] || 0) + 1);
  const maxO = Math.max(...Object.values(ownerCount));
  const ownerColors = ['var(--accent)','var(--accent2)','var(--warn)','var(--failed)','var(--critical)'];

  document.getElementById('owner-bars').innerHTML = sortDesc(ownerCount).slice(0, 8).map(([own, cnt], i) => `
    <div class="bar-row">
      <div class="bar-name">${own}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${cnt/maxO*100}%;background:${ownerColors[i % ownerColors.length]}"></div></div>
      <div class="bar-count">${cnt}</div>
    </div>`).join('');

  // Type donut
  const lpCount   = count(d, x => x.type === 'LP');
  const postCount = count(d, x => x.type === 'Posting');
  drawDonut('donut-type', 'donut-type-legend', [
    { label:'LP',      value: lpCount,   color:'var(--lp)' },
    { label:'Posting', value: postCount, color:'var(--posting)' },
  ]);
}

// ─────────────────────────────────────────────────────────────
// RENDER — CASE LOG
// ─────────────────────────────────────────────────────────────

let activeDay = 'All';

function renderCases() {
  document.getElementById('day-filters').innerHTML = ['All', ...DAYS].map(d => `
    <div class="day-btn${d === activeDay ? ' active' : ''}" onclick="setDay('${d}')">${d}</div>`).join('');

  const rows = activeDay === 'All' ? DATA : DATA.filter(x => x.day === activeDay);
  document.getElementById('case-count-label').textContent = `${activeDay} — ${rows.length} cases`;

  document.getElementById('case-tbody').innerHTML = rows.map(r => `
    <tr>
      <td style="font-family:'Space Mono',monospace;font-size:.72rem;color:var(--muted)">${r.day}</td>
      <td style="font-weight:600;white-space:nowrap">${r.owner}</td>
      <td style="font-family:'Space Mono',monospace;font-size:.72rem;color:var(--accent2)">${r.task_id}</td>
      <td><span class="status-pill pill-${r.status}">${r.status}</span></td>
      <td><span class="type-pill type-${r.type}">${r.type}</span></td>
      <td><div class="cat-tags">${r.categories.map(c => `<span class="cat-tag cat-${c}">${c}</span>`).join('')}</div></td>
      <td style="font-size:.75rem;color:var(--muted);max-width:320px">${r.summary.replace(/\n/g, '<br>')}</td>
    </tr>`).join('');
}

function setDay(d) {
  activeDay = d;
  renderCases();
}

// ─────────────────────────────────────────────────────────────
// RENDER — TEAM ANALYSIS
// ─────────────────────────────────────────────────────────────

function renderTeam() {
  const ownerMap  = groupBy(DATA, 'owner');
  const catColors = { Styling:'var(--accent2)', Content:'var(--accent)', Config:'var(--warn)', Linking:'var(--failed)', Question:'var(--muted)' };

  const cards = Object.entries(ownerMap)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([owner, cases]) => {
      const obs      = count(cases, x => x.status === 'Observed');
      const fail     = count(cases, x => x.status === 'Failed');
      const crit     = count(cases, x => x.status === 'Critical');
      const cats     = {};
      cases.forEach(c => c.categories.forEach(cat => cats[cat] = (cats[cat] || 0) + 1));
      const topCat   = sortDesc(cats)[0];
      const failRate = Math.round((fail + crit) / cases.length * 100);
      const trend    = failRate >= 50 ? 'risk' : failRate >= 25 ? 'watch' : 'ok';
      const trendLabel = trend === 'risk' ? '⚠ At Risk' : trend === 'watch' ? '◈ Watch' : '✓ On Track';
      const barColor = failRate >= 50 ? 'var(--failed)' : failRate >= 25 ? 'var(--warn)' : 'var(--accent)';

      return `<div class="owner-card">
        <div class="owner-name">${owner}</div>
        <div class="owner-stats">
          <div class="owner-stat" style="margin-right:14px">
            <div class="owner-stat-val" style="color:var(--text)">${cases.length}</div>
            <div class="owner-stat-lbl">Cases</div>
          </div>
          <div class="owner-stat" style="margin-right:14px">
            <div class="owner-stat-val" style="color:var(--observed)">${obs}</div>
            <div class="owner-stat-lbl">Observed</div>
          </div>
          <div class="owner-stat" style="margin-right:14px">
            <div class="owner-stat-val" style="color:var(--failed)">${fail}</div>
            <div class="owner-stat-lbl">Failed</div>
          </div>
          <div class="owner-stat">
            <div class="owner-stat-val" style="color:var(--critical)">${crit}</div>
            <div class="owner-stat-lbl">Critical</div>
          </div>
        </div>
        ${topCat ? `<div style="font-size:.72rem;color:var(--muted);margin-bottom:6px;">Top issue: <span style="color:${catColors[topCat[0]] || 'var(--text)'}">${topCat[0]} (${topCat[1]})</span></div>` : ''}
        <div class="owner-bar-row">
          <div class="owner-bar-lbl">Fail rate</div>
          <div class="owner-bar-track"><div class="owner-bar-fill" style="width:${failRate}%;background:${barColor}"></div></div>
          <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--muted);min-width:30px;text-align:right">${failRate}%</div>
        </div>
        <div><span class="trend-badge trend-${trend}">${trendLabel}</span></div>
      </div>`;
    });

  document.getElementById('owner-grid').innerHTML = cards.join('');
}

// ─────────────────────────────────────────────────────────────
// RENDER — WEEKLY REPORT
// ─────────────────────────────────────────────────────────────

function renderReport() {
  const d        = DATA;
  const total    = d.length;
  const fail     = count(d, x => x.status === 'Failed');
  const crit     = count(d, x => x.status === 'Critical');
  const owners   = [...new Set(d.map(x => x.owner))];
  const catCount = {};
  d.forEach(r => r.categories.forEach(c => catCount[c] = (catCount[c] || 0) + 1));

  const ownerMap      = groupBy(d, 'owner');
  const atRisk        = Object.entries(ownerMap)
    .filter(([, cases]) => count(cases, x => x.status === 'Failed' || x.status === 'Critical') / cases.length >= 0.5)
    .map(([o]) => o);
  const repeatedConfig = d.filter(x => x.categories.includes('Config')).length >= 5;

  document.getElementById('daily-report').textContent =
`QA Shadow – Daily EOD (Apr 6–10, 2026)

• Reviewed: ${owners.length} people / ${total} cases
• Main issues: Config mismatches (inventory filter / trim), Styling (empty space, mobile layout)
• Pattern: ${repeatedConfig ? 'Repeated Config errors — inventory filter misconfiguration across multiple team members' : 'No dominant repeated pattern detected'}
• At risk: ${atRisk.length > 0 ? atRisk.join(', ') : 'None'}
• Queues: Stable (to be verified in WOMS)
• Status: Under control / monitor Config errors`;

  document.getElementById('weekly-report').textContent =
`QA Shadow – Weekly Summary
Week Apr 6–10, 2026

## Coverage
- Total people reviewed: ${owners.length}
- Total cases reviewed: ${total}

## Main Patterns
- Config (inventory filter, trim, campaigns) is the #1 recurring bug category.
- Styling issues (empty space, mobile layout) are common but low severity.
- Linking errors (missing # anchoring, broken CTAs) need systematic attention.

## Top Issues
${sortDesc(catCount).map(([c, n]) => `- ${c}: ${n} occurrences`).join('\n')}

## Performance
- Improved: Edmundo Morales, Javier Alcoba (0% fail rate)
- Needs attention: ${atRisk.join(', ') || 'N/A'}
- Most errors: Javier Callejas (${ownerMap['Javier Callejas']?.length || 0} cases), Alexander Sosa (${((ownerMap['Alexander Sosa'] || []).concat(ownerMap['Alexander Sosa '] || [])).length} cases)

## Queue & Control
- Overall status: Stable
- Pending/rework issues: Requires daily WOMS verification
- Notes: Critical cases (D-44881, D-36120, D-46425) must be followed up on fix.

## Recommendations
1. Host a Config session — inventory filter rules and trim setup.
2. Review anchoring (#) standards in a team sync.
3. QA Shadow next week to continue tracking Config bug trend.

## Final Status
- Overall: Under control
- Critical bugs: ${crit} (follow up required)
- Failed rate: ${Math.round(fail / total * 100)}%`;
}

// ─────────────────────────────────────────────────────────────
// CSV IMPORT (file upload + Google Sheets URL)
// ─────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines   = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const obj  = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');

    const sum  = obj['Summary bugs'] || obj['summary'] || '';
    const cats = [];
    if (sum.includes('Styling'))  cats.push('Styling');
    if (sum.includes('Content'))  cats.push('Content');
    if (sum.includes('Config'))   cats.push('Config');
    if (sum.includes('Linking'))  cats.push('Linking');
    if (sum.includes('Question')) cats.push('Question');

    return {
      day:        obj['day']      || obj['Day']    || 'Imported',
      owner:      obj['Owner']    || obj['owner']  || 'Unknown',
      task_id:    obj['ID task']  || obj['task_id']|| '',
      status:     obj['Status']   || obj['status'] || 'Observed',
      type:       obj['Type']     || obj['type']   || 'LP',
      summary:    sum,
      categories: [...new Set(cats)]
    };
  }).filter(r => r.owner && r.owner !== 'Owner');
}

document.getElementById('csv-file-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    try {
      const parsed = parseCSV(ev.target.result);
      DATA = [...DATA, ...parsed];
      document.getElementById('import-status').textContent = `✓ Loaded ${parsed.length} new cases. Switch tabs to see updated data.`;
      rerender();
    } catch (err) {
      document.getElementById('import-status').textContent = '✗ Parse error: ' + err.message;
    }
  };
  reader.readAsText(file);
});

async function fetchGS() {
  const url = document.getElementById('gs-url').value.trim();
  if (!url) { document.getElementById('import-status').textContent = 'Please enter a URL'; return; }
  document.getElementById('import-status').textContent = '⟳ Fetching…';
  try {
    const resp   = await fetch(url);
    const text   = await resp.text();
    const parsed = parseCSV(text);
    DATA = [...DATA, ...parsed];
    document.getElementById('import-status').textContent = `✓ Loaded ${parsed.length} cases from Google Sheets.`;
    rerender();
  } catch (err) {
    document.getElementById('import-status').textContent = '✗ Error: ' + err.message + '. Make sure the sheet is published to web as CSV.';
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
  if (id === 'cases')  renderCases();
  if (id === 'team')   renderTeam();
  if (id === 'report') renderReport();
}

function copyText(id) {
  const txt = document.getElementById(id).textContent;
  navigator.clipboard.writeText(txt).then(() => {
    const btn  = event.target;
    const orig = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

function rerender() {
  renderOverview();
  if (document.getElementById('panel-cases').classList.contains('active'))  renderCases();
  if (document.getElementById('panel-team').classList.contains('active'))   renderTeam();
  if (document.getElementById('panel-report').classList.contains('active')) renderReport();
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
renderOverview();
