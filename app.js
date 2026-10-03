'use strict';

/* =========================================================
   Progress — suivi des tirs au basket (PWA, données locales)
   ========================================================= */

const STORE = 'progress.v1';
const COLORS = ['#f0913a', '#f0c75a', '#7fdc9f', '#5ed1d1', '#6aa8f0', '#b48cf0', '#f08cc4', '#f07a6a'];
const EMOJIS = ['🎯', '🏀', '🏃', '🎈', '⛹️', '🔥', '💪', '⭐', '🏆', '⚡', '🚀', '🌀',
  '👟', '🦘', '🙌', '👀', '🧠', '💥', '🌙', '☀️', '⬅️', '➡️', '⬆️', '↗️'];
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const MIN_RECORD = 10; // tirs minimum pour qu'une séance compte comme record
const SERIES = 10; // tirs par série par défaut

/*
 * Exercices de départ. Les ids sont fixes : deux appareils qui démarrent
 * chacun de leur côté ne créent pas de doublons à la synchro.
 */
const DEFAULT_EXERCISES = [
  { id: 'lf', name: 'Lancers francs', emoji: '🎯', color: '#f0913a' },
  { id: 'dpd', name: 'Double pas droite', emoji: '🏃', color: '#7fdc9f' },
  { id: 'dpg', name: 'Double pas gauche', emoji: '🏃', color: '#5ed1d1' },
  { id: '3ax', name: '3 points axe', emoji: '🏀', color: '#6aa8f0' },
  { id: '3d45', name: '3 points 45° droite', emoji: '🏀', color: '#b48cf0' },
  { id: '3g45', name: '3 points 45° gauche', emoji: '🏀', color: '#f08cc4' },
  { id: '3d0', name: '3 points 0° droite', emoji: '🏀', color: '#f07a6a' },
  { id: '3g0', name: '3 points 0° gauche', emoji: '🏀', color: '#f0c75a' },
  { id: 'flo', name: 'Floater', emoji: '🎈', color: '#5ed1d1' },
];

/* ---------- State ---------- */
let state = load();
let tab = 'today';
let statsSel = 'all';
let popKey = null; // exercice dont le bouton + s'anime au prochain affichage

/*
 * log[day][exId] = [[réussis, tentés], …] : une entrée par série.
 * stamps[`${day}|${exId}`] = date de la dernière modif d'une case,
 * deleted[exId] = date de suppression, ex.updatedAt, orderAt :
 * ces horodatages permettent de fusionner les données de plusieurs appareils.
 */
function defaultExercises() { return DEFAULT_EXERCISES.map(e => ({ ...e, size: SERIES, updatedAt: 0 })); }
function emptyState(seed = true) { return { v: 1, exercises: seed ? defaultExercises() : [], log: {}, stamps: {}, deleted: {}, orderAt: 0 }; }
function normalize(s, seed = true) {
  if (!s || !Array.isArray(s.exercises) || typeof s.log !== 'object') return emptyState(seed);
  s.v = 1; s.stamps ||= {}; s.deleted ||= {}; s.orderAt ||= 0;
  for (const e of s.exercises) { e.updatedAt ||= 0; e.size ||= SERIES; }
  return s;
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(STORE))); } catch (e) { return emptyState(); }
}
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { toast('Sauvegarde impossible'); }
}
function save() { persist(); scheduleSync(); }

/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dow = d => (d.getDay() + 6) % 7; // 0 = lundi
const weekStart = d => addDays(d, -dow(d));
const dayLabel = k => {
  const t = today();
  if (k === key(t)) return "Aujourd'hui";
  if (k === key(addDays(t, -1))) return 'Hier';
  const d = parse(k);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== t.getFullYear() ? { year: 'numeric' } : {}) });
};
const shortDate = k => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

