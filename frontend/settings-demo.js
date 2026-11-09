// -----------------------------------------------------------------------------
// DEV DEMO DATA — the work rules and the payroll months (DB 0131 / 0132).
// NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=1 to the URL:
//     settings.html?demo=1                      the rule rows and the months, the Super Administrator's view
//     settings.html?demo=1&role=admin           the Administrator's view (Close, no Reopen)
//     attendance.html?demo=1&view=month&month=2026-11
//                                               the invented crew priced by the clock rule: the
//                                               After-Hours Not Counted chip, the notes, the Excel column
//     attendance.html?demo=1&view=month&month=2026-10
//                                               the same crew under the old rule, October closed for HF-BP
//     exceptions.html?demo=1                    the day-start and long-shift words from the rule
//
// Until 0131 and 0132 are applied, get_work_rules and get_payroll_periods do not
// exist on the database and the pages fall back to generic words. This file
// answers those two reads with the four rule rows 0131 seeds (today's rule from
// 2000, the clock rule from 1 Nov 2026, per company) and one closed month, and
// keeps the four Settings writes in this page's memory, so the Settings page and
// the Attendance words can be reviewed before the apply. A reload brings
// everything back.
//
// IT WRITES NOTHING. No database call of its own is made while this is on; the
// real Dash.* functions are shadowed for this page load only. Sign-in stays
// real (the page still needs a login), and settings.manage is added to the
// signed-in account's permission list for this page load so the Settings page
// opens even before the live profiles carry it.
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

  // ---- the rule rows, as 0131 seeds them ------------------------------------
  function rule(id, code, from, mode, start, end, rest, grace, round, note) {
    return { rule_id: id, company_code: code, effective_from: from, mode: mode, day_start: start, day_end: end,
             normal_minutes: 450, rest_minutes: rest, rest_gate_minutes: 360, grace_minutes: grace, round_minutes: round,
             overlong_hours: 20, question_hours: 16, note: note, created_at: "2026-11-07T04:00:00Z", created_by: null };
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
  // HF-BP's October is closed; Hai Fu's is open — its first Close is refused the
  // way the database refuses it (two days without a figure), the second succeeds
  var PERIODS = [
    { company_code: "HF-BP", period_month: "2026-10-01", status: "closed", closed_at: "2026-11-05T02:10:00Z", closed_by_name: "Nick Fury (demo)",
      reopened_at: null, reopened_by_name: null, note: "October done", days: 131, working_minutes: 58950, ot_minutes: 7230 }
  ];
  var haiFuRefusedOnce = false;
  var ME = "You (demo)";

  // ---- the signed-in account: settings.manage for this page load -----------
  var realAccess = Dash.getMyAccess;
  Dash.getMyAccess = async function () {
    var v = await realAccess.apply(this, arguments);
    if (v && v.ok && v.access) {
      v.access.permissions = v.access.permissions || [];
      if (v.access.permissions.indexOf("settings.manage") < 0) v.access.permissions.push("settings.manage");
      if (ROLE === "admin") v.access.access_profile_code = "admin";
      if (ROLE === "super") v.access.access_profile_code = "super_admin";
    }
    return v;
  };

  // ---- the two reads ---------------------------------------------------------
  Dash.getWorkRules = async function () { return RULES.slice(); };
  Dash.getPayrollPeriods = async function () { return PERIODS.slice(); };

  // ---- the four writes, in memory, refused as 0132 refuses them --------------
  function monthWord(iso) {
    return new Date(String(iso).slice(0, 7) + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  function firstOfThisMonth() { return Dash.todayKL().slice(0, 7) + "-01"; }
  function periodOf(code, month) {
    return PERIODS.filter(function (p) { return p.company_code === code && p.period_month === month; })[0] || null;
  }
  Dash.closePayrollMonth = async function (code, month, note) {
    if (!/^\d{4}-\d{2}-01$/.test(String(month))) return { ok: false, code: "bad_month", message: "Pick a month." };
    if (month >= firstOfThisMonth()) return { ok: false, code: "month_not_over", message: monthWord(month) + " is not over yet." };
    var p = periodOf(code, month);
    if (p && p.status === "closed") return { ok: false, code: "already_closed", message: monthWord(month) + " is already closed." };
    if (code === "Hai Fu" && !haiFuRefusedOnce) {
      haiFuRefusedOnce = true;
      return { ok: false, code: "unpriced_days", days: 2, message: "2 days in " + monthWord(month) + " have no figure. Settle them on the Exceptions page, then close." };
    }
    var figures = { days: 44, working_minutes: 19800, ot_minutes: 2610 };
    if (p) { Object.assign(p, { status: "closed", closed_at: new Date().toISOString(), closed_by_name: ME, note: note || null }, figures); }
    else PERIODS.push(Object.assign({ company_code: code, period_month: month, status: "closed", closed_at: new Date().toISOString(), closed_by_name: ME,
                                      reopened_at: null, reopened_by_name: null, note: note || null }, figures));
    return Object.assign({ ok: true, period_id: "demo-period" }, figures);
  };
  Dash.reopenPayrollMonth = async function (code, month, reason) {
    var acc = await Dash.getMyAccess();
    if (!(acc && acc.ok && acc.access && acc.access.access_profile_code === "super_admin")) {
      return { ok: false, code: "super_admin_only", message: "Only a Super Administrator reopens a closed month." };
    }
    if (String(reason || "").trim().length < 3) return { ok: false, code: "reason_required", message: "Say why the month is reopened." };
    var p = periodOf(code, month);
    if (!p || p.status !== "closed") return { ok: false, code: "not_closed", message: monthWord(month) + " is not closed." };
    Object.assign(p, { status: "open", reopened_at: new Date().toISOString(), reopened_by_name: ME, note: String(reason).trim() });
    return { ok: true };
  };
  Dash.setWorkRule = async function (r) {
    var today = Dash.todayKL();
    if (["HF-BP", "Hai Fu"].indexOf(r.company_code) < 0) return { ok: false, code: "unknown_company", message: "No such company." };
    if (!r.effective_from || r.effective_from < firstOfThisMonth()) {
      return { ok: false, code: "bad_date", message: "A rule starts on a day of the current month or later; the past is never rewritten." };
    }
    if (r.mode !== "total" && r.mode !== "clock") return { ok: false, code: "bad_mode", message: "The rule is by the total or by the clock." };
    if (!r.day_start || !r.day_end || r.day_end <= r.day_start) return { ok: false, code: "bad_window", message: "The day must end after it starts." };
    if (!(r.rest_minutes >= 0 && r.rest_minutes <= 600) || !(r.grace_minutes >= 0 && r.grace_minutes <= 120) ||
        [1, 5, 10, 15, 30, 60].indexOf(Number(r.round_minutes)) < 0 || !(r.overlong_hours >= 8 && r.overlong_hours <= 72) ||
        !(r.question_hours >= 1 && r.question_hours <= 72) || !(r.normal_minutes >= 1 && r.normal_minutes <= 1440) ||
        !(r.rest_gate_minutes >= 0 && r.rest_gate_minutes <= 1440)) {
      return { ok: false, code: "bad_minutes", message: "Check the figures: rest 0-600 min, grace 0-120 min, rounding 1/5/10/15/30/60 min, the long-shift line 8-72 h, the question line 1-72 h." };
    }
    // by the clock the day's length follows the window; by the total it is given
    var mins = function (t) { var p = String(t).split(":"); return Number(p[0]) * 60 + Number(p[1]); };
    var normal = r.mode === "clock" ? mins(r.day_end) - mins(r.day_start) - Number(r.rest_minutes) : Number(r.normal_minutes);
    if (normal < 1) return { ok: false, code: "bad_window", message: "The window is shorter than the rest." };
    var same = RULES.filter(function (x) { return x.company_code === r.company_code && x.effective_from === r.effective_from; })[0];
    if (same && r.effective_from <= today) {
      return { ok: false, code: "rule_in_force", message: "That rule is already in force; add a new one from a later date instead." };
    }
    var row = same || { rule_id: "demo-rule-" + (nextRuleId++), company_code: r.company_code, effective_from: r.effective_from };
    Object.assign(row, { mode: r.mode, day_start: r.day_start + ":00", day_end: r.day_end + ":00", normal_minutes: normal,
                         rest_minutes: Number(r.rest_minutes), rest_gate_minutes: Number(r.rest_gate_minutes), grace_minutes: Number(r.grace_minutes),
                         round_minutes: Number(r.round_minutes), overlong_hours: Number(r.overlong_hours), question_hours: Number(r.question_hours),
                         note: String(r.note || "").trim() || null, created_at: new Date().toISOString(), created_by: null });
    if (!same) RULES.push(row);                                   // a future row may be rewritten until its day comes
    return { ok: true, rule_id: row.rule_id, normal_minutes: normal };
  };
  Dash.deleteWorkRule = async function (ruleId) {
    var row = RULES.filter(function (x) { return x.rule_id === ruleId; })[0];
    if (!row) return { ok: false, code: "not_found" };
    if (row.effective_from <= Dash.todayKL()) return { ok: false, code: "rule_in_force", message: "That rule is in force or past; it stays on record." };
    RULES.splice(RULES.indexOf(row), 1);
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
      ? "<strong>Demo data</strong> — the rule rows are the ones migration 0131 seeds and the months are invented, so the page can be " +
        "reviewed before the database change is applied. Nothing is saved; a reload brings everything back. " +
        "Try: <em>New Rule From…</em> (a future row shows From Then with Withdraw), <em>Close</em> October for Hai Fu (the first try is refused the way " +
        "the database refuses it, the second closes it), <em>Reopen</em> October for HF Bored Piles (a reason is required). " +
        "<code>&role=admin</code> on the URL shows the Administrator's view. Drop <code>?demo=1</code> for the real page."
      : "<strong>Demo data</strong> — the rule words on this page come from the rows migration 0131 seeds. Nothing is saved. " +
        "Drop <code>?demo=1</code> for the real page.";
    main.insertBefore(b, main.querySelector("section, .att-when, .filters, .page-caption + *") || main.firstChild);
  });

  console.log("[demo] work rules + payroll months answered from invented rows. Nothing hits the database.");
})();
