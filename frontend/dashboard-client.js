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
   await Dash.getProjectSupervisors()             -> active supervisors per project (one string)
   await Dash.getProjectDailyOutput()             -> last 28 days of per-project daily output
                                                     (piles cast/bored-on, metres bored)
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
   await Dash.getTestTypes()                      -> test type directory (CSL/MLT/PDA/PIT:
                                                     id, code, name, default curing days)
   await Dash.getProjectTestSpecs()               -> per-project test specs with coverage:
                                                     percentage => implied tests vs assigned
                                                     vs done (base tables stay locked)

   TEST OPERATIONS (management/office only — database-enforced; each returns
   { ok, ... } or throws with .message = the database's error code)
   -----------------------------------------------------------------------------
   await Dash.setPileTestRequirement(pileId, testTypeId, remove?)
                                           -> require a test on a pile (inserts
                                              as 'pending') or remove the
                                              requirement — removal refused once
                                              done or a result exists
                                              ('requirement_in_use')
   await Dash.bookTest(reqId, date|null)   -> set the scheduled date (status ->
                                              'scheduled'); null = unbook (back
                                              to 'pending'). Done tests refuse;
                                              booking a failed test = a retest.
   await Dash.recordTestResult(reqId, {testDate, resultStatus, reportUrl?, remarks?})
                                           -> file the result (passed/failed/
                                              inconclusive/pending_review),
                                              flip the requirement; the pile's
                                              testing_status recomputes itself
   await Dash.setProjectTestSpec(projectId, testTypeId, {percentage?, remarks?, remove?})
                                           -> upsert/remove one project's spec
                                              row (percentage 0–100)
   await Dash.getManpowerBySite()                 -> active staff: name/role/company + current
                                                     site (whereabouts only — no IC/phone)
   await Dash.getProjectDirectory()               -> every project id/code/name/status (ALL
                                                     lines, for move pickers — pulse is BP-only)
   await Dash.getProjectQuantities()              -> per-project design-vs-actual consumption
                                                     rollup (0053): design/committed/verified
                                                     boring metres, concrete m³, steel t +
                                                     coverage counters ("committed" = cast
                                                     piles at design quantities; bore-log
                                                     columns fill as real logs are captured)

   MANPOWER WRITE COMMANDS (management/office only — database-enforced; each
   returns { ok, ... } or throws with .message = the database's error code)
   -----------------------------------------------------------------------------
   await Dash.moveStaff(staffId, projectId|null, remarks?, effectiveDate?)
                                                  -> reassign a worker (null =
                                                     unassigned); every applied move
                                                     lands in transfer_log with
                                                     effectiveDate as the "happened
                                                     on" date (omitted = today —
                                                     backdate for catch-up moves)
   await Dash.moveMachine(machineId, projectId|null, remarks?, effectiveDate?)
                                                  -> same for machines. Stamps
                                                     mobilised_date = effectiveDate
                                                     (YYYY-MM-DD, when the move
                                                     REALLY happened — backdate for
                                                     corrections) or today when
                                                     omitted. The transfer log keeps
                                                     its own entry timestamp.
   await Dash.getTransferLog(limit?)              -> the movement history, ordered by
                                                     effective_date (when it really
                                                     happened; moved_at = entry time),
                                                     management/office only
   await Dash.updateTransfer(transferId, {effectiveDate?, remarks?})
                                           -> fix a history row's date/remarks
                                              (omitted = unchanged). Wrong sites?
                                              delete the row + addPastMove instead.
   await Dash.deleteTransfer(transferId)   -> remove a mistaken history row (any
                                              plan linked to it stays executed,
                                              just unlinked)
   await Dash.addPastMove({staffId? | machineId?, fromProjectId?, toProjectId?,
                           effectiveDate, remarks?})
                                           -> backfill pre-dashboard history
                                              (exactly one subject; null project =
                                              unassigned side). HISTORY ONLY — the
                                              current site / mobilised date are NOT
                                              touched; use moveStaff/moveMachine
                                              for the current stint.
   await Dash.getMovementPlans()           -> every movement plan (staff AND
                                              machine, all statuses, earliest
                                              planned date first). Pages show
                                              the status='planned' rows; a
                                              planned row whose date is past =
                                              overdue (amber). Any signed-in
                                              login may read (whereabouts).
   await Dash.addMovementPlan({staffId? | machineId?, plannedDate,
                               toProjectId?, remarks?})
                                           -> record an INTENDED move (exactly
                                              one of staffId/machineId;
                                              toProjectId null = mob out /
                                              demob to unassigned — yard trips
                                              use the HF-YARD-001 project).
                                              Plans NEVER auto-apply on their
                                              date — the office executes them.
   await Dash.executeMovementPlan(planId)  -> the move really happened: applies
                                              it through moveStaff/moveMachine
                                              rules (same validation, transfer
                                              log, mobilised_date stamp) and
                                              links the resulting transfer row
   await Dash.cancelMovementPlan(planId)   -> planned -> cancelled. Executed
                                              plans are immutable history.
   await Dash.addStaff({fullName, role, companyCode, employeeCode?, projectId?,
                        designation?, dateJoined?, contactNumber?,
                        countryOrigin?, allowDuplicate?})
                                           -> register a new worker. Throws
                                              'duplicate_name' (active same-name
                                              worker exists — retry with
                                              allowDuplicate after confirming) or
                                              'duplicate_employee_code'
   await Dash.addMachine({machineCode, machineType, brand?, model?,
                          registrationNo?, projectId?, serviceIntervalHours?})
                                           -> register a new machine. Throws
                                              'duplicate_machine_code'
   await Dash.setStaffActive(staffId, active) -> mark a worker left (false) or
                                              reactivate (true). Departure also
                                              locks their phone out of the punch
                                              app — intended.
   await Dash.getStaffDetail(staffId)      -> one worker's editable facts for
                                              the edit form (incl. contact/date
                                              joined — management/office only;
                                              whatsapp_name comes back read-only)
   await Dash.updateStaff(staffId, {fullName?, role?, companyCode?, employeeCode?,
                                    designation?, dateJoined?, contactNumber?,
                                    countryOrigin?, allowDuplicate?})
                                           -> partial update (omitted/blank field
                                              = unchanged). Throws duplicate_name /
                                              duplicate_employee_code like addStaff.
   await Dash.updateMachine(machineId, {machineType?, brand?, model?,
                            registrationNo?, serialNumber?, yearManufactured?,
                            serviceIntervalHours?, status?, mobilisedDate?,
                            clearMobilised?})
                                           -> partial machine edit (blank =
                                              unchanged). mobilisedDate is a
                                              CORRECTION — moves stamp it
                                              themselves; clearMobilised nulls
                                              it. machine_code is NOT editable
                                              — bot matching key. (next-move
                                              editing removed in 0049 — plan
                                              moves via addMovementPlan.)
   await Dash.addServiceRecord(machineId, {serviceDate, serviceType, description?,
                               hourMeter?, parts?, costTotal?, vendor?, remarks?})
                                           -> log a service/repair; machines
                                              mirror columns update via trigger
   await Dash.setMachineHourMeter(machineId, hours, date?)
                                           -> manual hour-meter reading (writes
                                              the daily log; machine must be
                                              assigned to a site) — lights the
                                              service-due engine
   await Dash.getMachineUtilization()      -> per machine, last 30 days: days
                                              operating/standby/breakdown, hours,
                                              fuel
   await Dash.getMachineProductivity()     -> per machine: tagged boring metres,
                                              piles, last activity date
   NOTE: adding/editing/deactivating and readings are for dashboard logins
   only — the bot's key is deliberately refused (it reports through its own
   tables; it never edits identity data).

   ISSUE COMMANDS (writes = management/office, database-enforced; the status
   audit trail is enforced by construction — updates go through issue_updates
   and a trigger propagates status + stamps resolved_date)
   -----------------------------------------------------------------------------
   await Dash.getIssueUpdates()            -> every issue's full update trail
                                              (newest first, with updater name)
   await Dash.addIssueUpdate(issueId, {comment, newStatus?, effectiveDate?})
                                           -> add a progress note and/or change
                                              status (in_progress/resolved/
                                              closed/open=reopen). effectiveDate
                                              (YYYY-MM-DD) = when it was REALLY
                                              fixed — stamps resolved_date
   await Dash.setIssueMeta(issueId, {priority?, category?, assignedToId?,
                                     clearAssignee?})
                                           -> triage; the change is also written
                                              into the trail automatically
   await Dash.addIssue({projectId, title, description?, category?, priority?,
                        machineId?, assignedToId?})
                                           -> office-raised issue; numbering is
                                              max+1 (the sequence is unreliable)

   MONEY COMMANDS (management/office designations only — the DATABASE refuses
   everyone else with 'not_authorised'; pages must render these sections
   silently absent when the call throws, never an error banner)
   -----------------------------------------------------------------------------
   await Dash.getClaimSummaries()          -> one row per project that has BQ/claim
                                              data: contract sum (orig + VO), claimed/
                                              certified to date, retention held,
                                              claimed-not-certified gap, last claim
   await Dash.getClaimRegister(projectId)  -> that project's progress claims, newest
                                              first (claimed vs certified per claim)
   await Dash.getBqStatus(projectId)       -> that project's BQ lines with cumulative
                                              claimed / certified qtys and %
   await Dash.getClaimLines(projectId)     -> every claim's lines for the project
                                              (newest claim first), each with
                                              previous / this-claim / cumulative qty
                                              — the paper IPC's PREVIOUS WD /
                                              CURRENT WD / GROSS WD columns

   MONEY WRITE COMMANDS (same management/office database gate; each returns
   { ok, ... } or throws with .message = the database's error code)
   -----------------------------------------------------------------------------
   await Dash.createClaim(projectId, {periodTo, submittedDate, retentionPct,
                                      retentionCapPct, remarks})
                                           -> { ok, claim_id, claim_no } — number
                                              auto-assigned (next in sequence)
   await Dash.setClaimLine(claimId, bqItemId, qtyClaimed, remarks?)
                                           -> add/correct one line's THIS-period
                                              qty; qty 0 on an uncertified line
                                              removes it
   await Dash.updateClaim(claimId, {periodTo, submittedDate, retentionPct,
                                    retentionCapPct, remarks})
                                           -> fix header facts (null = unchanged)
   await Dash.certifyClaimLine(claimId, bqItemId, qtyCertified|null)
                                           -> record certified qty (null clears)
   await Dash.setClaimStatus(claimId, status, certifiedDate?)
                                           -> submitted | certified | paid
   await Dash.deleteClaim(claimId)         -> latest claim of its project ONLY

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

  function getProjectSupervisors() {
    return q(sb.from("v_project_supervisors").select("*"));
  }

  function getProjectDailyOutput() {
    // last 28 days, newest first (view is pre-filtered and pre-ordered)
    return q(sb.from("v_project_daily_output").select("*"));
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

  // ---- test operations (0052) — the office runs the testing pipeline --------
  function getTestTypes() {
    return q(sb.from("v_test_types").select("*").order("test_code"));
  }

  function getProjectTestSpecs() {
    return q(sb.from("v_project_test_specs").select("*")
      .order("project_code").order("test_code"));
  }

  function setPileTestRequirement(pileId, testTypeId, remove) {
    return q(sb.rpc("set_pile_test_requirement", {
      p_pile_id: pileId, p_test_type_id: testTypeId, p_remove: !!remove
    }));
  }

  function bookTest(reqId, date) {
    return q(sb.rpc("book_test", {
      p_test_req_id: reqId, p_scheduled_date: date || null
    }));
  }

  function recordTestResult(reqId, o) {
    o = o || {};
    return q(sb.rpc("record_test_result", {
      p_test_req_id: reqId,
      p_test_date: o.testDate,
      p_result_status: o.resultStatus,
      p_report_url: o.reportUrl || null,
      p_remarks: o.remarks || null
    }));
  }

  function setProjectTestSpec(projectId, testTypeId, o) {
    o = o || {};
    return q(sb.rpc("set_project_test_spec", {
      p_project_id: projectId,
      p_test_type_id: testTypeId,
      p_percentage: numOrNull(o.percentage),
      p_remarks: o.remarks || null,
      p_remove: !!o.remove
    }));
  }

  // ---- manpower (whereabouts + office-adjustable moves, 0039) ---------------
  function getManpowerBySite() {
    return q(sb.from("v_manpower_by_site").select("*").order("full_name"));
  }

  function getProjectDirectory() {
    return q(sb.from("v_project_directory").select("*").order("project_code"));
  }

  function getProjectQuantities() {
    // design-vs-actual material rollup per project (0053)
    return q(sb.from("v_project_quantities").select("*").order("project_code"));
  }

  function moveStaff(staffId, projectId, remarks, effectiveDate) {
    return q(sb.rpc("move_staff", {
      p_staff_id: staffId, p_project_id: projectId || null,
      p_remarks: remarks || null,
      p_effective_date: effectiveDate || null   // null = today (KL)
    }));
  }

  function moveMachine(machineId, projectId, remarks, effectiveDate) {
    return q(sb.rpc("move_machine", {
      p_machine_id: machineId, p_project_id: projectId || null,
      p_remarks: remarks || null,
      p_effective_date: effectiveDate || null   // null = today (KL)
    }));
  }

  function getTransferLog(limit) {
    return q(sb.rpc("get_transfer_log", { p_limit: limit || 100 }));
  }

  // ---- transfer history maintenance (0050) — the office owns its history ----
  function updateTransfer(transferId, o) {
    o = o || {};
    return q(sb.rpc("update_transfer", {
      p_transfer_id: transferId,
      p_effective_date: o.effectiveDate || null,   // null = unchanged
      p_remarks: o.remarks || null                 // null = unchanged
    }));
  }

  function deleteTransfer(transferId) {
    return q(sb.rpc("delete_transfer", { p_transfer_id: transferId }));
  }

  function addPastMove(o) {
    o = o || {};
    return q(sb.rpc("add_past_move", {
      p_staff_id: o.staffId || null,
      p_machine_id: o.machineId || null,
      p_from_project_id: o.fromProjectId || null,
      p_to_project_id: o.toProjectId || null,
      p_effective_date: o.effectiveDate,
      p_remarks: o.remarks || null
    }));
  }

  // ---- movement planning (0048) — intended moves; NEVER auto-applied --------
  function getMovementPlans() {
    return q(sb.from("v_movement_plans").select("*")
      .order("planned_date").order("created_at"));
  }

  function addMovementPlan(o) {
    o = o || {};
    return q(sb.rpc("add_movement_plan", {
      p_staff_id: o.staffId || null,
      p_machine_id: o.machineId || null,
      p_planned_date: o.plannedDate,
      p_to_project_id: o.toProjectId || null,
      p_remarks: o.remarks || null
    }));
  }

  function cancelMovementPlan(planId) {
    return q(sb.rpc("cancel_movement_plan", { p_plan_id: planId }));
  }

  function executeMovementPlan(planId) {
    return q(sb.rpc("execute_movement_plan", { p_plan_id: planId }));
  }

  function addStaff(o) {
    o = o || {};
    return q(sb.rpc("add_staff", {
      p_full_name: o.fullName,
      p_role: o.role,
      p_company_code: o.companyCode,
      p_employee_code: o.employeeCode || null,
      p_project_id: o.projectId || null,
      p_designation: o.designation || "site",
      p_date_joined: o.dateJoined || null,
      p_contact_number: o.contactNumber || null,
      p_country_origin: o.countryOrigin || null,
      p_allow_duplicate: !!o.allowDuplicate
    }));
  }

  function addMachine(o) {
    o = o || {};
    return q(sb.rpc("add_machine", {
      p_machine_code: o.machineCode,
      p_machine_type: o.machineType,
      p_brand: o.brand || null,
      p_model: o.model || null,
      p_registration_no: o.registrationNo || null,
      p_project_id: o.projectId || null,
      p_service_interval_hours: (o.serviceIntervalHours === undefined ||
        o.serviceIntervalHours === null || o.serviceIntervalHours === "")
        ? null : Number(o.serviceIntervalHours)
    }));
  }

  function setStaffActive(staffId, active) {
    return q(sb.rpc("set_staff_active", { p_staff_id: staffId, p_active: !!active }));
  }

  function getStaffDetail(staffId) {
    return q(sb.rpc("get_staff_detail", { p_staff_id: staffId }));
  }

  function updateMachine(machineId, o) {
    o = o || {};
    return q(sb.rpc("update_machine", {
      p_machine_id: machineId,
      p_machine_type: o.machineType || null,
      p_brand: o.brand || null,
      p_model: o.model || null,
      p_registration_no: o.registrationNo || null,
      p_serial_number: o.serialNumber || null,
      p_year_manufactured: numOrNull(o.yearManufactured),
      p_service_interval_hours: numOrNull(o.serviceIntervalHours),
      p_status: o.status || null,
      p_mobilised_date: o.mobilisedDate || null,
      p_clear_mobilised: !!o.clearMobilised
    }));
  }

  function addServiceRecord(machineId, o) {
    o = o || {};
    return q(sb.rpc("add_service_record", {
      p_machine_id: machineId,
      p_service_date: o.serviceDate,
      p_service_type: o.serviceType,
      p_description: o.description || null,
      p_hour_meter: numOrNull(o.hourMeter),
      p_parts: (o.parts && o.parts.length) ? o.parts : null,
      p_cost_total: numOrNull(o.costTotal),
      p_vendor: o.vendor || null,
      p_remarks: o.remarks || null,
      p_performed_by_id: null
    }));
  }

  function setMachineHourMeter(machineId, hours, date) {
    return q(sb.rpc("set_machine_hour_meter", {
      p_machine_id: machineId, p_hour_meter: Number(hours), p_reading_date: date || null
    }));
  }

  function getMachineUtilization() {
    return q(sb.from("v_machine_utilization_30d").select("*"));
  }

  function getMachineProductivity() {
    return q(sb.from("v_machine_productivity").select("*"));
  }

  // ---- issue operations (0046) — status changes ALWAYS via issue_updates ----
  function getIssueUpdates() {
    return q(sb.from("v_issue_updates").select("*"));
  }

  function addIssueUpdate(issueId, o) {
    o = o || {};
    return q(sb.rpc("add_issue_update", {
      p_issue_id: issueId,
      p_comment: o.comment || null,
      p_new_status: o.newStatus || null,
      // date-only input -> noon Malaysia time (the skill's resolved-date convention)
      p_effective_at: o.effectiveDate ? o.effectiveDate + "T12:00:00+08:00" : null
    }));
  }

  function setIssueMeta(issueId, o) {
    o = o || {};
    return q(sb.rpc("set_issue_meta", {
      p_issue_id: issueId,
      p_priority: o.priority || null,
      p_category: o.category || null,
      p_assigned_to_id: o.assignedToId || null,
      p_clear_assignee: !!o.clearAssignee,
      p_machine_id: o.machineId || null,
      p_clear_machine: !!o.clearMachine,
      p_pile_id: o.pileId || null,          // must belong to the issue's project (DB-guarded)
      p_clear_pile: !!o.clearPile
    }));
  }

  function getAllPiles() {
    // lightweight pile directory for project-scoped pickers
    return q(sb.from("v_pile_register")
      .select("pile_id,project_id,project_code,pile_mark_no")
      .order("pile_mark_no"));
  }

  function addIssue(o) {
    o = o || {};
    return q(sb.rpc("add_issue", {
      p_project_id: o.projectId,
      p_title: o.title,
      p_description: o.description || null,
      p_category: o.category || null,
      p_priority: o.priority || null,
      p_machine_id: o.machineId || null,
      p_pile_id: o.pileId || null,
      p_assigned_to_id: o.assignedToId || null
    }));
  }

  function updateStaff(staffId, o) {
    o = o || {};
    return q(sb.rpc("update_staff", {
      p_staff_id: staffId,
      p_full_name: o.fullName || null,
      p_role: o.role || null,
      p_company_code: o.companyCode || null,
      p_employee_code: o.employeeCode || null,
      p_designation: o.designation || null,
      p_date_joined: o.dateJoined || null,
      p_contact_number: o.contactNumber || null,
      p_country_origin: o.countryOrigin || null,
      p_allow_duplicate: !!o.allowDuplicate
    }));
  }

  // ---- claims (MONEY) --------------------------------------------------------
  // All three call designation-gated database functions (0035): the database
  // itself raises 'not_authorised' unless the signed-in staff row is
  // management/office. UI buttons/ifs alone are never the guard.
  function getClaimSummaries() {
    return q(sb.rpc("get_claim_summaries"));
  }

  function getClaimRegister(projectId) {
    return q(sb.rpc("get_claim_register", { p_project_id: projectId }));
  }

  function getBqStatus(projectId) {
    return q(sb.rpc("get_bq_status", { p_project_id: projectId }));
  }

  function getClaimLines(projectId) {
    return q(sb.rpc("get_claim_lines", { p_project_id: projectId }));
  }

  // money WRITES (0037) — the database re-checks the caller's designation on
  // every call; these wrappers just shape the parameters.
  function numOrNull(v) {
    return (v === undefined || v === null || v === "") ? null : Number(v);
  }

  function createClaim(projectId, o) {
    o = o || {};
    return q(sb.rpc("create_claim", {
      p_project_id: projectId,
      p_period_to: o.periodTo || null,
      p_submitted_date: o.submittedDate || null,
      p_retention_pct: numOrNull(o.retentionPct),
      p_retention_cap_pct: numOrNull(o.retentionCapPct),
      p_remarks: o.remarks || null
    }));
  }

  function setClaimLine(claimId, bqItemId, qtyClaimed, remarks) {
    return q(sb.rpc("set_claim_line", {
      p_claim_id: claimId, p_bq_item_id: bqItemId,
      p_qty_claimed: qtyClaimed, p_remarks: remarks || null
    }));
  }

  function updateClaim(claimId, o) {
    o = o || {};
    return q(sb.rpc("update_claim", {
      p_claim_id: claimId,
      p_period_to: o.periodTo || null,
      p_submitted_date: o.submittedDate || null,
      p_retention_pct: numOrNull(o.retentionPct),
      p_retention_cap_pct: numOrNull(o.retentionCapPct),
      p_remarks: o.remarks || null
    }));
  }

  function certifyClaimLine(claimId, bqItemId, qtyCertified) {
    return q(sb.rpc("certify_claim_line", {
      p_claim_id: claimId, p_bq_item_id: bqItemId,
      p_qty_certified: numOrNull(qtyCertified)
    }));
  }

  function setClaimStatus(claimId, status, certifiedDate) {
    return q(sb.rpc("set_claim_status", {
      p_claim_id: claimId, p_status: status,
      p_certified_date: certifiedDate || null
    }));
  }

  function deleteClaim(claimId) {
    return q(sb.rpc("delete_claim", { p_claim_id: claimId }));
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
    getProjectSupervisors: getProjectSupervisors,
    getProjectDailyOutput: getProjectDailyOutput,
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
    getTestTypes: getTestTypes,
    getProjectTestSpecs: getProjectTestSpecs,
    setPileTestRequirement: setPileTestRequirement,
    bookTest: bookTest,
    recordTestResult: recordTestResult,
    setProjectTestSpec: setProjectTestSpec,

    getManpowerBySite: getManpowerBySite,
    getProjectDirectory: getProjectDirectory,
    getProjectQuantities: getProjectQuantities,
    moveStaff: moveStaff,
    moveMachine: moveMachine,
    getTransferLog: getTransferLog,
    updateTransfer: updateTransfer,
    deleteTransfer: deleteTransfer,
    addPastMove: addPastMove,
    getMovementPlans: getMovementPlans,
    addMovementPlan: addMovementPlan,
    cancelMovementPlan: cancelMovementPlan,
    executeMovementPlan: executeMovementPlan,
    addStaff: addStaff,
    addMachine: addMachine,
    setStaffActive: setStaffActive,
    getStaffDetail: getStaffDetail,
    updateStaff: updateStaff,
    updateMachine: updateMachine,
    addServiceRecord: addServiceRecord,
    setMachineHourMeter: setMachineHourMeter,
    getMachineUtilization: getMachineUtilization,
    getMachineProductivity: getMachineProductivity,
    getIssueUpdates: getIssueUpdates,
    addIssueUpdate: addIssueUpdate,
    setIssueMeta: setIssueMeta,
    addIssue: addIssue,
    getAllPiles: getAllPiles,

    getClaimSummaries: getClaimSummaries,
    getClaimRegister: getClaimRegister,
    getBqStatus: getBqStatus,
    getClaimLines: getClaimLines,
    createClaim: createClaim,
    setClaimLine: setClaimLine,
    updateClaim: updateClaim,
    certifyClaimLine: certifyClaimLine,
    setClaimStatus: setClaimStatus,
    deleteClaim: deleteClaim,

    todayKL: todayKL,
    currentYearKL: currentYearKL,
    klTime: klTime,
    klDateTime: klDateTime
  };
})();
