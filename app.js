/* WaterShare app (stage 1: works fully offline on the phone). */
(function () {
  'use strict';
  const APP_VERSION = '1.0.0';
  const { isNum } = Calc;

  /* ================= Helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const money = (n) => (isNum(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—');
  const num = (n, d = 2) => n.toLocaleString('en-US', { maximumFractionDigits: d });
  const vol = (n) => (isNum(n) ? `${num(n)} ft³` : '—');
  const unitLabel = (u) => (u === 'ccf' ? 'CCF' : 'ft³');
  const monthLabel = (id) => { const [y, m] = id.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
  const shortMonth = (id) => { const [y, m] = id.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' }) + ' ' + String(y).slice(2); };
  const dateLabel = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const numOrNull = (v) => { if (v == null) return null; const s = String(v).replace(/[,$\s]/g, ''); if (s === '') return null; const n = Number(s); return isFinite(n) ? n : null; };
  const slug = (s) => String(s || 'member').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'member';
  const nextMonthId = (id) => { let [y, m] = id.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${pad(m)}`; };
  const currentMonthId = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const valStr = (v) => (isNum(v) ? String(v) : '');

  const I = {
    chevR: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
    setup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
    meter: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><circle cx="32" cy="32" r="26"/><rect x="18" y="18" width="28" height="9" rx="2"/><path d="M32 40l10-8"/><circle cx="32" cy="40" r="2.5" fill="currentColor"/></svg>',
  };

  /* ================= Storage (IndexedDB on the phone) ================= */
  const DB_NAME = 'watershare';
  let db;
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('members')) d.createObjectStore('members', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('months')) d.createObjectStore('months', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Storage write was cancelled'));
    });
  }
  const dbAll = (s) => tx(s, 'readonly', (st) => st.getAll());
  const dbGet = (s, k) => tx(s, 'readonly', (st) => st.get(k));
  const dbPut = (s, v) => tx(s, 'readwrite', (st) => st.put(v));
  const dbDel = (s, k) => tx(s, 'readwrite', (st) => st.delete(k));
  const dbClear = (s) => tx(s, 'readwrite', (st) => st.clear());

  const urlCache = new Map();
  async function saveFile(blob, name) {
    const id = uid();
    const data = await blob.arrayBuffer();
    await dbPut('files', { id, type: blob.type || 'application/octet-stream', name, size: blob.size, data, createdAt: Date.now() });
    return id;
  }
  async function getFileBlob(id) {
    const f = await dbGet('files', id);
    return f ? { blob: new Blob([f.data], { type: f.type }), name: f.name, type: f.type } : null;
  }
  async function fileURL(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const f = await getFileBlob(id);
    if (!f) return null;
    const u = URL.createObjectURL(f.blob);
    urlCache.set(id, u);
    return u;
  }
  async function deleteFile(id) {
    if (!id) return;
    if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
    await dbDel('files', id);
  }
  async function hydrate(root) {
    for (const img of $$('img[data-file]', root)) {
      const u = await fileURL(img.dataset.file);
      if (u) img.src = u;
    }
  }

  /* Shrink photos so a year of readings stays small. */
  async function compressImage(file, max = 1600, quality = 0.82) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
      return blob || file;
    } catch (e) {
      return file;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function pickFile(accept) {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file';
      if (accept) i.accept = accept;
      i.style.display = 'none';
      document.body.appendChild(i);
      i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); });
      i.click();
    });
  }

  /* ================= App state ================= */
  const DEFAULT_SETTINGS = {
    key: 'settings', systemName: '', feePct: 10, thresholdType: 'pct', thresholdValue: 5,
    utilityUnit: 'ccf', utilityStartReading: null, billUnit: 'ccf', lastBackup: null,
  };
  const S = { members: [], months: [], settings: { ...DEFAULT_SETTINGS }, view: { tab: 'months' } };
  let sheetCtx = null;
  let sheetGen = 0;

  async function loadAll() {
    S.members = await dbAll('members');
    S.months = await dbAll('months');
    const st = await dbGet('kv', 'settings');
    S.settings = { ...DEFAULT_SETTINGS, ...(st || {}) };
  }
  const ctx = () => ({ members: S.members, months: S.months, settings: S.settings });
  const getMember = (id) => S.members.find((m) => m.id === id);
  const getMonth = (id) => S.months.find((m) => m.id === id);
  const activeMembers = () => S.members.filter((m) => m.status === 'active').sort(byName);
  const byName = (a, b) => a.name.localeCompare(b.name);
  const manager = () => S.members.find((m) => m.isManager && m.status !== 'removed');
  async function putMonth(m) { await dbPut('months', m); const i = S.months.findIndex((x) => x.id === m.id); if (i >= 0) S.months[i] = m; else S.months.push(m); }
  async function putMember(m) { await dbPut('members', m); const i = S.members.findIndex((x) => x.id === m.id); if (i >= 0) S.members[i] = m; else S.members.push(m); }
  async function putSettings() { await dbPut('kv', S.settings); }
  const sortedParticipants = (month) => month.participants.map(getMember).filter(Boolean).sort(byName);

  /* ================= UI primitives ================= */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function odo(value, unit, size = '') {
    if (!isNum(value)) return '<span class="odo none">Not read</span>';
    let [ip, fp] = String(value).split('.');
    let lead = '';
    if (ip.startsWith('-')) { ip = ip.slice(1); lead = '<span class="sep">−</span>'; }
    const zeros = Math.max(0, 5 - ip.length);
    let h = lead;
    for (let k = 0; k < zeros; k++) h += '<span class="lead">0</span>';
    for (const ch of ip) h += `<span>${ch}</span>`;
    if (fp) { h += '<span class="sep">.</span>'; for (const ch of fp.slice(0, 3)) h += `<span class="frac">${ch}</span>`; }
    return `<span class="odo ${size}" role="img" aria-label="${esc(value)} ${unitLabel(unit)}">${h}<span class="unit">${unitLabel(unit)}</span></span>`;
  }

  const thumb = (fileId) => (fileId
    ? `<img class="thumb" data-file="${esc(fileId)}" alt="">`
    : `<span class="thumb empty">${I.camera}</span>`);

  function topbar(title, sub, back) {
    return `<header class="topbar">${back ? `<button class="back" data-act="${back.act}" ${back.id ? `data-id="${esc(back.id)}"` : ''}>${I.chevL}${esc(back.label)}</button>` : ''}
      <h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</h1></header>`;
  }

  function renderTabs() {
    const tabs = [['months', 'Months', I.cal], ['history', 'History', I.chart], ['setup', 'Setup', I.setup]];
    $('#tabbar').innerHTML = tabs.map(([k, label, icon]) =>
      `<button data-act="tab" data-id="${k}" ${S.view.tab === k ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('');
  }

  function render() {
    renderTabs();
    const v = S.view;
    let html;
    if (v.tab === 'months') html = v.monthId && getMonth(v.monthId) ? viewMonth(getMonth(v.monthId)) : viewMonths();
    else if (v.tab === 'history') html = v.memberId && getMember(v.memberId) ? viewMemberHistory(getMember(v.memberId)) : viewHistory();
    else html = viewSetup();
    const app = $('#app');
    app.innerHTML = html;
    hydrate(app);
    if (v.tab === 'setup') fillStorageInfo();
  }

  function go(view) {
    S.view = { ...S.view, ...view };
    render();
    window.scrollTo(0, 0);
  }

  /* ================= Months list ================= */
  function monthStatus(c) {
    if (c.checksum && c.checksum.warn) return 'warn';
    if (c.participants.some((p) => p.status === 'negative')) return 'bad';
    if (c.shares) return 'ok';
    return '';
  }

  function viewMonths() {
    const sys = S.settings.systemName || 'Shared water system';
    let h = topbar('Months', sys);
    h += '<div class="page">';
    if (!S.members.some((m) => m.status !== 'removed')) {
      return h + `<div class="empty-state">${I.meter}<h2>Add your members first</h2>
        <p>Each member needs a name and a starting meter reading so the first month's usage can be calculated.</p>
        <button class="btn" data-act="tab" data-id="setup">Go to setup</button></div></div>`;
    }
    h += backupReminder();
    h += `<button class="btn block new-month" data-act="newMonth">${I.plus}Start a new month</button>`;
    const months = Calc.sortedMonths(S.months).reverse();
    if (!months.length) {
      h += '<p class="note-text">Your months will appear here. To enter past months, start a new month and pick an earlier date.</p>';
      return h + '</div>';
    }
    h += '<div class="group-title">All months</div><div class="group">';
    for (const m of months) {
      const c = Calc.computeMonth(m, ctx());
      const bits = [`${c.readCount} of ${c.n} read`];
      bits.push(c.billReady ? 'bill entered' : 'no bill yet');
      if (c.checksum && c.checksum.pct != null) bits.push(`${num(c.checksum.pct, 1)}% difference`);
      h += `<button class="row" data-act="openMonth" data-id="${m.id}">
        <span class="dot ${monthStatus(c)}"></span>
        <span class="grow"><span class="title">${monthLabel(m.id)}</span><span class="meta">${esc(bits.join(', '))}</span></span>
        <span class="end">${c.totals ? `<span class="big">${money(c.totals.billTotal)}</span>` : ''}</span>${I.chevR}</button>`;
    }
    return h + '</div></div>';
  }

  function backupReminder() {
    if (!S.months.length) return '';
    const last = S.settings.lastBackup;
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    if (days != null && days < 30) return '';
    const msg = days == null ? 'This phone has the only copy of your data.' : `Last backup was ${days} days ago.`;
    return `<div class="callout"><p>${msg} Save a backup file to keep it safe.</p>
      <div class="btn-row"><button class="btn small quiet" data-act="backup">Save a backup file</button></div></div>`;
  }

  /* ================= One month ================= */
  function usageLine(p) {
    if (p.status === 'missing') return 'Not read yet';
    if (p.status === 'noprev') return 'No previous reading';
    const flags = [];
    if (p.replaced) flags.push('meter replaced');
    if (p.overridden) flags.push('usage overridden');
    const u = `${vol(p.usage)} used`;
    return flags.length ? `${u} (${flags.join(', ')})` : u;
  }

  function viewMonth(m) {
    const c = Calc.computeMonth(m, ctx());
    let h = topbar(monthLabel(m.id), null, { act: 'backToMonths', label: 'Months' });
    h += '<div class="page">';

    const utilRead = m.utility && isNum(m.utility.value);
    h += `<div class="progress">
      <div class="step ${c.allRead ? 'done' : ''}"><strong>${c.readCount}/${c.n}</strong>member meters</div>
      <div class="step ${utilRead ? 'done' : ''}"><strong>${utilRead ? 'Read' : 'To do'}</strong>utility meter</div>
      <div class="step ${c.billReady ? 'done' : ''}"><strong>${c.billReady ? 'Entered' : 'To do'}</strong>utility bill</div></div>`;

    // Member readings
    h += '<div class="group-title">Member meters</div><div class="group">';
    const parts = sortedParticipants(m);
    if (!parts.length) h += '<p class="note-text">No members are included this month. Change that in this month\'s settings below.</p>';
    for (const mem of parts) {
      const p = c.participants.find((x) => x.id === mem.id);
      const r = m.readings[mem.id];
      const cls = p.status === 'negative' ? ' style="color:var(--bad)"' : '';
      h += `<button class="row" data-act="readMember" data-id="${mem.id}">${thumb(r && r.photoId)}
        <span class="grow"><span class="title">${esc(mem.name)}${m.managerId === mem.id ? ' <span class="tag main">Manager</span>' : ''}</span>
        <span class="meta"${cls}>${esc(usageLine(p))}</span></span>
        <span class="end">${odo(r && r.value, r ? r.unit : mem.meterUnit)}</span></button>`;
    }
    h += '</div>';

    // Utility meter
    h += '<div class="group-title">Utility meter</div><div class="group">';
    h += `<button class="row" data-act="readUtility">${thumb(m.utility && m.utility.photoId)}
      <span class="grow"><span class="title">Utility meter</span><span class="meta">${esc(usageLine(c.util))}</span></span>
      <span class="end">${odo(m.utility && m.utility.value, m.utility ? m.utility.unit : S.settings.utilityUnit)}</span></button></div>`;

    // Checksum
    h += '<div class="group-title">Checksum</div><div class="group">' + checksumBlock(c, m) + '</div>';

    // Bill
    h += '<div class="group-title">Utility bill</div>';
    if (m.bill) {
      const b = m.bill;
      h += '<div class="group">';
      const billSum = Calc.r2((b.baseFee || 0) + (b.usageFee || 0) + (b.extras || []).reduce((a, x) => a + (x.amount || 0), 0));
      h += `<button class="row" data-act="editBill"><span class="grow"><span class="title">${money(billSum)}</span>
        <span class="meta">${esc([b.billDate ? `Dated ${dateLabel(b.billDate)}` : '', b.period].filter(Boolean).join(', ') || 'Tap to edit')}</span></span>${I.chevR}</button>`;
      h += `<dl class="totals" style="border-top:1px solid var(--line);margin:0"><dt>Base fee</dt><dd>${money(b.baseFee)}</dd><dt>Usage fee</dt><dd>${money(b.usageFee)}</dd>`;
      for (const x of b.extras || []) h += `<dt>${esc(x.name || 'Other charge')}</dt><dd>${money(x.amount)}</dd>`;
      h += `<dt>Measured usage on bill</dt><dd>${isNum(b.measured) ? `${num(b.measured)} ${unitLabel(b.measuredUnit)}` : '—'}</dd></dl>`;
      if (b.pdfId) h += `<button class="row" data-act="viewFile" data-id="${b.pdfId}"><span class="thumb empty">${I.doc}</span><span class="grow"><span class="title">View the bill</span><span class="meta">Opens the saved PDF or photo</span></span>${I.chevR}</button>`;
      h += '</div>';
    } else {
      h += `<button class="btn block quiet" data-act="editBill">${I.doc}Enter the utility bill</button>`;
    }

    // Charges
    h += '<div class="group-title">Member charges</div>';
    if (c.blockers.length) {
      h += `<div class="callout info">${c.blockers.map((b) => `<p>${esc(b)}</p>`).join('')}</div>`;
    } else {
      h += '<div class="group">';
      const sorted = [...c.shares].sort((a, b) => byName(a.member, b.member));
      for (const s of sorted) {
        h += `<div class="charge"><div class="charge-head"><span class="name">${esc(s.member.name)}${s.isManager ? ' <span class="tag main">Manager</span>' : ''}</span><span class="total">${money(s.total)}</span></div>
          <dl class="charge-lines"><dt>Water used</dt><dd>${vol(s.usage)} (${num(s.frac * 100, 1)}%)</dd>
          <dt>Base fee share</dt><dd>${money(s.base)}</dd><dt>Usage fee share</dt><dd>${money(s.usageAmt)}</dd>
          ${s.extras.map((e) => `<dt>${esc(e.name)}</dt><dd>${money(e.amount)}</dd>`).join('')}
          <dt>Management fee${s.isManager ? '' : ` (${num(c.totals.feePct)}%)`}</dt><dd>${s.isManager ? 'None' : money(s.fee)}</dd></dl></div>`;
      }
      h += '</div>';
      const t = c.totals;
      h += `<div class="group" style="margin-top:12px"><dl class="totals">
        <dt>Utility bill total</dt><dd>${money(t.billTotal)}</dd>
        <dt>Shares before fees</dt><dd>${money(t.sharesTotal)}</dd>
        ${t.rounding !== 0 ? `<dt>Rounding difference</dt><dd>${t.rounding > 0 ? '+' : ''}${money(t.rounding)}</dd>` : ''}
        ${t.managerShare != null ? `<dt>Your own share</dt><dd>${money(t.managerShare)}</dd>` : ''}
        <dt>Management fees</dt><dd>${money(t.fees)}</dd>
        <dt class="strong">Members owe you</dt><dd>${money(t.owedToManager)}</dd></dl></div>`;
      if (t.managerShare == null) h += '<div class="callout"><p>No manager is set for this month, so everyone pays the management fee. Set the manager in this month\'s settings.</p></div>';
    }

    // Month settings
    const mgr = getMember(m.managerId);
    h += `<div class="group-title">This month's settings</div><div class="group">
      <button class="row" data-act="monthSettings"><span class="grow"><span class="title">Members included</span><span class="meta">${c.n} member${c.n === 1 ? '' : 's'} share this bill</span></span>${I.chevR}</button>
      <button class="row" data-act="monthSettings"><span class="grow"><span class="title">Manager and fee</span><span class="meta">${esc(mgr ? mgr.name : 'No manager')}, ${num(isNum(m.feePct) ? m.feePct : 10)}% management fee</span></span>${I.chevR}</button></div>
      <div class="btn-row"><button class="btn danger" data-act="deleteMonth">Delete this month</button></div>`;
    return h + '</div>';
  }

  function thresholdText() {
    const s = S.settings;
    return s.thresholdType === 'ft3' ? `${num(s.thresholdValue)} ft³` : `${num(s.thresholdValue)}%`;
  }

  function checksumBlock(c, m) {
    let h = '';
    const b = m.bill;
    if (!c.checksum) {
      h += '<p class="note-text">Shows once the utility meter and every member meter are read.</p>';
    } else {
      const k = c.checksum;
      const max = Math.max(k.utilityUsage, k.memberUsage, 1);
      const pctText = k.pct != null ? ` (${num(Math.abs(k.pct), 1)}%)` : '';
      let msg;
      if (Math.abs(k.delta) < 0.0005) msg = 'Member meters match the utility meter exactly.';
      else if (k.delta > 0) msg = `The utility meter measured ${vol(k.delta)} more than all member meters combined${pctText}.`;
      else msg = `Member meters total ${vol(-k.delta)} more than the utility meter${pctText}.`;
      const verdict = k.warn
        ? (k.delta > 0 ? `Over your ${thresholdText()} limit. Worth checking for a leak on the shared main or a misread meter.` : `Over your ${thresholdText()} limit. Check for a misread or a meter that reads high.`)
        : `Within your ${thresholdText()} limit.`;
      h += `<div class="gauge"><div class="gauge-bars">
        <div class="gauge-bar"><span>Utility meter</span><span class="track"><span class="fill" style="display:block;width:${(k.utilityUsage / max) * 100}%"></span></span><span>${vol(k.utilityUsage)}</span></div>
        <div class="gauge-bar"><span>Member meters</span><span class="track"><span class="fill alt" style="display:block;width:${(k.memberUsage / max) * 100}%"></span></span><span>${vol(k.memberUsage)}</span></div></div>
        <div class="callout ${k.warn ? '' : 'ok'}"><p>${esc(msg)}</p><p>${esc(verdict)}</p></div></div>`;
    }
    if (b && isNum(b.measured)) {
      const ft = Calc.toFt3(b.measured, b.measuredUnit);
      h += `<p class="note-text" style="border-top:1px solid var(--line)">The bill itself measured ${vol(ft)}. Its reading dates may differ from yours, so it's shown for reference only.</p>`;
    }
    return h;
  }

  /* ================= Sheets ================= */
  function openSheet(title, body, opts = {}) {
    const slot = $('#overlay-slot');
    sheetGen++;
    slot.innerHTML = `<div class="scrim" data-act="closeSheet"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-head"><h2>${esc(title)}</h2><button class="x" data-act="closeSheet" aria-label="Close">×</button></div>
        <div class="sheet-body">${body}</div></section>`;
    document.body.style.overflow = 'hidden';
    const sheet = $('.sheet', slot);
    if (opts.onInput) sheet.addEventListener('input', opts.onInput);
    if (opts.onChange) sheet.addEventListener('change', opts.onChange);
    requestAnimationFrame(() => { $('.scrim', slot).classList.add('show'); sheet.classList.add('show'); });
    hydrate(sheet);
    return sheet;
  }
  function closeSheet() {
    const slot = $('#overlay-slot');
    const sheet = $('.sheet', slot);
    document.body.style.overflow = '';
    sheetCtx = null;
    if (!sheet) { slot.innerHTML = ''; return; }
    sheet.classList.remove('show');
    const scrim = $('.scrim', slot); if (scrim) scrim.classList.remove('show');
    const gen = sheetGen;
    setTimeout(() => { if (gen === sheetGen) slot.innerHTML = ''; }, 260);
  }

  const field = (label, inner, hint) => `<label class="field"><span class="lbl">${label}</span>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
  const seg = (name, options, value) => `<div class="seg" role="radiogroup">${options.map(([v, l]) =>
    `<label><input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  const switchRow = (id, title, meta, checked) => `<label class="switch-row"><span class="grow">${title}${meta ? `<span class="meta">${meta}</span>` : ''}</span>
    <span class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="track"></span></span></label>`;
  const radioVal = (root, name) => { const r = $(`input[name="${name}"]:checked`, root); return r ? r.value : null; };

  /* ---------- New month ---------- */
  function sheetNewMonth() {
    const latest = Calc.sortedMonths(S.months).pop();
    const suggest = latest ? nextMonthId(latest.id) : currentMonthId();
    const act = activeMembers();
    const body = `<div class="group">${field('Month', `<input type="month" id="fMonth" value="${suggest}">`, 'Pick an earlier month to enter past data.')}</div>
      <p class="note-text">Includes ${act.length} active member${act.length === 1 ? '' : 's'}: ${esc(act.map((m) => m.name).join(', ') || 'none')}. You can change who is included afterward.</p>
      <button class="btn block" data-act="createMonth">Start month</button>`;
    openSheet('Start a new month', body);
  }
  async function createMonth() {
    const id = $('#fMonth').value;
    if (!/^\d{4}-\d{2}$/.test(id)) return toast('Pick a month first.');
    if (getMonth(id)) { closeSheet(); toast(`${monthLabel(id)} already exists.`); return go({ tab: 'months', monthId: id }); }
    const mgr = manager();
    const m = {
      id, createdAt: Date.now(), participants: activeMembers().map((x) => x.id),
      managerId: mgr && mgr.status === 'active' ? mgr.id : null,
      feePct: S.settings.feePct, readings: {}, utility: null, bill: null,
    };
    await putMonth(m);
    closeSheet();
    toast(`${monthLabel(id)} started`);
    go({ tab: 'months', monthId: id });
  }

  /* ---------- Meter reading (member or utility) ---------- */
  function sheetReading(kind, memberId) {
    const m = getMonth(S.view.monthId);
    const mem = kind === 'member' ? getMember(memberId) : null;
    const rec = kind === 'member' ? m.readings[memberId] : m.utility;
    const unit = rec ? rec.unit : (mem ? mem.meterUnit : S.settings.utilityUnit);
    const prev = kind === 'member' ? Calc.prevMemberReading(memberId, m.id, ctx()) : Calc.prevUtilityReading(m.id, ctx());
    sheetCtx = { kind, memberId, monthId: m.id, unit, prev, existingPhotoId: rec ? rec.photoId : null, photoBlob: null, removePhoto: false };
    const prevText = prev
      ? `Last reading ${num(prev.raw, 3)} ${unitLabel(prev.unit)}${prev.monthId ? ` in ${monthLabel(prev.monthId)}` : ' (starting reading)'}`
      : (kind === 'member' ? 'No previous reading. Add a starting reading for this member in Setup.' : 'No previous reading. Add the utility meter starting reading in Setup.');
    const rep = rec && rec.replaced; const ov = rec && rec.override;
    const title = mem ? mem.name : 'Utility meter';
    const body = `
      <div class="odo-stage"><div id="odoLive">${odo(rec && rec.value, unit, 'lg')}</div>
        <span class="caption">${esc(prevText)}</span><p class="usage-readout" id="usageLive"></p></div>
      <div class="group">
        ${field(`Meter reading (${unitLabel(unit)})`, `<input class="reading-input" id="fValue" inputmode="decimal" autocomplete="off" value="${valStr(rec && rec.value)}" placeholder="0">`)}
        ${field('Date read', `<input type="date" id="fDate" value="${esc((rec && rec.date) || (m.id >= currentMonthId() ? today() : ''))}">`)}
      </div>
      <div class="group-title">Photo of the meter</div>
      <div class="group"><div class="photo-box" id="photoBox">${photoBoxInner()}</div></div>
      <div class="group-title">Special cases</div>
      <div class="group">
        <details class="more" ${rep ? 'open' : ''}><summary>Meter was replaced this month</summary>
          ${field(`Old meter's final reading (${unitLabel(prev ? prev.unit : unit)})`, `<input id="fOldFinal" inputmode="decimal" value="${valStr(rep && rep.oldFinal)}">`)}
          ${field(`New meter's starting reading (${unitLabel(unit)})`, `<input id="fNewStart" inputmode="decimal" value="${valStr(rep && rep.newStart)}">`, 'Usage is counted on the old meter up to its final reading, then on the new meter from its starting reading.')}
        </details>
        <details class="more" ${ov ? 'open' : ''}><summary>Override the usage</summary>
          ${field('Usage to charge (ft³)', `<input id="fOvUsage" inputmode="decimal" value="${valStr(ov && ov.usage)}">`, 'Replaces the calculated usage for this month only. The month is flagged in your history.')}
          ${field('Reason (required)', `<input type="text" id="fOvNote" value="${esc(ov ? ov.note : '')}" placeholder="For example: misread last month">`)}
        </details>
      </div>
      <div class="group" style="margin-top:12px">${field('Note', `<textarea id="fNote" placeholder="Optional">${esc(rec ? rec.note || '' : '')}</textarea>`)}</div>
      <div class="btn-row"><button class="btn" data-act="saveReading">Save reading</button>
        ${kind === 'member' ? '<button class="btn quiet" data-act="saveReadingNext">Save and next</button>' : ''}</div>
      ${rec ? '<div class="btn-row"><button class="btn danger" data-act="clearReading">Clear this reading</button></div>' : ''}`;
    const sheet = openSheet(title, body, { onInput: updateReadingPreview });
    updateReadingPreview();
    return sheet;
  }

  function photoBoxInner() {
    const c = sheetCtx;
    let img = '';
    if (c.photoBlob) img = `<img id="photoPreview" src="${c.pendingUrl}" alt="New meter photo" data-act="viewPending">`;
    else if (c.existingPhotoId && !c.removePhoto) img = `<img id="photoPreview" data-file="${c.existingPhotoId}" alt="Meter photo" data-act="viewFile" data-id="${c.existingPhotoId}">`;
    const has = !!img;
    return `${img}<div class="photo-actions"><button class="btn ${has ? 'ghost' : 'quiet'}" data-act="pickPhoto">${I.camera}${has ? 'Replace photo' : 'Take or choose photo'}</button>
      ${has ? '<button class="btn danger fit" data-act="removePhoto" style="flex:0 0 auto">Remove</button>' : ''}</div>`;
  }
  function refreshPhotoBox() { const box = $('#photoBox'); if (box) { box.innerHTML = photoBoxInner(); hydrate(box); } }

  function draftReading() {
    const c = sheetCtx;
    const oldFinal = numOrNull($('#fOldFinal').value), newStart = numOrNull($('#fNewStart').value);
    const ovUsage = numOrNull($('#fOvUsage').value);
    return {
      value: numOrNull($('#fValue').value), unit: c.unit, date: $('#fDate').value || null,
      replaced: oldFinal != null && newStart != null ? { oldFinal, newStart } : null,
      override: ovUsage != null ? { usage: ovUsage, note: $('#fOvNote').value.trim() } : null,
      note: $('#fNote').value.trim(),
    };
  }
  function updateReadingPreview() {
    if (!sheetCtx || !$('#fValue')) return;
    const d = draftReading();
    $('#odoLive').innerHTML = odo(d.value, d.unit, 'lg');
    const u = Calc.usageFromReading(d, sheetCtx.prev);
    const out = $('#usageLive');
    out.className = 'usage-readout' + (u.status === 'negative' ? ' bad' : '');
    if (u.status === 'ok') out.textContent = `${vol(u.usage)} used${u.overridden ? ' (override)' : u.replaced ? ' (across meter swap)' : ''}`;
    else if (u.status === 'negative') out.textContent = `${vol(u.usage)}: lower than last time. Check the reading.`;
    else out.textContent = '';
  }

  async function saveReading(goNext) {
    const c = sheetCtx;
    if (c.processing) await c.processing;
    const d = draftReading();
    if (d.override && !d.override.note) return toast('Add a reason for the override.');
    if (d.value == null && !d.override && !c.photoBlob && !(c.existingPhotoId && !c.removePhoto)) return toast('Enter the meter reading or add a photo.');
    const m = getMonth(c.monthId);
    const mem = c.kind === 'member' ? getMember(c.memberId) : null;
    let photoId = c.removePhoto ? null : c.existingPhotoId;
    if (c.photoBlob) {
      const name = mem ? `${m.id}_${slug(mem.name)}_meter.jpg` : `${m.id}_utility-meter.jpg`;
      photoId = await saveFile(c.photoBlob, name);
      if (c.existingPhotoId) await deleteFile(c.existingPhotoId);
    } else if (c.removePhoto && c.existingPhotoId) {
      await deleteFile(c.existingPhotoId);
    }
    const rec = { ...d, photoId, savedAt: Date.now() };
    if (c.kind === 'member') m.readings[c.memberId] = rec; else m.utility = rec;
    await putMonth(m);
    if (c.pendingUrl) URL.revokeObjectURL(c.pendingUrl);
    closeSheet();
    render();
    toast('Reading saved');
    if (goNext && c.kind === 'member') {
      const parts = sortedParticipants(m);
      const idx = parts.findIndex((x) => x.id === c.memberId);
      const rest = parts.slice(idx + 1).concat(parts.slice(0, idx));
      const next = rest.find((x) => !(m.readings[x.id] && isNum(m.readings[x.id].value)));
      if (next) setTimeout(() => sheetReading('member', next.id), 280);
      else if (!(m.utility && isNum(m.utility.value))) setTimeout(() => sheetReading('utility'), 280);
      else toast('All meters are read');
    }
  }

  async function clearReading() {
    const c = sheetCtx;
    if (!confirm('Clear this reading and its photo?')) return;
    const m = getMonth(c.monthId);
    if (c.existingPhotoId) await deleteFile(c.existingPhotoId);
    if (c.kind === 'member') delete m.readings[c.memberId]; else m.utility = null;
    await putMonth(m);
    closeSheet(); render(); toast('Reading cleared');
  }

  async function pickPhoto() {
    const f = await pickFile('image/*');
    if (!f || !sheetCtx) return;
    toast('Processing photo…');
    const job = compressImage(f);
    sheetCtx.processing = job;
    const blob = await job;
    if (!sheetCtx) return;
    if (sheetCtx.pendingUrl) URL.revokeObjectURL(sheetCtx.pendingUrl);
    sheetCtx.photoBlob = blob;
    sheetCtx.pendingUrl = URL.createObjectURL(blob);
    sheetCtx.removePhoto = false;
    refreshPhotoBox();
  }

  /* ---------- Utility bill ---------- */
  function sheetBill() {
    const m = getMonth(S.view.monthId);
    const b = m.bill || {};
    sheetCtx = { monthId: m.id, extras: (b.extras || []).map((x) => ({ ...x })), existingPdfId: b.pdfId || null, pdfBlob: null, pdfName: null, removePdf: false };
    const body = `
      <div class="group">
        ${field('Bill date', `<input type="date" id="bDate" value="${esc(b.billDate || '')}">`)}
        ${field('Service period', `<input type="text" id="bPeriod" value="${esc(b.period || '')}" placeholder="For example: Feb 3 to Mar 4">`)}
      </div>
      <div class="group-title">Charges</div>
      <div class="group">
        ${field('Base fee', `<span class="money"><input id="bBase" inputmode="decimal" value="${valStr(b.baseFee)}" placeholder="0.00"></span>`, 'Split equally among included members.')}
        ${field('Usage fee', `<span class="money"><input id="bUsage" inputmode="decimal" value="${valStr(b.usageFee)}" placeholder="0.00"></span>`, 'Split by each member\'s share of the water used.')}
        <div class="field"><span class="lbl">Measured usage on the bill</span><div class="inline"><input id="bMeasured" inputmode="decimal" value="${valStr(b.measured)}" placeholder="0">
          <span class="fit">${seg('bUnit', [['ccf', 'CCF'], ['ft3', 'ft³']], b.measuredUnit || S.settings.billUnit)}</span></div></div>
      </div>
      <div class="group-title">Other charges<span class="aside">Taxes, surcharges, fees</span></div>
      <div id="extras"></div>
      <button class="btn block ghost" data-act="addExtra" style="margin-top:10px">${I.plus}Add a charge</button>
      <div class="group-title">Bill document</div>
      <div class="group"><div class="photo-box" id="pdfBox">${pdfBoxInner()}</div></div>
      <div class="btn-row"><button class="btn" data-act="saveBill">Save bill</button></div>
      ${m.bill ? '<div class="btn-row"><button class="btn danger" data-act="clearBill">Remove this bill</button></div>' : ''}`;
    openSheet('Utility bill', body);
    renderExtras();
  }
  function renderExtras() {
    const box = $('#extras');
    if (!box) return;
    const ex = sheetCtx.extras;
    if (!ex.length) { box.innerHTML = ''; return; }
    box.innerHTML = ex.map((x, i) => `<div class="group" style="margin-top:${i ? 10 : 0}px" data-extra="${i}">
      ${field('Name', `<input type="text" data-k="name" value="${esc(x.name || '')}" placeholder="For example: State tax">`)}
      ${field('Amount', `<span class="money"><input data-k="amount" inputmode="decimal" value="${valStr(x.amount)}" placeholder="0.00"></span>`)}
      <div class="field"><span class="lbl">Split</span>${seg('split' + i, [['equal', 'Equally'], ['usage', 'By usage']], x.split || 'equal')}</div>
      ${switchRow('fee' + i, 'Management fee applies', null, !!x.fee)}
      <div class="field"><button class="btn small danger" data-act="removeExtra" data-id="${i}">Remove this charge</button></div></div>`).join('');
  }
  function readExtras() {
    $$('[data-extra]').forEach((el) => {
      const i = Number(el.dataset.extra);
      const x = sheetCtx.extras[i];
      x.name = $('[data-k="name"]', el).value.trim();
      x.amount = numOrNull($('[data-k="amount"]', el).value);
      x.split = radioVal(el, 'split' + i) || 'equal';
      x.fee = $('#fee' + i, el).checked;
    });
  }
  function pdfBoxInner() {
    const c = sheetCtx;
    const has = c.pdfBlob || (c.existingPdfId && !c.removePdf);
    const label = c.pdfBlob ? c.pdfName : 'Saved bill';
    return `${has ? `<button class="row" style="border:0;padding:4px 0" data-act="${c.pdfBlob ? 'viewPendingPdf' : 'viewFile'}" data-id="${c.existingPdfId || ''}"><span class="thumb empty">${I.doc}</span><span class="grow"><span class="title">${esc(label)}</span><span class="meta">Tap to view</span></span></button>` : ''}
      <div class="photo-actions"><button class="btn ${has ? 'ghost' : 'quiet'}" data-act="pickPdf">${I.doc}${has ? 'Replace' : 'Attach PDF or photo'}</button>
      ${has ? '<button class="btn danger" data-act="removePdf" style="flex:0 0 auto">Remove</button>' : ''}</div>`;
  }
  async function pickPdf() {
    const f = await pickFile('application/pdf,image/*');
    if (!f || !sheetCtx) return;
    let blob = f;
    if (f.type.startsWith('image/')) { const job = compressImage(f, 2200, 0.85); sheetCtx.processing = job; blob = await job; }
    sheetCtx.pdfBlob = blob;
    sheetCtx.pdfName = f.name || 'Bill';
    sheetCtx.removePdf = false;
    $('#pdfBox').innerHTML = pdfBoxInner();
  }
  async function saveBill() {
    readExtras();
    const c = sheetCtx;
    if (c.processing) await c.processing;
    const m = getMonth(c.monthId);
    const baseFee = numOrNull($('#bBase').value), usageFee = numOrNull($('#bUsage').value);
    if (baseFee == null || usageFee == null) return toast('Enter both the base fee and the usage fee.');
    const extras = c.extras.filter((x) => x.name || x.amount != null).map((x) => ({ id: x.id || uid(), name: x.name, amount: x.amount, split: x.split, fee: x.fee }));
    if (extras.some((x) => x.amount == null)) return toast('Each other charge needs an amount.');
    let pdfId = c.removePdf ? null : c.existingPdfId;
    if (c.pdfBlob) {
      const ext = c.pdfBlob.type === 'application/pdf' ? 'pdf' : 'jpg';
      pdfId = await saveFile(c.pdfBlob, `${m.id}_utility-bill.${ext}`);
      if (c.existingPdfId) await deleteFile(c.existingPdfId);
    } else if (c.removePdf && c.existingPdfId) await deleteFile(c.existingPdfId);
    m.bill = {
      billDate: $('#bDate').value || null, period: $('#bPeriod').value.trim(),
      baseFee, usageFee, measured: numOrNull($('#bMeasured').value), measuredUnit: radioVal($('.sheet'), 'bUnit') || 'ccf',
      extras, pdfId, savedAt: Date.now(),
    };
    await putMonth(m);
    closeSheet(); render(); toast('Bill saved');
  }
  async function clearBill() {
    if (!confirm('Remove this bill and its document?')) return;
    const m = getMonth(sheetCtx.monthId);
    if (m.bill && m.bill.pdfId) await deleteFile(m.bill.pdfId);
    m.bill = null;
    await putMonth(m);
    closeSheet(); render(); toast('Bill removed');
  }

  /* ---------- This month's settings ---------- */
  function sheetMonthSettings() {
    const m = getMonth(S.view.monthId);
    const list = S.members.filter((x) => x.status !== 'removed' || m.participants.includes(x.id)).sort(byName);
    const body = `<div class="group-title">Members sharing this bill</div><div class="group">
      ${list.map((x) => switchRow('inc_' + x.id, esc(x.name), x.status === 'inactive' ? 'Currently inactive' : x.status === 'removed' ? 'Removed' : '', m.participants.includes(x.id))).join('')}</div>
      <div class="group-title">Manager and fee</div><div class="group">
      ${field('Manager this month', `<select id="msMgr"><option value="">No manager</option>${list.map((x) => `<option value="${x.id}" ${m.managerId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`, 'The manager pays the utility bill and doesn\'t pay the management fee.')}
      ${field('Management fee (%)', `<input id="msFee" inputmode="decimal" value="${valStr(isNum(m.feePct) ? m.feePct : S.settings.feePct)}">`)}</div>
      <div class="btn-row"><button class="btn" data-act="saveMonthSettings">Save</button></div>`;
    sheetCtx = { monthId: m.id, list };
    openSheet(`${monthLabel(m.id)} settings`, body);
  }
  async function saveMonthSettings() {
    const m = getMonth(sheetCtx.monthId);
    const fee = numOrNull($('#msFee').value);
    if (fee == null || fee < 0) return toast('Enter a management fee percentage.');
    m.participants = sheetCtx.list.filter((x) => $('#inc_' + x.id).checked).map((x) => x.id);
    m.managerId = $('#msMgr').value || null;
    if (m.managerId && !m.participants.includes(m.managerId)) m.participants.push(m.managerId);
    m.feePct = fee;
    await putMonth(m);
    closeSheet(); render(); toast('Month settings saved');
  }
  async function deleteMonth() {
    const m = getMonth(S.view.monthId);
    if (!confirm(`Delete ${monthLabel(m.id)} with all its readings, photos and bill? This can't be undone.`)) return;
    for (const r of Object.values(m.readings)) if (r.photoId) await deleteFile(r.photoId);
    if (m.utility && m.utility.photoId) await deleteFile(m.utility.photoId);
    if (m.bill && m.bill.pdfId) await deleteFile(m.bill.pdfId);
    await dbDel('months', m.id);
    S.months = S.months.filter((x) => x.id !== m.id);
    toast(`${monthLabel(m.id)} deleted`);
    go({ monthId: null });
  }

  /* ================= History ================= */
  function barChart(values, labels, opts) {
    const W = 340, H = 150, top = 12, bottom = 22, left = 4, right = 4;
    const vals = values.map((v) => (isNum(v) ? v : 0));
    let lo = Math.min(0, ...vals, opts.limit != null && opts.signed ? -opts.limit : 0);
    let hi = Math.max(0, ...vals, opts.limit != null ? opts.limit : 0);
    if (hi === lo) hi = lo + 1;
    const margin = (hi - lo) * 0.08; hi += margin; if (lo < 0) lo -= margin;
    const y = (v) => top + ((hi - v) / (hi - lo)) * (H - top - bottom);
    const n = values.length, slot = (W - left - right) / n, bw = Math.min(26, slot * 0.64);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">`;
    if (opts.limit != null) {
      s += `<line class="limit" x1="0" x2="${W}" y1="${y(opts.limit)}" y2="${y(opts.limit)}"/>`;
      if (opts.signed) s += `<line class="limit" x1="0" x2="${W}" y1="${y(-opts.limit)}" y2="${y(-opts.limit)}"/>`;
    }
    values.forEach((v, i) => {
      const x = left + i * slot + (slot - bw) / 2;
      if (isNum(v)) {
        const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        const cls = opts.cls(v);
        s += `<rect class="${cls}" x="${x}" y="${y0}" width="${bw}" height="${Math.max(1.5, y1 - y0)}" rx="3"><title>${esc(labels[i])}: ${esc(opts.fmt(v))}</title></rect>`;
      }
      if (n <= 12 || i % 2 === 0) s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>`;
    });
    s += `<line class="zero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
    return s;
  }

  function viewHistory() {
    let h = topbar('History');
    h += '<div class="page">';
    const months = Calc.sortedMonths(S.months);
    if (!months.length) {
      return h + `<div class="empty-state">${I.chart}<h2>No history yet</h2><p>Start a month and enter readings to see usage, leak checks and bills over time.</p>
        <button class="btn" data-act="tab" data-id="months">Go to months</button></div></div>`;
    }
    const calcs = months.map((m) => ({ m, c: Calc.computeMonth(m, ctx()) }));
    const recent = calcs.slice(-24);
    const labels = recent.map((x) => shortMonth(x.m.id));
    const ft3Mode = S.settings.thresholdType === 'ft3';
    const lim = S.settings.thresholdValue;
    const leakVals = recent.map((x) => (x.c.checksum ? (ft3Mode ? x.c.checksum.delta : x.c.checksum.pct) : null));

    h += `<div class="group-title">Leak check<span class="aside">Utility minus members</span></div><div class="group"><div class="chart">
      ${barChart(leakVals, labels, { label: 'Checksum difference by month', limit: lim, signed: true, fmt: (v) => ft3Mode ? vol(v) : `${num(v, 1)}%`, cls: (v) => (Math.abs(v) > lim ? 'bar-warn' : 'bar-ok') })}</div>
      <p class="chart-legend">Bars above the line mean the utility meter measured more than the member meters combined. A gap that grows month after month often points to a leak on the shared main. Dashed lines mark your ${thresholdText()} limit.</p></div>`;

    const useVals = recent.map((x) => (x.c.allRead ? x.c.totalUsage : null));
    h += `<div class="group-title">Total member usage</div><div class="group"><div class="chart">
      ${barChart(useVals, labels, { label: 'Total member usage by month', fmt: vol, cls: () => 'bar-use' })}</div></div>`;

    h += '<div class="group-title">By month</div><div class="group"><div class="table-wrap"><table class="hist"><thead><tr><th>Month</th><th>Members</th><th>Utility</th><th>Diff</th><th>Bill</th></tr></thead><tbody>';
    for (const { m, c } of [...calcs].reverse()) {
      const k = c.checksum;
      h += `<tr data-act="openMonthFromHistory" data-id="${m.id}"><td>${shortMonth(m.id)}</td><td>${c.allRead ? num(c.totalUsage, 0) : '—'}</td>
        <td>${c.util.usage != null ? num(c.util.usage, 0) : '—'}</td>
        <td${k && k.warn ? ' style="color:var(--warn);font-weight:700"' : ''}>${k ? (k.pct != null ? `${num(k.pct, 1)}%` : num(k.delta, 0)) : '—'}</td>
        <td>${c.totals ? money(c.totals.billTotal) : '—'}</td></tr>`;
    }
    h += '</tbody></table></div><p class="chart-legend">Volumes in ft³. Tap a month to open it.</p></div>';

    h += '<div class="group-title">By member</div><div class="group">';
    const mems = [...S.members].sort((a, b) => (a.status === 'removed') - (b.status === 'removed') || byName(a, b));
    for (const mem of mems) {
      const n = months.filter((m) => m.readings[mem.id] && isNum(m.readings[mem.id].value)).length;
      h += `<button class="row" data-act="memberHistory" data-id="${mem.id}"><span class="grow"><span class="title">${esc(mem.name)}${mem.status === 'removed' ? ' <span class="tag">Removed</span>' : ''}</span>
        <span class="meta">${n} reading${n === 1 ? '' : 's'}</span></span>${I.chevR}</button>`;
    }
    return h + '</div></div>';
  }

  function viewMemberHistory(mem) {
    let h = topbar(mem.name, [mem.location, mem.meterId ? `Meter ${mem.meterId}` : ''].filter(Boolean).join(', ') || null, { act: 'backToHistory', label: 'History' });
    h += '<div class="page">';
    const months = Calc.sortedMonths(S.months).filter((m) => m.participants.includes(mem.id) || m.readings[mem.id]).reverse();
    if (!months.length) return h + '<p class="note-text">No readings for this member yet.</p></div>';
    const rows = months.map((m) => {
      const c = Calc.computeMonth(m, ctx());
      const p = c.participants.find((x) => x.id === mem.id);
      const share = c.shares && c.shares.find((s) => s.id === mem.id);
      return { m, r: m.readings[mem.id], p, share };
    });
    const last12 = rows.slice(0, 12).filter((x) => x.p && x.p.usage != null);
    if (last12.length) {
      const tot = last12.reduce((a, x) => a + x.p.usage, 0);
      const paid = last12.reduce((a, x) => a + (x.share ? x.share.total : 0), 0);
      h += `<div class="group" style="margin-top:8px"><dl class="totals"><dt>Average monthly usage</dt><dd>${vol(tot / last12.length)}</dd>
        <dt>Usage, last ${last12.length} month${last12.length === 1 ? '' : 's'}</dt><dd>${vol(tot)}</dd>
        <dt>Billed, same period</dt><dd>${money(paid)}</dd></dl></div>`;
    }
    h += '<div class="group-title">Readings<span class="aside">Tap to see the photo</span></div><div class="group">';
    for (const { m, r, p, share } of rows) {
      const meta = [p ? usageLine(p) : 'Not included', r && r.date ? `read ${dateLabel(r.date)}` : ''].filter(Boolean).join(', ');
      const act = r && r.photoId ? `data-act="viewMemberPhoto" data-id="${r.photoId}" data-month="${m.id}"` : `data-act="openMonthFromHistory" data-id="${m.id}"`;
      h += `<button class="row" ${act}>${thumb(r && r.photoId)}<span class="grow"><span class="title">${monthLabel(m.id)}</span><span class="meta">${esc(meta)}</span></span>
        <span class="end">${share ? `<span class="big">${money(share.total)}</span>` : ''}</span></button>`;
    }
    return h + '</div></div>';
  }

  /* ================= Viewer (photos and PDFs) ================= */
  async function openViewer(fileId, caption, sub, monthId) {
    const f = await getFileBlob(fileId);
    if (!f) return toast('That file is missing.');
    showViewer(f.blob, f.name, f.type, caption, sub, monthId);
  }
  function showViewer(blob, name, type, caption, sub, monthId) {
    const url = URL.createObjectURL(blob);
    const isImg = (type || '').startsWith('image/');
    const el = document.createElement('div');
    el.className = 'viewer';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<div class="viewer-head"><span class="cap"><strong>${esc(caption || name)}</strong>${esc(sub || '')}</span>
      <button data-v="close">Done</button><span class="spacer"></span>${monthId ? '<button data-v="month">Open month</button>' : ''}<button data-v="share">Share</button></div>
      <div class="viewer-stage">${isImg ? `<img src="${url}" alt="${esc(caption || 'Photo')}">` : `<iframe src="${url}" title="${esc(name)}"></iframe>`}</div>
      <div class="viewer-hint">${isImg ? 'Tap the photo to zoom in or out' : 'Use Share to open the bill in Files or Books if it doesn\'t show fully'}</div>`;
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    const close = () => { el.remove(); URL.revokeObjectURL(url); if (!$('.sheet.show')) document.body.style.overflow = ''; };
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-v]');
      if (e.target.tagName === 'IMG') { $('.viewer-stage', el).classList.toggle('zoomed'); return; }
      if (!b) return;
      if (b.dataset.v === 'close') close();
      if (b.dataset.v === 'month') { close(); go({ tab: 'months', monthId }); }
      if (b.dataset.v === 'share') shareBlob(blob, name, type);
    });
  }
  async function shareBlob(blob, name, type) {
    const file = new File([blob], name || 'file', { type: type || blob.type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name || 'file';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  }
  function fileCaption(fileId) {
    for (const m of S.months) {
      for (const [mid, r] of Object.entries(m.readings)) if (r.photoId === fileId) {
        const mem = getMember(mid);
        return [`${mem ? mem.name : 'Member'}, ${monthLabel(m.id)}`, `${isNum(r.value) ? `${num(r.value, 3)} ${unitLabel(r.unit)}` : 'No reading'}${r.date ? `, read ${dateLabel(r.date)}` : ''}`, m.id];
      }
      if (m.utility && m.utility.photoId === fileId) return [`Utility meter, ${monthLabel(m.id)}`, isNum(m.utility.value) ? `${num(m.utility.value, 3)} ${unitLabel(m.utility.unit)}` : '', m.id];
      if (m.bill && m.bill.pdfId === fileId) return [`Utility bill, ${monthLabel(m.id)}`, m.bill.period || '', m.id];
    }
    return ['File', '', null];
  }

  /* ================= Setup ================= */
  function viewSetup() {
    const s = S.settings;
    let h = topbar('Setup', s.systemName || null);
    h += '<div class="page">';
    const current = S.members.filter((m) => m.status !== 'removed').sort(byName);
    const removed = S.members.filter((m) => m.status === 'removed').sort(byName);
    const act = current.filter((m) => m.status === 'active').length;
    h += `<div class="group-title">Members<span class="aside">${act} active</span></div>`;
    if (current.length) {
      h += '<div class="group">';
      for (const m of current) {
        const tags = (m.isManager ? ' <span class="tag main">Manager</span>' : '') + (m.status === 'inactive' ? ' <span class="tag">Inactive</span>' : '');
        const meta = [m.location, `Meter in ${unitLabel(m.meterUnit)}`, isNum(m.startReading) ? `starts at ${num(m.startReading, 3)}` : 'no starting reading'].filter(Boolean).join(', ');
        h += `<button class="row" data-act="editMember" data-id="${m.id}"><span class="grow"><span class="title">${esc(m.name)}${tags}</span><span class="meta">${esc(meta)}</span></span>${I.chevR}</button>`;
      }
      h += '</div>';
    } else {
      h += '<p class="note-text">Add each household on the shared system, including yourself.</p>';
    }
    h += `<button class="btn block quiet" data-act="addMember" style="margin-top:10px">${I.plus}Add a member</button>`;
    if (removed.length) {
      h += `<details class="group more" style="margin-top:12px"><summary>Removed members (${removed.length})</summary>
        ${removed.map((m) => `<button class="row" data-act="editMember" data-id="${m.id}"><span class="grow"><span class="title">${esc(m.name)}</span><span class="meta">History kept. Tap to restore.</span></span>${I.chevR}</button>`).join('')}</details>`;
    }

    h += `<div class="group-title">Billing and meters</div><div class="group">
      <button class="row" data-act="editSettings"><span class="grow"><span class="title">Management fee</span><span class="meta">${num(s.feePct)}% for new months</span></span>${I.chevR}</button>
      <button class="row" data-act="editSettings"><span class="grow"><span class="title">Checksum warning</span><span class="meta">Warn when the difference is over ${thresholdText()}</span></span>${I.chevR}</button>
      <button class="row" data-act="editSettings"><span class="grow"><span class="title">Utility meter</span><span class="meta">Reads in ${unitLabel(s.utilityUnit)}, ${isNum(s.utilityStartReading) ? `starts at ${num(s.utilityStartReading, 3)}` : 'no starting reading'}</span></span>${I.chevR}</button>
      <button class="row" data-act="editSettings"><span class="grow"><span class="title">System name</span><span class="meta">${esc(s.systemName || 'Not set')}</span></span>${I.chevR}</button></div>`;

    h += `<div class="group-title">Your data</div>
      <div class="callout info"><p>For now, everything is stored only on this phone. Google Drive sync comes in the next update. Until then, save a backup file regularly to Files, OneDrive or Google Drive.</p></div>
      <div class="group" style="margin-top:12px">
      <button class="row" data-act="backup"><span class="grow"><span class="title">Save a backup file</span><span class="meta">${s.lastBackup ? `Last saved ${new Date(s.lastBackup).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Never saved'}. Includes photos and bills.</span></span>${I.chevR}</button>
      <button class="row" data-act="restore"><span class="grow"><span class="title">Restore from a backup file</span><span class="meta">Replaces everything on this phone</span></span>${I.chevR}</button>
      <p class="note-text" id="storageInfo" style="border-top:1px solid var(--line)">Checking storage…</p></div>
      <p class="note-text" style="text-align:center">WaterShare ${APP_VERSION}</p>`;
    return h + '</div>';
  }

  async function fillStorageInfo() {
    const el = $('#storageInfo');
    if (!el) return;
    const bits = [];
    try {
      const files = await dbAll('files');
      const bytes = files.reduce((a, f) => a + (f.size || 0), 0);
      bits.push(`${files.length} photo${files.length === 1 ? '' : 's'} and document${files.length === 1 ? '' : 's'}, ${(bytes / 1048576).toFixed(1)} MB.`);
    } catch (e) { /* ignore */ }
    try {
      if (navigator.storage && navigator.storage.persisted) {
        const p = await navigator.storage.persisted();
        bits.push(p ? 'The phone has agreed to keep this data.' : 'The phone may clear this data if storage runs very low, so keep backups.');
      }
    } catch (e) { /* ignore */ }
    el.textContent = bits.join(' ');
  }

  function sheetMember(id) {
    const m = id ? getMember(id) : { id: null, name: '', location: '', phone: '', email: '', meterUnit: 'ft3', meterId: '', startReading: null, status: 'active', isManager: false, notes: '' };
    sheetCtx = { memberId: id };
    const removed = m.status === 'removed';
    const body = `<div class="group">
        ${field('Name', `<input type="text" id="mName" value="${esc(m.name)}" autocomplete="off" placeholder="For example: The Garcias">`)}
        ${field('Location or lot', `<input type="text" id="mLoc" value="${esc(m.location || '')}" placeholder="Optional">`)}
        ${field('Phone', `<input type="tel" id="mPhone" value="${esc(m.phone || '')}" placeholder="For texting statements">`)}
        ${field('Email', `<input type="email" id="mEmail" value="${esc(m.email || '')}" placeholder="Optional">`)}
      </div>
      <div class="group-title">Meter</div><div class="group">
        <div class="field"><span class="lbl">Meter reads in</span>${seg('mUnit', [['ft3', 'Cubic feet'], ['ccf', 'CCF']], m.meterUnit || 'ft3')}</div>
        ${field('Meter ID or serial', `<input type="text" id="mMeterId" value="${esc(m.meterId || '')}" placeholder="Optional">`)}
        ${field('Starting reading', `<input id="mStart" inputmode="decimal" value="${valStr(m.startReading)}" placeholder="0">`, 'The reading just before the first month you enter in the app. It\'s used to calculate that first month\'s usage.')}
      </div>
      <div class="group-title">Status</div><div class="group">
        ${removed ? switchRow('mRestore', 'Restore this member', 'Brings them back as an active member', false) : switchRow('mActive', 'Active', 'Inactive members are left out of new months, including the base fee split.', m.status === 'active')}
        ${switchRow('mMgr', 'Manager', 'Pays the utility bill and doesn\'t pay the management fee. Only one member can be the manager.', !!m.isManager)}
      </div>
      <div class="group" style="margin-top:12px">${field('Notes', `<textarea id="mNotes" placeholder="Optional">${esc(m.notes || '')}</textarea>`)}</div>
      <div class="btn-row"><button class="btn" data-act="saveMember">${id ? 'Save member' : 'Add member'}</button></div>
      ${id && !removed ? '<div class="btn-row"><button class="btn danger" data-act="removeMember">Remove member</button></div>' : ''}`;
    openSheet(id ? m.name : 'Add a member', body);
  }
  async function saveMember() {
    const id = sheetCtx.memberId;
    const name = $('#mName').value.trim();
    if (!name) return toast('Enter a name for this member.');
    const old = id ? getMember(id) : null;
    let status = old ? old.status : 'active';
    if ($('#mRestore')) { if ($('#mRestore').checked) status = 'active'; }
    else status = $('#mActive').checked ? 'active' : 'inactive';
    const m = {
      ...(old || { id: uid(), createdAt: Date.now() }),
      name, location: $('#mLoc').value.trim(), phone: $('#mPhone').value.trim(), email: $('#mEmail').value.trim(),
      meterUnit: radioVal($('.sheet'), 'mUnit') || 'ft3', meterId: $('#mMeterId').value.trim(),
      startReading: numOrNull($('#mStart').value), status, isManager: $('#mMgr').checked, notes: $('#mNotes').value.trim(),
    };
    if (m.isManager) {
      for (const other of S.members) if (other.id !== m.id && other.isManager) await putMember({ ...other, isManager: false });
    }
    await putMember(m);
    closeSheet(); render(); toast(id ? 'Member saved' : `${name} added`);
  }
  async function removeMember() {
    const m = getMember(sheetCtx.memberId);
    const used = S.months.some((x) => x.readings[m.id]);
    if (used) {
      if (!confirm(`Remove ${m.name}? They'll be left out of new months. Their past readings, photos and bills stay in your history.`)) return;
      await putMember({ ...m, status: 'removed', isManager: false });
    } else {
      if (!confirm(`Delete ${m.name}? They have no readings yet, so nothing else is affected.`)) return;
      await dbDel('members', m.id);
      S.members = S.members.filter((x) => x.id !== m.id);
      for (const mo of S.months) if (mo.participants.includes(m.id)) {
        mo.participants = mo.participants.filter((x) => x !== m.id);
        if (mo.managerId === m.id) mo.managerId = null;
        await putMonth(mo);
      }
    }
    closeSheet(); render(); toast(`${m.name} removed`);
  }

  function sheetSettings() {
    const s = S.settings;
    const body = `<div class="group">${field('System name', `<input type="text" id="sName" value="${esc(s.systemName)}" placeholder="For example: Cedar Lane Water">`)}</div>
      <div class="group-title">Management fee</div><div class="group">
        ${field('Percent added to each member\'s bill', `<input id="sFee" inputmode="decimal" value="${valStr(s.feePct)}">`, 'Applies to new months. Each month keeps its own rate, so changing this won\'t alter past bills.')}</div>
      <div class="group-title">Checksum warning</div><div class="group">
        <div class="field"><span class="lbl">Measure the difference in</span>${seg('sThType', [['pct', 'Percent'], ['ft3', 'Cubic feet']], s.thresholdType)}</div>
        ${field('Warn when the difference is over', `<input id="sTh" inputmode="decimal" value="${valStr(s.thresholdValue)}">`)}</div>
      <div class="group-title">Utility meter</div><div class="group">
        <div class="field"><span class="lbl">Meter reads in</span>${seg('sUUnit', [['ccf', 'CCF'], ['ft3', 'Cubic feet']], s.utilityUnit)}</div>
        ${field('Starting reading', `<input id="sUStart" inputmode="decimal" value="${valStr(s.utilityStartReading)}" placeholder="0">`, 'Your reading of the utility meter just before the first month you enter.')}
        <div class="field"><span class="lbl">Bill usage is usually shown in</span>${seg('sBUnit', [['ccf', 'CCF'], ['ft3', 'Cubic feet']], s.billUnit)}</div></div>
      <div class="btn-row"><button class="btn" data-act="saveSettings">Save settings</button></div>`;
    openSheet('Billing and meters', body);
  }
  async function saveSettings() {
    const sh = $('.sheet');
    const fee = numOrNull($('#sFee').value), th = numOrNull($('#sTh').value);
    if (fee == null || fee < 0) return toast('Enter a management fee percentage.');
    if (th == null || th < 0) return toast('Enter a checksum warning limit.');
    Object.assign(S.settings, {
      systemName: $('#sName').value.trim(), feePct: fee, thresholdType: radioVal(sh, 'sThType') || 'pct', thresholdValue: th,
      utilityUnit: radioVal(sh, 'sUUnit') || 'ccf', utilityStartReading: numOrNull($('#sUStart').value), billUnit: radioVal(sh, 'sBUnit') || 'ccf',
    });
    await putSettings();
    closeSheet(); render(); toast('Settings saved');
  }

  /* ================= Backup and restore ================= */
  function blobToBase64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  }
  function base64ToBuffer(b64) {
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  async function backup() {
    toast('Preparing backup…');
    const files = await dbAll('files');
    const parts = [`{"app":"WaterShare","format":1,"version":${JSON.stringify(APP_VERSION)},"exportedAt":${JSON.stringify(new Date().toISOString())},`,
      `"settings":${JSON.stringify(S.settings)},"members":${JSON.stringify(S.members)},"months":${JSON.stringify(S.months)},"files":[`];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const meta = JSON.stringify({ id: f.id, type: f.type, name: f.name, size: f.size, createdAt: f.createdAt });
      parts.push((i ? ',' : '') + meta.slice(0, -1) + ',"data":"');
      parts.push(await blobToBase64(new Blob([f.data])));
      parts.push('"}');
    }
    parts.push(']}');
    const blob = new Blob(parts, { type: 'application/json' });
    sheetCtx = { backupBlob: blob, backupName: `WaterShare-backup-${today()}.json` };
    const n = S.months.length;
    openSheet('Backup ready', `<p class="note-text">${n} month${n === 1 ? '' : 's'}, ${S.members.length} member${S.members.length === 1 ? '' : 's'} and ${files.length} photo${files.length === 1 ? '' : 's'} and document${files.length === 1 ? '' : 's'}, ${(blob.size / 1048576).toFixed(1)} MB.</p>
      <p class="note-text">Choose Save to Files, or pick OneDrive or Google Drive from the share options.</p>
      <button class="btn block" data-act="shareBackup">Save or share the backup</button>`);
  }
  async function shareBackup() {
    const c = sheetCtx;
    const ok = await shareBlob(c.backupBlob, c.backupName, 'application/json');
    if (ok) {
      S.settings.lastBackup = Date.now();
      await putSettings();
      closeSheet(); render();
      toast('Backup saved');
    }
  }
  async function restore() {
    const f = await pickFile();
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { return toast('That file isn\'t a WaterShare backup.'); }
    if (!data || data.app !== 'WaterShare') return toast('That file isn\'t a WaterShare backup.');
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-US') : 'an unknown date';
    if (!confirm(`Replace everything on this phone with the backup from ${when}? It has ${data.months.length} months and ${data.members.length} members. This can't be undone.`)) return;
    toast('Restoring…');
    for (const s of ['members', 'months', 'files', 'kv']) await dbClear(s);
    for (const u of urlCache.values()) URL.revokeObjectURL(u);
    urlCache.clear();
    for (const m of data.members) await dbPut('members', m);
    for (const m of data.months) await dbPut('months', m);
    for (const x of data.files || []) {
      await dbPut('files', { id: x.id, type: x.type, name: x.name, size: x.size, createdAt: x.createdAt, data: base64ToBuffer(x.data) });
    }
    await dbPut('kv', { ...DEFAULT_SETTINGS, ...data.settings, key: 'settings' });
    await loadAll();
    go({ tab: 'months', monthId: null, memberId: null });
    toast('Backup restored');
  }

  /* ================= Events ================= */
  const actions = {
    tab: (el) => go({ tab: el.dataset.id, monthId: null, memberId: null }),
    closeSheet: () => closeSheet(),
    newMonth: () => sheetNewMonth(),
    createMonth: () => createMonth(),
    openMonth: (el) => go({ monthId: el.dataset.id }),
    openMonthFromHistory: (el) => go({ tab: 'months', monthId: el.dataset.id }),
    backToMonths: () => go({ monthId: null }),
    backToHistory: () => go({ memberId: null }),
    readMember: (el) => sheetReading('member', el.dataset.id),
    readUtility: () => sheetReading('utility'),
    saveReading: () => saveReading(false),
    saveReadingNext: () => saveReading(true),
    clearReading: () => clearReading(),
    pickPhoto: () => pickPhoto(),
    removePhoto: () => { sheetCtx.removePhoto = true; sheetCtx.photoBlob = null; refreshPhotoBox(); },
    viewPending: () => showViewer(sheetCtx.photoBlob, 'Meter photo.jpg', 'image/jpeg', 'New photo', 'Not saved yet'),
    viewPendingPdf: () => showViewer(sheetCtx.pdfBlob, sheetCtx.pdfName, sheetCtx.pdfBlob.type, 'New bill', 'Not saved yet'),
    viewFile: (el) => { const [cap, sub] = fileCaption(el.dataset.id); openViewer(el.dataset.id, cap, sub); },
    viewMemberPhoto: (el) => { const [cap, sub] = fileCaption(el.dataset.id); openViewer(el.dataset.id, cap, sub, el.dataset.month); },
    editBill: () => sheetBill(),
    addExtra: () => { readExtras(); sheetCtx.extras.push({ id: uid(), name: '', amount: null, split: 'equal', fee: false }); renderExtras(); },
    removeExtra: (el) => { readExtras(); sheetCtx.extras.splice(Number(el.dataset.id), 1); renderExtras(); },
    pickPdf: () => pickPdf(),
    removePdf: () => { sheetCtx.removePdf = true; sheetCtx.pdfBlob = null; $('#pdfBox').innerHTML = pdfBoxInner(); },
    saveBill: () => saveBill(),
    clearBill: () => clearBill(),
    monthSettings: () => sheetMonthSettings(),
    saveMonthSettings: () => saveMonthSettings(),
    deleteMonth: () => deleteMonth(),
    memberHistory: (el) => go({ memberId: el.dataset.id }),
    addMember: () => sheetMember(null),
    editMember: (el) => sheetMember(el.dataset.id),
    saveMember: () => saveMember(),
    removeMember: () => removeMember(),
    editSettings: () => sheetSettings(),
    saveSettings: () => saveSettings(),
    backup: () => backup().catch((e) => toast('Backup failed: ' + e.message)),
    shareBackup: () => shareBackup().catch((e) => toast('Sharing failed: ' + e.message)),
    restore: () => restore().catch((e) => toast('Restore failed: ' + e.message)),
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('.viewer')) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(el, e)).catch((err) => { console.error(err); toast('Something went wrong: ' + err.message); });
  });

  function showBanner(text, button, onClick) {
    const slot = $('#banner-slot');
    slot.innerHTML = `<div class="banner"><span class="grow">${esc(text)}</span><button class="btn small">${esc(button)}</button></div>`;
    $('button', slot).addEventListener('click', onClick);
  }

  /* ================= Start ================= */
  async function start() {
    try {
      db = await openDB();
      await loadAll();
    } catch (e) {
      $('#app').innerHTML = `<div class="page"><div class="callout bad"><p>WaterShare couldn't open its storage on this phone: ${esc(e.message)}. If you're using a private browsing tab, open the app from its home-screen icon instead.</p></div></div>`;
      return;
    }
    render();
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
    if ('serviceWorker' in navigator) {
      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) showBanner('A new version of WaterShare is ready.', 'Reload', () => location.reload());
        hadController = true;
      });
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  start();
})();
