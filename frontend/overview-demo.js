// -----------------------------------------------------------------------------
// DEV DEMO DATA — Overview map only. NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=truck to the URL:
//     index.html?demo=truck
//
// It fills the map's people-and-drivers layer so it can be seen full before
// the real crew list and the real trip book are flowing: an invented crew
// spread over the REAL sites (both payrolls, so most pins get a figure), and
// four invented trips on the road today, each by its own driver, between real
// sites — so the lines land where real ones would.
//
// IT WRITES NOTHING. Three READ commands are shadowed for this page load only:
//   Dash.getProjectPulse    the real one, untouched — remembered so the fake
//                           crew and trips can stand on real sites
//   Dash.getManpowerBySite  the real rows PLUS the invented crew
//   Dash.getDeliveries      invented trips only (the real book is not read)
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

  var DRIVERS = [
    { name: "Nick Fury (demo)",    vehicle: "Lorry" },
    { name: "Maria Hill (demo)",   vehicle: "Cargo" },
    { name: "Phil Coulson (demo)", vehicle: "Lorry" },
    { name: "Happy Hogan (demo)",  vehicle: "Loader" }
  ];

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

  // ---- 2. the crew: real rows plus the invented crew ------------------------
  var realManpower = Dash.getManpowerBySite;
  Dash.getManpowerBySite = async function () {
    var real = [];
    try { real = (await realManpower.apply(Dash, arguments)) || []; } catch (e) { real = []; }
    var list = await sites();
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
    return real.concat(crew);
  };

  // ---- 3. the trip book: four trips on the road today -----------------------
  // The legs mirror the reviewed screen: a long one west to east, one from the
  // second Selangor site north-east, one down to Negeri Sembilan, and a short
  // hop between two Selangor sites. Each end is picked from whatever sites
  // exist; a missing state falls back to another real site, never an error.
  Dash.getDeliveries = async function () {
    var list = await sites();
    var empty = { ok: true, can_edit: false, can_delete: false, deliveries: [],
                  drivers: DRIVERS.map(function (d) { return { name: d.name, vehicle: d.vehicle }; }) };
    if (list.length < 2) return empty;

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
    // never a trip from a site to itself
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
    // the ends are written the ways the book really gets them — a code, a
    // code without the HF- prefix, a site name — so the page's matching is
    // exercised along with the drawing
    var legs = [
      [west,   other(west,   pick(east, 0)),               "code",  "name"],
      [second, other(second, pick(east, east.length - 1)), "short", "code"],
      [coast,  other(coast,  pick(nsn, 0)),                "name",  "code"],
      [west,   other(west,   second),                      "name",  "short"]
    ];

    function as(p, how) {
      if (how === "name" && p.project_name) return p.project_name;
      if (how === "short") return String(p.project_code || "").replace(/^HF-/, "");
      return p.project_code;
    }

    var today = Dash.todayKL();
    empty.deliveries = legs.map(function (l, i) {
      return {
        id: "demo-trip-" + (i + 1),
        date: today,
        from: as(l[0], l[2]),
        to: as(l[1], l[3]),
        driver: DRIVERS[i].name,
        doNum: "DO-DEMO-" + (101 + i),
        remark: "demo trip",
        received: false,
        items: [{ item: ["600mm auger", "Casing 1.2m", "Tremie pipe", "Kelly bar"][i], qty: "1" }]
      };
    });
    return empty;
  };

  // a banner, so nobody mistakes this screen for the real one
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main");
    if (!main) return;
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.style.cssText = "margin:0 0 16px";
    b.innerHTML = "<strong>Demo data</strong> — the map is showing an invented crew and four " +
      "invented trips so the workers-and-drivers layer can be reviewed. The sites are real; the " +
      "people are not, and nothing was written to the database. Drop <code>?demo=truck</code> " +
      "from the URL for the real map.";
    main.insertBefore(b, main.querySelector(".map-layout"));
  });

  console.log("[demo] overview crew + trip reads replaced with fake data. Nothing hits the database.");
})();