/* ---------- Log ---------- */
const series = (ex, k) => state.log[k]?.[ex.id] || [];
const sum = list => list.reduce((t, [m, a]) => ({ m: t.m + m, a: t.a + a }), { m: 0, a: 0 });
const val = (ex, k) => sum(series(ex, k));
function setSeries(ex, k, list) {
  const day = state.log[k] || (state.log[k] = {});
  if (!list.length) delete day[ex.id]; else day[ex.id] = list;
  if (!Object.keys(day).length) delete state.log[k];
  state.stamps[`${k}|${ex.id}`] = Date.now();
  save();
}
const addSeries = (ex, k, m) => setSeries(ex, k, [...series(ex, k), [m, ex.size]]);
/** Totaux d'un ou plusieurs exercices sur les jours [from, to] (clés incluses). */
function tally(exs, from = '', to = '9999') {
  let m = 0, a = 0;
  for (const k in state.log) {
    if (k < from || k > to) continue;
    for (const ex of exs) { const v = sum(series(ex, k)); m += v.m; a += v.a; }
  }
  return { m, a };
}
/** Séances d'un exercice, de la plus ancienne à la plus récente. */
function sessions(ex) {
  return Object.keys(state.log).filter(k => state.log[k][ex.id]?.length).sort().map(k => ({ k, n: series(ex, k).length, ...val(ex, k) }));
}
/** Meilleure série jamais faite (au meilleur taux, puis la plus récente). */
function bestSeries(ex) {
  let best = null;
  for (const k of Object.keys(state.log).sort()) for (const [m, a] of series(ex, k)) if (!best || m / a >= best.m / best.a) best = { k, m, a };
  return best;
}
function trainingDays() {
  const ids = new Set(state.exercises.map(e => e.id));
  return Object.keys(state.log).filter(k => Object.keys(state.log[k]).some(id => ids.has(id))).sort();
}
function bestSession(ex) {
  let best = null;
  for (const s of sessions(ex)) if (s.a >= MIN_RECORD && (!best || s.m / s.a > best.m / best.a)) best = s;
  return best;
}
/** Jours d'entraînement consécutifs (aujourd'hui pas encore fait ne casse rien). */
function streak() {
  const days = new Set(trainingDays());
  let d = today(), n = 0;
  if (!days.has(key(d))) d = addDays(d, -1);
  while (days.has(key(d))) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------- Helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const byId = id => state.exercises.find(e => e.id === id);
const ratio = t => t.a ? t.m / t.a : null;
const pct = r => r == null ? '–' : Math.round(r * 100) + ' %';
const sinceKey = n => key(addDays(today(), -(n - 1)));

const ICON_PLUS = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

/* =========================================================
   Views
   ========================================================= */
function render() {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#title').textContent = { today: 'Entraînement', history: 'Historique', stats: 'Progrès' }[tab];
  const view = $('#view');
  if (!state.exercises.length) view.innerHTML = emptyView();
  else view.innerHTML = tab === 'today' ? todayView() : tab === 'history' ? historyView() : statsView();
  popKey = null;
  if (tab === 'stats') { const sc = view.querySelector('.heat-scroll'); if (sc) sc.scrollLeft = sc.scrollWidth; }
}

function emptyView() {
  return `<div class="empty">
    <h2>Chaque tir compte.</h2>
    <p>Ajoute les exercices que tu travailles<br>pour suivre ta progression.</p>
    <button class="btn accent" data-act="defaults">Ajouter les exercices de base</button>
    <button class="btn" data-act="new">Créer un exercice</button>
  </div>`;
}

function todayView() {
  const t = today(), k = key(t);
  const tot = tally(state.exercises, k, k);
  const p = ratio(tot) || 0;
  const r = 22, c = 2 * Math.PI * r;
  const dateStr = t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const st = streak();
  return `<div class="summary">
      <div class="ring-wrap">
        <svg viewBox="0 0 52 52" width="52" height="52" style="transform:rotate(-90deg)"><circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--card-2)" stroke-width="4"/><circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="transition:stroke-dashoffset .4s"/></svg>
        <span>${tot.a ? Math.round(p * 100) + '%' : '–'}</span>
      </div>
      <div><div class="greet">${dateStr}</div><div class="count">${tot.a ? `${tot.m} réussis sur ${tot.a} tirs` : 'Pas encore de série'}</div></div>
      <div class="day"><b>${st ? '🔥 ' + st : trainingDays().length}</b><small>${st ? (st > 1 ? 'jours de suite' : 'jour de suite') : 'entraînements'}</small></div>
    </div>
    <div class="list">${state.exercises.map(ex => exRow(ex, k)).join('')}</div>
    <p class="hint">Fais une série de tirs, puis touche + pour noter tes réussites.<br>Touche un exercice pour voir ou corriger tes séries du jour.</p>`;
}

function exRow(ex, k) {
  const list = series(ex, k), v = sum(list);
  const ref = ratio(tally([ex], sinceKey(30), key(addDays(today(), -1))));
  let sub = list.length ? `${list.map(([m]) => m).join(' · ')} → <b>${pct(v.m / v.a)}</b>` : `Séries de ${ex.size} tirs`;
  if (ref != null) sub += ` · moy. ${pct(ref)}`;
  return `<div class="ex" data-act="day" data-id="${ex.id}" style="--c:${ex.color}">
    <div class="emoji">${ex.emoji}</div>
    <div class="body">
      <div class="name">${esc(ex.name)}</div>
      <div class="sub">${sub}</div>
      <div class="meter"><span style="width:${v.a ? v.m / v.a * 100 : 0}%"></span></div>
    </div>
    <button class="shot ${popKey === ex.id ? 'pop' : ''}" data-act="add" data-id="${ex.id}" aria-label="Noter une série">${ICON_PLUS}</button>
  </div>`;
}

function historyView() {
  const days = trainingDays().reverse();
  const add = '<button class="btn" data-act="past" style="margin:0 0 12px">+ Ajouter une séance passée</button>';
  if (!days.length) return add + '<p class="hint">Aucune séance pour l\'instant.<br>Tes entraînements apparaîtront ici.</p>';
  return add + `<div class="list">${days.map(k => {
    const exs = state.exercises.filter(ex => state.log[k][ex.id]);
    const tot = tally(exs, k, k);
    return `<div class="day-card" data-act="edit-day" data-day="${k}">
      <h3><span>${dayLabel(k)}</span><small>${tot.m}/${tot.a} · ${pct(ratio(tot))}</small></h3>
      <div class="rates">${exs.map(ex => { const v = val(ex, k); return `<div class="r" style="--c:${ex.color}"><span>${ex.emoji}</span><span class="n">${esc(ex.name)}</span><span class="track"><span style="width:${v.m / v.a * 100}%"></span></span><span class="pct" style="width:auto;min-width:46px">${v.m}/${v.a}</span></div>`; }).join('')}</div>
    </div>`;
  }).join('')}</div>`;
}

function statsView() {
  if (statsSel !== 'all' && !byId(statsSel)) statsSel = 'all';
  const chips = `<div class="chips"><button class="chip ${statsSel === 'all' ? 'active' : ''}" data-act="sel" data-id="all">Tous</button>${state.exercises.map(ex => `<button class="chip ${statsSel === ex.id ? 'active' : ''}" data-act="sel" data-id="${ex.id}">${ex.emoji} ${esc(ex.name)}</button>`).join('')}</div>`;
  return chips + (statsSel === 'all' ? statsAll() : statsOne(byId(statsSel)));
}

/** Variation de réussite : 30 derniers jours contre les 30 d'avant. */
function trend(exs) {
  const cur = ratio(tally(exs, sinceKey(30)));
  const prev = ratio(tally(exs, sinceKey(60), key(addDays(today(), -30))));
  if (cur == null || prev == null) return '';
  const d = Math.round((cur - prev) * 100);
  return d ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d} pts</em>` : '';
}

function statsAll() {
  const exs = state.exercises;
  const all = tally(exs);
  const week = tally(exs, key(weekStart(today())));
  const counts = {};
  for (const k in state.log) counts[k] = tally(exs, k, k).a;
  const max = Math.max(1, ...Object.values(counts));
  const heat = heatmap('var(--accent)', d => {
    const n = counts[key(d)];
    return n ? 'lvl' + Math.max(1, Math.ceil(n / max * 4)) : '';
  });
  return `<div class="kpis">
      <div class="kpi"><small>Réussite 30 j</small><b>${pct(ratio(tally(exs, sinceKey(30))))}${trend(exs)}</b></div>
      <div class="kpi"><small>Entraînements</small><b>${trainingDays().length}</b></div>
      <div class="kpi"><small>Tirs au total</small><b>${all.a}</b></div>
      <div class="kpi"><small>Tirs cette semaine</small><b>${week.a}</b></div>
    </div>
    <div class="card"><h3><span>Réussite par exercice</span><span>30 jours</span></h3><div class="rates">${exs.map(ex => {
      const r = ratio(tally([ex], sinceKey(30)));
      return `<div class="r" style="--c:${ex.color}" data-act="sel" data-id="${ex.id}"><span>${ex.emoji}</span><span class="n">${esc(ex.name)}</span><span class="track"><span style="width:${(r || 0) * 100}%"></span></span><span class="pct" style="width:46px">${pct(r)}</span></div>`;
    }).join('')}</div></div>
    <div class="card" style="--c:var(--accent)"><h3><span>Jours d'entraînement</span><span>${today().getFullYear()}</span></h3>${heat}
      <div class="legend"><span><i style="background:var(--card-2)"></i>Repos</span><span><i style="background:color-mix(in srgb, var(--c) 30%, var(--card-2))"></i>Peu de tirs</span><span><i style="background:var(--c)"></i>Beaucoup</span></div>
    </div>`;
}

function statsOne(ex) {
  const ss = sessions(ex);
  const all = tally([ex]);
  const best = bestSession(ex), top = bestSeries(ex);
  return `<div class="kpis" style="--c:${ex.color}">
      <div class="kpi"><small>Réussite 30 j</small><b style="color:var(--c)">${pct(ratio(tally([ex], sinceKey(30))))}${trend([ex])}</b></div>
      <div class="kpi"><small>Meilleure séance</small><b>${best ? pct(best.m / best.a) : '–'}${best ? `<em>${best.m}/${best.a}</em>` : ''}</b></div>
      <div class="kpi"><small>Meilleure série</small><b>${top ? `${top.m}<em>/ ${top.a}</em>` : '–'}</b></div>
      <div class="kpi"><small>Tirs</small><b>${all.a}<em>${ss.length} séance${ss.length > 1 ? 's' : ''}</em></b></div>
    </div>
    <div class="card" style="--c:${ex.color}"><h3><span>${ex.emoji} ${esc(ex.name)}</span><span>${ss.length ? `${Math.min(ss.length, 30)} dernières séances` : ''}</span></h3>
      ${ss.length ? chart(ss.slice(-30)) : '<p class="note" style="margin:0">Pas encore de séance pour cet exercice.</p>'}
      ${ss.length ? '<div class="legend" style="--c:' + ex.color + '"><span><i style="background:var(--c);opacity:.45;border-radius:50%"></i>Une séance</span><span><i style="background:var(--c);height:3px;vertical-align:3px"></i>Tendance</span></div>' : ''}
    </div>
    ${ss.length ? `<p class="hint">Réussite totale ${pct(ratio(all))}${best ? ` · meilleure séance le ${shortDate(best.k)}` : ''}${top ? ` · meilleure série le ${shortDate(top.k)}` : ''}</p>` : ''}
    <button class="btn" data-act="edit" data-id="${ex.id}" style="margin-top:14px">Modifier l'exercice</button>`;
}

