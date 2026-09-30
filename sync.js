/* WaterShare Google Drive sync.
   The phone is always the main copy. Changes are queued and uploaded when there's signal.
   Uses the drive.file permission, so the app can only see files it created itself. */
(function () {
  'use strict';
  const WS = window.WS;
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3';
  const UP = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER = 'application/vnd.google-apps.folder';
  const DATA_NAME = 'WaterShare-data.json';
  const LS_TOKEN = 'ws_token', LS_STATE = 'ws_oauth_state';

  const DEFAULT_SY = () => ({
    key: 'sync', connected: false, dataVersion: 1, syncedVersion: 0, pending: [], tombstones: [],
    driveMap: {}, folders: { months: {} }, dataFileId: null, inflight: null, lastSync: null, lastError: null,
  });
  let SY = DEFAULT_SY();
  let syncing = false, again = false, offline = false, timer = null;

  const esc = WS.esc;
  const saveSY = () => WS.dbPut('kv', SY);

  /* ---------- Sign-in (Google OAuth, redirect flow) ---------- */
  function getToken() {
    try { const t = JSON.parse(localStorage.getItem(LS_TOKEN)); if (t && t.expiresAt > Date.now()) return t.access_token; } catch (e) { /* ignore */ }
    return null;
  }
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

  function startAuth(mode, after) {
    const cid = (WS.S.settings.googleClientId || '').trim();
    if (!cid) { WS.toast('Add your Google client ID first.'); return; }
    if (!navigator.onLine) { WS.toast('Connect to wifi or cell service to sign in to Google.'); return; }
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(LS_STATE, JSON.stringify({ state, mode, after: after || 'sync', view: WS.S.view }));
    const p = new URLSearchParams({ client_id: cid, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPE, include_granted_scopes: 'true', state });
    if (mode === 'silent') p.set('prompt', 'none');
    if (mode === 'consent') p.set('prompt', 'consent select_account');
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
  }

  /* Called at startup. Returns what happened with a sign-in redirect, if any. */
  function handleRedirect() {
    if (!location.hash || !/(access_token|error)=/.test(location.hash)) return null;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_STATE)) || {}; } catch (e) { /* ignore */ }
    localStorage.removeItem(LS_STATE);
    if (saved.view) WS.S.view = { ...WS.S.view, ...saved.view };
    if (!saved.state || h.get('state') !== saved.state) return { error: 'The Google sign-in reply didn\'t match. Try again.' };
    if (h.get('error')) {
      if (saved.mode === 'silent') { startAuth('interactive', saved.after); return { redirecting: true }; }
      return { error: h.get('error') === 'access_denied' ? 'Google Drive access wasn\'t allowed, so nothing was connected.' : `Google sign-in failed (${h.get('error')}).` };
    }
    const scope = h.get('scope') || SCOPE;
    if (!scope.includes('drive.file')) return { error: 'Google Drive access wasn\'t granted. When you connect, make sure the Google Drive box is ticked.' };
    const exp = Number(h.get('expires_in') || 3600);
    localStorage.setItem(LS_TOKEN, JSON.stringify({ access_token: h.get('access_token'), expiresAt: Date.now() + (exp - 120) * 1000 }));
    return { ok: true, after: saved.after || 'sync' };
  }

  /* ---------- Drive API ---------- */
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  async function api(url, opts = {}) {
    const tok = getToken();
    if (!tok) throw new HttpError(401, 'Signed out of Google');
    let res;
    try {
      res = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + tok, ...(opts.headers || {}) } });
    } catch (e) {
      const err = new Error('No connection'); err.offline = true; throw err;
    }
    offline = false;
    if (res.status === 401) { localStorage.removeItem(LS_TOKEN); throw new HttpError(401, 'Google sign-in expired'); }
    if (!res.ok) {
      let msg = res.statusText || 'Request failed';
      try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch (e) { /* ignore */ }
      throw new HttpError(res.status, msg);
    }
    return res;
  }
  const qs = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  async function findOne(query) {
    const url = `${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&spaces=drive&pageSize=10&orderBy=modifiedTime desc`;
    const j = await (await api(url)).json();
    return (j.files && j.files[0]) || null;
  }
  async function findFolder(name, parent) {
    return findOne(`name='${qs(name)}' and mimeType='${FOLDER}' and trashed=false` + (parent ? ` and '${parent}' in parents` : ''));
  }
  async function folder(name, parent) {
    const f = await findFolder(name, parent);
    if (f) return f.id;
    const r = await api(`${API}/files?fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parent ? { name, mimeType: FOLDER, parents: [parent] } : { name, mimeType: FOLDER }),
    });
    return (await r.json()).id;
  }
  async function ensureFolders() {
    const F = SY.folders || (SY.folders = { months: {} });
    if (!F.months) F.months = {};
    if (!F.root) F.root = await folder('WaterShare');
    if (!F.photos) F.photos = await folder('Meter photos', F.root);
    if (!F.bills) F.bills = await folder('Utility bills', F.root);
    if (!F.other) F.other = await folder('Other bills', F.root);
    await saveSY();
  }
  async function monthFolder(mid) {
    if (!SY.folders.months[mid]) { SY.folders.months[mid] = await folder(mid, SY.folders.photos); await saveSY(); }
    return SY.folders.months[mid];
  }
  function kindOf(rec) {
    if (rec.kind) return rec.kind;
    if (/_utility-bill\./.test(rec.name || '')) return 'bill';
    return 'meter';
  }
  async function parentFor(rec) {
    const k = kindOf(rec);
    if (k === 'bill') return SY.folders.bills;
    if (k === 'expense') return SY.folders.other;
    const mid = rec.monthId || (rec.name || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(mid) ? monthFolder(mid) : SY.folders.photos;
  }
  async function uploadMultipart(meta, data, type) {
    const boundary = 'wsb' + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
      data, `\r\n--${boundary}--`,
    ]);
    const r = await api(`${UP}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return (await r.json()).id;
  }

  function buildDriveData() {
    const d = WS.buildData();
    d.driveMap = SY.driveMap;
    return d;
  }
  async function uploadData() {
    const blob = new Blob([JSON.stringify(buildDriveData())], { type: 'application/json' });
    if (!SY.dataFileId) {
      const f = await findOne(`name='${DATA_NAME}' and '${SY.folders.root}' in parents and trashed=false`);
      if (f) SY.dataFileId = f.id;
    }
    if (SY.dataFileId) {
      try {
        await api(`${UP}/files/${SY.dataFileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: blob });
        return;
      } catch (e) { if (e.status !== 404) throw e; SY.dataFileId = null; }
    }
    SY.dataFileId = await uploadMultipart({ name: DATA_NAME, parents: [SY.folders.root], mimeType: 'application/json' }, blob, 'application/json');
    await saveSY();
  }

  /* ---------- Sync ---------- */
  function waitingCount() {
    return SY.pending.length + SY.tombstones.length + (SY.dataVersion !== SY.syncedVersion ? 1 : 0);
  }
  function schedule(ms = 4000) {
    if (!SY.connected) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(), ms);
  }

  async function uploadOne(id) {
    const rec = await WS.dbGet('files', id);
    if (!rec) return;
    if (SY.inflight === id) {
      // The app may have closed mid-upload last time. Check before uploading again.
      const ex = await findOne(`appProperties has { key='wsId' and value='${qs(id)}' } and trashed=false`);
      if (ex) { SY.driveMap[id] = { driveId: ex.id, name: rec.name, type: rec.type }; return; }
    }
    SY.inflight = id; await saveSY();
    const meta = async () => ({ name: rec.name || id, parents: [await parentFor(rec)], mimeType: rec.type, appProperties: { wsId: id } });
    let driveId;
    try {
      driveId = await uploadMultipart(await meta(), rec.data, rec.type);
    } catch (e) {
      if (e.status !== 404) throw e;
      // A folder was deleted in Drive. Recreate the folders and try once more.
      SY.folders = { months: {} }; await ensureFolders();
      driveId = await uploadMultipart(await meta(), rec.data, rec.type);
    }
    SY.driveMap[id] = { driveId, name: rec.name, type: rec.type };
  }

  async function syncNow(opts = {}) {
    if (!SY.connected) return;
    if (syncing) { again = true; return; }
    if (!getToken()) { paint(); if (opts.interactive) startAuth('silent', 'sync'); return; }
    if (!waitingCount() && !opts.force) { SY.lastSync = SY.lastSync || Date.now(); paint(); return; }
    syncing = true; SY.lastError = null; paint();
    try {
      await ensureFolders();
      while (SY.pending.length) {
        const id = SY.pending[0];
        await uploadOne(id);
        SY.pending.shift(); SY.inflight = null; await saveSY(); paint();
      }
      while (SY.tombstones.length) {
        const d = SY.tombstones[0];
        try {
          await api(`${API}/files/${d}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
        } catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
        SY.tombstones.shift(); await saveSY();
      }
      if (SY.dataVersion !== SY.syncedVersion) {
        const v = SY.dataVersion;
        await uploadData();
        SY.syncedVersion = v;
      }
      SY.lastSync = Date.now();
      await saveSY();
    } catch (e) {
      if (e.offline) offline = true;
      else if (e.status !== 401) SY.lastError = e.message;
      await saveSY();
    } finally {
      syncing = false;
      paint();
      if (again) { again = false; schedule(1000); }
    }
  }

  /* ---------- Status pill ---------- */
  function pillInfo() {
    if (!SY.connected) return null;
    const n = waitingCount();
    const label = `${n} change${n === 1 ? '' : 's'} to upload`;
    if (syncing) return { cls: 'busy', text: n ? `Uploading, ${n} left` : 'Syncing' };
    if (SY.lastError) return { cls: 'bad', text: 'Sync problem' };
    if (!n) return { cls: 'ok', text: 'Synced' };
    if (offline || !navigator.onLine) return { cls: 'warn', text: `${label}, no signal` };
    if (!getToken()) return { cls: 'warn', text: `${label}, tap to sync` };
    return { cls: 'warn', text: label };
  }
  const CLOUD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.5 4.3 4.3 0 0 0 7 18z"/></svg>';
  function pill() {
    const p = pillInfo();
    if (!p) return '';
    return `<button class="sync-pill ${p.cls}" data-act="syncTap" data-sync-pill>${CLOUD}<span>${esc(p.text)}</span></button>`;
  }
  function paint() {
    const html = pill();
    for (const el of document.querySelectorAll('[data-sync-pill]')) el.outerHTML = html;
    const sec = document.getElementById('driveSection');
    if (sec) sec.outerHTML = driveSection();
  }

  /* ---------- Setup screen section ---------- */
  function driveSection() {
    const s = WS.S.settings;
    let h = '<div id="driveSection">';
    if (!SY.connected) {
      h += `<div class="group"><button class="row" data-act="driveSetup"><span class="grow"><span class="title">Set up Google Drive sync</span>
        <span class="meta">${s.googleClientId ? 'Client ID saved. Tap to connect.' : 'Uploads readings, photos and bills to your Drive whenever there\'s signal'}</span></span>${WS.icons.chevR}</button></div>`;
    } else {
      const last = SY.lastSync ? new Date(SY.lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet';
      const n = waitingCount();
      h += `<div class="group">
        <div class="row" style="cursor:default"><span class="grow"><span class="title">Connected to Google Drive</span>
          <span class="meta">Last synced ${esc(last)}. ${n ? `${n} change${n === 1 ? '' : 's'} waiting.` : 'Everything is uploaded.'}${SY.lastError ? ` Last problem: ${esc(SY.lastError)}` : ''}</span></span></div>
        <button class="row" data-act="syncNowBtn"><span class="grow"><span class="title">Sync now</span><span class="meta">Uploads anything waiting</span></span>${WS.icons.chevR}</button>
        <button class="row" data-act="driveDownload"><span class="grow"><span class="title">Download everything from Google Drive</span><span class="meta">For a new phone, or if this phone lost its data</span></span>${WS.icons.chevR}</button>
        <button class="row" data-act="driveReupload"><span class="grow"><span class="title">Upload everything again</span><span class="meta">Use if files were deleted from your Drive</span></span>${WS.icons.chevR}</button>
        <button class="row" data-act="driveDisconnect"><span class="grow"><span class="title">Disconnect Google Drive</span><span class="meta">Your files stay in Drive</span></span>${WS.icons.chevR}</button></div>`;
    }
    return h + '</div>';
  }

  function sheetDriveSetup() {
    const s = WS.S.settings;
    const origin = location.origin, redirect = redirectUri();
    WS.openSheet('Google Drive sync', `
      <p class="note-text">You'll need a free Google Cloud client ID. The setup guide walks through getting one in about 10 minutes. It will ask for these two addresses, exactly as shown:</p>
      <div class="group">
        <div class="field"><span class="lbl">Authorized JavaScript origin</span><div class="inline"><input type="text" readonly value="${esc(origin)}" id="dOrigin"><button class="btn small ghost fit" data-act="copyField" data-id="dOrigin">Copy</button></div></div>
        <div class="field"><span class="lbl">Authorized redirect URI</span><div class="inline"><input type="text" readonly value="${esc(redirect)}" id="dRedirect"><button class="btn small ghost fit" data-act="copyField" data-id="dRedirect">Copy</button></div></div>
      </div>
      <div class="group" style="margin-top:12px">
        <label class="field"><span class="lbl">Client ID</span><input type="text" id="dClient" value="${esc(s.googleClientId || '')}" placeholder="Ends in .apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      </div>
      <p class="note-text">WaterShare only gets access to files it creates in a WaterShare folder. It can't see anything else in your Drive.</p>
      <div class="btn-row"><button class="btn" data-act="driveConnect">Save and connect</button></div>`);
  }

  async function connectAfterAuth() {
    // Look for existing WaterShare data in this Google account before uploading.
    let remote = null;
    try {
      const root = await findFolder('WaterShare');
      if (root) {
        const f = await findOne(`name='${DATA_NAME}' and '${root.id}' in parents and trashed=false`);
        if (f) remote = { rootId: root.id, fileId: f.id, modified: f.modifiedTime };
      }
    } catch (e) {
      WS.toast(e.offline ? 'No connection. Try again when you have signal.' : 'Couldn\'t reach Google Drive: ' + e.message);
      return;
    }
    const localHasData = WS.S.months.length || WS.S.members.length;
    if (remote && localHasData) {
      const when = new Date(remote.modified).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      WS.openSheet('WaterShare data found', `<p class="note-text">Your Google Drive already has WaterShare data, last updated ${esc(when)}. Which copy do you want to keep?</p>
        <div class="btn-row"><button class="btn" data-act="driveUseLocal">Keep this phone's data</button></div>
        <p class="note-text">Uploads this phone's data into the same WaterShare folder. Photos already in Drive aren't uploaded twice.</p>
        <div class="btn-row"><button class="btn ghost" data-act="driveUseRemote">Replace with Drive's data</button></div>
        <p class="note-text">Downloads the Drive copy onto this phone, replacing what's here.</p>`);
      WS.setSheetCtx({ remote });
      return;
    }
    if (remote && !localHasData) { await finishConnect(remote, true); return; }
    await finishConnect(null, false);
  }

  async function finishConnect(remote, download) {
    const keep = { dataVersion: SY.dataVersion + 1 };
    SY = DEFAULT_SY();
    SY.connected = true;
    SY.dataVersion = keep.dataVersion;
    if (remote) { SY.folders.root = remote.rootId; SY.dataFileId = remote.fileId; }
    if (download) { await saveSY(); return downloadAll(true); }
    if (remote) {
      // Reuse uploads that already exist in Drive for the same files.
      try {
        const d = await (await api(`${API}/files/${remote.fileId}?alt=media`)).json();
        const localIds = new Set(await WS.dbKeys('files'));
        for (const [id, m] of Object.entries(d.driveMap || {})) if (localIds.has(id)) SY.driveMap[id] = m;
      } catch (e) { /* not fatal */ }
    }
    const keys = await WS.dbKeys('files');
    SY.pending = keys.filter((k) => !SY.driveMap[k]);
    await saveSY();
    WS.closeSheet();
    WS.render();
    WS.toast('Google Drive connected');
    syncNow({ force: true });
  }

  async function downloadAll(skipConfirm) {
    if (!getToken()) { startAuth('silent', 'download'); return; }
    if (!SY.dataFileId) {
      try {
        await ensureFolders();
        const f = await findOne(`name='${DATA_NAME}' and '${SY.folders.root}' in parents and trashed=false`);
        if (f) SY.dataFileId = f.id;
      } catch (e) { WS.toast(e.offline ? 'No connection right now.' : e.message); return; }
    }
    if (!SY.dataFileId) { WS.toast('There\'s no WaterShare data in your Drive yet.'); return; }
    if (!skipConfirm && !confirm('Replace everything on this phone with the copy in Google Drive? Changes not yet uploaded will be lost.')) return;
    WS.openSheet('Downloading from Google Drive', '<p class="note-text" id="dlProg">Getting your data…</p><p class="note-text">Keep the app open until this finishes.</p>');
    const prog = (t) => { const el = document.getElementById('dlProg'); if (el) el.textContent = t; };
    try {
      const data = await (await api(`${API}/files/${SY.dataFileId}?alt=media`)).json();
      const entries = Object.entries(data.driveMap || {});
      const files = [];
      let i = 0;
      for (const [id, m] of entries) {
        i++; prog(`Downloading photos and bills: ${i} of ${entries.length}`);
        try {
          const res = await api(`${API}/files/${m.driveId}?alt=media`);
          const buf = await res.arrayBuffer();
          files.push({ id, name: m.name, type: m.type || res.headers.get('Content-Type') || 'application/octet-stream', size: buf.byteLength, data: buf, createdAt: Date.now() });
        } catch (e) { if (e.offline) throw e; /* skip files deleted from Drive */ }
      }
      prog('Saving to this phone…');
      await WS.replaceAllData(data, files);
      SY.connected = true;
      SY.driveMap = data.driveMap || {};
      SY.pending = []; SY.tombstones = [];
      SY.syncedVersion = SY.dataVersion;
      SY.lastSync = Date.now();
      await saveSY();
      WS.closeSheet();
      WS.go({ tab: 'months', monthId: null, memberId: null, expenseId: null });
      WS.toast('Downloaded from Google Drive');
    } catch (e) {
      WS.closeSheet();
      WS.toast(e.offline ? 'Lost connection. Nothing on this phone was changed.' : 'Download failed: ' + e.message);
    }
  }

  /* ---------- Hooks from the app ---------- */
  WS.onChange = () => { SY.dataVersion++; saveSY(); paint(); schedule(); };
  WS.onFileAdded = (id) => { if (!SY.pending.includes(id)) SY.pending.push(id); saveSY(); schedule(); };
  WS.onFileDeleted = (id) => {
    const i = SY.pending.indexOf(id);
    if (i >= 0) SY.pending.splice(i, 1);
    else if (SY.driveMap[id]) SY.tombstones.push(SY.driveMap[id].driveId);
    delete SY.driveMap[id];
    saveSY();
  };
  WS.onRestored = async () => {
    // After restoring a backup file, upload a fresh copy if Drive is connected.
    if (!SY.connected) return;
    const keys = await WS.dbKeys('files');
    SY.pending = keys.filter((k) => !SY.driveMap[k]);
    SY.dataVersion++;
    await saveSY();
    schedule(500);
  };
  WS.syncPill = pill;
  WS.driveSection = driveSection;
  WS.syncConnected = () => SY.connected;

  Object.assign(WS.actions, {
    syncTap: () => {
      const p = pillInfo();
      if (SY.lastError) { WS.toast(SY.lastError); SY.lastError = null; }
      if (!getToken()) return startAuth('silent', 'sync');
      if (p && p.cls === 'ok') return WS.toast('Everything is uploaded');
      syncNow({ force: true });
    },
    syncNowBtn: () => (getToken() ? syncNow({ force: true }) : startAuth('silent', 'sync')),
    driveSetup: () => sheetDriveSetup(),
    copyField: (el) => {
      const inp = document.getElementById(el.dataset.id);
      inp.select();
      (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).then(() => WS.toast('Copied'), () => { document.execCommand('copy'); WS.toast('Copied'); });
    },
    driveConnect: async () => {
      const cid = document.getElementById('dClient').value.trim();
      if (!/\.apps\.googleusercontent\.com$/.test(cid)) return WS.toast('That doesn\'t look like a Google client ID. It should end in .apps.googleusercontent.com');
      WS.S.settings.googleClientId = cid;
      await WS.dbPut('kv', WS.S.settings);
      startAuth('consent', 'connect');
    },
    driveUseLocal: () => finishConnect(WS.getSheetCtx().remote, false),
    driveUseRemote: () => { if (confirm('Replace everything on this phone with the copy in Google Drive?')) finishConnect(WS.getSheetCtx().remote, true); },
    driveDownload: () => downloadAll(false),
    driveReupload: async () => {
      if (!confirm('Upload a fresh copy of all your data, photos and bills to Google Drive?')) return;
      SY.folders = { months: {} }; SY.driveMap = {}; SY.dataFileId = null; SY.tombstones = [];
      SY.pending = await WS.dbKeys('files'); SY.dataVersion++;
      await saveSY(); paint();
      getToken() ? syncNow({ force: true }) : startAuth('silent', 'sync');
    },
    driveDisconnect: async () => {
      if (!confirm('Disconnect Google Drive? Nothing is deleted from your Drive, and your data stays on this phone.')) return;
      const v = SY.dataVersion;
      SY = DEFAULT_SY(); SY.dataVersion = v;
      localStorage.removeItem(LS_TOKEN);
      await saveSY();
      WS.render(); WS.toast('Google Drive disconnected');
    },
  });

  /* ---------- Startup ---------- */
  WS.onStart = async () => {
    const saved = await WS.dbGet('kv', 'sync');
    SY = { ...DEFAULT_SY(), ...(saved || {}) };
    const r = handleRedirect();
    window.addEventListener('online', () => { offline = false; paint(); schedule(1500); });
    window.addEventListener('offline', () => { offline = true; paint(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(1500); });
    if (!r) { schedule(2500); return; }
    if (r.redirecting) return 'redirecting';
    if (r.error) { setTimeout(() => WS.toast(r.error), 300); return; }
    if (r.after === 'connect') setTimeout(connectAfterAuth, 200);
    else if (r.after === 'download') setTimeout(() => downloadAll(false), 200);
    else setTimeout(() => syncNow({ force: true }), 200);
  };
})();
