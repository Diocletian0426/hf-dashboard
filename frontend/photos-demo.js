// -----------------------------------------------------------------------------
// DEV DEMO DATA — punch photos, on photos.html. NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=1 to the URL:
//     photos.html?demo=1               (an office login holding selfie.view)
//     photos.html?demo=1&viewonly=1    (a login WITHOUT selfie.view: the page is refused)
//
// It answers the two photo calls of the engine (DB 0138) from invented rows:
// the Avengers test crew, a worker with a second shift, a punch with no photo,
// an excused worker, a photo whose file is gone. The pictures are drawn here.
// IT READS AND WRITES NOTHING: no database, no file store.
//
// MUST load AFTER dashboard-client.js and BEFORE shell.js.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("demo") !== "1") return;                        // self-gate

  var VIEW_ONLY = params.get("viewonly") === "1";
  var PERMS = ["attendance.view", "manpower.view"].concat(VIEW_ONLY ? [] : ["selfie.view"]);
  var ACCESS = { ok: true, access: {
    full_name: "Nick Fury (demo)", designation: "office", role: null, status: "active",
    access_profile_code: "demo", access_profile_name: VIEW_ONLY ? "Demo — view only" : "Demo",
    scope_all_projects: true, permissions: PERMS, project_ids: [], legacy: false
  }};
  var USER = { id: "demo-user", email: "demo@example.invalid" };
  var SITES = [
    { id: "demo-site-1", code: "HF-SGR-004",  name: "UMECH - RAWANG (DEMO)" },
    { id: "demo-site-2", code: "HF-KDH-002A", name: "MCS SIK BRIDGE 2 (DEMO)" }
  ];

  Dash.requireLogin = function () {
    return new Promise(function (resolve) {
      if (document.readyState !== "loading") resolve(USER);
      else document.addEventListener("DOMContentLoaded", function () { resolve(USER); });
    });
  };
  Dash.getUser = async function () { return USER; };
  Dash.getMyAccess = async function () { return ACCESS; };
  Dash.can = function (p) { return PERMS.indexOf(p) !== -1; };
  Dash.getProjectDirectory = async function () {
    return SITES.map(function (s) {
      return { project_id: s.id, project_code: s.code, project_name: s.name, status: "active", has_bored_scope: true, client_name: "Demo" };
    });
  };
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main"), err = document.getElementById("error");
    if (!main || !err) return;
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.innerHTML = "<strong>Demo data</strong> — invented punches and drawn pictures so the page can be reviewed. " +
      "Nothing here is real. Drop <code>?demo=1</code> from the URL for the real page.";
    main.insertBefore(b, err);
  });

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // [code, name, site, [[type, 'HH:MM' KL, photo]...]]  photo: photo | no_photo | not_needed | gone
  var CREW = [
    ["BP-D01", "Iron Man (demo)",        0, [["in", "07:52", "photo"], ["out", "17:01", "photo"], ["in", "17:02", "photo"], ["out", "20:15", "photo"]]],
    ["BP-D02", "Thor (demo)",            0, [["in", "08:00", "photo"], ["out", "17:04", "photo"]]],
    ["HS-D03", "Hulk (demo)",            1, [["in", "08:21", "photo"], ["out", "16:08", "no_photo"]]],
    ["BP-D04", "Captain America (demo)", 0, [["in", "07:45", "photo"]]],
    ["HS-D05", "Black Widow (demo)",     1, [["in", "08:05", "not_needed"], ["out", "17:00", "not_needed"]]],
    ["BP-D06", "Hawkeye (demo)",         1, [["in", "08:10", "gone"], ["out", "17:02", "photo"]]]
  ];

  // a work day -> rows shaped like get_punch_selfies. The day before today has a smaller crew.
  Dash.getPunchPhotos = async function (date) {
    await wait(120);
    var crew = date === Dash.todayKL() ? CREW : CREW.slice(0, 3);
    var rows = [];
    crew.forEach(function (w, wi) {
      w[3].forEach(function (p, pi) {
        var has = p[2] === "photo" || p[2] === "gone";
        rows.push({
          punch_id: "demo-punch-" + wi + "-" + pi, staff_id: "demo-staff-" + wi, employee_code: w[0], full_name: w[1],
          project_id: SITES[w[2]].id, project_name: SITES[w[2]].name, punch_type: p[0], shift_no: pi < 2 ? 1 : 2,
          punched_at: date + "T" + p[1] + ":00+08:00", photo: has ? "photo" : p[2],
          path: has ? (p[2] === "gone" ? "gone/" : "") + w[0] + "/" + date + "/" + p[0] + "-" + p[1].replace(":", "") + ".jpg" : null,
          photo_at: has ? date + "T" + p[1] + ":05+08:00" : null
        });
      });
    });
    return rows;
  };

  // a drawn stand-in for each file; a "gone/" path gets a link that does not load
  var HUES = { "BP-D01": 0, "BP-D02": 45, "HS-D03": 120, "BP-D04": 215, "BP-D06": 280 };
  Dash.punchPhotoUrls = async function (paths) {
    await wait(120);
    var out = {};
    (paths || []).forEach(function (path) {
      if (/^gone\//.test(path)) { out[path] = "data:image/jpeg;base64,AAAA"; return; }
      var code = path.split("/")[0], label = path.split("/").pop().replace(".jpg", "");
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640">' +
        '<rect width="100%" height="100%" fill="hsl(' + (HUES[code] || 0) + ',45%,82%)"/>' +
        '<circle cx="240" cy="250" r="110" fill="hsl(' + (HUES[code] || 0) + ',40%,55%)"/>' +
        '<rect x="90" y="390" width="300" height="250" rx="120" fill="hsl(' + (HUES[code] || 0) + ',40%,55%)"/>' +
        '<text x="240" y="60" font-family="Georgia" font-size="34" text-anchor="middle" fill="#0f172a">' + code + "</text>" +
        '<text x="240" y="100" font-family="Georgia" font-size="24" text-anchor="middle" fill="#334155">' + label + "</text></svg>";
      out[path] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    return out;
  };

  console.log("[demo] punch photos: reads replaced with invented rows and drawn pictures. Nothing hits the database.");
})();