/** Réussite par séance (points) et moyenne glissante pondérée sur 5 séances (ligne). */
function chart(ss) {
  const W = 320, H = 150, L = 28, R = 8, T = 8, B = 20;
  const x = i => ss.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (ss.length - 1);
  const y = r => T + (1 - r) * (H - T - B);
  const avg = ss.map((_, i) => {
    const w = ss.slice(Math.max(0, i - 4), i + 1);
    return w.reduce((n, s) => n + s.m, 0) / w.reduce((n, s) => n + s.a, 0);
  });
  const grid = [0, .25, .5, .75, 1].map(r => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(r)}" y2="${y(r)}"/><text x="${L - 6}" y="${y(r) + 3}" text-anchor="end">${r * 100}%</text>`).join('');
  const dots = ss.map((s, i) => `<circle class="dot" cx="${x(i)}" cy="${y(s.m / s.a)}" r="${Math.min(6, 2.5 + s.a / 15)}"/>`).join('');
  const line = avg.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r).toFixed(1)}`).join(' ');
  const n = ss.length - 1;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">${grid}${dots}<path class="avg" d="${line}"/><circle class="last" cx="${x(n)}" cy="${y(avg[n])}" r="4.5"/>
    <text x="${x(0)}" y="${H - 4}" text-anchor="${n ? 'start' : 'middle'}">${shortDate(ss[0].k)}</text>${n ? `<text x="${x(n)}" y="${H - 4}" text-anchor="end">${shortDate(ss[n].k)}</text>` : ''}</svg></div>`;
}

