/* =============================================================================
   HF Dashboard — THE ENGINE ("plumbing")
   =============================================================================
   This file is owned by the BACKEND team. The UI should NOT need to change it.
   Pages call the ready-made commands on `window.Dash` below and render what
   they return. The engine handles login sessions and every database call —
   the UI never talks to Supabase directly.

   AUTH COMMANDS
   -----------------------------------------------------------------------------
   await Dash.signIn(email, password) -> { ok:true } or { ok:false, message }
   await Dash.signOut()               -> clears the session, goes to login.html
   await Dash.getUser()               -> the signed-in user or null (no network)
   await Dash.requireLogin()          -> redirects to login.html when signed out
   await Dash.getMyProfile()          -> { full_name, designation, role } for the
                                         signed-in person's staff record, or null
                                         if the account isn't linked yet.
                                         designation: management | office |
                                         site_supervisor | site  (drives which
                                         pages the nav shows — see shell.js)

   DATA COMMANDS (each returns an array of rows — or throws with .message)
   -----------------------------------------------------------------------------
   await Dash.getProjectPulse()                   -> one row per ACTIVE project: progress,
                                                     issues, last-report date, machines/workers
                                                     on site (the Overview page's cards)
   await Dash.getOverview()                       -> ONE row of company-wide "today" stats
   await Dash.getProjects()                       -> per-project progress rows (BP line, all statuses)
   await Dash.getPileRegister(projectId, status?) -> per-pile design-vs-actual rows
   await Dash.getIssues(status?)                  -> issue board ('open' default = open+in_progress,
                                                     'all', or an exact status)
   await Dash.getMachines()                       -> machine fleet rows
   await Dash.getMachineServiceHistory()          -> all servicing records (newest first)
   await Dash.getMachineActivity()                -> last 14 days of daily machine reports
   await Dash.getShifts(dateYYYYMMDD, projectId?) -> who worked that day (punch data)
   await Dash.getSitesMissingGeofence()           -> active sites with workers but no GPS set
   await Dash.getRecentPunches(dateYYYYMMDD, projectId?, limit?) -> raw punch list
   await Dash.getLeaveBalances(year)              -> per-worker leave balance rows
   await Dash.getLeaveRequests(year, status?)     -> leave requests ('pending' default, 'all', ...)
   await Dash.getTests(showAll?)                  -> pile test tracker (hides completed/passed
                                                     unless showAll is true)

   HELPERS
   -----------------------------------------------------------------------------
   Dash.todayKL()        -> 'YYYY-MM-DD' for TODAY in Malaysia time (never use
                            new Date().toISOString() — that is UTC and is wrong
                            for 8 hours every evening)
   Dash.currentYearKL()  -> e.g. 2026
   Dash.klTime(ts)       -> '07:45 AM'      (Malaysia time)
   Dash.klDateTime(ts)   -> '02 Jul, 07:45 AM'
   ============================================================================= */
