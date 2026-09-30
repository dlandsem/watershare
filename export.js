/* WaterShare export: an Excel workbook of everything, optionally zipped with all photos and bills. */
(function () {
  'use strict';
  const WS = window.WS;
  const { isNum } = Calc;

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[data-lib="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; s.dataset.lib = src;
      s.onload = () => res(); s.onerror = () => rej(new Error('Couldn\'t load ' + src));
      document.head.appendChild(s);
    });
  }

  const MONEY = '$#,##0.00';
  const n2 = (v) => (isNum(v) ? Math.round(v * 100) / 100 : null);
  const n3 = (v) => (isNum(v) ? Math.round(v * 1000) / 1000 : null);
  const d = (s) => s || '';

  /* Build a sheet from a header row and data rows. moneyCols are zero-based column indexes. */
  function sheet(header, rows, widths, moneyCols = [], links = {}) {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = 1; r <= range.e.r; r++) {
      for (const c of moneyCols) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === 'n') cell.z = MONEY;
      }
      for (const [c, targets] of Object.entries(links)) {
        const t = targets[r - 1];
        const cell = ws[XLSX.utils.encode_cell({ r, c: Number(c) })];
        if (t && cell) cell.l = { Target: t };
      }
    }
    return ws;
  }

  /* Paths used inside the zip, matching the Google Drive folder layout. */
  function pathFor(rec) {
    const name = rec.name || rec.id;
    const kind = rec.kind || (/_utility-bill\./.test(name) ? 'bill' : 'meter');
    if (kind === 'bill') return `Utility bills/${name}`;
    if (kind === 'expense') return `Other bills/${name}`;
    const mid = rec.monthId || name.slice(0, 7);
    return /^\d{4}-\d{2}$/.test(mid) ? `Meter photos/${mid}/${name}` : `Meter photos/${name}`;
  }

  async function buildWorkbook(fileIndex, withLinks) {
    await loadScript('lib/xlsx.mini.min.js');
    const S = WS.S;
    const ctx = WS.ctx();
    const months = Calc.sortedMonths(S.months);
    const memberName = (id) => { const m = S.members.find((x) => x.id === id); return m ? m.name : 'Unknown'; };
    const fpath = (id) => (id && fileIndex[id] ? fileIndex[id] : '');
    const wb = XLSX.utils.book_new();

    // Summary by month
    const sumRows = months.map((m) => {
      const c = Calc.computeMonth(m, ctx);
      const b = m.bill || {};
      const extras = (b.extras || []).reduce((a, x) => a + (x.amount || 0), 0);
      const paidCount = c.shares ? c.shares.filter((s) => !s.isManager && m.payments && m.payments[s.id] && m.payments[s.id].paid).length : null;
      const owing = c.shares ? c.shares.filter((s) => !s.isManager).length : null;
      return [m.id, c.n, c.allRead ? n3(c.totalUsage) : null, n3(c.util.usage), c.checksum ? n3(c.checksum.delta) : null,
        c.checksum && c.checksum.pct != null ? n2(c.checksum.pct) : null,
        n2(b.baseFee), n2(b.usageFee), n2(extras), c.totals ? c.totals.billTotal : null, c.totals ? c.totals.expensesTotal : null,
        c.totals ? c.totals.fees : null, c.totals ? c.totals.owedToManager : null, paidCount == null ? '' : `${paidCount} of ${owing}`];
    });
    XLSX.utils.book_append_sheet(wb, sheet(
      ['Month', 'Members', 'Member usage (ft3)', 'Utility meter usage (ft3)', 'Difference (ft3)', 'Difference (%)', 'Base fee', 'Usage fee', 'Other charges', 'Utility bill total', 'Other bills added', 'Management fees', 'Owed to manager', 'Paid'],
      sumRows, [9, 9, 16, 20, 15, 13, 11, 11, 13, 15, 15, 15, 15, 10], [6, 7, 8, 9, 10, 11, 12]), 'Summary');

    // Readings
    const rdRows = [], rdLinks = [];
    for (const m of months) {
      const c = Calc.computeMonth(m, ctx);
      for (const p of c.participants) {
        const r = m.readings[p.id] || {};
        rdRows.push([m.id, p.member.name, d(r.date), isNum(r.value) ? r.value : null, r.unit ? (r.unit === 'ccf' ? 'CCF' : 'ft3') : '',
          p.prev ? n3(p.prev.raw) : null, n3(p.usage), r.replaced ? `Old meter final ${r.replaced.oldFinal}, new meter start ${r.replaced.newStart}` : '',
          r.override ? n3(r.override.usage) : null, r.override ? r.override.note : '', d(r.note), fpath(r.photoId)]);
        rdLinks.push(withLinks ? fpath(r.photoId) : '');
      }
      const u = m.utility || {};
      rdRows.push([m.id, 'Utility meter', d(u.date), isNum(u.value) ? u.value : null, u.unit ? (u.unit === 'ccf' ? 'CCF' : 'ft3') : '',
        c.util.prev ? n3(c.util.prev.raw) : null, n3(c.util.usage), u.replaced ? `Old meter final ${u.replaced.oldFinal}, new meter start ${u.replaced.newStart}` : '',
        u.override ? n3(u.override.usage) : null, u.override ? u.override.note : '', d(u.note), fpath(u.photoId)]);
      rdLinks.push(withLinks ? fpath(u.photoId) : '');
    }
    XLSX.utils.book_append_sheet(wb, sheet(
      ['Month', 'Meter', 'Date read', 'Reading', 'Unit', 'Previous reading', 'Usage (ft3)', 'Meter replaced', 'Usage override (ft3)', 'Override reason', 'Note', 'Photo'],
      rdRows, [9, 20, 11, 11, 6, 15, 11, 30, 18, 24, 24, 44], [], { 11: rdLinks }), 'Readings');

    // Member charges
    const chRows = [];
    for (const m of months) {
      const c = Calc.computeMonth(m, ctx);
      if (!c.shares) continue;
      for (const s of c.shares) {
        const pay = (m.payments || {})[s.id] || {};
        chRows.push([m.id, s.member.name, s.isManager ? 'Yes' : '', n3(s.usage), n2(s.frac * 100), s.base, s.usageAmt,
          n2(s.extras.reduce((a, e) => a + e.amount, 0)), n2(s.expenses.reduce((a, e) => a + e.total, 0)), s.fee, s.total,
          s.isManager ? '' : pay.paid ? 'Paid' : 'Unpaid', d(pay.date), d(pay.note)]);
      }
    }
    XLSX.utils.book_append_sheet(wb, sheet(
      ['Month', 'Member', 'Manager', 'Usage (ft3)', 'Share of usage (%)', 'Base fee share', 'Usage fee share', 'Other charges', 'Other bills', 'Management fee', 'Total', 'Payment', 'Date paid', 'Payment note'],
      chRows, [9, 20, 9, 11, 16, 14, 15, 13, 12, 15, 11, 9, 11, 24], [5, 6, 7, 8, 9, 10]), 'Charges');

    // Utility bills
    const blRows = [], blLinks = [];
    for (const m of months) {
      const b = m.bill;
      if (!b) continue;
      blRows.push([m.id, d(b.billDate), d(b.period), n2(b.baseFee), n2(b.usageFee), isNum(b.measured) ? b.measured : null, b.measuredUnit === 'ft3' ? 'ft3' : 'CCF',
        (b.extras || []).map((x) => `${x.name}: $${(x.amount || 0).toFixed(2)} (${x.split === 'usage' ? 'by usage' : 'equal'}${x.fee ? ', fee applies' : ''})`).join('; '), fpath(b.pdfId)]);
      blLinks.push(withLinks ? fpath(b.pdfId) : '');
    }
    XLSX.utils.book_append_sheet(wb, sheet(
      ['Month', 'Bill date', 'Service period', 'Base fee', 'Usage fee', 'Measured usage', 'Unit', 'Other charges', 'Bill file'],
      blRows, [9, 11, 20, 11, 11, 15, 6, 44, 40], [3, 4], { 8: blLinks }), 'Utility bills');

    // Other bills
    const exRows = [], exLinks = [];
    for (const e of [...(S.expenses || [])].sort((a, b) => (a.billDate || '').localeCompare(b.billDate || ''))) {
      const ec = Calc.computeExpense(e, ctx);
      const how = e.billing === 'month' ? `Added to ${e.monthId} statements` : 'Billed separately';
      if (!ec.shares) { exRows.push([e.name, d(e.billDate), `${e.rangeStart} to ${e.rangeEnd}`, how, '', null, null, null, null, null, null, '', '', '', fpath(e.pdfId)]); exLinks.push(withLinks ? fpath(e.pdfId) : ''); continue; }
      for (const s of ec.shares) {
        const pay = e.billing === 'separate' ? ((e.payments || {})[s.id] || {}) : {};
        exRows.push([e.name, d(e.billDate), `${e.rangeStart} to ${e.rangeEnd}`, how, s.member.name, n3(s.usage), n2(s.frac * 100), s.equal, s.usageAmt, s.fee, s.total,
          s.isManager || e.billing !== 'separate' ? '' : pay.paid ? 'Paid' : 'Unpaid', d(pay.date), d(pay.note), fpath(e.pdfId)]);
        exLinks.push(withLinks ? fpath(e.pdfId) : '');
      }
    }
    XLSX.utils.book_append_sheet(wb, sheet(
      ['Bill', 'Bill date', 'Usage range', 'How billed', 'Member', 'Usage in range (ft3)', 'Share of usage (%)', 'Equal share', 'Usage share', 'Management fee', 'Total', 'Payment', 'Date paid', 'Payment note', 'Bill file'],
      exRows, [18, 11, 20, 24, 20, 18, 16, 12, 12, 15, 11, 9, 11, 22, 40], [7, 8, 9, 10], { 14: exLinks }), 'Other bills');

    // Members
    const mbRows = [...S.members].sort((a, b) => a.name.localeCompare(b.name)).map((m) => [m.name, d(m.location), d(m.phone), d(m.email),
      m.meterUnit === 'ccf' ? 'CCF' : 'ft3', d(m.meterId), isNum(m.startReading) ? m.startReading : null,
      m.status === 'active' ? 'Active' : m.status === 'inactive' ? 'Inactive' : 'Removed', m.isManager ? 'Yes' : '', d(m.notes)]);
    XLSX.utils.book_append_sheet(wb, sheet(['Member', 'Location', 'Phone', 'Email', 'Meter unit', 'Meter ID', 'Starting reading', 'Status', 'Manager', 'Notes'],
      mbRows, [22, 16, 14, 24, 10, 14, 15, 9, 9, 30]), 'Members');

    // Settings
    const st = S.settings;
    XLSX.utils.book_append_sheet(wb, sheet(['Setting', 'Value'], [
      ['System name', st.systemName || ''], ['Management fee for new months (%)', st.feePct],
      ['Checksum warning', st.thresholdType === 'ft3' ? `${st.thresholdValue} ft3` : `${st.thresholdValue}%`],
      ['Utility meter unit', st.utilityUnit === 'ccf' ? 'CCF' : 'ft3'], ['Utility meter starting reading', isNum(st.utilityStartReading) ? st.utilityStartReading : ''],
      ['Payment instructions', st.statementFooter || ''], ['Exported', new Date().toLocaleString('en-US')],
    ], [34, 50]), 'Settings');

    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  async function makeExport(withFiles) {
    const stamp = WS.today();
    const recs = withFiles ? await WS.dbAll('files') : (await WS.dbAll('files')).map((f) => ({ id: f.id, name: f.name, kind: f.kind, monthId: f.monthId }));
    const index = {};
    const used = new Set();
    for (const r of recs) {
      let p = pathFor(r);
      if (used.has(p)) p = p.replace(/(\.[^.]+)?$/, (ext) => `_${r.id.slice(-4)}${ext || ''}`);
      used.add(p); index[r.id] = p;
    }
    const xlsx = await buildWorkbook(index, withFiles);
    const xlsxBlob = new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (!withFiles) return { blob: xlsxBlob, name: `WaterShare-${stamp}.xlsx`, type: xlsxBlob.type };
    await loadScript('lib/jszip.min.js');
    const zip = new JSZip();
    zip.file('WaterShare.xlsx', xlsxBlob);
    zip.file('Read me.txt', `WaterShare export, ${new Date().toLocaleString('en-US')}\r\n\r\nWaterShare.xlsx has every month's readings, charges, bills and payments.\r\nThe Photo and Bill file columns link to the files in these folders:\r\n  Meter photos (one folder per month)\r\n  Utility bills\r\n  Other bills\r\n\r\nTo keep using the app, a new manager can restore a WaterShare backup file instead.\r\n`);
    for (const r of recs) zip.file(index[r.id], r.data);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    return { blob, name: `WaterShare-export-${stamp}.zip`, type: 'application/zip' };
  }

  function sheetExport() {
    WS.openSheet('Export to Excel', `
      <p class="note-text">The workbook has a sheet each for the monthly summary, readings, member charges, utility bills, other bills and members.</p>
      <div class="btn-row"><button class="btn" data-act="exportRun" data-id="xlsx">Excel workbook only</button></div>
      <div class="btn-row"><button class="btn quiet" data-act="exportRun" data-id="zip">Excel plus all photos and bills</button></div>
      <p class="note-text">The second option makes a .zip file with the workbook and every photo and bill in folders, with links from the workbook to each file. It's the full record to hand to a future manager.</p>`);
  }

  Object.assign(WS.actions, {
    exportData: () => sheetExport(),
    exportRun: async (el) => {
      const withFiles = el.dataset.id === 'zip';
      WS.openSheet('Export to Excel', '<p class="note-text">Preparing your export…</p>');
      try {
        const out = await makeExport(withFiles);
        WS.setSheetCtx({ exportOut: out });
        WS.openSheet('Export ready', `<p class="note-text">${WS.esc(out.name)}, ${(out.blob.size / 1048576).toFixed(1)} MB.</p>
          <p class="note-text">Choose Save to Files, or pick Google Drive, OneDrive, Mail or Messages from the share options.</p>
          <button class="btn block" data-act="exportShare">Save or share the export</button>`);
        WS.setSheetCtx({ exportOut: out });
      } catch (e) {
        WS.closeSheet();
        WS.toast('Export failed: ' + e.message);
      }
    },
    exportShare: async () => {
      const out = WS.getSheetCtx().exportOut;
      const ok = await WS.shareBlob(out.blob, out.name, out.type);
      if (ok) { WS.closeSheet(); WS.toast('Export saved'); }
    },
  });
  WS.makeExport = makeExport;
})();
