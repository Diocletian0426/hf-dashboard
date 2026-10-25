// -----------------------------------------------------------------------------
// DEV DEMO DATA — manpower.html only. NOT part of the app.
//
// Off by default. Turn it on by adding ?demo=1 to the URL:
//     manpower.html?demo=1
//
// It stands in for the sign-in AND for every read/write this page and the
// shell make, so the page can be reviewed (and screenshotted by the Playwright
// harness) with no login at all: three invented sites, the Avengers test crew
// spread over them with one of every status, two office staff, one worker
// awaiting deployment, two who left, a machine with nobody to run it, and a
// movement history of By Punch and office moves. (No plans: the page stopped
// showing planning on 25 Oct 2026.)
//
// IT WRITES NOTHING. Move, Add Worker, Edit, Mark As Left, Reactivate, the
// history fixes and the phone buttons change the in-memory lists for this
// page load only — no database call is made while this is on.
//
// MUST load AFTER dashboard-client.js and BEFORE shell.js — the shell asks
// for the login the moment it runs.
//
// TO REMOVE once the page is accepted: delete this file and its <script> tag
// in manpower.html.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("demo") !== "1") return;                        // self-gate

  var PERMS = ["manpower.view", "manpower.edit", "devices.view", "devices.manage", "machines.view"];

  var today = Dash.todayKL();
  function day(n) {                                    // today minus n days
    var d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function ts(iso, hhmm) { return iso + "T" + (hhmm || "08:00") + ":00+08:00"; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var seq = 100;
  function newId(prefix) { seq++; return prefix + "-" + seq; }

  var SITES = [
    { project_id: "demo-site-1", project_code: "HF-SGR-004",  project_name: "UMECH - IOI PUCHONG (DEMO)", status: "active",    has_bored_scope: true,  has_sheet_scope: false, state: "SGR" },
    { project_id: "demo-site-2", project_code: "HF-KDH-002A", project_name: "MCS SIK BRIDGE 2 (DEMO)",    status: "active",    has_bored_scope: true,  has_sheet_scope: false, state: "KDH" },
    { project_id: "demo-site-3", project_code: "HF-SP-901",   project_name: "Satar Empire (DEMO)",        status: "active",    has_bored_scope: false, has_sheet_scope: true,  state: "SGR" },
    { project_id: "demo-site-4", project_code: "HF-PLS-009",  project_name: "Old Bridge (DEMO, completed)", status: "completed", has_bored_scope: true, has_sheet_scope: false, state: "PLS" }
  ];
  function site(id) { return SITES.filter(function (s) { return s.project_id === id; })[0]; }

  var SUPERVISORS = [{ project_id: "demo-site-2", supervisors: "Vision (demo)" }];

  var MACHINES = [
    { machine_id: "demo-m1", machine_code: "BR-D2", machine_type: "boring_rig",    current_site: "HF-SGR-004",  machine_status: "active" },
    { machine_id: "demo-m2", machine_code: "CC-D1", machine_type: "crawler_crane", current_site: "HF-SGR-004",  machine_status: "active" },
    { machine_id: "demo-m3", machine_code: "BR-D1", machine_type: "boring_rig",    current_site: "HF-KDH-002A", machine_status: "active" },
    { machine_id: "demo-m4", machine_code: "V-D1",  machine_type: "vibro_hammer",  current_site: "HF-SP-901",   machine_status: "active" }
  ];

  // the roster, as v_manpower_by_site returns it (whereabouts only)
  function w(o) {
    var s = o.site ? site(o.site) : null, ls = o.lastSite ? site(o.lastSite) : null;
    return {
      staff_id: o.id, full_name: o.name + " (demo)", role: o.role, company: o.co,
      current_project_id: s ? s.project_id : null, project_code: s ? s.project_code : null,
      project_name: s ? s.project_name : null, project_status: s ? s.status : null,
      employee_code: o.code || null, is_active: o.left ? false : true, updated_at: ts(day(o.left || 0)),
      last_reported_date: o.lastDays === undefined ? null : day(o.lastDays),
      last_reported_project_id: ls ? ls.project_id : (o.lastDays !== undefined && o.lastSite === null ? null : (ls ? ls.project_id : null)),
      last_reported_project_code: ls ? ls.project_code : null,
      last_reported_status: o.lastDays === undefined ? null : "present",
      has_date_joined: !!o.joined, has_contact: !!o.contact,
      last_reported_source: o.lastDays === undefined ? null : (o.bot ? "bot" : "gps"),
      ot_eligible: o.ot === false ? false : true,
      // the gated facts (get_staff_detail), kept here for the demo only
      _detail: { date_joined: o.joined || null, contact_number: o.contact || null, country_origin: o.origin || null,
                 whatsapp_name: o.wa || null }
    };
  }
  var ROWS = [
    w({ id: "demo-ironman", name: "Iron-Man",        code: "BP-D01", role: "boring_operator", co: "HF-BP",  site: "demo-site-1", lastSite: "demo-site-1", lastDays: 0, joined: "2025-03-10", contact: "012-000 0001", origin: "Malaysia" }),
    w({ id: "demo-cap",     name: "Captain America", code: "BP-D02", role: "crane_operator",  co: "HF-BP",  site: "demo-site-1", lastSite: "demo-site-1", lastDays: 0, joined: "2025-06-01", contact: "012-000 0002", origin: "Malaysia" }),
    w({ id: "demo-widow",   name: "Black Widow",     code: "BP-D03", role: "general_worker",  co: "HF-BP",  site: "demo-site-1", lastSite: "demo-site-2", lastDays: 1, joined: "2026-01-12", origin: "Myanmar" }),
    w({ id: "demo-hulk",    name: "Hulk",            code: "HS-D04", role: "welder",          co: "Hai Fu", site: "demo-site-1", lastSite: "demo-site-1", lastDays: 0, joined: "2024-11-20", contact: "012-000 0004", origin: "Bangladesh", wa: "Hulk" }),
    w({ id: "demo-thor",    name: "Thor",            code: "BP-D05", role: "general_worker",  co: "HF-BP",  site: "demo-site-1", lastSite: "demo-site-1", lastDays: 10, origin: "Nepal" }),
    w({ id: "demo-hawkeye", name: "Hawkeye",         code: "BP-D06", role: "general_worker",  co: "HF-BP",  site: "demo-site-2", lastSite: "demo-site-2", lastDays: 0, joined: "2025-09-01", contact: "012-000 0006" }),
    w({ id: "demo-falcon",  name: "Falcon",          code: "BP-D07", role: "welder",          co: "HF-BP",  site: "demo-site-2", lastSite: "demo-site-2", lastDays: 1, bot: true, joined: "2025-09-01" }),
    w({ id: "demo-vision",  name: "Vision",          code: "BP-D08", role: "site_supervisor", co: "HF-BP",  site: "demo-site-2", lastSite: "demo-site-2", lastDays: 0, joined: "2023-02-14", contact: "012-000 0008", origin: "Malaysia" }),
    w({ id: "demo-wanda",   name: "Scarlet Witch",   code: "HS-D09", role: "vibro_operator",  co: "Hai Fu", site: "demo-site-3", lastSite: "demo-site-3", lastDays: 0, joined: "2024-05-05", contact: "012-000 0009" }),
    w({ id: "demo-antman",  name: "Ant-Man",         code: "HS-D10", role: "welder",          co: "Hai Fu", site: "demo-site-3" }),
    w({ id: "demo-warm",    name: "War Machine",     code: "BP-D11", role: "general_worker",  co: "HF-BP",  site: null,          lastSite: "demo-site-1", lastDays: 2, joined: "2026-02-02" }),
    w({ id: "demo-fury",    name: "Nick Fury",       code: "BP-D12", role: "management",      co: "HF-BP",  site: null, joined: "2020-01-01", contact: "012-000 0012", ot: false }),
    w({ id: "demo-hill",    name: "Maria Hill",      code: "BP-D13", role: "admin",           co: "HF-BP",  site: null, joined: "2022-07-01", contact: "012-000 0013", ot: false }),
    w({ id: "demo-loki",    name: "Loki",            code: "BP-D14", role: "general_worker",  co: "HF-BP",  site: "demo-site-1", left: 20 }),
    w({ id: "demo-quick",   name: "Quicksilver",     code: "HS-D15", role: "welder",          co: "Hai Fu", site: "demo-site-3", left: 45 })
  ];
  function row(id) { return ROWS.filter(function (r) { return r.staff_id === id; })[0]; }

  function tl(o) {
    var f = o.from ? site(o.from) : null, t = o.to ? site(o.to) : null, r = o.staff ? row(o.staff) : null;
    return { transfer_id: newId("demo-tl"), moved_at: ts(day(o.days), o.at || "08:05"), effective_date: day(o.days),
             subject_type: o.machine ? "machine" : "staff", staff_id: r ? r.staff_id : null, machine_id: o.machine || null,
             subject_name: r ? r.full_name : o.machineName, from_project: f ? f.project_code : "—", to_project: t ? t.project_code : "—",
             moved_by_name: o.by || null, source: o.source || "dashboard", remarks: o.remarks || null };
  }
  var TRANSLOG = [
    tl({ staff: "demo-widow",   from: "demo-site-2", to: "demo-site-1", days: 1, source: "punch", by: "Punch", remarks: "Moved by punch: inside UMECH - IOI PUCHONG (DEMO)'s fence at 07:52 AM (punch IN)" }),
    tl({ staff: "demo-hawkeye", from: "demo-site-1", to: "demo-site-2", days: 2, source: "punch", by: "Punch", remarks: "Moved by punch: inside MCS SIK BRIDGE 2 (DEMO)'s fence at 08:01 AM (punch IN)" }),
    tl({ machine: "demo-m3", machineName: "BR-D1", from: "demo-site-1", to: "demo-site-2", days: 3, by: "Maria Hill (demo)", remarks: "Rig to Sik for the abutment" }),
    tl({ staff: "demo-warm",    from: "demo-site-1", to: null,          days: 4, by: "Nick Fury (demo)", remarks: "Mob out, waiting for Perlis" }),
    tl({ staff: "demo-wanda",   from: "demo-site-1", to: "demo-site-3", days: 6, source: "punch", by: "Punch", remarks: "Moved by punch: inside Satar Empire (DEMO)'s fence at 09:14 AM (punch TRACKER)" }),
    tl({ staff: "demo-thor",    from: null,          to: "demo-site-1", days: 9, by: "Maria Hill (demo)", remarks: "(new worker)" }),
    tl({ staff: "demo-loki",    from: "demo-site-1", to: null,          days: 20, by: "Maria Hill (demo)", remarks: "Left" }),
    tl({ staff: "demo-falcon",  from: "demo-site-3", to: "demo-site-2", days: 12, source: "backfill", by: "Maria Hill (demo)", remarks: "Catch-up from the WhatsApp list" }),
    tl({ staff: "demo-hulk",    from: "demo-site-2", to: "demo-site-1", days: 15, by: "Nick Fury (demo)" }),
    tl({ staff: "demo-ironman", from: "demo-site-2", to: "demo-site-1", days: 15, by: "Nick Fury (demo)", remarks: "Rig crew together" }),
    tl({ staff: "demo-cap",     from: "demo-site-2", to: "demo-site-1", days: 15, by: "Nick Fury (demo)", remarks: "Rig crew together" }),
    tl({ staff: "demo-ironman", from: null,          to: "demo-site-2", days: 30, by: "Maria Hill (demo)", remarks: "(new worker)" })
  ];

  var DEVICES = {
    "demo-ironman": { is_enrolled: true,  device_label: "Samsung A15", bound_at: ts(day(30), "10:12"), last_seen_at: ts(day(0), "07:51"), has_live_code: false, code_expires_at: null },
    "demo-widow":   { is_enrolled: false, device_label: null, bound_at: null, last_seen_at: null, has_live_code: true, code_expires_at: ts(day(-1), "18:00") }
  };
  function dev(id) {
    var r = row(id), d = DEVICES[id] || { is_enrolled: false, device_label: null, bound_at: null, last_seen_at: null, has_live_code: false, code_expires_at: null };
    return [Object.assign({ staff_id: id, full_name: r.full_name, employee_code: r.employee_code, project_id: r.current_project_id,
                            project_code: r.project_code, project_name: r.project_name, device_id: d.is_enrolled ? "demo-dev-" + id : null }, d)];
  }

  // ---- the sign-in the shell asks for --------------------------------------
  var ACCESS = { ok: true, access: {
    full_name: "Nick Fury (demo)", designation: "office", role: null, status: "active",
    access_profile_code: "demo", access_profile_name: "Demo",
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
  Dash.getMyProfile = async function () { return { full_name: ACCESS.access.full_name, designation: "office", role: null }; };
  Dash.can = function (p) { return PERMS.indexOf(p) !== -1; };

  // ---- reads ---------------------------------------------------------------
  Dash.getProjectDirectory   = async function () { return copy(SITES); };
  Dash.getProjectSupervisors = async function () { return copy(SUPERVISORS); };
  Dash.getMachines           = async function () { return copy(MACHINES); };
  Dash.getManpowerBySite     = async function () { await wait(120); return copy(ROWS).map(function (r) { delete r._detail; return r; }); };
  Dash.getTransferLog        = async function (limit) {
    await wait(120);
    return copy(TRANSLOG).sort(function (a, b) { return a.effective_date < b.effective_date ? 1 : a.effective_date > b.effective_date ? -1 : 0; }).slice(0, limit || 100);
  };
  Dash.getStaffDetail = async function (id) {
    await wait(150);
    var r = row(id); if (!r) throw new Error("staff_not_found");
    return Object.assign({ ok: true, staff_id: id, full_name: r.full_name, role: r.role, company_code: r.company, employee_code: r.employee_code,
                           is_active: r.is_active, ot_eligible: r.ot_eligible }, r._detail);
  };
  Dash.getWorkerDevices = async function (id) { await wait(150); return copy(dev(id)); };

  // ---- writes: in memory only ----------------------------------------------
  function dupName(name, exceptId) {
    return ROWS.some(function (r) { return r.is_active && r.staff_id !== exceptId && r.full_name.toLowerCase() === String(name).trim().toLowerCase(); });
  }
  function dupCode(code, exceptId) {
    return !!code && ROWS.some(function (r) { return r.is_active && r.staff_id !== exceptId && r.employee_code === code; });
  }
  function moveRow(r, toId, remarks, date, source, by) {
    var f = r.current_project_id ? site(r.current_project_id) : null, t = toId ? site(toId) : null;
    r.current_project_id = t ? t.project_id : null; r.project_code = t ? t.project_code : null;
    r.project_name = t ? t.project_name : null; r.project_status = t ? t.status : null;
    TRANSLOG.unshift({ transfer_id: newId("demo-tl"), moved_at: new Date().toISOString(), effective_date: date || today,
      subject_type: "staff", staff_id: r.staff_id, machine_id: null, subject_name: r.full_name,
      from_project: f ? f.project_code : "—", to_project: t ? t.project_code : "—",
      moved_by_name: by || "Nick Fury (demo)", source: source || "dashboard", remarks: remarks || null });
  }
  Dash.moveStaff = async function (id, toId, remarks, date) {
    await wait(300);
    var r = row(id); if (!r) throw new Error("staff_not_found");
    if (!r.is_active) throw new Error("staff_inactive");
    if (toId && !site(toId)) throw new Error("project_not_found");
    moveRow(r, toId, remarks, date);
    return { ok: true, full_name: r.full_name, to_project_code: r.project_code };
  };
  Dash.addStaff = async function (o) {
    await wait(300);
    if (!String(o.fullName || "").trim()) throw new Error("empty_name");
    if (dupCode(o.employeeCode)) throw new Error("duplicate_employee_code");
    if (!o.allowDuplicate && dupName(o.fullName)) throw new Error("duplicate_name");
    var r = w({ id: newId("demo-new"), name: String(o.fullName).trim().replace(/ \(demo\)$/, ""), code: o.employeeCode, role: o.role, co: o.companyCode,
                site: o.projectId || null, joined: o.dateJoined, contact: o.contactNumber, origin: o.countryOrigin });
    ROWS.push(r);
    TRANSLOG.unshift({ transfer_id: newId("demo-tl"), moved_at: new Date().toISOString(), effective_date: today, subject_type: "staff",
      staff_id: r.staff_id, machine_id: null, subject_name: r.full_name, from_project: "—", to_project: r.project_code || "—",
      moved_by_name: "Nick Fury (demo)", source: "dashboard", remarks: "(new worker)" });
    return { ok: true, staff_id: r.staff_id, full_name: r.full_name, to_project_code: r.project_code };
  };
  Dash.updateStaff = async function (id, o) {
    await wait(300);
    var r = row(id); if (!r) throw new Error("staff_not_found");
    if (o.employeeCode && dupCode(o.employeeCode, id)) throw new Error("duplicate_employee_code");
    if (o.fullName && !o.allowDuplicate && dupName(o.fullName, id)) throw new Error("duplicate_name");
    if (o.fullName) r.full_name = String(o.fullName).trim().replace(/ \(demo\)$/, "") + " (demo)";
    if (o.role) r.role = o.role;
    if (o.companyCode) r.company = o.companyCode;
    if (o.employeeCode) r.employee_code = o.employeeCode;
    if (o.dateJoined) { r._detail.date_joined = o.dateJoined; r.has_date_joined = true; }
    if (o.contactNumber) { r._detail.contact_number = o.contactNumber; r.has_contact = true; }
    if (o.countryOrigin) r._detail.country_origin = o.countryOrigin;
    if (typeof o.otEligible === "boolean") r.ot_eligible = o.otEligible;
    return { ok: true, full_name: r.full_name };
  };
  Dash.setStaffActive = async function (id, active) {
    await wait(300);
    var r = row(id); if (!r) throw new Error("staff_not_found");
    r.is_active = !!active; r.updated_at = new Date().toISOString();
    return { ok: true, full_name: r.full_name, is_active: r.is_active };
  };
  Dash.addPastMove = async function (o) {
    await wait(300);
    var r = row(o.staffId); if (!r) throw new Error("staff_not_found");
    if (!o.effectiveDate) throw new Error("date_required");
    var f = o.fromProjectId ? site(o.fromProjectId) : null, t = o.toProjectId ? site(o.toProjectId) : null;
    TRANSLOG.unshift({ transfer_id: newId("demo-tl"), moved_at: new Date().toISOString(), effective_date: o.effectiveDate, subject_type: "staff",
      staff_id: r.staff_id, machine_id: null, subject_name: r.full_name, from_project: f ? f.project_code : "—", to_project: t ? t.project_code : "—",
      moved_by_name: "Nick Fury (demo)", source: "backfill", remarks: o.remarks || null });
    return { ok: true };
  };
  Dash.updateTransfer = async function (tid, o) {
    await wait(300);
    var t = TRANSLOG.filter(function (x) { return x.transfer_id === tid; })[0];
    if (!t) throw new Error("transfer_not_found");
    if (o.effectiveDate) t.effective_date = o.effectiveDate;
    if (o.remarks) t.remarks = o.remarks;
    return { ok: true };
  };
  Dash.deleteTransfer = async function (tid) {
    await wait(300);
    var i = TRANSLOG.map(function (x) { return x.transfer_id; }).indexOf(tid);
    if (i === -1) throw new Error("transfer_not_found");
    TRANSLOG.splice(i, 1);
    return { ok: true };
  };
  Dash.issueEnrolmentCode = async function (id) {
    await wait(300);
    var d = DEVICES[id];
    if (d && d.is_enrolled) return { ok: false, code: "worker_already_bound", message: "This worker already has a phone registered. Release it first, then issue a code." };
    DEVICES[id] = { is_enrolled: false, device_label: null, bound_at: null, last_seen_at: null, has_live_code: true, code_expires_at: ts(day(-2), "18:00") };
    return { ok: true, enrolment_code_display: "7F3A-9C1E", expires_at_local: UI.dstr(day(-2)) + ", 06:00 pm" };
  };
  Dash.revokeEnrolmentCode = async function (id) {
    await wait(300);
    if (DEVICES[id]) { DEVICES[id].has_live_code = false; DEVICES[id].code_expires_at = null; }
    return { ok: true };
  };
  Dash.releaseDevice = async function (id) {
    await wait(300);
    DEVICES[id] = { is_enrolled: false, device_label: null, bound_at: null, last_seen_at: null, has_live_code: false, code_expires_at: null };
    return { ok: true };
  };

  // a banner, so nobody mistakes this screen for the real one
  window.addEventListener("DOMContentLoaded", function () {
    var main = document.getElementById("main");
    if (!main) return;
    var b = document.createElement("div");
    b.className = "banner banner-amber";
    b.innerHTML = "<strong>Demo data</strong> — an invented crew so the layout can be reviewed. " +
      "Nothing here is real and the buttons write nothing to the database. Drop " +
      "<code>?demo=1</code> from the URL for the real page.";
    main.insertBefore(b, document.getElementById("mp-tiles"));
  });

  console.log("[demo] manpower page: sign-in + reads/writes replaced. Nothing hits the database.");
})();