(function () {
  "use strict";

  var cfg = window.DASH_CONFIG;
  var sb  = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  // supabase-js keeps the login session in localStorage and refreshes it
  // automatically — nothing to manage here.

  // ---- auth ----------------------------------------------------------------
  async function signIn(email, password) {
    var res = await sb.auth.signInWithPassword({ email: email, password: password });
    if (res.error) return { ok: false, message: res.error.message };
    return { ok: true };
  }

  async function signOut() {
    await sb.auth.signOut();
    window.location.replace("login.html");
  }

  async function getUser() {
    var res = await sb.auth.getSession();     // reads local session, no network
    return (res.data && res.data.session) ? res.data.session.user : null;
  }

  async function requireLogin() {
    var user = await getUser();
    if (!user) { window.location.replace("login.html"); return null; }
    return user;
  }

  var _profile;   // cached for the lifetime of the page
  async function getMyProfile() {
    if (_profile !== undefined) return _profile;
    try {
      var res = await sb.rpc("get_my_profile");
      _profile = (res.error || !res.data || res.data.length === 0) ? null : res.data[0];
    } catch (e) { _profile = null; }
    return _profile;
  }

  // ---- tiny query helper: unwrap data or throw the error --------------------
  async function q(builder) {
    var res = await builder;
    if (res.error) throw res.error;
    return res.data;
  }

  // ---- data ------------------------------------------------------------------
  function getOverview() {
    return q(sb.from("v_company_overview").select("*").single());
  }

  function getProjectPulse() {
    return q(sb.from("v_project_pulse").select("*")
      .eq("project_status", "active")
      .order("project_code"));
  }

  function getProjects() {
    // v_project_pulse = bored-piling projects only (all statuses) — the whole
    // dashboard is scoped to the HF Bored Piles line for now.
    return q(sb.from("v_project_pulse").select("*")
      .order("project_status").order("project_code"));
  }

  function getPileRegister(projectId, status) {
    var b = sb.from("v_pile_register").select("*")
      .eq("project_id", projectId)
      .order("pile_mark_no");
    if (status && status !== "all") b = b.eq("construction_status", status);
    return q(b);
  }

  function getIssues(status) {
    var b = sb.from("v_issue_board").select("*");
    if (!status || status === "open") b = b.in("status", ["open", "in_progress"]);
    else if (status !== "all")        b = b.eq("status", status);
    return q(b.order("priority_sort").order("raised_date", { ascending: false }));
  }

  function getMachines() {
    // the view orders by machine code (since 0030)
    return q(sb.from("v_machine_fleet").select("*"));
  }

  function getMachineServiceHistory() {
    // full servicing history, newest first (view is pre-ordered)
    return q(sb.from("v_machine_service_history").select("*"));
  }

  function getMachineActivity() {
    // last 14 days of daily machine reports, newest first (view is pre-ordered)
    return q(sb.from("v_machine_recent_activity").select("*"));
  }

  function getShifts(date, projectId) {
    // ALWAYS pass a date — null would return every day ever recorded
    return q(sb.rpc("get_daily_shifts", {
      p_work_date: date, p_project_id: projectId || null
    }));
  }

  function getSitesMissingGeofence() {
    return q(sb.rpc("get_sites_missing_geofence"));
  }

  function getRecentPunches(date, projectId, limit) {
    return q(sb.rpc("get_recent_punches", {
      p_project_id: projectId || null, p_work_date: date, p_limit: limit || 200
    }));
  }

  function getLeaveBalances(year) {
    return q(sb.rpc("get_leave_balance", { p_staff_id: null, p_year: year }));
  }

  function getLeaveRequests(year, status) {
    return q(sb.rpc("get_leave_requests", {
      p_staff_id: null,
      p_status: (status && status !== "all") ? status : null,
      p_year: year
    }));
  }

  function getTests(showAll) {
    var b = sb.from("v_test_tracker").select("*");
    if (!showAll) b = b.not("status", "in", '("completed","passed")');
    return q(b.order("priority_bucket").order("scheduled_test_date", { ascending: true }));
  }

  // FUTURE (write actions — deliberately not wired up in the view-only MVP):
  //   approveLeave(requestId)        -> sb.rpc("approve_leave", { p_request_id: requestId })
  //   rejectLeave(requestId, reason) -> sb.rpc("reject_leave",  { p_request_id: requestId, p_reason: reason })
  // When enabled, the database functions themselves will also check the
  // caller's designation (management/office) — UI buttons alone are not the guard.

  // ---- Malaysia-time helpers -------------------------------------------------
  var KL = "Asia/Kuala_Lumpur";

  function todayKL() {
    // en-CA gives YYYY-MM-DD directly
    return new Intl.DateTimeFormat("en-CA", { timeZone: KL }).format(new Date());
  }

  function currentYearKL() {
    return parseInt(todayKL().slice(0, 4), 10);
  }

  function klTime(ts) {
    if (!ts) return "";
    return new Intl.DateTimeFormat("en-MY", {
      timeZone: KL, hour: "2-digit", minute: "2-digit", hour12: true
    }).format(new Date(ts));
  }

  function klDateTime(ts) {
    if (!ts) return "";
    return new Intl.DateTimeFormat("en-MY", {
      timeZone: KL, day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit", hour12: true
    }).format(new Date(ts));
  }

  // ---- the public commands the UI uses ---------------------------------------
  window.Dash = {
    signIn: signIn,
    signOut: signOut,
    getUser: getUser,
    requireLogin: requireLogin,
    getMyProfile: getMyProfile,

    getOverview: getOverview,
    getProjectPulse: getProjectPulse,
    getProjects: getProjects,
    getPileRegister: getPileRegister,
    getIssues: getIssues,
    getMachines: getMachines,
    getMachineServiceHistory: getMachineServiceHistory,
    getMachineActivity: getMachineActivity,
    getShifts: getShifts,
    getSitesMissingGeofence: getSitesMissingGeofence,
    getRecentPunches: getRecentPunches,
    getLeaveBalances: getLeaveBalances,
    getLeaveRequests: getLeaveRequests,
    getTests: getTests,

    todayKL: todayKL,
    currentYearKL: currentYearKL,
    klTime: klTime,
    klDateTime: klDateTime
  };
})();
