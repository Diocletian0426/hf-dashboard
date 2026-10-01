// -----------------------------------------------------------------------------
// DEV DEMO DATA — requests.html only. NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=1 to the URL:
//     requests.html?demo=1               (an office login that may approve)
//     requests.html?demo=1&viewonly=1    (attendance.view only — no buttons)
//
// It stands in for the sign-in AND for every engine read/write this page and
// the shell make, so the page can be reviewed (and screenshotted by the
// Playwright harness) with no login at all: eight invented requests, both
// kinds, all three statuses, two sites, one long reason in Malay.
//
// IT WRITES NOTHING. Approve / Reject change the in-memory list for this page
// load only — no database call is made while this is on. Approving Captain
// America's missed shift is scripted to be REFUSED the way the database would
// (overlaps_existing_shift), so the error path can be seen too; so is undoing
// Hawkeye's approval (punches_changed). Undo on any other approved row flips
// it to Rejected, again in memory only.
//
// Names are the Avengers test crew (the convention attendance-demo.js and the
// real test rows use), so a demo row can never be mistaken for a real worker.
//
// MUST load AFTER dashboard-client.js and BEFORE shell.js — the shell asks
// for the login the moment it runs.
//
// TO REMOVE BEFORE THE PILOT: delete this file and its <script> tag in
// requests.html.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("demo") !== "1") return;                        // self-gate

  var VIEW_ONLY = params.get("viewonly") === "1";
  var PERMS = ["attendance.view"].concat(VIEW_ONLY ? [] : ["attendance.edit"]);

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
  function hoursAgo(h) { return new Date(Date.now() - h * 3600000).toISOString(); }
  function at(iso, hhmm) { return hhmm ? iso + "T" + hhmm + ":00+08:00" : null; }

  // one request in the RPC's shape — the *_at fields are derived from the
  // *_local ones here only because there is no database behind the demo
  function req(o) {
    var site = SITES[o.site];
    return {
      request_id: o.id, type: o.type, status: o.status,
      staff_id: "demo-" + o.name, full_name: o.name, employee_code: o.code,
      project_id: site.id, project_name: site.name,
      work_date: o.date, shift_no: o.shift || null,
      requested_in_at: at(o.date, o.inL), requested_out_at: at(o.date, o.outL),
      requested_in_local: o.inL || null, requested_out_local: o.outL || null,
      original_in_local: o.origIn || null, original_out_local: o.origOut || null,
      reason: o.reason, note: o.note || null,
      created_at: o.created,
      reviewed_at: o.reviewedAt || null, reviewed_by_name: o.reviewedBy || null
    };
  }

  var FURY = "Nick Fury (demo)";
  var ROWS = [
    req({ id: "demo-r1", type: "missed_shift", status: "pending", name: "Hulk (demo)", code: "BP-D04",
          site: 0, date: day(2), inL: "08:00", outL: "18:30", created: hoursAgo(20),
          reason: "Saya lupa tekan punch masuk dan keluar sebab telefon habis bateri dari pagi. " +
                  "Supervisor Encik Rahman nampak saya kerja dekat rig nombor 2 dari pagi sampai " +
                  "petang, tolong tanya dia. Minta maaf boss, lepas ni saya caj telefon malam." }),
    req({ id: "demo-r2", type: "change_times", status: "pending", name: "Thor (demo)", code: "BP-D05",
          site: 1, date: day(1), shift: 1, origIn: "07:58", origOut: "18:05", inL: "07:30", outL: null,
          created: hoursAgo(3), reason: "come early unload casing, forget punch" }),
    req({ id: "demo-r3", type: "change_times", status: "pending", name: "Black Widow (demo)", code: "BP-D03",
          site: 0, date: day(3), shift: 2, origIn: "19:00", origOut: "23:10", inL: null, outL: "22:00",
          created: hoursAgo(50), reason: "punch out late. no signal at site" }),
    req({ id: "demo-r4", type: "missed_shift", status: "pending", name: "Captain America (demo)", code: "BP-D02",
          site: 1, date: day(5), inL: "08:00", outL: "17:00", created: hoursAgo(98),
          reason: "phone rosak. kerja full day" }),
    req({ id: "demo-r5", type: "missed_shift", status: "approved", name: "Iron-Man (demo)", code: "BP-D01",
          site: 0, date: day(8), inL: "08:00", outL: "18:00", created: hoursAgo(8 * 24 - 5),
          reason: "new phone, app not install yet",
          note: "Supervisor confirmed he was on site.", reviewedBy: FURY, reviewedAt: hoursAgo(7 * 24) }),
    req({ id: "demo-r6", type: "change_times", status: "approved", name: "Hawkeye (demo)", code: "BP-D06",
          site: 1, date: day(10), shift: 1, origIn: "08:10", origOut: "17:45", inL: "08:00", outL: "18:00",
          created: hoursAgo(10 * 24 - 6), reason: "app slow, punch late both time",
          reviewedBy: FURY, reviewedAt: hoursAgo(9 * 24) }),
    req({ id: "demo-r7", type: "missed_shift", status: "rejected", name: "Falcon (demo)", code: "BP-D07",
          site: 0, date: day(12), inL: "08:00", outL: "20:00", created: hoursAgo(12 * 24 - 4),
          reason: "work",
          note: "Site was stopped that day for rain — no work recorded by the supervisor.",
          reviewedBy: FURY, reviewedAt: hoursAgo(11 * 24) }),
    req({ id: "demo-r8", type: "change_times", status: "rejected", name: "Scarlet Witch (demo)", code: "BP-D08",
          site: 1, date: day(14), shift: 1, origIn: "08:02", origOut: "17:30", inL: null, outL: "21:00",
          created: hoursAgo(14 * 24 - 2), reason: "stay back for concreting",
          note: "Overtime not approved by the site manager.", reviewedBy: FURY, reviewedAt: hoursAgo(13 * 24) })
  ];

  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---- the sign-in the shell asks for --------------------------------------
  var ACCESS = { ok: true, access: {
    full_name: FURY, designation: "office", role: null, status: "active",
    access_profile_code: "demo", access_profile_name: VIEW_ONLY ? "Demo — view only" : "Demo",
    scope_all_projects: true, permissions: PERMS, project_ids: [], legacy: false
  }};
  var USER = { id: "demo-user", email: "demo@example.invalid" };
  // Answers once the page has parsed, like a real sign-in round trip would.
  // Answering at once would let the shell finish booting before the page
  // script below it has even defined window.onShellReady.
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

  // ---- the two request commands --------------------------------------------
  Dash.getAttendanceRequests = async function (opts) {
    opts = opts || {};
    await wait(150);
    var inRange = ROWS.filter(function (r) {
      if (opts.projectId && r.project_id !== opts.projectId) return false;
      if (opts.from && r.work_date < opts.from) return false;
      if (opts.to && r.work_date > opts.to) return false;
      return true;
    });
    var counts = { pending: 0, approved: 0, rejected: 0 };
    inRange.forEach(function (r) { counts[r.status]++; });
    var rows = inRange.filter(function (r) {
      return !opts.status || opts.status === "all" || r.status === opts.status;
    }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })       // newest first
      .slice(0, opts.limit || 300);
    return { ok: true, requests: copy(rows), counts: counts };
  };

  Dash.reviewAttendanceRequest = async function (id, decision, note) {
    await wait(350);
    if (!Dash.can("attendance.edit"))
      return { ok: false, code: "forbidden", message: "Your account may not review attendance requests." };
    var r = ROWS.filter(function (x) { return x.request_id === id; })[0];
    if (!r) return { ok: false, code: "not_found", message: "That request no longer exists." };
    if (r.status !== "pending")
      return { ok: false, code: "already_reviewed", message: "This request was already " + r.status + " by " +
               (r.reviewed_by_name || "someone") + "." };
    if (decision !== "approved" && decision !== "rejected")
      return { ok: false, code: "bad_decision", message: "Decision must be approved or rejected." };
    if (decision === "approved" && id === "demo-r4")
      return { ok: false, code: "overlaps_existing_shift",
               message: "Captain America (demo) already has a shift on that day (07:55–17:20), so the missed " +
                        "shift cannot be added. Reject it, or ask him for a Change Times request instead." };
    r.status = decision;
    r.note = note || null;
    r.reviewed_at = new Date().toISOString();
    r.reviewed_by_name = FURY;
    return { ok: true, status: decision,
             message: decision === "rejected" ? "Request rejected."
                    : r.type === "missed_shift" ? "Approved — the In and Out punches were added for " + r.full_name + "."
                    : "Approved — the new times now stand for " + r.full_name + "'s shift." };
  };

  // Undo an approval: flips the row to Rejected, in memory only. Hawkeye's
  // approval is scripted to be refused (punches_changed) so that path shows.
  Dash.revokeAttendanceRequest = async function (id, note) {
    await wait(350);
    if (!Dash.can("attendance.edit"))
      return { ok: false, code: "forbidden", message: "Your account may not undo attendance approvals." };
    var r = ROWS.filter(function (x) { return x.request_id === id; })[0];
    if (!r) return { ok: false, code: "not_found", message: "That request no longer exists." };
    if (r.status !== "approved")
      return { ok: false, code: "not_approved", message: "Only an approved request can be undone — this one is " +
               r.status + "." };
    if (!note || !String(note).trim())
      return { ok: false, code: "note_required", message: "Say why the approval is withdrawn." };
    if (id === "demo-r6")
      return { ok: false, code: "punches_changed",
               message: "Hawkeye (demo)'s shift has been changed since this was approved, so the approval cannot " +
                        "be undone here. Correct the day on the Attendance page instead." };
    r.status = "rejected";
    r.note = String(note).trim();
    r.reviewed_at = new Date().toISOString();
    r.reviewed_by_name = FURY;
    return { ok: true, status: "rejected", message: "Approval withdrawn — " + r.full_name + "'s request is now rejected." };
  };

  // a banner, so nobody mistakes this screen for the real one
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main");
    if (!main) return;
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.innerHTML = "<strong>Demo data</strong> — invented requests so the layout can be reviewed. " +
      "Nothing here is real and Approve / Reject write nothing to the database. Drop " +
      "<code>?demo=1</code> from the URL for the real page.";
    main.insertBefore(b, document.getElementById("rq-stats"));
  });

  console.log("[demo] requests page: sign-in + request reads/writes replaced. Nothing hits the database.");
})();
