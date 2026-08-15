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
    var row = {
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
    }
    // punched out the next morning: the overlong flag's whole reason to exist
    if (dom === 19 && w.name.indexOf("Thor") === 0) {
      row.last_out_at = stamp(iso, 24 + 9.4);
      row.hours_on_site = Math.round((24 + 9.4 - inAt) * 100) / 100;
      row.overlong_shift = true;
    }
    // punched from outside the fence
    if (dom % 7 === 3 && w.site === 2) row.has_anomaly = true;
    // still on site right now (today only)
    if (iso === Dash.todayKL() && w.name.indexOf("Falcon") === 0) {
      row.last_out_at = null; row.out_count = 0; row.hours_on_site = null;
    }
    return row;
  }

  function punchesFor(row) {
    var out = [];
    var far = row.has_anomaly;
    out.push({
      punched_at: row.first_in_at, full_name: row.full_name, punch_type: "in",
      project_name: row.project_name,
      gps_lat: 3.3215 + wobble(row.full_name, row.work_date, 0.004),
      gps_lng: 101.5771 + wobble(row.full_name, row.work_date + "y", 0.004),
      distance_m: far ? 840 : Math.round(12 + Math.abs(wobble(row.full_name, row.work_date, 60))),
      verification_status: far ? "outside_geofence" : "verified"
    });
    if (row.last_out_at) {
      out.push({
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
  Dash.getRecentPunches = async function (date, projectId) {
    var out = [];
    shiftsOn(date, projectId || null).forEach(function (r) { out = out.concat(punchesFor(r)); });
    return out.sort(function (a, b) { return a.punched_at < b.punched_at ? 1 : -1; });  // newest first, as the real one does
  };
  Dash.getSitesMissingGeofence = async function () {
    return [{ project_name: SITES[1].name, active_workers_assigned: 3 }];
  };

  // a banner, so nobody mistakes this screen for the real one
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main");
    if (!main) return;
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.style.cssText = "margin:0 0 16px";
    b.innerHTML = "<strong>Demo data</strong> — this page is showing an invented crew so the " +
      "layout can be reviewed before the punch pilot starts. Nothing here is real and nothing " +
      "was written to the database. Drop <code>?demo=1</code> from the URL for the real page.";
    main.insertBefore(b, main.querySelector(".filters"));
  });

  console.log("[demo] attendance reads replaced with fake data. Nothing hits the database.");
  void realShifts;
})();
