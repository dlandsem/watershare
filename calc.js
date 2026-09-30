/* WaterShare calculation engine.
   Pure functions: everything they need is passed in, nothing is read from the page.
   All volumes are handled internally in cubic feet (ft3). */

(function (root) {
  'use strict';

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const toFt3 = (v, unit) => (unit === 'ccf' ? v * 100 : v);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const money2 = (n) => '$' + n.toFixed(2);

  function sortedMonths(months) {
    return [...months].sort((a, b) => a.id.localeCompare(b.id));
  }

  /* Most recent reading for a member before the given month.
     Falls back to the member's starting reading from Setup. */
  function prevMemberReading(memberId, monthId, ctx) {
    const prior = sortedMonths(ctx.months).filter((m) => m.id < monthId).reverse();
    for (const m of prior) {
      const r = m.readings && m.readings[memberId];
      if (r && isNum(r.value)) {
        return { ft3: toFt3(r.value, r.unit), raw: r.value, unit: r.unit, date: r.date || null, monthId: m.id };
      }
    }
    const mem = ctx.members.find((x) => x.id === memberId);
    if (mem && isNum(mem.startReading)) {
      return { ft3: toFt3(mem.startReading, mem.meterUnit), raw: mem.startReading, unit: mem.meterUnit, date: null, monthId: null };
    }
    return null;
  }

  function prevUtilityReading(monthId, ctx) {
    const prior = sortedMonths(ctx.months).filter((m) => m.id < monthId).reverse();
    for (const m of prior) {
      const r = m.utility;
      if (r && isNum(r.value)) {
        return { ft3: toFt3(r.value, r.unit), raw: r.value, unit: r.unit, date: r.date || null, monthId: m.id };
      }
    }
    const s = ctx.settings || {};
    if (isNum(s.utilityStartReading)) {
      return { ft3: toFt3(s.utilityStartReading, s.utilityUnit), raw: s.utilityStartReading, unit: s.utilityUnit, date: null, monthId: null };
    }
    return null;
  }

  /* Usage for one reading record given its previous reading.
     status: ok | missing | noprev | negative */
  function usageFromReading(r, prev) {
    if (r && r.override && isNum(r.override.usage)) {
      return { usage: r.override.usage, prev, status: r.override.usage < 0 ? 'negative' : 'ok', overridden: true, replaced: false };
    }
    if (!r || !isNum(r.value)) return { usage: null, prev, status: 'missing' };
    if (!prev) return { usage: null, prev, status: 'noprev' };
    let usage;
    const replaced = !!(r.replaced && isNum(r.replaced.oldFinal) && isNum(r.replaced.newStart));
    if (replaced) {
      // Old meter: previous reading up to its final reading. New meter: starting reading up to today.
      usage = (toFt3(r.replaced.oldFinal, prev.unit) - prev.ft3) + (toFt3(r.value, r.unit) - toFt3(r.replaced.newStart, r.unit));
    } else {
      usage = toFt3(r.value, r.unit) - prev.ft3;
    }
    usage = Math.round(usage * 1000) / 1000;
    return { usage, prev, status: usage < 0 ? 'negative' : 'ok', overridden: false, replaced };
  }

  function memberUsage(month, memberId, ctx) {
    const r = month.readings && month.readings[memberId];
    return usageFromReading(r, prevMemberReading(memberId, month.id, ctx));
  }

  function utilityUsage(month, ctx) {
    return usageFromReading(month.utility, prevUtilityReading(month.id, ctx));
  }

  function checksumWarn(delta, pct, settings) {
    const type = (settings && settings.thresholdType) || 'pct';
    const val = settings && isNum(settings.thresholdValue) ? settings.thresholdValue : 5;
    if (type === 'ft3') return Math.abs(delta) > val;
    return pct == null ? Math.abs(delta) > 0 : Math.abs(pct) > val;
  }

  /* Periodic expense (like the annual power bill).
     The equal portion is split evenly; the usage portion is prorated by each
     member's total water usage across the chosen range of months. */
  function computeExpense(exp, ctx) {
    const months = sortedMonths(ctx.months).filter((m) => m.id >= exp.rangeStart && m.id <= exp.rangeEnd);
    const participants = (exp.participants || []).map((id) => {
      const member = ctx.members.find((m) => m.id === id) || { id, name: 'Unknown member' };
      let usage = 0; let counted = 0; const gaps = [];
      for (const m of months) {
        if (!(m.participants || []).includes(id)) continue;
        const u = memberUsage(m, id, ctx);
        if (u.usage != null && u.usage >= 0) { usage += u.usage; counted++; } else gaps.push(m.id);
      }
      return { id, member, usage: Math.round(usage * 1000) / 1000, counted, gaps };
    });
    const n = participants.length;
    const eq = isNum(exp.amountEqual) ? exp.amountEqual : 0;
    const us = isNum(exp.amountUsage) ? exp.amountUsage : 0;
    const totalUsage = sum(participants.map((p) => p.usage));
    const blockers = [];
    if (!n) blockers.push('No members are included in this bill.');
    if (!eq && !us) blockers.push('Enter an amount to split.');
    if (us && totalUsage <= 0 && n) blockers.push('No water usage is recorded for the included members in that range of months.');
    const warnings = participants.filter((p) => p.gaps.length).map((p) => `${p.member.name} is missing usage for ${p.gaps.length} month${p.gaps.length === 1 ? '' : 's'} in the range.`);
    let shares = null, totals = null;
    if (!blockers.length) {
      const feePct = isNum(exp.feePct) ? exp.feePct : 10;
      shares = participants.map((p) => {
        const frac = totalUsage > 0 ? p.usage / totalUsage : 0;
        const equal = r2(eq / n);
        const usageAmt = r2(us * frac);
        const subtotal = r2(equal + usageAmt);
        const isManager = p.id === exp.managerId;
        const fee = exp.feeApplies && !isManager ? r2((subtotal * feePct) / 100) : 0;
        return { id: p.id, member: p.member, usage: p.usage, frac, equal, usageAmt, subtotal, fee, total: r2(subtotal + fee), isManager };
      });
      const billTotal = r2(eq + us);
      const sharesTotal = r2(sum(shares.map((x) => x.subtotal)));
      const mgr = shares.find((x) => x.isManager);
      totals = {
        billTotal, sharesTotal, rounding: r2(sharesTotal - billTotal), feePct,
        fees: r2(sum(shares.map((x) => x.fee))),
        owedToManager: r2(sum(shares.filter((x) => !x.isManager).map((x) => x.total))),
        managerShare: mgr ? mgr.subtotal : null,
      };
    }
    return { participants, n, months: months.map((m) => m.id), totalUsage, blockers, warnings, shares, totals };
  }

  /* Full month calculation. */
  function computeMonth(month, ctx) {
    const participants = (month.participants || []).map((id) => {
      const member = ctx.members.find((m) => m.id === id) || { id, name: 'Unknown member' };
      return Object.assign({ id, member }, memberUsage(month, id, ctx));
    });
    const n = participants.length;
    const read = participants.filter((p) => p.usage != null);
    const allRead = n > 0 && read.length === n;
    const negatives = participants.filter((p) => p.status === 'negative');
    const noPrev = participants.filter((p) => p.status === 'noprev');
    const totalUsage = sum(read.map((p) => p.usage));

    // Checksum: private meters vs. the utility meter, both read by the manager on the same day.
    const util = utilityUsage(month, ctx);
    let checksum = null;
    if (util.usage != null && allRead) {
      const delta = util.usage - totalUsage;
      const pct = util.usage !== 0 ? (delta / util.usage) * 100 : null;
      checksum = { utilityUsage: util.usage, memberUsage: totalUsage, delta, pct, warn: checksumWarn(delta, pct, ctx.settings) };
    }

    const b = month.bill;
    const billReady = !!(b && isNum(b.baseFee) && isNum(b.usageFee));
    const blockers = [];
    if (n === 0) blockers.push('No members are included in this month.');
    if (!billReady) blockers.push('Enter the utility bill to calculate charges.');
    if (noPrev.length) blockers.push(noPrev.length === 1
      ? `${noPrev[0].member.name} has no previous reading. Add a starting reading in Setup.`
      : `${noPrev.length} members have no previous reading. Add starting readings in Setup.`);
    const missing = participants.filter((p) => p.status === 'missing');
    if (missing.length) blockers.push(`${missing.length} of ${n} readings still to enter.`);
    if (negatives.length) blockers.push(`Usage below zero for ${negatives.map((p) => p.member.name).join(', ')}. Check the reading, or record a meter replacement or override.`);

    let shares = null;
    let totals = null;
    if (!blockers.length) {
      const feePct = isNum(month.feePct) ? month.feePct : 10;
      const extrasDef = (b.extras || []).filter((x) => isNum(x.amount));
      shares = participants.map((p) => {
        const frac = totalUsage > 0 ? p.usage / totalUsage : 1 / n;
        const base = r2(b.baseFee / n);
        const usageAmt = r2(b.usageFee * frac);
        const extras = extrasDef.map((x) => ({
          id: x.id, name: x.name || 'Other charge', fee: !!x.fee, split: x.split,
          amount: r2(x.split === 'usage' ? x.amount * frac : x.amount / n),
        }));
        const isManager = p.id === month.managerId;
        const feeBase = base + usageAmt + sum(extras.filter((e) => e.fee).map((e) => e.amount));
        const fee = isManager ? 0 : r2((feeBase * feePct) / 100);
        const subtotal = r2(base + usageAmt + sum(extras.map((e) => e.amount)));
        const total = r2(subtotal + fee);
        return { id: p.id, member: p.member, usage: p.usage, frac, base, usageAmt, extras, fee, subtotal, total, isManager };
      });
      const billTotal = r2(b.baseFee + b.usageFee + sum(extrasDef.map((x) => x.amount)));
      const sharesTotal = r2(sum(shares.map((s) => s.subtotal)));
      const managerShare = shares.find((s) => s.isManager);
      totals = {
        billTotal,
        sharesTotal,
        rounding: r2(sharesTotal - billTotal),
        fees: r2(sum(shares.map((s) => s.fee))),
        owedToManager: r2(sum(shares.filter((s) => !s.isManager).map((s) => s.total))),
        managerShare: managerShare ? managerShare.subtotal : null,
        feePct,
        expensesTotal: 0,
      };
      shares.forEach((s) => { s.expenses = []; });
    }

    // Periodic expenses added to this month's statements.
    const attached = (ctx.expenses || []).filter((e) => e.billing === 'month' && e.monthId === month.id);
    const attachedNotes = [];
    if (shares) {
      for (const e of attached) {
        const ec = computeExpense(e, ctx);
        if (!ec.shares) { attachedNotes.push(`${e.name || 'Other bill'} can't be added yet: ${ec.blockers.join(' ')}`); continue; }
        for (const es of ec.shares) {
          const s = shares.find((x) => x.id === es.id);
          if (!s) { attachedNotes.push(`${es.member.name} isn't included this month, so their ${money2(es.total)} share of ${e.name || 'the other bill'} isn't on a statement.`); continue; }
          s.expenses.push({ id: e.id, name: e.name || 'Other bill', subtotal: es.subtotal, fee: es.fee, total: es.total });
          s.total = r2(s.total + es.total);
        }
        totals.expensesTotal = r2(totals.expensesTotal + ec.totals.billTotal);
      }
      totals.fees = r2(sum(shares.map((s) => s.fee + sum(s.expenses.map((e) => e.fee)))));
      totals.owedToManager = r2(sum(shares.filter((s) => !s.isManager).map((s) => s.total)));
      const ms = shares.find((s) => s.isManager);
      if (ms) totals.managerShare = r2(ms.subtotal + sum(ms.expenses.map((e) => e.subtotal)));
    }

    return { attached, attachedNotes, participants, n, readCount: read.length, allRead, totalUsage, util, checksum, billReady, blockers, shares, totals };
  }

  const api = { isNum, r2, toFt3, sortedMonths, prevMemberReading, prevUtilityReading, memberUsage, utilityUsage, usageFromReading, computeMonth, computeExpense, checksumWarn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