function heatmap(color, cls) {
  const t = today();
  const start = addDays(weekStart(t), -52 * 7);
  let html = '';
  for (let ws = start; ws <= t; ws = addDays(ws, 7)) {
    let label = '';
    for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (d.getDate() === 1) label = MONTHS[d.getMonth()]; }
    if (ws.getTime() === start.getTime()) label = MONTHS[ws.getMonth()];
    html += `<i class="m">${label}</i>`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      html += d > t ? '<i class="none"></i>' : `<i class="${cls(d)}" data-act="edit-day" data-day="${key(d)}"></i>`;
    }
  }
  return `<div class="heat-scroll"><div class="heat" style="--c:${color}">${html}</div></div>`;
}

/* =========================================================
   Actions
   ========================================================= */
/** Note une série et salue un record de série. */
function recordSeries(ex, k, m) {
  const prev = bestSeries(ex);
  addSeries(ex, k, m);
  if (m === ex.size) toast(`🔥 ${m}/${ex.size}, parfait !`);
  else if (prev && m / ex.size > prev.m / prev.a) toast(`🏆 Record : ${m}/${ex.size}`);
  else toast(`${m}/${ex.size} noté`);
}

const view = document.getElementById('view');
view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const ex = byId(el.dataset.id);
  switch (el.dataset.act) {
    case 'add': openPick(ex); break;
    case 'day': openDay(key(today()), ex.id); break;
    case 'edit-day': openDay(el.dataset.day); break;
    case 'past': openPastPicker(); break;
    case 'edit': openEditor(ex); break;
    case 'sel': statsSel = el.dataset.id; render(); window.scrollTo({ top: 0 }); break;
    case 'new': openEditor(); break;
    case 'defaults': {
      const now = Date.now();
      for (const d of DEFAULT_EXERCISES) {
        if (byId(d.id)) continue;
        state.exercises.push({ ...d, size: SERIES, updatedAt: now });
      }
      save(); render(); toast('Exercices ajoutés');
      break;
    }
  }
});

