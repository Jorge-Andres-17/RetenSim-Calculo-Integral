'use strict';

/* -----------------------------------------
   1. CONFIGURACIÓN Y CONSTANTES
   -------------------------------------------------- */

const DEFAULTS = {
  income: 60000,
  T: 20,
  lambda: 0.1,
  discount: 0.1,
  lambdaA: 0.08,
  delta: 0.5,
  tau: 6,
  costB: 5000,
  accept: 0.2,
  costC: 15000,
  n: 20,
  cohort: 600,
  hours: 120,
  hourRate: 25000,
};

const PARAM_IDS = Object.keys(DEFAULTS);

const SCENARIO_LABELS = {
  base: 'Sin intervención',
  A: 'A · Beneficio masivo',
  B: 'B · Acompañamiento',
  C: 'C · Oferta al cancelar',
};

const SCENARIO_COLORS = {
  base: '#a5b0bd',
  A: '#82ade6',
  B: '#43dbb7',
  C: '#d8aa77',
};

/** Orden de visualización de los escenarios en tablas y barras. */
const SCENARIO_ORDER = ['base', 'A', 'B', 'C'];

/** Subdivisiones de la referencia numérica (Simpson compuesto). */
const REFERENCE_SUBDIVISIONS = 4096;

/** Valores de n usados en la tabla de convergencia. */
const CONVERGENCE_STEPS = [10, 20, 40, 80];

/* -----------------------------------------
   2. ESTADO DE LA APLICACIÓN
   -------------------------------------------- */

let result = null;

/* ------------------------------------------
   3. UTILIDADES (DOM y formato)
   ------------------------------------------- */

const $ = (id) => document.getElementById(id);

const numberFormat = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const money = (x) => '$' + numberFormat.format(x);
const formatPercent = (x) => numberFormat.format(100 * x) + ' %';

/** Lee los parámetros actuales desde los inputs del formulario. */
function readParams() {
  return Object.fromEntries(PARAM_IDS.map((k) => [k, Number($(k).value)]));
}

/* ------------------------------------------------
   4. MODELO MATEMÁTICO
   ---------------------------------------- */

/** Función de supervivencia S(t) según el escenario. */
function survival(t, p, kind) {
  if (kind === 'base') return Math.exp(-p.lambda * t);
  if (kind === 'A') return Math.exp(-p.lambdaA * t);
  if (kind === 'C') return Math.exp(-p.lambda * (1 - p.accept) * t);
  return Math.exp(-p.lambda * t + p.lambda * p.delta * p.tau * (1 - Math.exp(-t / p.tau)));
}

/** Integrando (valor esperado por mes) según el escenario. */
function integrand(t, p, kind) {
  const s = survival(t, p, kind);
  if (kind === 'base') return p.income * s;
  if (kind === 'A') return p.income * (1 - p.discount) * s;
  if (kind === 'C') return (p.income - p.lambda * p.costC) * s;
  return (p.income - p.costB * Math.exp(-t / p.tau)) * s;
}

/** Integral cerrada de perMonth·e^(-rate·t) en [0, T]. */
function constantIntegral(rate, perMonth, T) {
  return perMonth * (Math.abs(rate) < 1e-12 ? T : -Math.expm1(-rate * T) / rate);
}

/* ---------- Métodos numéricos ---------- */

function simpson(fn, T, n) {
  const h = T / n;
  let sum = fn(0) + fn(T);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * fn(i * h);
  return (sum * h) / 3;
}

function trapezoid(fn, T, n) {
  let sum = (fn(0) + fn(T)) / 2;
  for (let i = 1; i < n; i++) sum += fn((i * T) / n);
  return (sum * T) / n;
}

/**
 * Calcula el valor esperado de cada escenario y los resultados numéricos.
 *
 * Composite Simpson with 4096 subdivisions: a consistently refined numerical reference,
 * not an independent empirical validation of the assumptions.
 */
