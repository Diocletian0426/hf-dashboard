// -----------------------------------------------------------------------------
// DEV DEMO DATA — leave, on leave.html and requests.html. NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=1 to the URL:
//     leave.html?demo=1                  (an office login that may add / cancel)
//     leave.html?demo=1&viewonly=1       (leave.view only — no buttons)
//     requests.html?demo=1&kind=leave    (the Leave kind among the requests)
//
// It answers the leave calls of the engine (DB 0134-0136) from invented rows:
// the Avengers test crew, every status, plain Leave waiting for its kind, an MC
// with a proof file, an MC with none. On leave.html it also stands in for the
// sign-in; on requests.html the sign-in is requests-demo.js's and this file
// only adds the leave permissions to it.
//
// IT WRITES NOTHING. Approve / Reject / Cancel / Add Leave change the in-memory
// list for this page load only, with the database's own refusals and words:
// type_required (plain Leave approved with no kind), proof_required (an MC with
// no file and no Proof Seen), note_required, already_reviewed, overlaps_leave,
// no_working_days.
//
// MUST load AFTER dashboard-client.js (and after requests-demo.js where that is
// present) and BEFORE shell.js.
//
// TO REMOVE BEFORE THE PILOT: delete this file and its <script> tags in
// leave.html and requests.html.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("demo") !== "1") return;                        // self-gate

  var VIEW_ONLY = params.get("viewonly") === "1";
  var ON_LEAVE_PAGE = /leave\.html$/.test(location.pathname);
  var LEAVE_PERMS = ["leave.view"].concat(VIEW_ONLY ? [] : ["leave.create", "leave.edit", "leave.approve"]);
  var FURY = "Nick Fury (demo)";

  var SITES = [
    { id: "demo-site-1", code: "HF-SGR-004",  name: "UMECH - RAWANG (DEMO)" },
    { id: "demo-site-2", code: "HF-KDH-002A", name: "MCS SIK BRIDGE 2 (DEMO)" }
  ];
  var CREW = [
    { id: "demo-Iron Man (demo)",        name: "Iron Man (demo)",        code: "BP-D01", site: 0 },
    { id: "demo-Thor (demo)",            name: "Thor (demo)",            code: "BP-D02", site: 0 },
    { id: "demo-Hulk (demo)",            name: "Hulk (demo)",            code: "HS-D03", site: 1 },
    { id: "demo-Captain America (demo)", name: "Captain America (demo)", code: "BP-D04", site: 0 },
    { id: "demo-Black Widow (demo)",     name: "Black Widow (demo)",     code: "HS-D05", site: 1 },
    { id: "demo-Hawkeye (demo)",         name: "Hawkeye (demo)",         code: "BP-D06", site: 1 },
    { id: "demo-Falcon (demo)",          name: "Falcon (demo)",          code: "HS-D07", site: 0 },
    { id: "demo-Scarlet Witch (demo)",   name: "Scarlet Witch (demo)",   code: "BP-D08", site: 1 }
  ];

  var today = Dash.todayKL();
  function day(n) {                                    // today plus n days
    var d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // the next Monday-to-Saturday date on or after today + n (a leave never starts on a Sunday here)
  function workday(n) {
    var iso = day(n);
    return new Date(iso + "T00:00:00Z").getUTCDay() === 0 ? day(n + 1) : iso;
  }
  function hoursAgo(h) { return new Date(Date.now() - h * 3600000).toISOString(); }
  // the database's count: Monday to Saturday (no holiday list in the demo)
  function countDays(a, b, half) {
    var n = 0, d = new Date(a + "T00:00:00Z"), end = new Date(b + "T00:00:00Z");
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() !== 0) n++;
    return half ? n * 0.5 : n;
  }
  var seq = 0;
  function lv(o) {
    var w = CREW[o.who], s = SITES[w.site];
    var end = o.end || o.start;
    return {
      request_id: "demo-lv-" + (++seq), staff_id: w.id, full_name: w.name, employee_code: w.code,
      company_code: w.code.indexOf("HS") === 0 ? "Hai Fu" : "HF-BP",
      project_id: s.id, project_name: s.name,
      leave_type: o.type, start_date: o.start, end_date: end, half_day: !!o.half,
      days: countDays(o.start, end, o.half), reason: o.reason || null, attachment_url: null,
      status: o.status || "pending", source: o.source || "worker",
      proof_path: o.proof || null, has_proof: !!o.proof, proof_seen: !!o.seen,
      proof_seen_by_name: o.seen ? FURY : null, requested_type: o.asked_as || o.type,
      review_remarks: o.note && o.status !== "cancelled" ? o.note : null,
      reviewed_by: null, reviewed_by_name: o.status && o.status !== "pending" ? FURY : null,
      reviewed_at: o.status === "approved" || o.status === "rejected" ? hoursAgo(o.answered || 20) : null,
      cancelled_at: o.status === "cancelled" ? hoursAgo(o.answered || 20) : null,
      cancel_reason: o.status === "cancelled" ? o.note : null,
      created_at: hoursAgo(o.asked || 30)
    };
  }

  var ROWS = [
    // waiting for the office
    lv({ who: 0, type: "leave", start: workday(5), end: workday(7), reason: "balik kampung, family matter", asked: 3 }),
    lv({ who: 1, type: "mc", start: workday(-1), reason: "demam", proof: "demo/thor-mc.jpg", asked: 20 }),
    lv({ who: 2, type: "mc", start: workday(-2), end: workday(-1), reason: "sakit perut", asked: 40 }),
    lv({ who: 3, type: "leave", start: workday(1), half: true, reason: "urusan bank, pagi sahaja", asked: 6 }),
    // answered
    lv({ who: 4, type: "annual", start: workday(-6), end: workday(-4), status: "approved", reason: "wedding", asked: 240, answered: 200 }),
    lv({ who: 5, type: "unpaid", start: workday(8), end: workday(12), status: "approved", reason: "going back to Myanmar",
         note: "Approved as unpaid.", asked: 60, answered: 30 }),
    lv({ who: 6, type: "mc", start: workday(0), status: "approved", reason: "fever", proof: "demo/falcon-mc.pdf", asked: 12, answered: 4 }),
    lv({ who: 7, type: "emergency", start: workday(-10), status: "approved", source: "office", reason: "family emergency", asked: 250, answered: 250 }),
    lv({ who: 0, type: "leave", start: workday(-14), end: workday(-13), status: "rejected", reason: "rest",
         note: "Concreting that week — ask again for another date.", asked: 400, answered: 380 }),
    lv({ who: 2, type: "annual", start: workday(15), end: workday(16), status: "cancelled", reason: "trip",
         note: "Worker changed the plan.", asked: 100, answered: 50 })
  ];

  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function find(id) { return ROWS.filter(function (x) { return x.request_id === id; })[0]; }
  var KIND_WORD = { leave: "Leave", annual: "Annual leave", mc: "Medical leave", unpaid: "Unpaid leave", emergency: "Emergency leave" };
  function fmt(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function words(r) {
    return KIND_WORD[r.leave_type] + " " + fmt(r.start_date) + (r.end_date !== r.start_date ? " to " + fmt(r.end_date) : "") +
           " (" + (r.days === 0.5 ? "half day" : r.days === 1 ? "1 day" : r.days + " days") + ")";
  }

  // ---- the sign-in ----------------------------------------------------------
  if (ON_LEAVE_PAGE) {
    var PERMS = ["attendance.view", "manpower.view"].concat(LEAVE_PERMS);
    var ACCESS = { ok: true, access: {
      full_name: FURY, designation: "office", role: null, status: "active",
      access_profile_code: "demo", access_profile_name: VIEW_ONLY ? "Demo — view only" : "Demo",
      scope_all_projects: true, permissions: PERMS, project_ids: [], legacy: false
    }};
    var USER = { id: "demo-user", email: "demo@example.invalid" };
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
    Dash.getManpowerBySite = async function () {
      return CREW.map(function (w) {
        return { staff_id: w.id, full_name: w.name, employee_code: w.code, project_id: SITES[w.site].id, project_name: SITES[w.site].name };
      });
    };
    window.addEventListener("DOMContentLoaded", function () {
      var main = document.getElementById("main"), err = document.getElementById("error");
      if (!main || !err) return;
      var b = document.createElement("div");
      b.className = "banner banner-amber";
      b.innerHTML = "<strong>Demo data</strong> — invented leave so the page can be reviewed. Nothing here is real " +
        "and nothing is written to the database. Drop <code>?demo=1</code> from the URL for the real page.";
      main.insertBefore(b, err);
    });
  } else {
    // requests.html: requests-demo.js owns the sign-in; add the leave permissions to it
    var baseCan = Dash.can, baseAccess = Dash.getMyAccess;
    Dash.can = function (p) { return LEAVE_PERMS.indexOf(p) !== -1 || baseCan(p); };
    Dash.getMyAccess = async function () {
      var a = await baseAccess();
      if (a && a.access && a.access.permissions) {
        a = copy(a);
        a.access.permissions = a.access.permissions.concat(LEAVE_PERMS);
      }
      return a;
    };
  }

  // ---- the leave calls -------------------------------------------------------
  Dash.getLeaveList = async function (opts) {
    opts = opts || {};
    await wait(120);
    return copy(ROWS.filter(function (r) {
      if (opts.status && opts.status !== "all" && r.status !== opts.status) return false;
      if (opts.staffId && r.staff_id !== opts.staffId) return false;
      if (opts.from && r.end_date < opts.from) return false;
      if (opts.to && r.start_date > opts.to) return false;
      return true;
    }).sort(function (a, b) { return a.start_date < b.start_date ? 1 : -1; }));
  };

  Dash.approveLeave = async function (id, asType, note) {
    await wait(300);
    var r = find(id);
    if (!r) return { ok: false, code: "not_found", message: "That request does not exist." };
    if (r.status !== "pending") return { ok: false, code: "already_reviewed", message: "That request was already " + r.status + "." };
    var type = asType || r.leave_type;
    if (type === "leave") return { ok: false, code: "type_required", message: "Pick the kind: Annual, Unpaid, Emergency or Medical." };
    if (type === "mc" && !r.proof_path && !r.proof_seen)
      return { ok: false, code: "proof_required",
               message: "An MC needs its proof: the worker's photo or PDF, or tick Proof Seen if the slip was shown to you." };
    r.status = "approved"; r.leave_type = type; r.review_remarks = note || null;
    r.reviewed_at = new Date().toISOString(); r.reviewed_by_name = FURY;
    return { ok: true, request_id: id, status: "approved", leave_type: type, days: r.days,
             message: "Approved — " + r.full_name + ", " + words(r) + "." };
  };

  Dash.rejectLeave = async function (id, note) {
    await wait(300);
    var r = find(id);
    if (!r) return { ok: false, code: "not_found", message: "That request does not exist." };
    if (r.status !== "pending") return { ok: false, code: "already_reviewed", message: "That request was already " + r.status + "." };
    if (!note || !String(note).trim())
      return { ok: false, code: "note_required", message: "Give the worker a reason for the refusal — it is shown on his phone." };
    r.status = "rejected"; r.review_remarks = String(note).trim();
    r.reviewed_at = new Date().toISOString(); r.reviewed_by_name = FURY;
    return { ok: true, request_id: id, status: "rejected", message: "Rejected — " + r.full_name + " will see it on his phone." };
  };

  Dash.cancelLeave = async function (id, note) {
    await wait(300);
    var r = find(id);
    if (!r) return { ok: false, code: "not_found", message: "That request does not exist." };
    if (r.status !== "pending" && r.status !== "approved")
      return { ok: false, code: "not_cancellable", message: "That request was already " + r.status + "." };
    if (!note || !String(note).trim())
      return { ok: false, code: "note_required", message: "Say why the leave is cancelled — the worker reads it." };
    r.status = "cancelled"; r.cancel_reason = String(note).trim();
    r.cancelled_at = new Date().toISOString(); r.reviewed_by_name = r.reviewed_by_name || FURY;
    return { ok: true, request_id: id, status: "cancelled", message: "Cancelled — " + r.full_name + ", " + words(r) + "." };
  };

  Dash.addLeave = async function (o) {
    await wait(300);
    var w = CREW.filter(function (x) { return x.id === o.staffId; })[0];
    if (!w) return { ok: false, code: "unknown_staff", message: "That worker is not on the staff list." };
    if (!o.start || !o.end || o.end < o.start) return { ok: false, code: "bad_dates", message: "The last day is before the first day." };
    if (o.halfDay && o.start !== o.end) return { ok: false, code: "bad_half_day", message: "A half day is for one date only." };
    if (countDays(o.start, o.end, false) === 0)
      return { ok: false, code: "no_working_days", message: "Those dates are Sundays or public holidays only. No leave is needed." };
    var clash = ROWS.filter(function (r) {
      return r.staff_id === w.id && (r.status === "pending" || r.status === "approved") && r.start_date <= o.end && r.end_date >= o.start;
    })[0];
    if (clash) return { ok: false, code: "overlaps_leave",
      message: "There is already " + (clash.status === "approved" ? "approved" : "a pending") + " leave on " + fmt(clash.start_date) +
               (clash.end_date !== clash.start_date ? " to " + fmt(clash.end_date) : "") + "." };
    if (o.approve && o.type === "leave")
      return { ok: false, code: "type_required", message: "Pick the kind before approving: Annual, Unpaid, Emergency or Medical." };
    if (o.approve && o.type === "mc" && !o.proofSeen)
      return { ok: false, code: "proof_required", message: "An MC needs its proof: tick Proof Seen once you have seen the slip, or leave it pending." };
    var row = lv({ who: CREW.indexOf(w), type: o.type, start: o.start, end: o.end, half: o.halfDay, reason: o.reason,
                   status: o.approve ? "approved" : "pending", source: "office", seen: o.proofSeen, asked: 0, answered: 0 });
    ROWS.push(row);
    return { ok: true, request_id: row.request_id, status: row.status, days: row.days,
             message: (o.approve ? "Approved — " : "Entered — ") + row.full_name + ", " + words(row) + "." };
  };

  Dash.setLeaveProofSeen = async function (id, seen) {
    await wait(150);
    var r = find(id);
    if (!r) return { ok: false, code: "not_found", message: "That request does not exist." };
    r.proof_seen = seen !== false;
    r.proof_seen_by_name = r.proof_seen ? FURY : null;
    return { ok: true, request_id: id, proof_seen: r.proof_seen };
  };

  // a stand-in slip, drawn here: no file store is touched
  Dash.leaveProofUrl = async function (path) {
    await wait(150);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300"><rect width="100%" height="100%" fill="#f8fafc"/>' +
              '<rect x="16" y="16" width="388" height="268" fill="none" stroke="#94a3b8"/>' +
              '<text x="210" y="120" font-family="Georgia" font-size="22" text-anchor="middle" fill="#0f172a">Medical Certificate (demo)</text>' +
              '<text x="210" y="160" font-family="Georgia" font-size="14" text-anchor="middle" fill="#475569">' + String(path).replace(/[<&]/g, "") + "</text></svg>";
    // a blob link: a browser will not open a data: link as a page
    return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  };

  console.log("[demo] leave: reads/writes replaced with invented rows. Nothing hits the database.");
})();