document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab; render(); window.scrollTo({ top: 0 });
});
$('#btn-add').addEventListener('click', () => openEditor());
$('#btn-settings').addEventListener('click', openSettings);

/** Supprime un exercice et son historique, en gardant une trace pour la synchro. */
function removeExercise(id) {
  state.exercises = state.exercises.filter(x => x.id !== id);
  state.deleted[id] = Date.now();
  for (const k in state.log) { delete state.log[k][id]; if (!Object.keys(state.log[k]).length) delete state.log[k]; }
  for (const sk in state.stamps) if (sk.endsWith('|' + id)) delete state.stamps[sk];
}

/* =========================================================
   Sheets
   ========================================================= */
function openSheet(build) {
  const root = $('#sheet-root');
  root.innerHTML = '<div class="backdrop"></div><div class="sheet"><div class="grab"></div><div class="sheet-body"></div></div>';
  const backdrop = root.querySelector('.backdrop'), sheet = root.querySelector('.sheet');
  const close = () => {
    backdrop.classList.remove('open'); sheet.classList.remove('open');
    setTimeout(() => (root.innerHTML = ''), 300);
  };
  backdrop.addEventListener('click', close);
  // glisser vers le bas pour fermer
  let y0 = null;
  sheet.addEventListener('touchstart', e => { y0 = sheet.scrollTop <= 0 && !e.target.closest('input') ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 110) close();
  });
  build(sheet.querySelector('.sheet-body'), close);
  requestAnimationFrame(() => { backdrop.classList.add('open'); sheet.classList.add('open'); });
}

/** Grille 0…taille de série : un toucher note les réussites d'une série. */
function pickGrid(ex) {
  return `<div class="pick" style="--c:${ex.color}">${[...Array(ex.size + 1)].map((_, i) => `<button data-a="pick" data-id="${ex.id}" data-v="${i}">${i}</button>`).join('')}</div>`;
}

/** Note une série du jour pour un exercice. */
function openPick(ex) {
  openSheet((body, close) => {
    body.style.setProperty('--c', ex.color);
    body.innerHTML = `
      <div class="sheet-head"><button data-a="cancel">Annuler</button><h2>${ex.emoji} ${esc(ex.name)}</h2><span style="width:52px"></span></div>
      <p class="pick-q">Combien de tirs réussis<br>sur <b>${ex.size}</b> ?</p>
      ${pickGrid(ex)}`;
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'cancel') return close();
      recordSeries(ex, key(today()), +b.dataset.v);
      popKey = ex.id; render(); close();
    });
  });
}

/** Séries d'un jour : celles d'un exercice, ou de tous. On peut en ajouter ou en retirer. */
function openDay(k, onlyId) {
  if (parse(k) > today()) return;
  openSheet((body, close) => {
    const exs = onlyId ? [byId(onlyId)] : state.exercises;
    const draw = () => {
      body.innerHTML = `
        <div class="sheet-head"><span style="width:52px"></span><h2>${onlyId ? esc(exs[0].name) : dayLabel(k)}</h2><button class="primary" data-a="close">OK</button></div>
        ${onlyId ? `<p class="note" style="margin-top:-4px;text-align:center">${dayLabel(k)}</p>` : ''}
        ${exs.map(ex => {
          const list = series(ex, k), v = sum(list);
          return `<div class="cnt-row" style="--c:${ex.color}">
            <div class="t"><span>${ex.emoji}</span><span>${esc(ex.name)}</span><em>${v.a ? `${v.m}/${v.a} · ${pct(v.m / v.a)}` : ''}</em></div>
            ${list.length ? `<div class="series">${list.map(([m, a], i) => `<button data-a="del" data-id="${ex.id}" data-v="${i}">${m}/${a}<span>×</span></button>`).join('')}</div>` : ''}
            <small class="pick-label">Ajouter une série de ${ex.size} tirs</small>
            ${pickGrid(ex)}
          </div>`;
        }).join('')}
        <p class="hint">Touche une série pour la retirer.</p>`;
    };
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'close') return close();
      const ex = byId(b.dataset.id);
      if (b.dataset.a === 'pick') recordSeries(ex, k, +b.dataset.v);
      if (b.dataset.a === 'del') {
        const list = [...series(ex, k)];
        const [[m, a]] = list.splice(+b.dataset.v, 1);
        setSeries(ex, k, list); toast(`Série ${m}/${a} retirée`);
      }
      render(); draw();
    });
    draw();
  });
}

