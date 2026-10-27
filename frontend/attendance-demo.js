// -----------------------------------------------------------------------------
// DEV DEMO DATA — attendance page only. NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=1 to the URL:
//     attendance.html?demo=1
//     attendance.html?demo=1&view=month&month=2026-08
//
// It replaces the three attendance READ commands with fakes so the page can be
// seen full — a crew across three sites, a month of days, and every state the
// table is supposed to handle (overtime, a missing punch out, a punch outside
// the fence, a shift left running overnight).
//
// IT WRITES NOTHING. No database call is made while this is on; the real
// Dash.* functions are shadowed for this page load only. The punch write path
// is not ours to touch (ATTENDANCE-HANDOFF §1), and test writes may only ever
// go against TEST-AVENGERS (§12) — so nothing here goes near either.
//
// Names are the Avengers test crew, the convention the real test rows already
// use, so a demo row can never be mistaken for a real worker.
//
// TO REMOVE BEFORE THE PILOT: delete this file and its <script> tag in
// attendance.html.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  if (new URLSearchParams(location.search).get("demo") !== "1") return;   // self-gate

  var SITES = [
    { id: "demo-site-1", code: "HF-SGR-004", name: "UMECH - RAWANG (DEMO)" },
    { id: "demo-site-2", code: "HF-KDH-002A", name: "MCS SIK BRIDGE 2 (DEMO)" },
    { id: "demo-site-3", code: "HF-JHR-001", name: "SA SETIA - ULU TIRAM (DEMO)" }
  ];

  var CREW = [
    { name: "Iron-Man (demo)",        site: 0, start: 8.0,  len: 9.2 },
    { name: "Captain America (demo)", site: 0, start: 7.9,  len: 10.8 },   // steady overtime
    { name: "Black Widow (demo)",     site: 0, start: 8.1,  len: 8.9 },
    { name: "Hulk (demo)",            site: 1, start: 7.75, len: 11.5 },   // heavy overtime
    { name: "Thor (demo)",            site: 1, start: 8.2,  len: 9.0 },
    { name: "Hawkeye (demo)",         site: 1, start: 8.0,  len: 7.4 },    // short days
    { name: "Falcon (demo)",          site: 2, start: 7.85, len: 9.6 },
    { name: "Scarlet Witch (demo)",   site: 2, start: 8.05, len: 9.1 }
  ];

  // A fixed wobble per worker per day — no Math.random, so a reload shows the
  // same month and a screenshot keeps matching the screen.
  function wobble(name, iso, spread) {
    var h = 0, str = name + iso;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
    return ((h % 1000) / 1000 - 0.5) * spread;
  }

  function stamp(iso, hours) {
    var h = Math.floor(hours), m = Math.round((hours - h) * 60);
    return iso + "T" + (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":00+08:00";
  }

  function dayOf(iso) { return new Date(iso + "T00:00:00+08:00").getDay(); }

  // THE DEMO'S STAND-IN FOR THE DATABASE. The real page does no hours
  // arithmetic — every real row arrives priced by fn_shift_minutes (0091) as
  // working_minutes / ot_minutes. Fake rows have no database behind them, so
  // this prices them the way the server would, for the demo only. It is NOT a
  // second copy of the rule for the app: nothing outside ?demo=1 can reach it.
  function fakeServerPrice(inHours, outHours) {
    var start = Math.round(inHours * 60), end = Math.round(outHours * 60);
    if (end - start > 22 * 60) return null;                  // over the limit: unpriced
    // DB 0104: count from 08:00 (or the later punch-in), lunch out past 6 h,
    // 8 h normal, the rest overtime — by the total
    var span = Math.max(0, end - Math.max(start, 8 * 60));
    var worked = span > 6 * 60 ? span - 60 : span;
    return { working: Math.min(worked, 8 * 60), ot: Math.max(0, worked - 8 * 60) };
  }

  // ---- Remove Shift in the demo (DB 0128) -----------------------------------
  // Every demo row carries the 0128 shape (shifts[], removed_count, all_removed),
  // so the Remove Shift menu, drawer and panel can be tried with ?demo=1. Three
  // cases sit on DEMO_DAY, the last working day before today: a one-minute double
  // tap (Scarlet Witch), a real second shift in the evening (Captain America),
  // and a day already removed (Hawkeye). A removal lives in this page's memory
  // only — a reload brings every shift back.
  var DEMO_DAY = (function () {
    var d = new Date(Dash.todayKL() + "T00:00:00Z");
    do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0);
    return d.toISOString().slice(0, 10);
  })();
  var REMOVED = {};                                   // "staff|date|shift" -> { reason, by, at }
  REMOVED["demo-Hawkeye (demo)|" + DEMO_DAY + "|1"] = { reason: "Test Punch", by: "Nick Fury (demo)", at: DEMO_DAY + "T18:05:00+08:00" };
  function priceSpans(spans) {                        // the same demo pricing, over several shifts
    var total = 0;
    for (var i = 0; i < spans.length; i++) {
      if (spans[i][1] === null) return null;
      total += Math.max(0, Math.round(spans[i][1] * 60) - Math.max(Math.round(spans[i][0] * 60), 8 * 60));
    }
    var worked = total > 6 * 60 ? total - 60 : total;
    return { working: Math.min(worked, 8 * 60), ot: Math.max(0, worked - 8 * 60) };
  }
  function hoursOfStamp(ts, iso) {                    // a stamp back to hours of the work day
    var d = new Date(ts), base = new Date(iso + "T00:00:00+08:00");
    return (d - base) / 3600000;
  }

  // One worker's day. Sundays off, and a handful of scripted problem days so
  // every badge on the page has something to point at.
  function shiftFor(w, iso) {
    if (dayOf(iso) === 0) return null;                       // no Sunday work
    var dom = Number(iso.slice(8, 10));
    if ((dom + w.name.length) % 11 === 0) return null;       // the odd day off

    var inAt  = w.start + wobble(w.name, iso, 0.25);
    var len   = w.len + wobble(w.name, iso + "x", 1.2);
    var outAt = inAt + len;

    var siteRow = SITES[w.site];
    var price = fakeServerPrice(inAt, outAt);
    var row = {
      staff_id: "demo-" + w.name,      // real rows carry a uuid; the page keys on it
      working_minutes: price ? price.working : null,
      ot_minutes: price ? price.ot : null,
      company_code: "HF-BP",
      day_kind: dayOf(iso) === 6 && dom % 9 === 4 ? "rest" : "normal",   // the odd Saturday stands in for a rest day
      full_name: w.name,
      project_id: siteRow.id,
      project_name: siteRow.name,
      work_date: iso,
      first_in_at: stamp(iso, inAt),
      last_out_at: stamp(iso, outAt),
      in_count: 1,
      out_count: 1,
      hours_on_site: Math.round(len * 100) / 100,
      has_anomaly: false,
      overlong_shift: false
    };

    // forgot to punch out — the shift runs on and the day cannot be counted
    if (dom === 12 && w.name.indexOf("Hulk") === 0) {
      row.last_out_at = null; row.out_count = 0; row.hours_on_site = null;
      row.working_minutes = null; row.ot_minutes = null;      // open = unpriced
    }
    // punched out the next morning: the overlong flag's whole reason to exist
    if (dom === 19 && w.name.indexOf("Thor") === 0) {
      row.last_out_at = stamp(iso, 24 + 9.4);
      row.hours_on_site = Math.round((24 + 9.4 - inAt) * 100) / 100;
      row.overlong_shift = true;
      row.working_minutes = null; row.ot_minutes = null;      // over the limit = unpriced
    }
    // punched from outside the fence
    if (dom % 7 === 3 && w.site === 2) row.has_anomaly = true;
    // moved to another site during the day (DB 0102): the day stays ONE row,
    // started here, ended there
    if (dom === 14 && w.name.indexOf("Iron") === 0) {
      var other = SITES[(w.site + 1) % SITES.length];
      row.out_project_id = other.id; row.out_project_name = other.name;
    }
    // still on site right now (today only)
    if (iso === Dash.todayKL() && w.name.indexOf("Falcon") === 0) {
      row.last_out_at = null; row.out_count = 0; row.hours_on_site = null;
      row.working_minutes = null; row.ot_minutes = null;
    }

    // 0128: the day's shifts — one, or the DEMO_DAY cases
    var spans = [[hoursOfStamp(row.first_in_at, iso), row.last_out_at ? hoursOfStamp(row.last_out_at, iso) : null]];
    if (iso === DEMO_DAY && w.name.indexOf("Scarlet") === 0) spans = [[inAt - 2 / 60, inAt - 1 / 60], [inAt, outAt]];   // a one-minute double tap first
    if (iso === DEMO_DAY && w.name.indexOf("Captain") === 0) spans = [[inAt, outAt], [19.5, 22.0]];                    // a real second shift
    row.shifts = spans.map(function (s, k) {
      var a = stamp(iso, s[0]), b = s[1] === null ? null : stamp(iso, s[1]);
      return { shift_no: k + 1, in_at: a, out_at: b, raw_in_at: a, raw_out_at: b, corrected: false, missed: false,
               entered_by_office: false, removed: false, removed_reason: null, removed_by_name: null, removed_at: null, _span: s };
    });
    row.shift_count = row.shifts.length;
    if (spans.length > 1) {
      var pm = priceSpans(spans);
      row.first_in_at = row.shifts[0].raw_in_at; row.last_out_at = row.shifts[row.shifts.length - 1].raw_out_at;
      row.in_count = row.out_count = spans.length;
      row.working_minutes = pm ? pm.working : null; row.ot_minutes = pm ? pm.ot : null;
    }
    // the office's removals, as 0128's view would price them
    var live = [];
    row.shifts.forEach(function (x) {
      var rm = REMOVED[row.staff_id + "|" + iso + "|" + x.shift_no];
      if (rm) { x.removed = true; x.removed_reason = rm.reason; x.removed_by_name = rm.by; x.removed_at = rm.at; }
      else live.push(x);
    });
    row.removed_count = row.shifts.length - live.length;
    row.all_removed = row.removed_count > 0 && live.length === 0;
    if (row.all_removed) {
      row.working_minutes = 0; row.ot_minutes = 0; row.first_in_at = null; row.last_out_at = null;
      row.in_count = 0; row.out_count = 0; row.has_anomaly = false;
    } else if (row.removed_count) {
      var pl = priceSpans(live.map(function (x) { return x._span; }));
      row.first_in_at = live[0].raw_in_at; row.last_out_at = live[live.length - 1].raw_out_at;
      row.in_count = row.out_count = live.length;
      row.working_minutes = pl ? pl.working : null; row.ot_minutes = pl ? pl.ot : null;
    }
    return row;
  }

  function punchesFor(row) {
    var out = [];
    var far = row.has_anomaly;
    if (row.shifts && (row.shifts.length > 1 || row.removed_count)) {     // 0128: each shift's own taps
      row.shifts.forEach(function (x) {
        [["in", x.raw_in_at], ["out", x.raw_out_at]].forEach(function (k) {
          if (!k[1]) return;
          out.push({ staff_id: row.staff_id, punched_by: "worker", synced_late: false, wrong_site: false,
                     punched_at: k[1], full_name: row.full_name, punch_type: k[0], project_name: row.project_name,
                     gps_lat: 3.3215, gps_lng: 101.5771, distance_m: 20, verification_status: "verified" });
        });
      });
      return out;
    }
    out.push({
      staff_id: row.staff_id, punched_by: "worker",
      // one late-synced tap and one wrong-site tap, so both badges have a home
      synced_late: row.full_name.indexOf("Hawkeye") === 0,
      wrong_site: far, detected_project_code: far ? SITES[0].code : null,
      punched_at: row.first_in_at, full_name: row.full_name, punch_type: "in",
      project_name: row.project_name,
      gps_lat: 3.3215 + wobble(row.full_name, row.work_date, 0.004),
      gps_lng: 101.5771 + wobble(row.full_name, row.work_date + "y", 0.004),
      distance_m: far ? 840 : Math.round(12 + Math.abs(wobble(row.full_name, row.work_date, 60))),
      verification_status: far ? "outside_geofence" : "verified"
    });
    if (row.last_out_at) {
      // Black Widow's punch-outs are office-entered, Thor's are auto-closed —
      // the two kinds of punch the worker did NOT tap
      var office = row.full_name.indexOf("Black Widow") === 0;
      var system = row.full_name.indexOf("Thor") === 0 && !row.overlong_shift;
      out.push({
        staff_id: row.staff_id,
        punched_by: office ? "office" : system ? "system" : "worker",
        entered_by_name: office ? "Nick Fury (demo)" : null,
        entry_note: office ? "forgot phone, supervisor confirmed" : null,
        punched_at: row.last_out_at, full_name: row.full_name, punch_type: "out",
        project_name: row.project_name,
        gps_lat: 3.3216 + wobble(row.full_name, row.work_date + "o", 0.004),
        gps_lng: 101.5773 + wobble(row.full_name, row.work_date + "p", 0.004),
        distance_m: Math.round(15 + Math.abs(wobble(row.full_name, row.work_date + "o", 60))),
        verification_status: "verified"
      });
    }
    return out;
  }

  function shiftsOn(iso, projectId) {
    var rows = [];
    CREW.forEach(function (w) {
      if (projectId && SITES[w.site].id !== projectId) return;
      var r = shiftFor(w, iso);
      if (r) rows.push(r);
    });
    return rows;
  }

  // ---- shadow the three read commands this page uses ------------------------
  var realShifts = Dash.getShifts;
  Dash.getShifts = async function (date, projectId) {
    return shiftsOn(date, projectId || null);
  };
  // The month view reads a whole range in one call when it can. Left alone,
  // that call would go to the REAL database and the demo month would show real
  // workers. Answer it from the same fake crew instead, day by day.
  Dash.getShiftsRange = async function (from, to, projectId) {
    var out = [], d = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z");
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      out = out.concat(shiftsOn(d.toISOString().slice(0, 10), projectId || null));
    }
    return out;
  };
  // the codes lookup is a real read too — the demo crew has no codes
  Dash.getManpowerBySite = async function () { return []; };
  Dash.getRecentPunches = async function (date, projectId) {
    var out = [];
    shiftsOn(date, projectId || null).forEach(function (r) { out = out.concat(punchesFor(r)); });
    return out.sort(function (a, b) { return a.punched_at < b.punched_at ? 1 : -1; });  // newest first, as the real one does
  };
  // 0124 (15 Oct review): the payroll-close read the Download Excel panel asks —
  // two unpriced days this month, so the tick shows
  Dash.getUnpricedDays = async function (from, to) {
    var m = String(from || Dash.todayKL()).slice(0, 7);
    return [
      { staff_id: "demo-Hulk (demo)", employee_code: "", full_name: "Hulk (demo)", company_code: "HF-BP", work_date: m + "-12", why: "open" },
      { staff_id: "demo-Thor (demo)", employee_code: "", full_name: "Thor (demo)", company_code: "HF-BP", work_date: m + "-19", why: "overlong" }
    ].filter(function (u) { return (!from || u.work_date >= from) && (!to || u.work_date <= to); });
  };
  // 0124 (Koon Sheng's review, 15 Oct): the never-punched-out line counts the
  // queue — one Punch Out Missing shift of Thor's, two days back
  Dash.getPunchExceptions = async function () {
    var d = new Date(Dash.todayKL() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 2);
    var day = d.toISOString().slice(0, 10);
    return [{ kind: "missed", staff_id: "demo-Thor (demo)", employee_code: "", full_name: "Thor (demo)", company_code: "HF-BP",
              flexible_hours: false, project_id: SITES[0].id, project_name: SITES[0].name, work_date: day, shift_no: 1,
              in_at: day + "T07:55:00+08:00", out_at: null, hours: 0, off_site_out: false, worker_note: null,
              request_id: null, declared_out_at: null, request_pending: false }];
  };
  Dash.getOpenShifts = async function () { return []; };   // the old list: not asked once the queue answers
  Dash.getSitesMissingGeofence = async function () {
    return [{ project_name: SITES[1].name, active_workers_assigned: 3 }];
  };

  // 0128 in memory: remove, restore, and the before/after — nothing is written
  function demoRow(staffId, date) {
    var w = CREW.filter(function (c) { return "demo-" + c.name === staffId; })[0];
    return w ? shiftFor(w, date) : null;
  }
  function demoShift(staffId, date, n) {
    var r = demoRow(staffId, date);
    return r ? r.shifts.filter(function (x) { return x.shift_no === Number(n); })[0] || null : null;
  }
  Dash.removeShift = async function (staffId, date, n, reason) {
    var x = demoShift(staffId, date, n);
    if (!x) return { ok: false, code: "no_such_shift", message: "That shift is not on the record." };
    if (x.removed) return { ok: false, code: "already_removed", message: "That shift is already removed." };
    if (!String(reason || "").trim()) return { ok: false, code: "reason_required", message: "Give the reason — the worker sees it." };
    if (!x.out_at && !x.missed) return { ok: false, code: "shift_open", message: "That shift is still open on the worker's phone." };
    REMOVED[staffId + "|" + date + "|" + Number(n)] = { reason: String(reason).trim(), by: "You (demo)", at: new Date().toISOString() };
    var r = demoRow(staffId, date);
    return { ok: true, work_date: date, shift_no: Number(n), working_minutes: r.working_minutes, ot_minutes: r.ot_minutes };
  };
  Dash.restoreShift = async function (staffId, date, n) {
    var k = staffId + "|" + date + "|" + Number(n);
    if (!REMOVED[k]) return { ok: false, code: "not_removed", message: "That shift is not removed." };
    delete REMOVED[k];
    var r = demoRow(staffId, date);
    return { ok: true, work_date: date, shift_no: Number(n), working_minutes: r.working_minutes, ot_minutes: r.ot_minutes };
  };
  Dash.previewShiftRemoval = async function (staffId, date, n, action) {
    var k = staffId + "|" + date + "|" + Number(n), had = REMOVED[k];
    var b = demoRow(staffId, date);
    if (action === "restore") delete REMOVED[k]; else REMOVED[k] = { reason: "preview", by: "", at: "" };
    var a = demoRow(staffId, date);
    if (had) REMOVED[k] = had; else delete REMOVED[k];
    var pick = function (r) { return { working_minutes: r.working_minutes, ot_minutes: r.ot_minutes, day_kind: r.day_kind, all_removed: r.all_removed }; };
    return { ok: true, action: action || "remove", work_date: date, shift_no: Number(n), before: pick(b), after: pick(a), sunday: null };
  };
  // the demo crew is not in the database: every other office write stops here
  var DEMO_REFUSED = { ok: false, code: "demo", message: "Demo data — nothing is saved." };
  ["setDayCorrection", "clearDayCorrection", "acceptShiftAsPunched", "clearShiftAcceptance"].forEach(function (f) {
    Dash[f] = async function () { return DEMO_REFUSED; };
  });
  Dash.priceShift = async function () { return null; };

  // a banner, so nobody mistakes this screen for the real one
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main");
    if (!main) return;
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.style.cssText = "margin:0 0 16px";
    b.innerHTML = "<strong>Demo data</strong> — this page is showing an invented crew so the " +
      "layout can be reviewed before the punch pilot starts. Nothing here is real and nothing " +
      "was written to the database. Drop <code>?demo=1</code> from the URL for the real page." +
      "<br><strong>Remove Shift</strong> — try it on " + DEMO_DAY + ": Scarlet Witch (a one-minute double tap), " +
      "Captain America (two real shifts), Hawkeye (already removed). A removal lasts until you reload.";
    main.insertBefore(b, main.querySelector(".att-when, .filters"));
  });

  console.log("[demo] attendance reads replaced with fake data. Nothing hits the database.");
  void realShifts;
})();