function compute(p) {
  const vals = {
    base: constantIntegral(p.lambda, p.income, p.T),
    A: constantIntegral(p.lambdaA, p.income * (1 - p.discount), p.T),
    C: constantIntegral(p.lambda * (1 - p.accept), p.income - p.lambda * p.costC, p.T),
  };

  const f = (t) => integrand(t, p, 'B');
  vals.B = simpson(f, p.T, REFERENCE_SUBDIVISIONS);

  const reference = vals.B;
  const sim = simpson(f, p.T, p.n);
  const trap = trapezoid(f, p.T, p.n);

  let best = 'base';
  for (const k of ['A', 'B', 'C']) {
    if (vals[k] > vals[best]) best = k;
  }

  return { p, vals, best, sim, trap, reference };
}

/** Genera las filas de la tabla de Simpson para el escenario B. */
function buildSimpsonRows(p) {
  const f = (t) => integrand(t, p, 'B');
  const h = p.T / p.n;
  const rows = [];

  for (let i = 0; i <= p.n; i++) {
    const t = i * h;
    const s = survival(t, p, 'B');
    const v = f(t);
    const coef = i === 0 || i === p.n ? 1 : i % 2 ? 4 : 2;
    rows.push({ i, t, s, v, coef, weighted: v * coef });
  }
  return rows;
}

/* -----------------------------------
   5. MODELO OPERATIVO
   ------------------------------ */

/**
 * Calcula carga operativa del acompañamiento (horas, FTE, costos)
 * y actualiza los indicadores en pantalla.
 */
function opsModel(p) {
  // The economic model cost B is the single source of truth.
  // Advisory minutes are derived from it and the illustrative hourly rate.
  const minutes = (p.costB / p.hourRate) * 60;
  const costFn = (t) => p.costB * Math.exp(-t / p.tau) * survival(t, p, 'B');
  const accumulated = simpson(costFn, p.T, REFERENCE_SUBDIVISIONS) * p.cohort;

  const checkpoints = [0, 3, 6, 12, p.T]
    .filter((x, i, a) => x <= p.T && a.indexOf(x) === i)
    .sort((a, b) => a - b);

  const rows = checkpoints.map((t) => {
    const active = p.cohort * survival(t, p, 'B');
    const hrs = (active * Math.exp(-t / p.tau) * minutes) / 60;
    return { t, hours: hrs, fte: hrs / p.hours, cost: hrs * p.hourRate };
  });

  const gross =
    (simpson((t) => p.income * survival(t, p, 'B'), p.T, REFERENCE_SUBDIVISIONS) -
      constantIntegral(p.lambda, p.income, p.T)) *
    p.cohort;

  const initialAdvisors = Math.ceil(rows[0].fte);
  const fixedExpense = initialAdvisors * p.hours * p.hourRate * p.T;

  renderOps({ p, minutes, rows, accumulated, gross, fixedExpense });

  return { accumulated, minutes, rows };
}

/* ---------------------------------------------------
   6. RENDERIZADO (UI)
   --------------------------------------------- */

/* ---------- Etiquetas de los controles ---------- */

function updateLabels(p) {
  const labels = {
    income: money(p.income),
    T: p.T + ' meses',
    lambda: numberFormat.format(p.lambda),
    discount: formatPercent(p.discount),
    lambdaA: numberFormat.format(p.lambdaA),
    delta: formatPercent(p.delta),
    tau: p.tau + ' meses',
    costB: money(p.costB),
    accept: formatPercent(p.accept),
    costC: money(p.costC),
    n: String(p.n),
    cohort: integerFormat.format(p.cohort),
    hours: p.hours + ' h',
    hourRate: money(p.hourRate),
  };

  for (const [k, v] of Object.entries(labels)) {
    if ($(k + 'Out')) $(k + 'Out').textContent = v;
  }
}

/* ---------- Gráficos ---------- */