function openPastPicker() {
  openSheet((body, close) => {
    const max = key(today());
    body.innerHTML = `
      <div class="sheet-head"><button data-a="cancel">Annuler</button><h2>Séance passée</h2><button class="primary" data-a="go">Suivant</button></div>
      <div class="field"><span class="label">Date de la séance</span><input class="text" type="date" id="f-date" max="${max}" value="${key(addDays(today(), -1))}"></div>`;
    body.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'cancel') close();
      if (a === 'go') {
        const k = body.querySelector('#f-date').value;
        if (!k || k > max) return toast('Choisis une date passée');
        close(); setTimeout(() => openDay(k), 320);
      }
    });
  });
}

function openEditor(ex) {
  const isNew = !ex;
  const d = ex ? { ...ex } : {
    name: '', emoji: EMOJIS[state.exercises.length % EMOJIS.length], color: COLORS[state.exercises.length % COLORS.length], size: SERIES,
  };
  openSheet((body, close) => {
    const draw = () => {
      const emojis = EMOJIS.includes(d.emoji) ? EMOJIS : [d.emoji, ...EMOJIS.slice(0, -1)];
      body.style.setProperty('--c', d.color);
      body.innerHTML = `
        <div class="sheet-head"><button data-a="cancel">Annuler</button><h2>${isNew ? 'Nouvel exercice' : 'Modifier'}</h2><button class="primary" data-a="save">${isNew ? 'Ajouter' : 'OK'}</button></div>
        <div class="field"><div class="name-row"><div class="emoji-preview">${d.emoji}</div><input class="text" id="f-name" maxlength="40" placeholder="Ex. Tir à mi-distance" value="${esc(d.name)}" autocomplete="off"></div></div>
        <div class="field"><span class="label">Icône</span><div class="emojis">${emojis.map(e => `<button data-a="emoji" data-v="${e}" class="${e === d.emoji ? 'sel' : ''}">${e}</button>`).join('')}</div></div>
        <div class="field"><span class="label">Couleur</span><div class="colors">${COLORS.map(c => `<button data-a="color" data-v="${c}" class="${c === d.color ? 'sel' : ''}" style="--sw:${c}" aria-label="couleur"></button>`).join('')}</div></div>
        <div class="field"><span class="label">Série</span><div class="stepper" style="margin-top:0"><span>Tirs par série</span><div><button data-a="size" data-v="-1">−</button><b>${d.size}</b><button data-a="size" data-v="1">+</button></div></div></div>
        ${isNew ? '' : `
          <div class="field"><span class="label">Ordre</span><div class="order"><button class="btn" data-a="move" data-v="-1">↑ Monter</button><button class="btn" data-a="move" data-v="1">↓ Descendre</button></div></div>
          <button class="btn danger" data-a="delete">Supprimer l'exercice</button>`}
      `;
      const input = body.querySelector('#f-name');
      input.addEventListener('input', () => (d.name = input.value));
      if (isNew && !d.name) setTimeout(() => input.focus(), 350);
    };
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const v = b.dataset.v;
      switch (b.dataset.a) {
        case 'cancel': return close();
        case 'emoji': d.emoji = v; break;
        case 'color': d.color = v; break;
        case 'size': d.size = Math.min(30, Math.max(1, d.size + +v)); break;
        case 'move': {
          const i = state.exercises.findIndex(x => x.id === ex.id), j = i + +v;
          if (j < 0 || j >= state.exercises.length) return;
          [state.exercises[i], state.exercises[j]] = [state.exercises[j], state.exercises[i]];
          state.orderAt = Date.now();
          save(); render(); toast(+v < 0 ? 'Remonté' : 'Descendu');
          return;
        }
        case 'delete':
          if (!confirm(`Supprimer « ${ex.name} » et tout son historique ?`)) return;
          removeExercise(ex.id);
          save(); render(); close(); toast('Exercice supprimé');
          return;
        case 'save': {
          if (!d.name.trim()) { body.querySelector('#f-name').focus(); return toast('Donne-lui un nom'); }
          const fields = { name: d.name.trim(), emoji: d.emoji, color: d.color, size: d.size, updatedAt: Date.now() };
          if (isNew) { state.exercises.push({ id: uid(), ...fields }); toast(`« ${fields.name} » ajouté`); }
          else Object.assign(ex, fields);
          save(); render();
          return close();
        }
      }
      draw();
    });
    draw();
  });
}

function openSettings() {
  openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2>Réglages</h2><button class="primary" data-a="close">OK</button></div>
      <div class="field"><span class="label">Apparence</span><div class="seg" id="theme-seg"></div></div>
      <div class="field"><span class="label">Synchronisation</span><div id="sync-box"></div></div>
      <div class="field"><span class="label">Sauvegarde</span>
      <button class="btn" data-a="export" style="margin-top:0">Exporter une sauvegarde</button>
      <button class="btn" data-a="import">Importer une sauvegarde</button>
      <input type="file" id="f-import" accept="application/json,.json" hidden></div>
      <button class="btn danger" data-a="reset" style="margin-top:24px">Tout effacer</button>
      <p class="note" style="text-align:center;margin-top:18px">${state.exercises.length} exercices · ${trainingDays().length} entraînements · ${tally(state.exercises).a} tirs</p>`;
    drawSyncBox(); drawThemeSeg();
    const file = body.querySelector('#f-import');
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.exercises) || typeof data.log !== 'object') throw new Error();
        if (!confirm(`Remplacer tes données par cette sauvegarde (${data.exercises.length} exercices) ?`)) return;
        // l'import devient la version la plus récente, y compris face aux autres appareils
        const now = Date.now(), imported = normalize(data);
        for (const ex of state.exercises) if (!imported.exercises.some(x => x.id === ex.id)) imported.deleted[ex.id] = now;
        for (const ex of imported.exercises) ex.updatedAt = now;
        for (const k in imported.log) for (const id in imported.log[k]) imported.stamps[`${k}|${id}`] = now;
        imported.orderAt = now;
        state = imported; save(); render(); close(); toast('Sauvegarde importée');
      } catch (e) { toast('Fichier invalide'); }
    });
    body.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') close();
      if (a === 'import') file.click();
      if (a === 'export') exportData();
      if (a === 'sync-now') syncNow();
      if (a === 'theme') { setTheme(e.target.closest('[data-a]').dataset.v); drawThemeSeg(); }
      if (a === 'sync-connect') {
        const token = body.querySelector('#f-token').value.trim();
        if (!token) return toast('Colle ton token GitHub');
        sync = { token, gistId: null, last: null, error: null }; saveSync();
        drawSyncBox(); syncNow();
      }
      if (a === 'sync-off' && confirm('Déconnecter cet appareil ? Tes données restent ici et sur GitHub.')) {
        sync = {}; saveSync(); drawSyncBox();
      }
      if (a === 'reset' && confirm('Effacer tous les exercices et tout l\'historique ? C\'est définitif.')) {
        for (const ex of [...state.exercises]) removeExercise(ex.id);
        state.log = {}; state.stamps = {}; state.orderAt = Date.now();
        save(); render(); close();
      }
    });
  });
}

