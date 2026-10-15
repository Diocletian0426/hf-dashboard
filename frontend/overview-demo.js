// -----------------------------------------------------------------------------
// DEV DEMO DATA — Overview map only. NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=truck to the URL:
//     index.html?demo=truck
//
// It fills the map's people-and-drivers layer so it can be seen full before
// the real crew list and real driver punches are flowing: an invented crew
// spread over the REAL sites (both payrolls, so most pins get a figure), and
// four invented drivers whose punches today cover every look a lorry has —
// on shift after three stops, punched out after two sites, two sessions at
// one site then a second site, and no punch at all — all at real sites, so
// the lines land where real ones would.
//
// IT WRITES NOTHING. Three READ commands are shadowed for this page load only:
//   Dash.getProjectPulse    the real one, untouched — remembered so the fake
//                           crew and drivers can stand on real sites
//   Dash.getManpowerBySite  the real rows PLUS the invented crew and drivers.
//                           Real DRIVERS are left out: their punches are not
//                           read here, so they would all show as "no punch
//                           today" when they may well be on the road.
//   Dash.getRecentPunches   invented punches for the four demo drivers only
//                           (real punches are not read)
// Every save / delete on Dash is left alone and nothing here calls one.
//
// Names are the Avengers test crew, the convention the real test rows already
// use, so a demo row can never be mistaken for a real worker or driver. No
// Math.random: a reload draws the same map, so a screenshot keeps matching
// the screen.
//
// TO REMOVE BEFORE THE PILOT: delete this file and its <script> tag in
// index.html.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  if (new URLSearchParams(location.search).get("demo") !== "truck") return;   // self-gate

  var CREW = ["Iron-Man", "Captain America", "Black Widow", "Hulk", "Thor", "Hawkeye",
              "Falcon", "Scarlet Witch", "Vision", "War Machine", "Ant-Man", "Wasp",
              "Spider-Man", "Black Panther", "Doctor Strange", "Captain Marvel",
              "Winter Soldier", "Okoye", "Shuri", "Valkyrie", "Wong", "Gamora",
              "Drax", "Rocket", "Groot", "Mantis", "Nebula", "Star-Lord"];
  var ROLES = ["operator", "general_worker", "welder", "rigger"];

  // A fixed, uneven spread over the sites in code order: HF-BP count, Hai Fu
  // count. Every seventh site is left empty — a map where every pin has a
  // crew would hide what an empty site looks like.
  var SPREAD = [[2, 1], [1, 0], [3, 2], [1, 1], [0, 1], [2, 0], [0, 0]];

  // two per payroll; staff_id ties each to its punches below
  var DRIVERS = [
    { id: "demo-driver-1", name: "Nick Fury (demo)",    company: "HF-BP" },
    { id: "demo-driver-2", name: "Maria Hill (demo)",   company: "Hai Fu" },
    { id: "demo-driver-3", name: "Phil Coulson (demo)", company: "HF-BP" },
    { id: "demo-driver-4", name: "Happy Hogan (demo)",  company: "Hai Fu" }
  ];

  // the page's own test for a driver (index.html isDriver)
  function isDriver(s) {
    var r = String((s && s.role) || "").trim().toLowerCase();
    return r === "driver" || r === "lorry_driver";
  }

  // East Malaysia is off this map; a demo worker there would never be drawn
  var OFF_MAP = { "Sabah": 1, "Sarawak": 1, "Labuan": 1, "SBH": 1, "SWK": 1 };

  function prefixOf(p) {
    var m = String(p.project_code || "").toUpperCase().match(/^HF-([A-Z]{3})/);
    return m ? m[1] : "";
  }

  function onMap(p) {
    if (p.state) return !OFF_MAP[p.state];
    var pre = prefixOf(p);
    return !!pre && !OFF_MAP[pre];
  }

  // ---- 1. the pulse: the real one, remembered ------------------------------
  var realPulse = Dash.getProjectPulse;
  var pulseP = null;
  Dash.getProjectPulse = function () {
    pulseP = realPulse.apply(Dash, arguments);
    return pulseP;
  };

  // the real sites, in code order, on the peninsula. The page asks for the
  // pulse first, so this normally rides the same request; if it ever asks for
  // the crew first, the pulse is read once here instead.
  function sites() {
    var p = pulseP || Dash.getProjectPulse();
    return Promise.resolve(p).then(function (rows) {
      return (rows || []).filter(onMap).sort(function (a, b) {
        return String(a.project_code).localeCompare(String(b.project_code));
      });
    }, function () { return []; });
  }

  // ---- 2. the drivers' days: who punched where, deterministically ----------
  // The days mirror the reviewed screen: driver 1 goes from the first
  // Selangor site out to Pahang and back (three stops, on shift); driver 2
  // works the second Selangor site, then the last Pahang one and punches out
  // there; driver 3 has two sessions at the last Selangor site, then one in
  // Negeri Sembilan (on shift); driver 4 has not punched (idle on the first
  // Selangor site, beside driver 1, so two lorries share a dot). A missing
  // state falls back to another real site, never an error.
  var daysP = null;
  function days() {
    return daysP || (daysP = sites().then(function (list) {
      if (list.length < 2) return null;
      function by(prefixes, state) {
        return list.filter(function (p) {
          return prefixes.indexOf(prefixOf(p)) !== -1 || (state && p.state === state);
        });
      }
      // the i-th of a group, else the i-th site overall
      function pick(group, i) {
        if (group.length) return group[Math.min(i, group.length - 1)];
        return list[i % list.length];
      }
      // never a move from a site to itself
      function other(a, b) {
        if (String(a.project_id) !== String(b.project_id)) return b;
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].project_id) !== String(a.project_id)) return list[i];
        }
        return b;
      }
      var sgr  = by(["SGR"], "Selangor");
      var nsn  = by(["NSN"], "Negeri Sembilan");
      var east = by(["PAH", "PHG"], "Pahang");
      if (!east.length) east = by(["TRG", "KLT", "KTN"], null);
      var west = pick(sgr, 0), second = pick(sgr, 1), coast = pick(sgr, sgr.length - 1);
      // [site, "in" time, "out" time or null], oldest first; the assigned
      // site is where the crew list says the driver belongs
      return [
        { home: west, sessions: [[west, "07:58", "09:40"],
                                 [other(west, pick(east, 0)), "11:58", "13:30"],
                                 [west, "15:05", null]] },
        { home: second, sessions: [[second, "08:10", "10:15"],
                                   [other(second, pick(east, east.length - 1)), "12:40", "16:20"]] },
        { home: coast, sessions: [[coast, "07:45", "09:30"],
                                  [coast, "09:50", "12:05"],
                                  [other(coast, pick(nsn, 0)), "13:20", null]] },
        { home: west, sessions: [] }
      ];
    }));
  }

  // ---- 3. the crew: real rows plus the invented crew and drivers -----------
  var realManpower = Dash.getManpowerBySite;
  Dash.getManpowerBySite = async function () {
    var real = [];
    try { real = (await realManpower.apply(Dash, arguments)) || []; } catch (e) { real = []; }
    real = real.filter(function (s) { return !isDriver(s); });
    var list = await sites();
    var plan = await days();
    var crew = [], k = 0;
    list.forEach(function (p, i) {
      var n = SPREAD[i % SPREAD.length];
      [["HF-BP", n[0]], ["Hai Fu", n[1]]].forEach(function (c) {
        for (var j = 0; j < c[1]; j++, k++) {
          crew.push({
            staff_id: "demo-staff-" + k,
            full_name: CREW[k % CREW.length] + (k >= CREW.length ? " 2" : "") + " (demo)",
            role: ROLES[k % ROLES.length],
            company: c[0],
            current_project_id: p.project_id,
            project_code: p.project_code,
            project_name: p.project_name
          });
        }
      });
    });
    var drivers = plan ? DRIVERS.map(function (d, i) {
      return {
        staff_id: d.id,
        full_name: d.name,
        role: "driver",
        company: d.company,
        current_project_id: plan[i].home.project_id,
        project_code: plan[i].home.project_code,
        project_name: plan[i].home.project_name
      };
    }) : [];
    return real.concat(crew, drivers);
  };

  // ---- 4. the punches: the four drivers' day, newest first like the RPC ----
  // Shaped like v_worker_punches. Fixed Malaysia times (+08:00) on the date
  // asked for, so a reload draws the same lorries in the same places.
  Dash.getRecentPunches = async function (date, projectId) {
    var plan = await days();
    if (!plan) return [];
    var day = String(date || Dash.todayKL()), out = [], n = 0;
    function row(d, site, type, hhmm) {
      n++;
      return {
        punch_id: "demo-punch-" + n,
        staff_id: d.id,
        full_name: d.name,
        project_id: site.project_id,
        project_name: site.project_name,
        punch_type: type,
        punched_at: day + "T" + hhmm + ":00+08:00",
        punch_date_local: day,
        gps_latitude: null,
        gps_longitude: null,
        verification_status: "verified",
        detected_project_id: site.project_id,
        punched_by: d.id,
        synced_late: false
      };
    }
    DRIVERS.forEach(function (d, i) {
      plan[i].sessions.forEach(function (s) {
        out.push(row(d, s[0], "in", s[1]));
        if (s[2]) out.push(row(d, s[0], "out", s[2]));
      });
    });
    if (projectId) {
      out = out.filter(function (r) { return String(r.project_id) === String(projectId); });
    }
    return out.sort(function (a, b) { return a.punched_at < b.punched_at ? 1 : -1; });
  };

  // a banner, so nobody mistakes this screen for the real one
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main");
    if (!main) return;
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.style.cssText = "margin:0 0 16px";
    b.innerHTML = "<strong>Demo data</strong> — the map is showing an invented crew and four " +
      "invented drivers with today's punches so the workers-and-drivers layer can be reviewed. " +
      "The sites are real; the people are not, and nothing was written to the database. Drop " +
      "<code>?demo=truck</code> from the URL for the real map.";
    main.insertBefore(b, main.querySelector(".map-layout"));
  });

  console.log("[demo] overview crew + punch reads replaced with fake data. Nothing hits the database.");
})();
