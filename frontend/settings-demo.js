// -----------------------------------------------------------------------------
// DEV DEMO DATA — the work rules, the payroll months, the public holidays and
// the Settings history (DB 0131 / 0132). NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=1 to the URL:
//     settings.html?demo=1                      the Super Administrator's view (close + the 24 h undo)
//     settings.html?demo=1&role=admin           the Administrator's view (close, no undo)
//     attendance.html?demo=1&view=month&month=2026-11
//                                               the invented crew priced by the clock rule: the
//                                               After-Hours Not Counted chip, the notes, the Excel column
//     attendance.html?demo=1&view=month&month=2026-10
//                                               the same crew under the old rule, October closed for HF-BP
//     exceptions.html?demo=1                    the day-start and long-shift words from the rule
//
// Until 0131 and 0132 are applied, the Settings reads do not exist on the
// database and the pages fall back to generic words. This file answers them
// with the four rule rows 0131 seeds (today's rule from 2000, the clock rule
// from 1 Nov 2026, per company, the 1.5x rates), one closed month (closed two
// hours ago, so the 24-hour undo is still open), one open month with two days
// still without a figure (the Settings page greys its Close Month as "2 Unpriced",
// the reason on hover; settle the two on the Exceptions demo and the close goes through — the note
// travels in sessionStorage, this tab only), the 2026 Penang holidays 0103
// seeds and a short history, and keeps every write in this page's memory with
// the database's own refusal codes and words. A reload brings everything back.
//
// IT WRITES NOTHING. No database call of its own is made while this is on; the
// real Dash.* functions are shadowed for this page load only. Sign-in stays
// real (the page still needs a login); settings.manage, payroll.close and (not
// for role=admin) payroll.reopen are added to the signed-in account's
// permission list for this page load so the page opens before the live
// profiles carry them.
//
// On attendance.html this file runs AFTER attendance-demo.js and re-prices the
// invented crew's days that fall under the clock rule, because fakeServerPrice
// there knows only the old total rule. The arithmetic below is the demo's
// stand-in for fn_day_minutes (0131) — it is NOT a second copy of the rule for
// the app: nothing outside ?demo=1 can reach it.
//
// TO REMOVE BEFORE THE PILOT: delete this file and its <script> tags in
// settings.html, attendance.html and exceptions.html.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("demo") !== "1") return;                        // self-gate
  var ROLE = params.get("role");                                 // "admin" | "super" | null = the real profile
  var ME = "You (demo)";
  var HOUR = 3600000;
  function todayIso() { return Dash.todayKL(); }
  function tomorrowIso() { var d = new Date(todayIso() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  function monthWord(iso) {
    return new Date(String(iso).slice(0, 7) + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  function dayWord(iso) {
    return new Date(String(iso).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }

  // ---- the rule rows, as 0131 (+ 0132's rates) seeds them -------------------
  function rule(id, code, from, mode, start, end, rest, grace, round, note) {
    return { rule_id: id, company_code: code, effective_from: from, mode: mode, day_start: start, day_end: end,
             normal_minutes: 450, rest_minutes: rest, rest_gate_minutes: 360, grace_minutes: grace, round_minutes: round,
             overlong_hours: 20, question_hours: 16, note: note, created_at: "2026-11-07T04:00:00Z", created_by: null, created_by_name: null,
             ot_rate: 1.5, rest_day_rate: 1.5, holiday_rate: 1.5 };   // created_by_name null = a migration wrote it (the page says System)
  }
  var OLD_NOTE = "The rule as live until 31 Oct 2026 (0103 … 0130): credited from 08:00, {rest} rest, OT beyond 7.5 h by the total, to the minute, Overlong over 20 h";
  var NEW_NOTE = "Chapter 2 (owner, 3 and 7 Nov 2026): 08:30-17:00 window, 10 min grace at the start only, 1 h rest, overtime only from a shift punched in at or after 17:00 (a start before 06:00 counts as overtime by itself), half-hour round-down per day, Overlong over 20 h; a man not paid overtime keeps his evening as normal hours";
  var RULES = [
    rule("demo-rule-1", "HF-BP",  "2000-01-01", "total", "08:00:00", "17:00:00", 90, 0,  1,  OLD_NOTE.replace("{rest}", "1.5 h")),
    rule("demo-rule-2", "Hai Fu", "2000-01-01", "total", "08:00:00", "17:00:00", 60, 0,  1,  OLD_NOTE.replace("{rest}", "1 h")),
    rule("demo-rule-3", "HF-BP",  "2026-11-01", "clock", "08:30:00", "17:00:00", 60, 10, 30, NEW_NOTE),
    rule("demo-rule-4", "Hai Fu", "2026-11-01", "clock", "08:30:00", "17:00:00", 60, 10, 30, NEW_NOTE)
  ];
  var nextRuleId = 5;

  // ---- the payroll months, as get_payroll_periods (0132) returns them --------
  // HF-BP's October was closed two hours ago (the 24-hour undo is still open);
  // Hai Fu's is open with two days still without a figure (UNPRICED below), so
  // its ⋮ menu greys Close Month as "2 Unpriced" (the reason on hover); the
  // Exceptions demo lists the two days for October — settled there (this tab),
  // they drop off here and the close goes through
  var closedAgo = new Date(Date.now() - 2 * HOUR).toISOString();
  var PERIODS = [
    { company_code: "HF-BP", period_month: "2026-10-01", status: "closed", closed_at: closedAgo, closed_by_name: "Nick Fury (demo)",
      reopened_at: null, reopened_by_name: null, note: "October done", days: 131, working_minutes: 58950, ot_minutes: 7230,
      reopen_until: new Date(Date.parse(closedAgo) + 24 * HOUR).toISOString() }
  ];
  // the two Hai Fu October days without a figure, as get_unpriced_days returns
  // them — the same two exceptions-demo.js lists for October; SETTLED_KEY is the
  // sessionStorage note the Exceptions demo writes when one is settled there
  var SETTLED_KEY = "hf-demo-settled";
  var UNPRICED = [
    { staff_id: "demo-hulk", employee_code: "HS-D04", full_name: "Hulk (demo)", company_code: "Hai Fu", work_date: "2026-10-14", why: "missed" },
    { staff_id: "demo-hulk", employee_code: "HS-D04", full_name: "Hulk (demo)", company_code: "Hai Fu", work_date: "2026-10-21", why: "overlong" },
    { staff_id: "demo-hulk", employee_code: "HS-D04", full_name: "Hulk (demo)", company_code: "Hai Fu", work_date: "2026-10-21", why: "pending_request" }   // his Change Times ask on the 21st (review issue 2)
  ];
  function settled() { try { return JSON.parse(sessionStorage.getItem(SETTLED_KEY) || "[]"); } catch (e) { return []; } }
  function unpricedRows(from, to) {
    var done = settled();
    return UNPRICED.filter(function (u) { return (!from || u.work_date >= from) && (!to || u.work_date <= to) && done.indexOf(u.staff_id + "|" + u.work_date) < 0; });
  }

  // ---- the public holidays, as 0103 seeds them for 2026 (+ the coming New Year)
  var HOLIDAYS = [
    ["2026-01-01", "New Year's Day", false], ["2026-02-01", "Thaipusam", false], ["2026-02-02", "Thaipusam (in lieu)", true],
    ["2026-02-17", "Chinese New Year", false], ["2026-02-18", "Chinese New Year (second day)", false], ["2026-03-07", "Nuzul Al-Quran", false],
    ["2026-03-21", "Hari Raya Aidilfitri", false], ["2026-03-22", "Hari Raya Aidilfitri (second day)", false], ["2026-03-23", "Hari Raya Aidilfitri (in lieu)", true],
    ["2026-05-01", "Labour Day", false], ["2026-05-27", "Hari Raya Haji", false], ["2026-05-31", "Wesak Day", false],
    ["2026-06-01", "Birthday of the Yang di-Pertuan Agong", false], ["2026-06-17", "Awal Muharram", false],
    ["2026-07-07", "George Town World Heritage City Day", false], ["2026-07-11", "Birthday of the Governor of Penang", false],
    ["2026-08-25", "Prophet Muhammad's Birthday", false], ["2026-08-31", "National Day", false], ["2026-09-16", "Malaysia Day", false],
    ["2026-11-08", "Deepavali", false], ["2026-11-09", "Deepavali (in lieu)", true], ["2026-12-25", "Christmas Day", false],
    ["2027-01-01", "New Year's Day", false]
  ].map(function (h) { return { holiday_date: h[0], name: h[1], calendar: "Penang", in_lieu: h[2], added_at: "2026-09-23T02:00:00Z" }; });

  // ---- the history, as get_settings_history (0132) returns it ----------------
  var HISTORY = [
    { occurred_at: closedAgo, actor_label: "Nick Fury (demo)", action: "payroll_month_closed", company_code: "HF-BP", on_date: "2026-10-01", detail: "October done", summary: "Closed October 2026 for HF-BP: 131 days, 982.5 h normal, 120.5 h overtime — October done" },
    { occurred_at: "2026-11-07T04:00:00Z", actor_label: "Migration 0131", action: "work_rule_set", company_code: "Hai Fu", on_date: "2026-11-01", detail: NEW_NOTE, summary: "New work rule for Hai Fu from 1 Nov 2026: clock, 08:30-17:00, rest 60 min, grace 10 min, round 30 min, line 20 h, question 16 h, rates 1.5x / 1.5x / 1.5x" },
    { occurred_at: "2026-11-07T04:00:00Z", actor_label: "Migration 0131", action: "work_rule_set", company_code: "HF-BP", on_date: "2026-11-01", detail: NEW_NOTE, summary: "New work rule for HF-BP from 1 Nov 2026: clock, 08:30-17:00, rest 60 min, grace 10 min, round 30 min, line 20 h, question 16 h, rates 1.5x / 1.5x / 1.5x" }
  ];
  function remember(action, summary, company, onDate, detail) {
    HISTORY.unshift({ occurred_at: new Date().toISOString(), actor_label: ME, action: action, company_code: company || null, on_date: onDate || null, detail: detail || null, summary: summary });
  }

  // ---- the signed-in account: the page's permissions for this page load ------
  var realAccess = Dash.getMyAccess;
  Dash.getMyAccess = async function () {
    var v = await realAccess.apply(this, arguments);
    if (v && v.ok && v.access) {
      v.access.permissions = v.access.permissions || [];
      ["settings.manage", "payroll.close"].concat(ROLE === "admin" ? [] : ["payroll.reopen"]).forEach(function (code) {
        if (v.access.permissions.indexOf(code) < 0) v.access.permissions.push(code);
      });
      if (ROLE === "admin") { v.access.access_profile_code = "admin"; v.access.permissions = v.access.permissions.filter(function (c) { return c !== "payroll.reopen"; }); }
      if (ROLE === "super") v.access.access_profile_code = "super_admin";
    }
    return v;
  };

  // ---- the reads ---------------------------------------------------------------
  Dash.getWorkRules = async function () { return RULES.slice(); };
  Dash.getPayrollPeriods = async function () { return PERIODS.slice(); };
  Dash.getPublicHolidays = async function (fromIso) {
    var y = String(fromIso || todayIso()).slice(0, 4) + "-01-01";
    return HOLIDAYS.filter(function (h) { return h.holiday_date >= y; }).slice();
  };
  Dash.getSettingsHistory = async function (limit) { return HISTORY.slice(0, limit || 100); };
  if (location.pathname.split("/").pop() === "settings.html") {     // on the Exceptions page exceptions-demo.js answers this itself
    Dash.getUnpricedDays = async function (from, to) { return unpricedRows(from, to); };
  }

  // ---- the writes, in memory, refused as 0132 refuses them ------------------
  function firstOfThisMonth() { return todayIso().slice(0, 7) + "-01"; }
  function periodOf(code, month) {
    return PERIODS.filter(function (p) { return p.company_code === code && p.period_month === month; })[0] || null;
  }
  Dash.closePayrollMonth = async function (code, month, note) {
    if (!/^\d{4}-\d{2}-01$/.test(String(month))) return { ok: false, code: "bad_month", message: "Pick a month." };
    if (month >= firstOfThisMonth()) return { ok: false, code: "month_not_over", message: monthWord(month) + " is not over yet." };
    var p = periodOf(code, month);
    if (p && p.status === "closed") return { ok: false, code: "already_closed", message: monthWord(month) + " is already closed." };
    var rows = unpricedRows(month, month.slice(0, 8) + "31").filter(function (u) { return u.company_code === code; });   // the database's own checks, should the menu be stale
    var seen = {}, un = 0, pend = 0;
    rows.forEach(function (u) { if (u.why === "pending_request") { pend++; return; } var k = u.staff_id + "|" + u.work_date; if (!seen[k]) { seen[k] = true; un++; } });
    if (un) return { ok: false, code: "unpriced_days", days: un, message: un + (un === 1 ? " day" : " days") + " in " + monthWord(month) + (un === 1 ? " has" : " have") + " no figure. Settle them on the Exceptions page, then close." };
    if (pend) return { ok: false, code: "pending_requests", requests: pend, message: pend + (pend === 1 ? " request" : " requests") + " for " + monthWord(month) + " still waiting. Approve or reject " + (pend === 1 ? "it" : "them") + " on the Requests page, then close." };
    var now = new Date().toISOString();
    var figures = { days: 44, working_minutes: 19800, ot_minutes: 2610 };
    var row = Object.assign({ status: "closed", closed_at: now, closed_by_name: ME, note: note || null, reopen_until: new Date(Date.now() + 24 * HOUR).toISOString() }, figures);
    if (p) Object.assign(p, row);
    else PERIODS.push(Object.assign({ company_code: code, period_month: month, reopened_at: null, reopened_by_name: null }, row));
    remember("payroll_month_closed", "Closed " + monthWord(month) + " for " + code + ": 44 days, 330 h normal, 43.5 h overtime" + (note ? " — " + note : ""), code, month, note || null);
    return Object.assign({ ok: true, period_id: "demo-period" }, figures);
  };
  Dash.reopenPayrollMonth = async function (code, month, reason) {
    var acc = await Dash.getMyAccess();
    if (!(acc && acc.ok && acc.access && acc.access.permissions.indexOf("payroll.reopen") >= 0)) {
      return { ok: false, code: "no_permission", message: "Only a Super Administrator can reopen a closed month." };
    }
    if (String(reason || "").trim().length < 3) return { ok: false, code: "reason_required", message: "Say why the month is reopened." };
    var p = periodOf(code, month);
    if (!p || p.status !== "closed") return { ok: false, code: "not_closed", message: monthWord(month) + " is not closed." };
    if (Date.parse(p.closed_at) < Date.now() - 24 * HOUR) {
      return { ok: false, code: "undo_window_passed", message: monthWord(month) + " was closed on " + dayWord(p.closed_at) + ", more than 24 hours ago; it stays closed. A correction is paid as an adjustment in the next month." };
    }
    Object.assign(p, { status: "open", reopened_at: new Date().toISOString(), reopened_by_name: ME, note: String(reason).trim(), reopen_until: null });
    remember("payroll_month_reopened", "Reopened " + monthWord(month) + " for " + code + " — " + String(reason).trim(), code, month, String(reason).trim());
    return { ok: true };
  };
  Dash.setWorkRule = async function (r) {
    var today = todayIso();
    if (["HF-BP", "Hai Fu"].indexOf(r.company_code) < 0) return { ok: false, code: "unknown_company", message: "No such company." };
    if (!r.effective_from || r.effective_from <= today) {
      return { ok: false, code: "bad_date", message: "A rule starts tomorrow or later; days already punched are never re-priced." };
    }
    if (r.mode !== "total" && r.mode !== "clock") return { ok: false, code: "bad_mode", message: "The rule is by the total or by the clock." };
    if (!r.day_start || !r.day_end || r.day_end <= r.day_start) return { ok: false, code: "bad_window", message: "The day must end after it starts." };
    if (!(r.rest_minutes >= 0 && r.rest_minutes <= 600) || !(r.grace_minutes >= 0 && r.grace_minutes <= 120) ||
        [1, 5, 10, 15, 30, 60].indexOf(Number(r.round_minutes)) < 0 || !(r.overlong_hours >= 8 && r.overlong_hours <= 72) ||
        !(r.question_hours >= 1 && r.question_hours <= 72) || !(r.normal_minutes >= 1 && r.normal_minutes <= 1440) ||
        !(r.rest_gate_minutes >= 0 && r.rest_gate_minutes <= 1440)) {
      return { ok: false, code: "bad_minutes", message: "Check the figures: rest 0-600 min, grace 0-120 min, rounding 1/5/10/15/30/60 min, the long-shift line 8-72 h, the question line 1-72 h." };
    }
    var rates = [r.ot_rate, r.rest_day_rate, r.holiday_rate].map(function (x) { return x === undefined || x === null ? 1.5 : Number(x); });
    if (rates.some(function (x) { return !(x >= 1 && x <= 5); })) return { ok: false, code: "bad_rate", message: "Check the rates: each between 1.0x and 5.0x." };
    // by the clock the day's length follows the window; by the total it is given
    var mins = function (t) { var p = String(t).split(":"); return Number(p[0]) * 60 + Number(p[1]); };
    var normal = r.mode === "clock" ? mins(r.day_end) - mins(r.day_start) - Number(r.rest_minutes) : Number(r.normal_minutes);
    if (normal < 1) return { ok: false, code: "bad_window", message: "The window is shorter than the rest." };
    var same = RULES.filter(function (x) { return x.company_code === r.company_code && x.effective_from === r.effective_from; })[0];
    var row = same || { rule_id: "demo-rule-" + (nextRuleId++), company_code: r.company_code, effective_from: r.effective_from };
    Object.assign(row, { mode: r.mode, day_start: r.day_start + ":00", day_end: r.day_end + ":00", normal_minutes: normal,
                         rest_minutes: Number(r.rest_minutes), rest_gate_minutes: Number(r.rest_gate_minutes), grace_minutes: Number(r.grace_minutes),
                         round_minutes: Number(r.round_minutes), overlong_hours: Number(r.overlong_hours), question_hours: Number(r.question_hours),
                         note: String(r.note || "").trim() || null, created_at: new Date().toISOString(), created_by: null, created_by_name: ME,
                         ot_rate: rates[0], rest_day_rate: rates[1], holiday_rate: rates[2] });
    if (!same) RULES.push(row);                                   // a future row may be rewritten until its day comes
    remember("work_rule_set", (same ? "Future work rule rewritten for " : "New work rule for ") + r.company_code + " from " + dayWord(r.effective_from) + ": " + r.mode + ", " + r.day_start + "-" + r.day_end +
             ", rest " + r.rest_minutes + " min, grace " + r.grace_minutes + " min, round " + r.round_minutes + " min, line " + r.overlong_hours + " h, question " + r.question_hours + " h, rates " + rates.join("x / ") + "x" + (row.note ? " — " + row.note : ""),
             r.company_code, r.effective_from, row.note);
    return { ok: true, rule_id: row.rule_id, normal_minutes: normal };
  };
  Dash.deleteWorkRule = async function (ruleId) {
    var row = RULES.filter(function (x) { return x.rule_id === ruleId; })[0];
    if (!row) return { ok: false, code: "not_found" };
    if (row.effective_from <= todayIso()) return { ok: false, code: "rule_in_force", message: "That rule is in force or past; it stays on record." };
    RULES.splice(RULES.indexOf(row), 1);
    remember("work_rule_deleted", "Future work rule for " + row.company_code + " from " + dayWord(row.effective_from) + " withdrawn", row.company_code, row.effective_from, row.note);
    return { ok: true };
  };
  Dash.addPublicHoliday = async function (dateIso, name, inLieu) {
    var nm = String(name || "").trim();
    if (!dateIso || dateIso <= todayIso()) return { ok: false, code: "bad_date", message: "A holiday is added for a coming day; days already punched are never re-priced." };
    if (!nm || nm.length > 120) return { ok: false, code: "bad_name", message: "Give the holiday a name (up to 120 characters)." };
    if (HOLIDAYS.some(function (h) { return h.holiday_date === dateIso; })) return { ok: false, code: "exists", message: dayWord(dateIso) + " is already a holiday." };
    HOLIDAYS.push({ holiday_date: dateIso, name: nm, calendar: "Penang", in_lieu: !!inLieu, added_at: new Date().toISOString() });
    remember("public_holiday_added", "Public holiday added: " + dayWord(dateIso) + " " + nm + (inLieu ? " (in lieu)" : ""), null, dateIso, nm);
    return { ok: true, holiday_date: dateIso };
  };
  Dash.deletePublicHoliday = async function (dateIso) {
    var h = HOLIDAYS.filter(function (x) { return x.holiday_date === dateIso; })[0];
    if (!h) return { ok: false, code: "not_found" };
    if (dateIso <= todayIso()) return { ok: false, code: "in_the_past", message: "That holiday has passed; it stays on record." };
    HOLIDAYS.splice(HOLIDAYS.indexOf(h), 1);
    remember("public_holiday_removed", "Public holiday removed: " + dayWord(dateIso) + " " + h.name, null, dateIso, h.name);
    return { ok: true };
  };

  // ---- attendance.html: the invented crew under the clock rule --------------
  // attendance-demo.js prices every day by the old total rule. For a day whose
  // rule in force is the clock rule, re-price from the day's shifts the way
  // fn_day_minutes (0131) would, so the figures and the After-Hours Not Counted
  // chip match the rule the page describes. Captain America has learned the
  // habit — out at 5, in again at 5:30 for overtime — so his evenings read as
  // overtime while the rest of the crew's read as not counted.
  var HABIT = "Captain America (demo)";
  var OUT_AT_FIVE = 17 * 60, IN_AGAIN = 17 * 60 + 30;
  function habitSplits(a, b) { return a < OUT_AT_FIVE && b > IN_AGAIN + 20; }   // a day shift that runs well past 5 PM
  function minutesOfDay(ts, iso) {                               // a stamp back to minutes of the work day (past 1440 = next day)
    return Math.round((new Date(ts) - new Date(iso + "T00:00:00+08:00")) / 60000);
  }
  function stampOf(iso, mins) {
    return new Date(Date.parse(iso + "T00:00:00+08:00") + mins * 60000).toISOString();
  }
  function roundDown(m, to) { return to > 1 ? Math.floor(m / to) * to : m; }
  function clockPrice(spans, u, otEligible) {
    var ds = Number(String(u.day_start).slice(0, 2)) * 60 + Number(String(u.day_start).slice(3, 5));
    var de = Number(String(u.day_end).slice(0, 2)) * 60 + Number(String(u.day_end).slice(3, 5));
    var grace = Number(u.grace_minutes) || 0;
    var normal = 0, ot = 0, unc = 0, otFlags = [];
    for (var i = 0; i < spans.length; i++) {
      var a = spans[i][0], b = spans[i][1];
      if (b === null) return null;                              // an open shift = the day unpriced
      if (a >= de) { ot += b - a; otFlags.push(true); continue; }   // punched in at or after the day's end: an overtime shift whole
      otFlags.push(false);
      if (a < 6 * 60) ot += Math.min(b, ds) - a;                // a night call-out: the minutes before the window are overtime by themselves
      var from = a <= ds + grace ? ds : a;                      // within the grace: counts from the day's start; never before it
      normal += Math.max(0, Math.min(b, de) - from);
      if (b > de) { if (otEligible) unc += b - de; else normal += b - de; }   // the overrun earns nothing (or stays normal for a man not paid overtime)
    }
    if (normal > Number(u.rest_gate_minutes)) normal -= Number(u.rest_minutes);   // the rest comes off once past the gate
    var to = Number(u.round_minutes) || 1;
    return { working: roundDown(Math.max(0, normal), to), ot: roundDown(ot, to), uncounted: unc, otFlags: otFlags };
  }
  function reprice(row) {
    var u = Dash.ruleFor(RULES, row.company_code, row.work_date);
    if (!u || !row.shifts) return row;
    if (u.mode !== "clock") { if (row.uncounted_minutes === undefined) row.uncounted_minutes = row.working_minutes === null ? null : 0; return row; }
    var iso = row.work_date;
    // the habit: a day shift that runs past 5 PM is cut at 5 and resumed at 5:30
    if (row.full_name === HABIT && row.shifts.length === 1 && row.shifts[0].out_at && !row.shifts[0].removed) {
      var s = row.shifts[0], a = minutesOfDay(s.raw_in_at, iso), b = minutesOfDay(s.raw_out_at, iso);
      if (habitSplits(a, b)) {
        var cut = stampOf(iso, OUT_AT_FIVE), again = stampOf(iso, IN_AGAIN), end = stampOf(iso, b);
        s.out_at = s.raw_out_at = cut; s._span = [a / 60, OUT_AT_FIVE / 60];
        row.shifts.push({ shift_no: 2, in_at: again, out_at: end, raw_in_at: again, raw_out_at: end, corrected: false, missed: false,
                          entered_by_office: false, removed: false, removed_reason: null, removed_by_name: null, removed_at: null, _span: [IN_AGAIN / 60, b / 60] });
        row.shift_count = 2; row.in_count = row.out_count = 2; row.last_out_at = end;
      }
    }
    var live = row.shifts.filter(function (x) { return !x.removed; });
    live.forEach(function (x) { x.ot_shift = false; });
    if (row.working_minutes === null || row.all_removed || !live.length) { row.uncounted_minutes = row.all_removed ? 0 : null; return row; }
    var spans = live.map(function (x) { return [minutesOfDay(x.raw_in_at, iso), x.raw_out_at ? minutesOfDay(x.raw_out_at, iso) : null]; });
    var p = clockPrice(spans, u, true);
    if (!p) { row.working_minutes = null; row.ot_minutes = null; row.uncounted_minutes = null; return row; }
    row.working_minutes = p.working; row.ot_minutes = p.ot; row.uncounted_minutes = p.uncounted;
    live.forEach(function (x, k) { x.ot_shift = p.otFlags[k]; });
    return row;
  }
  function wrapRows(name) {
    var real = Dash[name];
    if (typeof real !== "function") return;
    Dash[name] = async function () {
      var rows = await real.apply(this, arguments);
      return Array.isArray(rows) ? rows.map(reprice) : rows;
    };
  }
  wrapRows("getShifts");
  wrapRows("getShiftsRange");
  // the habit's two extra taps, so the day's punch list matches its shifts
  if (typeof Dash.getRecentPunches === "function") {
    var realPunches = Dash.getRecentPunches;
    Dash.getRecentPunches = async function (date, projectId) {
      var out = await realPunches.apply(this, arguments);
      if (!Array.isArray(out)) return out;
      var u = Dash.ruleFor(RULES, "HF-BP", date);
      if (!u || u.mode !== "clock") return out;
      var mine = out.filter(function (p) { return p.full_name === HABIT; });
      if (mine.length !== 2) return out;                         // one in, one out: the day the split applies to
      var tapIn = mine.filter(function (p) { return p.punch_type === "in"; })[0];
      var tapOut = mine.filter(function (p) { return p.punch_type === "out"; })[0];
      if (!tapIn || !tapOut || !habitSplits(minutesOfDay(tapIn.punched_at, date), minutesOfDay(tapOut.punched_at, date))) return out;
      var base = tapIn;
      [["out", OUT_AT_FIVE], ["in", IN_AGAIN]].forEach(function (k) {
        out.push(Object.assign({}, base, { punch_type: k[0], punched_at: stampOf(date, k[1]), punched_by: "worker", synced_late: false, wrong_site: false,
                                           distance_m: 18, verification_status: "verified" }));
      });
      return out.sort(function (a, b) { return a.punched_at < b.punched_at ? 1 : -1; });
    };
  }

  // ---- a banner, so nobody mistakes this screen for the real one -------------
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main");
    if (!main) return;
    var page = location.pathname.split("/").pop();
    var existing = main.querySelector(".banner.banner-amber");
    if (existing) {                                              // attendance-demo.js spoke first: add our lines to its banner
      existing.innerHTML += "<br><strong>Clock rule</strong> — days from 1 Nov 2026 are priced by the rule from Settings (demo arithmetic): " +
        "Captain America punches out at 5 PM and in again at 5:30 PM, so his evenings are overtime; the rest of the crew's evenings show " +
        "<em>After-Hours Not Counted</em>. October is closed for HF Bored Piles — open October to see the note. " +
        "<code>settings.html?demo=1</code> shows the rules and the months.";
      return;
    }
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.style.cssText = "margin:0 0 16px";
    b.innerHTML = page === "settings.html"
      ? "<strong>Demo data</strong> — the rule rows are the ones migration 0131 seeds (with 1.5× rates), the holidays are 0103's Penang list, " +
        "the months and the history are invented, so the page can be reviewed before the database change is applied. Nothing is saved; a reload brings everything back. " +
        "Try: <em>View</em> on a rule (its figures in a side panel; Withdraw on a scheduled one), <em>New Rule</em> (top right of Work Rules; the form opens in the side panel; tomorrow or later; the day length follows the window by the clock), " +
        "the <em>⋮</em> menu on Hai Fu's October (<em>Close Month</em> is greyed <em>2 Unpriced · 1 Pending</em> — hover it for the reason; <em>See Unpriced Days</em> and <em>See Pending Requests</em> lead to the records; settle them there, come back in this tab and the close goes through), " +
        "<em>Reopen</em> October for HF Bored Piles (closed two hours ago, so the 24-hour undo is still open; a reason is required), " +
        "<em>Add Holiday</em> (top right of Public Holidays; the form opens in the side panel) and <em>Remove</em> a coming one, <em>Show History</em>. " +
        "<code>&role=admin</code> on the URL shows the Administrator's view (Close, no Reopen). Drop <code>?demo=1</code> for the real page."
      : "<strong>Demo data</strong> — the rule words on this page come from the rows migration 0131 seeds. Nothing is saved. " +
        "Drop <code>?demo=1</code> for the real page.";
    main.insertBefore(b, main.querySelector("section, .st-area, .att-when, .filters, .page-caption + *") || main.firstChild);
  });

  console.log("[demo] work rules, payroll months, holidays and history answered from invented rows. Nothing hits the database.");
})();
