// -----------------------------------------------------------------------------
// DEV DEMO DATA — exceptions.html only. NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=1 to the URL:
//     exceptions.html?demo=1
//
// It stands in for the sign-in AND for every engine read/write this page and
// the shell make, so the page can be reviewed (and screenshotted by the
// Playwright harness) with no login at all: one invented shift of every kind
// the queue knows (DB 0124), a crew to compare against, and a payroll-close
// list. Dates are pinned to today so the rows are on screen whenever the page
// is opened.
//
// IT WRITES NOTHING. Accept As Punched, Credit From Punch-In, Approve, Reject
// and Undo change the in-memory list for this page load only — no database
// call is made while this is on.
//
// Names are the Avengers test crew (the convention attendance-demo.js and the
// real test rows use), so a demo row can never be mistaken for a real worker.
//
// MUST load AFTER dashboard-client.js and BEFORE shell.js — the shell asks
// for the login the moment it runs.
//
// TO REMOVE BEFORE THE PILOT: delete this file and its <script> tag in
// exceptions.html.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("demo") !== "1") return;                        // self-gate

  var PERMS = ["attendance.view", "attendance.edit"];

  var SITES = [
    { id: "demo-site-1", code: "HF-SGR-004",  name: "UMECH - RAWANG (DEMO)" },
    { id: "demo-site-2", code: "HF-KDH-002A", name: "MCS SIK BRIDGE 2 (DEMO)" }
  ];

  var today = Dash.todayKL();
  function day(n) {                                    // today minus n days
    var d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function at(iso, hhmm, plusDays) {                   // a Malaysia-time stamp on a day
    if (!hhmm) return null;
    var d = iso;
    if (plusDays) {
      var x = new Date(iso + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + plusDays); d = x.toISOString().slice(0, 10);
    }
    return d + "T" + hhmm + ":00+08:00";
  }
  function hoursBetween(a, b) {
    var ms = (b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime();
    return Math.round(ms / 36000) / 100;
  }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---- the crew: who tapped what, per site and day (get_daily_shifts shape) --
  // one entry per worker-day; the exceptions below are derived from these
  var PEOPLE = {
    ironman: { id: "demo-ironman", name: "Iron-Man (demo)",        code: "BP-D01", co: "HF-BP", flex: false },
    cap:     { id: "demo-cap",     name: "Captain America (demo)", code: "BP-D02", co: "HF-BP", flex: false },
    widow:   { id: "demo-widow",   name: "Black Widow (demo)",     code: "BP-D03", co: "HF-BP", flex: false },
    hulk:    { id: "demo-hulk",    name: "Hulk (demo)",            code: "HS-D04", co: "Hai Fu", flex: true },
    thor:    { id: "demo-thor",    name: "Thor (demo)",            code: "BP-D05", co: "HF-BP", flex: false },
    hawkeye: { id: "demo-hawkeye", name: "Hawkeye (demo)",         code: "BP-D06", co: "HF-BP", flex: false },
    falcon:  { id: "demo-falcon",  name: "Falcon (demo)",          code: "BP-D07", co: "HF-BP", flex: false },
    vision:  { id: "demo-vision",  name: "Vision (demo)",          code: "BP-D08", co: "HF-BP", flex: false },
    wanda:   { id: "demo-wanda",   name: "Scarlet Witch (demo)",   code: "BP-D09", co: "HF-BP", flex: false }
  };
  function wd(o) {                                     // a worker-day row as get_daily_shifts returns it
    var p = PEOPLE[o.who], site = SITES[o.site];
    var inAt = at(o.date, o.inL), outAt = at(o.date, o.outL, o.outNext ? 1 : 0);
    return {
      staff_id: p.id, full_name: p.name, employee_code: p.code, company_code: p.co, flexible_hours: p.flex,
      project_id: site.id, project_name: site.name, work_date: o.date,
      first_in_at: inAt, last_out_at: outAt, in_count: 1, out_count: outAt ? 1 : 0,
      hours_on_site: outAt ? hoursBetween(inAt, outAt) : null,
      has_anomaly: !outAt, overlong_shift: false, has_correction: !!o.corrected,
      open_shift: !outAt, shift_count: 1,
      shifts: [{ shift_no: 1, in_at: inAt, out_at: outAt, raw_in_at: inAt, raw_out_at: outAt,
                 corrected: !!o.corrected, reason: o.corrected || null, project_id: site.id,
                 missed: !!o.missed, long_accepted: false, early_accepted: false, worker_note: o.note || null }],
      // 0124 queue facts kept here so the exceptions can be derived
      _kind: o.kind || null, _offSite: !!o.offSite, _note: o.note || null,
      _declared: o.declaredL ? at(o.date, o.declaredL, o.declaredNext ? 1 : 0) : null, _reqId: o.reqId || null
    };
  }

  var DAYS = [
    // 3 days ago at UMECH: a concreting night — the whole crew ended together
    // (Iron-Man's and Black Widow's shifts are both over 16 h: two Overlong rows,
    // Compare With Crew shows them side by side; Iron-Man punched out off site)
    wd({ who: "ironman", site: 0, date: day(3), inL: "07:50", outL: "05:10", outNext: true, kind: "overlong", offSite: true,
         note: "concreting whole night, finish 5am" }),
    wd({ who: "widow",   site: 0, date: day(3), inL: "07:58", outL: "05:05", outNext: true, kind: "overlong" }),
    wd({ who: "vision",  site: 0, date: day(3), inL: "08:02", outL: "05:12", outNext: true, kind: "overlong" }),
    wd({ who: "wanda",   site: 0, date: day(3), inL: "08:00", outL: "17:30" }),
    // 5 days ago at MCS SIK: one forgotten punch-out — Captain America "ended" at
    // 08:02 next morning while the crew left at 17:30
    wd({ who: "cap",     site: 1, date: day(5), inL: "08:00", outL: "08:02", outNext: true, kind: "overlong", offSite: true }),
    wd({ who: "thor",    site: 1, date: day(5), inL: "07:55", outL: "17:30" }),
    wd({ who: "hawkeye", site: 1, date: day(5), inL: "07:58", outL: "17:32" }),
    wd({ who: "falcon",  site: 1, date: day(5), inL: "08:03", outL: "17:28" }),
    // yesterday at MCS SIK: Thor chose Start New Shift this morning, so yesterday
    // is marked Punch Out Missing; the crew left at 18:05
    wd({ who: "thor",    site: 1, date: day(1), inL: "07:55", outL: null, kind: "missed", missed: true }),
    wd({ who: "hawkeye", site: 1, date: day(1), inL: "07:58", outL: "18:05" }),
    wd({ who: "falcon",  site: 1, date: day(1), inL: "08:01", outL: "18:04" }),
    // 2 days ago at UMECH: Hawkeye was called in at 04:50 for the pour (Early Start)
    wd({ who: "hawkeye", site: 0, date: day(2), inL: "04:50", outL: "17:05", kind: "early_start" }),
    wd({ who: "ironman", site: 0, date: day(2), inL: "07:50", outL: "17:10" }),
    // 4 days ago at UMECH: Falcon punched out next morning away from the site and
    // declared he finished at 23:30 — a Change Times request waiting
    wd({ who: "falcon",  site: 0, date: day(4), inL: "19:00", outL: "09:40", outNext: true, kind: "declared", offSite: true,
         declaredL: "23:30", reqId: "demo-req-1" }),
    wd({ who: "vision",  site: 0, date: day(4), inL: "19:05", outL: "23:25" }),
    wd({ who: "wanda",   site: 0, date: day(4), inL: "19:02", outL: "23:28" })
  ];
  // Hulk (Flexible Hours) punched in 17 h ago and is still open: Open 16 h+
  (function () {
    var start = new Date(Date.now() - 17.2 * 3600000);
    var kl = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(start);
    var p = {}; kl.forEach(function (x) { p[x.type] = x.value; });
    var d = p.year + "-" + p.month + "-" + p.day, t = (p.hour === "24" ? "00" : p.hour) + ":" + p.minute;
    DAYS.push(wd({ who: "hulk", site: 0, date: d, inL: t, outL: null, kind: "long_open" }));
  })();

  var ACCEPTED = {};                                   // key -> true after Accept / Credit
  var REQUESTS = { "demo-req-1": "pending" };

  function key(d) { return d.staff_id + "|" + d.work_date + "|1"; }

  function exceptionsFor(from, to) {
    var out = [];
    DAYS.forEach(function (d) {
      if (!d._kind) return;
      if (from && d.work_date < from) return;
      if (to && d.work_date > to) return;
      if ((d._kind === "overlong" || d._kind === "early_start") && ACCEPTED[key(d)]) return;
      if (d._kind === "declared" && REQUESTS[d._reqId] !== "pending") return;
      out.push({
        kind: d._kind, staff_id: d.staff_id, employee_code: d.employee_code, full_name: d.full_name,
        company_code: d.company_code, flexible_hours: d.flexible_hours,
        project_id: d.project_id, project_name: d.project_name, work_date: d.work_date, shift_no: 1,
        in_at: d.first_in_at, out_at: d.last_out_at, hours: hoursBetween(d.first_in_at, d.last_out_at),
        off_site_out: d._offSite, worker_note: d._note,
        request_id: d._reqId, declared_out_at: d._declared, request_pending: !!d._reqId
      });
    });
    var order = { missed: 1, long_open: 2, overlong: 3, declared: 4, early_start: 5 };
    return out.sort(function (a, b) {
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      if (a.off_site_out !== b.off_site_out) return a.off_site_out ? -1 : 1;
      if (a.work_date !== b.work_date) return a.work_date < b.work_date ? 1 : -1;
      return a.full_name.localeCompare(b.full_name);
    });
  }

  function unpricedFor(from, to) {
    var out = [];
    DAYS.forEach(function (d) {
      if (!d._kind || (from && d.work_date < from) || (to && d.work_date > to)) return;
      var why = d._kind === "missed" ? "missed" : d._kind === "long_open" ? "open"
              : d._kind === "overlong" && !ACCEPTED[key(d)] ? "overlong" : null;
      if (why) out.push({ staff_id: d.staff_id, employee_code: d.employee_code, full_name: d.full_name,
                          company_code: d.company_code, work_date: d.work_date, why: why });
      if (d._reqId && REQUESTS[d._reqId] === "pending")
        out.push({ staff_id: d.staff_id, employee_code: d.employee_code, full_name: d.full_name,
                   company_code: d.company_code, work_date: d.work_date, why: "pending_request" });
    });
    return out.sort(function (a, b) {
      return a.work_date < b.work_date ? -1 : a.work_date > b.work_date ? 1 : a.full_name.localeCompare(b.full_name);
    });
  }

  // ---- the sign-in the shell asks for --------------------------------------
  var FURY = "Nick Fury (demo)";
  var ACCESS = { ok: true, access: {
    full_name: FURY, designation: "office", role: null, status: "active",
    access_profile_code: "demo", access_profile_name: "Demo",
    scope_all_projects: true, permissions: PERMS, project_ids: [], legacy: false
  }};
  var USER = { id: "demo-user", email: "demo@example.invalid" };
  // Answers once the page has parsed, like a real sign-in round trip would.
  Dash.requireLogin = function () {
    return new Promise(function (resolve) {
      if (document.readyState !== "loading") resolve(USER);
      else document.addEventListener("DOMContentLoaded", function () { resolve(USER); });
    });
  };
  Dash.getUser = async function () { return USER; };
  Dash.getMyAccess = async function () { return ACCESS; };
  Dash.can = function (p) { return PERMS.indexOf(p) !== -1; };

  // the site list (page dropdown + the shell's site search)
  Dash.getProjectDirectory = async function () {
    return SITES.map(function (s) {
      return { project_id: s.id, project_code: s.code, project_name: s.name,
               status: "active", has_bored_scope: true, client_name: "Demo" };
    });
  };

  // ---- the queue's reads ---------------------------------------------------
  Dash.getPunchExceptions = async function (from, to) { await wait(150); return copy(exceptionsFor(from, to)); };
  Dash.getUnpricedDays   = async function (from, to) { await wait(150); return copy(unpricedFor(from, to)); };
  Dash.getShifts = async function (date, projectId) {
    await wait(200);
    return copy(DAYS.filter(function (d) { return d.work_date === date && (!projectId || d.project_id === projectId); }));
  };

  // ---- the writes: in memory only ------------------------------------------
  Dash.acceptShiftAsPunched = async function (staffId, workDate, shiftNo, kind, note) {
    await wait(350);
    var d = DAYS.filter(function (x) { return x.staff_id === staffId && x.work_date === workDate; })[0];
    if (!d) return { ok: false, code: "no_such_shift", message: "That shift is not on the record." };
    if (kind === "long" && !d.last_out_at) return { ok: false, code: "shift_open", message: "That shift has no punch-out yet." };
    if (kind === "long" && hoursBetween(d.first_in_at, d.last_out_at) <= 16)
      return { ok: false, code: "not_overlong", message: "That shift is not over 16 hours." };
    if (kind === "early" && d.flexible_hours)
      return { ok: false, code: "flexible_hours", message: "Flexible Hours staff are credited from the punch-in already." };
    ACCEPTED[key(d)] = true;
    var mins = Math.round(hoursBetween(d.first_in_at, d.last_out_at) * 60) - 90;   // a plain 1.5 h rest, demo only
    return { ok: true, mark: kind === "long" ? "overlong_accepted" : "early_start_accepted", working_minutes: mins };
  };
  Dash.clearShiftAcceptance = async function (staffId, workDate) {
    await wait(300);
    var d = DAYS.filter(function (x) { return x.staff_id === staffId && x.work_date === workDate; })[0];
    if (!d || !ACCEPTED[key(d)]) return { ok: false, code: "not_found" };
    delete ACCEPTED[key(d)];
    return { ok: true };
  };
  Dash.reviewAttendanceRequest = async function (id, decision, note) {
    await wait(350);
    if (!REQUESTS[id]) return { ok: false, code: "not_found", message: "That request no longer exists." };
    if (REQUESTS[id] !== "pending")
      return { ok: false, code: "already_reviewed", message: "This request was already " + REQUESTS[id] + "." };
    if (decision === "rejected" && !(note && String(note).trim()))
      return { ok: false, code: "note_required", message: "Say why the request is rejected." };
    REQUESTS[id] = decision;
    return { ok: true, status: decision,
             message: decision === "rejected" ? "Request rejected."
                    : "Approved — the declared finish time now stands for Falcon (demo)’s shift." };
  };

  // a banner, so nobody mistakes this screen for the real one
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main");
    if (!main) return;
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.innerHTML = "<strong>Demo data</strong> — invented shifts so the layout can be reviewed. " +
      "Nothing here is real and the buttons write nothing to the database. Drop " +
      "<code>?demo=1</code> from the URL for the real page.";
    main.insertBefore(b, document.getElementById("ex-stats"));
  });

  console.log("[demo] exceptions page: sign-in + queue reads/writes replaced. Nothing hits the database.");
})();