function linePath(p, kind, w, h, m) {
  let d = '';
  for (let i = 0; i <= 120; i++) {
    const t = (p.T * i) / 120;
    const x = m + ((w - 2 * m) * i) / 120;
    const y = m + (h - 2 * m) * (1 - survival(t, p, kind));
    d += (i ? ' L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d;
}

function drawHero() {
  const p = DEFAULTS;
  const w = 460, h = 260, m = 30;
  const line = linePath(p, 'B', w, h, m);
  const base = linePath(p, 'base', w, h, m);

  $('heroLine').setAttribute('d', line);
  $('heroBase').setAttribute('d', base);
  $('heroArea').setAttribute('d', line + ` L${w - m} ${h - m} L${m} ${h - m} Z`);
}

function drawChart(p) {
  const svg = $('survivalChart');
  const w = 720, h = 310, l = 48, r = 20, t = 20, b = 40;
  const ww = w - l - r;
  const hh = h - t - b;
  const y = (surv) => t + (1 - surv) * hh;
  let s = '';

  // Líneas horizontales y etiquetas del eje Y
  for (let i = 0; i <= 5; i++) {
    const yy = t + (hh * i) / 5;
    s += `<line x1="${l}" y1="${yy}" x2="${w - r}" y2="${yy}" stroke="#648798" stroke-opacity=".2"/><text x="${l - 10}" y="${yy + 4}" fill="#a5bac6" text-anchor="end" font-size="11">${100 - i * 20}%</text>`;
  }

  // Etiquetas del eje X
  for (let i = 0; i <= 5; i++) {
    const xx = l + (ww * i) / 5;
    s += `<text x="${xx}" y="${h - 12}" text-anchor="middle" fill="#a5bac6" font-size="11">${numberFormat.format((p.T * i) / 5)}</text>`;
  }

  // Curvas de supervivencia (B se dibuja al final para quedar encima)
  for (const kind of ['base', 'A', 'C', 'B']) {
    let path = '';
    for (let i = 0; i <= 150; i++) {
      const f = i / 150;
      path += (i ? 'L' : 'M') + (l + ww * f).toFixed(2) + ' ' + y(survival(f * p.T, p, kind)).toFixed(2) + ' ';
    }
    const dash = kind === 'C' ? 'stroke-dasharray="4 5"' : '';
    s += `<path d="${path}" fill="none" stroke="${SCENARIO_COLORS[kind]}" stroke-width="${kind === 'B' ? 3.6 : 2.3}" ${dash}/>`;
  }

  svg.innerHTML = s;
}

function drawBars(vals) {
  const max = Math.max(0, ...Object.values(vals));

  $('barChart').innerHTML = SCENARIO_ORDER.map((k) => {
    const width = Math.min(100, Math.max(0, (100 * vals[k]) / (max || 1))).toFixed(2);
    return `<div class="bar-item"><div class="bar-label"><span>${SCENARIO_LABELS[k]}</span><strong>${money(vals[k])}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${SCENARIO_COLORS[k]}"></div></div></div>`;
  }).join('');
}

/* ---------- Resumen y tabla de resultados ---------- */

function renderSummary(r) {
  const p = r.p;
  const diff = r.vals[r.best] - r.vals.base;

  $('bestValue').textContent = money(r.vals[r.best]);
  $('bestName').textContent = SCENARIO_LABELS[r.best];
  $('improvement').textContent = money(diff);
  $('improvementPct').textContent =
    (r.vals.base ? numberFormat.format((diff / r.vals.base) * 100) : '0') + ' % respecto a base';
  $('survivalB').textContent = formatPercent(survival(p.T, p, 'B'));
  $('survivalT').textContent = `Al mes ${p.T}`;
}

function renderResultsTable(r) {
  const p = r.p;

  $('resultsBody').innerHTML = SCENARIO_ORDER.map(
    (k) =>
      `<tr><td>${SCENARIO_LABELS[k]}${r.best === k ? ' ★' : ''}</td><td>${formatPercent(survival(p.T, p, k))}</td><td>${money(r.vals[k])}</td><td>${money(r.vals[k] - r.vals.base)}</td></tr>`
  ).join('');
}

/* ---------- Validación numérica ---------- */

function updateValidation(r) {
  const p = r.p;
  const f = (t) => integrand(t, p, 'B');

  $('simN').textContent = p.n;
  $('simpson').textContent = money(r.sim);
  $('trapezoid').textContent = money(r.trap);
  $('reference').textContent = money(r.reference);
  $('simError').textContent = money(Math.abs(r.sim - r.reference));
  $('trapError').textContent = money(Math.abs(r.trap - r.reference));

  const rows = buildSimpsonRows(p);

  $('convergenceRows').innerHTML = CONVERGENCE_STEPS.map((n) => {
    const a = simpson(f, p.T, n);
    const b = trapezoid(f, p.T, n);
    return `<tr><td>${n}</td><td>${money(a)}</td><td>${money(Math.abs(a - r.reference))}</td><td>${money(b)}</td><td>${money(Math.abs(b - r.reference))}</td></tr>`;
  }).join('');

  $('simpsonRows').innerHTML = rows
    .map(
      (x) =>
        `<tr><td>${x.i}</td><td>${numberFormat.format(x.t)}</td><td>${x.s.toFixed(6).replace('.', ',')}</td><td>${money(x.v)}</td><td>${x.coef}</td><td>${money(x.weighted)}</td></tr>`
    )
    .join('');

  r.simRows = rows;
}

/* ---------- Modelo operativo ---------- */

function renderOps({ p, minutes, rows, accumulated, gross, fixedExpense }) {
  $('minutesDerived').textContent = numberFormat.format(minutes) + ' min';
  $('opsHours').textContent = numberFormat.format(rows[0].hours);
  $('opsFte').textContent = numberFormat.format(rows[0].fte);
  $('opsCost').textContent = money(accumulated);
  $('opsCostSub').textContent = `Costo ya descontado en B · ${p.cohort} clientes · ${p.T} meses`;

  $('opsGross').textContent = money(gross);
  $('opsFlexible').textContent = money(gross - accumulated);
  $('opsFixed').textContent = money(gross - fixedExpense);

  $('opsBody').innerHTML = rows
    .map(
      (x) =>
        `<tr><td>${numberFormat.format(x.t)}</td><td>${numberFormat.format(x.hours)}</td><td>${numberFormat.format(x.fte)}</td><td>${money(x.cost)}</td></tr>`
    )
    .join('');
}

/* ------------------------------------------------------------
   7. ACTUALIZACIÓN GENERAL
   ----------------------------------------------------------- */

function update() {
  const p = readParams();
  updateLabels(p);

  const r = compute(p);
  result = r;

  renderSummary(r);
  drawChart(p);
  drawBars(r.vals);
  renderResultsTable(r);
  updateValidation(r);
  opsModel(p);
}

/* ========-------------------------------------------==================================================================
   8. EXPORTACIÓN CSV
   ---------------------------------------------------============================================ */

function downloadCsv(rows, name) {
  const content =
    '\ufeff' +
    rows.map((r) => r.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(';')).join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportComparisonCsv() {
  if (!result) return;
  const r = result;

  downloadCsv(
    [
      ['Escenario', 'Permanencia final', 'Valor esperado COP', 'Diferencia base COP'],
      ...SCENARIO_ORDER.map((k) => [
        SCENARIO_LABELS[k],
        survival(r.p.T, r.p, k),
        r.vals[k],
        r.vals[k] - r.vals.base,
      ]),
    ],
    'retensim_comparacion.csv'
  );
}

function exportSimpsonTableCsv() {
  if (!result) return;

  downloadCsv(
    [
      ['i', 'Mes', 'Supervivencia B', 'Integrando COP por mes', 'Coeficiente Simpson', 'Producto'],
      ...result.simRows.map((x) => [x.i, x.t, x.s, x.v, x.coef, x.weighted]),
    ],
    'retensim_tabla_simpson.csv'
  );
}

/* -----------------------------------------=======================================
   9. MANEJADORES DE EVENTOS
   ----------------------------------------============================================= */

function resetParams() {
  for (const [k, v] of Object.entries(DEFAULTS)) $(k).value = v;
  update();
}

function toggleMenu() {
  const open = $('nav').classList.toggle('open');
  $('menuButton').setAttribute('aria-expanded', String(open));
}

function closeMenu() {
  $('nav').classList.remove('open');
  $('menuButton').setAttribute('aria-expanded', 'false');
}

function bindEvents() {
  $('csv').addEventListener('click', exportComparisonCsv);
  $('tableCsv').addEventListener('click', exportSimpsonTableCsv);
  $('reset').addEventListener('click', resetParams);

  for (const id of PARAM_IDS) {
    $(id).addEventListener(id === 'n' ? 'change' : 'input', update);
  }

  $('menuButton').addEventListener('click', toggleMenu);
  document.querySelectorAll('#nav a').forEach((a) => a.addEventListener('click', closeMenu));
}

/* =-------------------------------------------===========================================
   10. INICIALIZACIÓN
   -----------------------------------------------======================================= */

bindEvents();
drawHero();
update();