async function exportData() {
  const name = `progress-${key(today())}.json`;
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const f = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: 'Sauvegarde Progress' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =========================================================
   Synchro via un gist GitHub privé
   ========================================================= */
const SYNC_KEY = 'progress.sync';
const GIST_FILE = 'progress.json';
const GIST_DESC = 'Progress — synchronisation';
let sync = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } })();
let syncTimer = null, syncing = false, syncAgain = false;

function saveSync() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) {} }
function scheduleSync(delay = 1500) {
  if (!sync.token) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, delay);
}

/** Fusionne deux états : pour chaque case et chaque exercice, la modification la plus récente gagne. */
function merge(a, b) {
  const deleted = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] || 0, t);
  const exs = new Map();
  for (const ex of [...a.exercises, ...b.exercises]) {
    const cur = exs.get(ex.id);
    if (!cur || ex.updatedAt > cur.updatedAt) exs.set(ex.id, ex);
  }
  for (const [id, ex] of exs) if (deleted[id] != null && deleted[id] >= ex.updatedAt) exs.delete(id);
  const [first, second] = b.orderAt > a.orderAt ? [b, a] : [a, b];
  const order = [...first.exercises, ...second.exercises].map(ex => ex.id).filter((id, i, arr) => arr.indexOf(id) === i && exs.has(id));

  const keys = new Set([...Object.keys(a.stamps), ...Object.keys(b.stamps)]);
  for (const s of [a, b]) for (const k in s.log) for (const id in s.log[k]) keys.add(`${k}|${id}`);
  const log = {}, stamps = {};
  for (const sk of keys) {
    const [k, id] = sk.split('|');
    if (!exs.has(id)) continue;
    const ta = a.stamps[sk] || 0, tb = b.stamps[sk] || 0;
    const va = a.log[k]?.[id], vb = b.log[k]?.[id];
    const [v, t] = ta > tb ? [va, ta] : tb > ta ? [vb, tb] : [va !== undefined ? va : vb, ta];
    if (t) stamps[sk] = t;
    if (v !== undefined) (log[k] ||= {})[id] = v;
  }
  return { v: 1, exercises: order.map(id => exs.get(id)), log, stamps, deleted, orderAt: Math.max(a.orderAt, b.orderAt) };
}

async function gh(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, {
    ...opts,
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + sync.token, Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!r.ok) throw new Error(r.status === 401 ? 'Token invalide ou expiré' : r.status === 404 ? 'Gist introuvable (droit « gist » manquant ?)' : `Erreur GitHub ${r.status}`);
  return r.json();
}
/** Retrouve le gist créé par un autre appareil, ou en crée un. */
async function findOrCreateGist() {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const g = list.find(g => g.description === GIST_DESC && g.files[GIST_FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: JSON.stringify(state) } } }) });
  return g.id;
}

async function syncNow() {
  if (!sync.token) return;
  if (syncing) { syncAgain = true; return; }
  clearTimeout(syncTimer);
  syncing = true; drawSyncBox();
  try {
    if (!sync.gistId) { sync.gistId = await findOrCreateGist(); saveSync(); }
    const g = await gh('/gists/' + sync.gistId);
    const f = g.files[GIST_FILE];
    let remote = emptyState(false);
    if (f) remote = normalize(JSON.parse(f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content), false);
    const merged = merge(state, remote);
    const out = JSON.stringify(merged);
    if (out !== JSON.stringify(state)) { state = merged; persist(); render(); }
    if (out !== JSON.stringify(remote)) {
      await gh('/gists/' + sync.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [GIST_FILE]: { content: out } } }) });
    }
    sync.last = Date.now(); sync.error = null;
  } catch (e) {
    sync.error = e instanceof TypeError ? 'Hors ligne' : e.message;
  } finally {
    syncing = false; saveSync(); drawSyncBox();
    if (syncAgain) { syncAgain = false; syncNow(); }
  }
}

function drawSyncBox() {
  const box = document.getElementById('sync-box');
  if (!box) return;
  if (!sync.token) {
    box.innerHTML = `
      <p class="note" style="margin-top:0">Synchronise tes tirs entre plusieurs appareils via un gist privé d'un compte GitHub.</p>
      <p class="note">1. <a href="https://github.com/settings/tokens/new?scopes=gist&description=Progress%20sync" target="_blank" rel="noopener">Crée un token GitHub</a> avec uniquement le droit « gist ».<br>2. Colle-le ici, sur chaque appareil.</p>
      <input class="text" id="f-token" type="password" placeholder="ghp_…" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn accent" data-a="sync-connect">Connecter</button>`;
    return;
  }
  const time = sync.last ? new Date(sync.last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  const st = syncing ? '<span class="sync-dot busy"></span>Synchronisation…'
    : sync.error ? `<span class="sync-dot err"></span>${esc(sync.error)}`
    : time ? `<span class="sync-dot ok"></span>Synchronisé à ${time}` : '<span class="sync-dot"></span>En attente';
  box.innerHTML = `
    <div class="sync-status">${st}</div>
    <div class="order"><button class="btn" data-a="sync-now">Synchroniser</button><button class="btn danger" data-a="sync-off">Déconnecter</button></div>`;
}

/* ---------- Thème (par appareil, non synchronisé) ---------- */
const THEME_KEY = 'progress.theme';
function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
function setTheme(t) {
  try { t === 'auto' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, t); } catch (e) {}
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  applyThemeColor();
}
/** Aligne la couleur de la barre système sur le thème effectif. */
function applyThemeColor() {
  const t = getTheme();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (!m.dataset.media) m.dataset.media = m.media;
    m.media = t === 'auto' ? m.dataset.media : (m.dataset.media.includes(t) ? '' : 'not all');
  });
}
function drawThemeSeg() {
  const el = document.getElementById('theme-seg');
  if (!el) return;
  const t = getTheme();
  el.innerHTML = [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']]
    .map(([v, l]) => `<button data-a="theme" data-v="${v}" class="${t === v ? 'sel' : ''}">${l}</button>`).join('');
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}
function $(s) { return document.querySelector(s); }

/* ---------- Boot ---------- */
let lastDay = key(today());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (key(today()) !== lastDay) { lastDay = key(today()); render(); }
    syncNow();
  } else if (syncTimer) syncNow(); // on part : envoie ce qui reste en attente
});
applyThemeColor();
render();
syncNow();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
