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
   await Dash.getMyAccess()           -> { ok:true, access:{ full_name, designation,
                                         role, status, access_profile_code,
                                         access_profile_name, scope_all_projects,
                                         permissions[], project_ids[] } }
                                      or { ok:false, reason:'no_account' | 'error' }.
                                      Falls back to the old profile call, in
                                      "legacy" mode, until migration 0062 is
                                      applied.
   Dash.can('piles.edit')             -> boolean. Buttons only — the database
                                         refuses the write regardless.

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

   PILE REGISTER WRITES (0055; management/office only — database-enforced; each
   returns { ok, ... } or throws with .message = the database's error code and,
   where noted, .details = specifics)
   -----------------------------------------------------------------------------
   await Dash.addPiles(projectId, {marks, diameterMm, zone?, depthM?, socketM?,
                                   grade?, capacityKn?, reinforcement?,
                                   drawingNo?, drawingRev?, drawingDate?, remarks?})
                                           -> BULK create: every mark gets a
                                              piling_records row + an identical
                                              pile_designs row; steel/concrete
                                              compute in the database. All-or-
                                              nothing — 'duplicate_marks' lists
                                              the conflicting marks in .details
   await Dash.updatePileIdentity(pileId, {mark?, zone?, clearZone?, diameterMm?})
                                           -> partial update of mark / zone /
                                              register Ø (null = leave unchanged)
   await Dash.setPileDesign(pileId, {diameterMm, depthM?, socketM?, grade?,
                                     capacityKn?, reinforcement?, drawingNo?,
                                     drawingRev?, drawingDate?, remarks?})
                                           -> FULL-REPLACE upsert of the design
                                              row — always submit complete
                                              state; omitted fields are cleared
   await Dash.deletePile(pileId)           -> typo eraser: refuses unless the
                                              pile is still 'planned' with zero
                                              child records ('pile_started' /
                                              'pile_in_use' with the blocking
                                              table in .details)
   await Dash.previewPileSteel(diameterMm, depthM, reinforcement)
                                           -> what a save WOULD store: steel
                                              breakdown + total t + concrete m³,
                                              same math as the generated columns
                                              (any signed-in login may call)
   await Dash.getProjectZones(projectId)   -> the project's REGISTERED zones +
                                              pile counts (zero-pile zones
                                              included — the Add Piles dropdown
                                              source; any signed-in login)
   await Dash.addZone(projectId, zone)     -> register a zone name for the
                                              project ('duplicate_zone' when it
                                              exists); zones are created BEFORE
                                              piles go into them
   await Dash.deleteZone(projectId, zone)  -> remove a zone NO pile uses
                                              ('zone_in_use' otherwise)
   await Dash.deleteZoneAndPiles(projectId, zone)
                                           -> batch-undo: delete the zone AND
                                              its piles — refused unless EVERY
                                              pile is still planned with zero
                                              records ('zone_piles_started' /
                                              'zone_piles_in_use', offending
                                              mark in .details); all-or-nothing
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

   USER ADMINISTRATION COMMANDS (0070/0071 — users.html / roles.html)
   The database enforces everything: reads need the users.view permission,
   account changes users.edit/create/approve, permission changes users.manage
   (owner-only today). Three rules it will refuse on, so the UI should not
   offer: you cannot change your own access; you can only manage people MORE
   JUNIOR than yourself; you can only hand out profiles BELOW your own rank.
   -----------------------------------------------------------------------------
   await Dash.getUserAccounts(status?)     -> every dashboard account with its
                                              names AND ids (profile/company/
                                              department/designation — ids feed
                                              the edit form), site + override
                                              counts, last seen. Optional
                                              status filter ('pending' etc.)
   await Dash.getUserEffectiveAccess(userId)
                                           -> all 76 permissions for ONE person:
                                              granted yes/no + SOURCE ('profile',
                                              'granted for this person',
                                              'removed for this person',
                                              'not granted') + the reason text.
                                              The permission editor's read.
   await Dash.getAdminReference()          -> ONE object with the dropdown
                                              lists: access_profiles (each with
                                              assignable=true when the caller
                                              may hand it out — filter on it,
                                              never show refusable options),
                                              departments, designations,
                                              companies, modules (plain-language
                                              group headings), my_rank
   await Dash.getUnlinkedLogins()          -> logins created in the Supabase
                                              console that have no dashboard
                                              account yet — the "to set up" tab
   await Dash.createUserAccount(userId, {fullName, companyId, accessProfileId,
                                         departmentId?, designationId?, staffId?})
                                           -> turn an unlinked login into an
                                              ACTIVE account in one step ("set
                                              up a login"). Throws
                                              login_not_found /
                                              account_already_exists /
                                              staff_already_linked /
                                              no_access_profile
   await Dash.updateUserAccount(userId, {fullName?, departmentId?, designationId?,
                                         companyId?, staffId?, clearStaff?})
                                           -> edit WHO somebody is (identity
                                              only — never what they may do;
                                              omitted = unchanged). Editing
                                              your own row is allowed.
   await Dash.approveUserAccount(userId, {accessProfileId, designationId?,
                                          departmentId?, staffId?, companyId?})
                                           -> approve a pending account and
                                              switch it on (kept for when
                                              signups return; today accounts
                                              are born active via
                                              createUserAccount)
   await Dash.setUserStatus(userId, status, reason?)
                                           -> active | suspended | disabled |
                                              pending. Suspend/disable stores
                                              the reason.
   await Dash.setUserAccessProfile(userId, accessProfileId)
                                           -> change what somebody may do —
                                              owner-only today (users.manage)
   await Dash.getUserProjectAssignments(userId)
                                           -> that person's assigned sites WITH
                                              the assignment_id that
                                              unassignUserProject needs
   await Dash.assignUserProject(userId, projectId, role?, endsOn?)
                                           -> put somebody on a site (role:
                                              member | supervisor |
                                              project_manager; endsOn optional)
   await Dash.unassignUserProject(assignmentId) -> take them off it
   await Dash.setUserPermissionOverride(userId, permissionCode, effect, reason,
                                        {expiresAt?, projectId?})
                                           -> one exception for one person:
                                              effect 'grant' | 'deny'. reason
                                              is REQUIRED (shown next to the
                                              permission forever). projectId
                                              only on site-scoped permissions.
                                              You cannot grant what you do not
                                              hold yourself.
   await Dash.clearUserPermissionOverride(userId, permissionCode)
                                           -> back to the profile default
   await Dash.resetUserPermissions(userId) -> clear ALL of somebody's
                                              exceptions ("use role default")
   await Dash.getAccessProfilePermissions(accessProfileId)
                                           -> what one access profile grants,
                                              in plain words (roles.html loads
                                              this when a card opens)

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

  // A password-reset link arrives as  ...#access_token=…&type=recovery  and is a
  // REAL SIGN-IN: supabase-js turns it into an ordinary session that carries no
  // marker saying "this person only came here to change their password". So the
  // only trustworthy signal is the URL itself — and the library erases it.
  //
  // Timing (checked against the vendored build, supabase-js 2.108.2):
  //   * createClient only STARTS the async initialise, so the hash is still
  //     intact on the line below;
  //   * initialise then fetches /auth/v1/user and sets location.hash = "",
  //     so the hash is gone after the first await anywhere in the app.
  // Hence: read it here, synchronously, before createClient. Every page loads
  // this file before its own script, so one capture covers the whole app.
  //
  // Supabase's PASSWORD_RECOVERY event is deliberately NOT used: it fires once
  // from a setTimeout and is never replayed, so any code that awaits a session
  // first misses it permanently.
  var _initialHash = (window.location.hash || "");

  var sb  = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  // supabase-js keeps the login session in localStorage and refreshes it
  // automatically — nothing to manage here.

  // Did this page load from a password-reset link?
  function recoveryPending() {
    return /(^|[#&])type=recovery(&|$)/.test(_initialHash);
  }

  // Supabase reports a dead link by redirecting with an error in the hash and
  // no token at all, e.g.
  //   #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
  // Returns that description in readable form, or null when the link was fine.
  function linkError() {
    if (!/(^|[#&])error/.test(_initialHash)) return null;
    var params = new URLSearchParams(_initialHash.replace(/^#/, ""));
    // error_description is prose; error is a code like "server_error", so
    // underscores become spaces too when we have to fall back to it.
    var desc = params.get("error_description") || params.get("error") || "";
    desc = desc.replace(/\+/g, " ").replace(/_/g, " ").trim();
    if (!desc) return "That link is no longer valid.";
    return desc.charAt(0).toUpperCase() + desc.slice(1) + ".";
  }

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

  // Sign out WITHOUT choosing where to go next — the caller redirects. Used by
  // reset.html, which needs to land on login.html?reset=1 to show its
  // confirmation. Never throws: if the sign-out call fails the session is
  // stale anyway, and the caller still wants to move on.
  async function signOutQuiet() {
    try { await sb.auth.signOut(); } catch (e) { /* already gone */ }
  }

  async function getUser() {
    // Usually a local read. NOT always free: on a page opened from a magic /
    // recovery link this awaits the library's initialise, which calls
    // /auth/v1/user before the session exists.
    var res = await sb.auth.getSession();
    return (res.data && res.data.session) ? res.data.session.user : null;
  }

  async function requireLogin() {
    var user = await getUser();
    if (!user) { window.location.replace("login.html"); return null; }
    return user;
  }

  // Create an account. This does NOT grant any access: the new auth user has no
  // row in user_accounts, so every database gate refuses them until an
  // administrator approves and assigns an access profile. See migration 0059.
  async function signUp(email, password) {
    var res = await sb.auth.signUp({
      email: email,
      password: password,
      options: { emailRedirectTo: window.location.origin + basePath() + "pending.html" }
    });
    if (res.error) return { ok: false, message: res.error.message };
    // Supabase returns a user with no session when email confirmation is on
    var needsConfirm = !(res.data && res.data.session);
    return { ok: true, needsConfirm: needsConfirm };
  }

  // Hand off to Google / Microsoft. The provider must be enabled in the Supabase
  // dashboard first — see AUTH_PROVIDERS in config.js. Supabase validates the
  // redirect against its own allow-list, which is what stops an open redirect.
  async function signInWithProvider(provider) {
    var res = await sb.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: window.location.origin + basePath() + "index.html" }
    });
    if (res.error) return { ok: false, message: res.error.message };
    return { ok: true };            // the browser is navigating away
  }

  // Sends the "set a new password" email. It must land on reset.html, NOT on
  // login.html — login.html bounces anyone holding a session to the dashboard,
  // and a recovery link is a session, so pointing it there means the password
  // never actually gets changed.
  // NOTE this URL must also be on Supabase's Redirect URLs allow-list, or
  // Supabase ignores it and falls back to the Site URL.
  async function resetPassword(email) {
    var res = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + basePath() + "reset.html"
    });
    if (res.error) return { ok: false, message: res.error.message };
    return { ok: true };
  }

  // Used by reset.html. Needs the session the recovery link just created.
  async function updatePassword(newPassword) {
    var res = await sb.auth.updateUser({ password: newPassword });
    if (res.error) return { ok: false, message: res.error.message };
    return { ok: true };
  }

  // the directory the app is served from — "/" locally, "/hf-dashboard/" on Pages
  function basePath() {
    var p = window.location.pathname;
    return p.slice(0, p.lastIndexOf("/") + 1);
  }

  // ---- who am I, and what may I do ------------------------------------------
  //
  // ONE call answers both. getMyAccess() returns a verdict, never a bare null,
  // because "the server said you have no account" and "the network dropped" are
  // completely different situations that used to look identical:
  //
  //     { ok: true,  access: {...} }
  //     { ok: false, reason: "no_account" }   -> signed in, not set up yet
  //     { ok: false, reason: "error", message } -> could not tell; assume nothing
  //
  // The old code collapsed all three into null, so a moment of bad wifi told a
  // director they were "not linked to a staff record" and stripped their menu.
  // Only SUCCESS is cached — an error must not stick for the life of the page.
  var _access;
  async function getMyAccess() {
    if (_access !== undefined) return _access;

    var res;
    try {
      res = await sb.rpc("get_my_access");
    } catch (e) {
      return { ok: false, reason: "error", message: String(e && e.message || e) };
    }

    if (res.error) {
      // get_my_access() arrives with migration 0062. Until that is applied the
      // function does not exist, so fall back to the old profile call and run
      // in legacy mode. This is what lets the frontend ship before or after the
      // database work without a flag day.
      if (isMissingFunction(res.error)) return await legacyAccess();
      return { ok: false, reason: "error", message: res.error.message };
    }

    if (!res.data || res.data.length === 0) {
      _access = { ok: false, reason: "no_account" };
      return _access;
    }

    var a = res.data[0];
    a.permissions = a.permissions || [];
    a.project_ids = a.project_ids || [];
    a.legacy = false;
    _access = { ok: true, access: a };
    return _access;
  }

  function isMissingFunction(err) {
    // PostgREST says PGRST202 for "no function matches"; older/edge cases show
    // up as a 404 or the phrase itself.
    var code = (err && err.code) || "";
    var msg  = String((err && err.message) || "");
    return code === "PGRST202" || code === "404" || /could not find the function/i.test(msg);
  }

  // Pre-0062 behaviour, expressed through the new shape so callers need no
  // special case. Permissions are unknown, so can() falls back to the old
  // two-tier rule (see below).
  async function legacyAccess() {
    var res;
    try {
      res = await sb.rpc("get_my_profile");
    } catch (e) {
      return { ok: false, reason: "error", message: String(e && e.message || e) };
    }
    if (res.error) return { ok: false, reason: "error", message: res.error.message };
    if (!res.data || res.data.length === 0) {
      _access = { ok: false, reason: "no_account" };
      return _access;
    }
    var p = res.data[0];
    _access = { ok: true, access: {
      full_name: p.full_name,
      designation: p.designation,
      role: p.role,
      status: "active",
      access_profile_code: p.designation,
      access_profile_name: null,
      scope_all_projects: true,
      permissions: [],
      project_ids: [],
      legacy: true,
      legacy_is_office: (p.designation === "management" || p.designation === "office")
    }};
    return _access;
  }

  // May the signed-in person do this? e.g. Dash.can("piles.edit")
  //
  // Buttons only. The database refuses the write regardless — see the gates in
  // migrations 0059-0066. Hiding a control the person cannot use stops the
  // interface lying to them; it is not what keeps them out.
  //
  // Call getMyAccess() once before using this (shell.js does it on boot).
  function can(permission) {
    if (!_access || !_access.ok) return false;
    var a = _access.access;
    if (a.status !== "active") return false;
    // before 0062 there is no permission list, so behave exactly as the old
    // dashboard did rather than guessing
    if (a.legacy) return !!a.legacy_is_office;
    return a.permissions.indexOf(permission) !== -1;
  }

  // Kept for the pages that already use it, and for shell.js's fallback path.
  // Same three-column shape as before: { full_name, designation, role } or null.
  async function getMyProfile() {
    var r = await getMyAccess();
    if (!r.ok) return null;
    return {
      full_name: r.access.full_name,
      designation: r.access.designation,
      role: r.access.role
    };
  }

  // ---- tiny query helper: unwrap data or throw the error --------------------
  async function q(builder) {
    var res = await builder;
    if (res.error) {
      // An expired or revoked login used to surface as a red "could not load"
      // banner on every panel. Send them back to sign in instead.
      if (isAuthExpired(res.error)) { await signOutQuiet(); window.location.replace("login.html"); }
      throw res.error;
    }
    return res.data;
  }

  function isAuthExpired(err) {
    var code   = (err && err.code) || "";
    var status = (err && err.status) || 0;
    var msg    = String((err && err.message) || "");
    return status === 401 || code === "PGRST301" ||
           /jwt expired|invalid jwt|jwt.*malformed/i.test(msg);
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

  // ---- pile register writes (0055) — the database re-checks the caller's
  // designation on every call; these wrappers just shape the parameters. ------
  function addPiles(projectId, o) {
    o = o || {};
    return q(sb.rpc("add_piles", {
      p_project_id: projectId,
      p_marks: o.marks || [],
      p_diameter_mm: numOrNull(o.diameterMm),
      p_zone: o.zone || null,
      p_depth_m: numOrNull(o.depthM),
      p_socket_m: numOrNull(o.socketM),
      p_grade: o.grade || null,
      p_capacity_kn: numOrNull(o.capacityKn),
      p_reinforcement: o.reinforcement || null,
      p_drawing_no: o.drawingNo || null,
      p_drawing_rev: o.drawingRev || null,
      p_drawing_date: o.drawingDate || null,
      p_remarks: o.remarks || null
    }));
  }

  function updatePileIdentity(pileId, o) {
    o = o || {};
    return q(sb.rpc("update_pile_identity", {
      p_pile_id: pileId,
      p_mark: o.mark || null,
      p_zone: o.zone || null,
      p_clear_zone: !!o.clearZone,
      p_diameter_mm: numOrNull(o.diameterMm)
    }));
  }

  function setPileDesign(pileId, o) {
    o = o || {};
    return q(sb.rpc("set_pile_design", {
      p_pile_id: pileId,
      p_diameter_mm: numOrNull(o.diameterMm),
      p_depth_m: numOrNull(o.depthM),
      p_socket_m: numOrNull(o.socketM),
      p_grade: o.grade || null,
      p_capacity_kn: numOrNull(o.capacityKn),
      p_reinforcement: o.reinforcement || null,
      p_drawing_no: o.drawingNo || null,
      p_drawing_rev: o.drawingRev || null,
      p_drawing_date: o.drawingDate || null,
      p_remarks: o.remarks || null
    }));
  }

  function deletePile(pileId) {
    return q(sb.rpc("delete_pile", { p_pile_id: pileId }));
  }

  function previewPileSteel(diameterMm, depthM, reinforcement) {
    return q(sb.rpc("preview_pile_steel", {
      p_diameter_mm: numOrNull(diameterMm),
      p_depth_m: numOrNull(depthM),
      p_reinforcement: reinforcement || null
    }));
  }

  function getProjectZones(projectId) {
    return q(sb.from("v_project_zones").select("*")
      .eq("project_id", projectId).order("zone_name"));
  }

  function addZone(projectId, zone) {
    return q(sb.rpc("add_zone", { p_project_id: projectId, p_zone: zone }));
  }

  function deleteZone(projectId, zone) {
    return q(sb.rpc("delete_zone", { p_project_id: projectId, p_zone: zone }));
  }

  function deleteZoneAndPiles(projectId, zone) {
    return q(sb.rpc("delete_zone_and_piles", { p_project_id: projectId, p_zone: zone }));
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
    // lightweight pile directory for project-scoped pickers.
    //
    // zone + project_name added for the bore-log picker, which narrows
    // site -> zone -> pile (267 piles in one flat list is unusable, and every
    // pile in the register carries a zone). Both are additive — existing
    // callers read fields by name and are unaffected.
    return q(sb.from("v_pile_register")
      .select("pile_id,project_id,project_code,project_name,zone,pile_mark_no")
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

  // ---- user administration (0070/0071) ---------------------------------------
  // The database checks the caller's PERMISSIONS on every call (users.view /
  // users.edit / users.create / users.manage) plus the rank rules — these
  // wrappers only shape parameters. See the header block for the rules the
  // database will refuse on, so pages can avoid offering refusable actions.

  function getUserAccounts(status) {
    return q(sb.rpc("get_user_accounts", { p_status: status || null }));
  }

  function getUserEffectiveAccess(userId) {
    return q(sb.rpc("get_user_effective_access", { p_user_id: userId }));
  }

  function getAdminReference() {
    // returns ONE object (not an array): { my_rank, access_profiles,
    // departments, designations, companies, modules }
    return q(sb.rpc("get_admin_reference"));
  }

  function getUnlinkedLogins() {
    return q(sb.rpc("get_unlinked_logins"));
  }

  function createUserAccount(userId, o) {
    o = o || {};
    return q(sb.rpc("create_user_account", {
      p_user_id: userId,
      p_full_name: o.fullName || null,
      p_company_id: o.companyId || null,
      p_access_profile_id: o.accessProfileId || null,
      p_department_id: o.departmentId || null,
      p_designation_id: o.designationId || null,
      p_staff_id: o.staffId || null
    }));
  }

  function updateUserAccount(userId, o) {
    o = o || {};
    return q(sb.rpc("update_user_account", {
      p_user_id: userId,
      p_full_name: o.fullName || null,
      p_department_id: o.departmentId || null,
      p_designation_id: o.designationId || null,
      p_company_id: o.companyId || null,
      p_staff_id: o.staffId || null,
      p_clear_staff: !!o.clearStaff
    }));
  }

  function approveUserAccount(userId, o) {
    o = o || {};
    return q(sb.rpc("approve_user_account", {
      p_user_id: userId,
      p_access_profile_id: o.accessProfileId || null,
      p_designation_id: o.designationId || null,
      p_department_id: o.departmentId || null,
      p_staff_id: o.staffId || null,
      p_company_id: o.companyId || null
    }));
  }

  function setUserStatus(userId, status, reason) {
    return q(sb.rpc("set_user_status", {
      p_user_id: userId, p_status: status, p_reason: reason || null
    }));
  }

  function setUserAccessProfile(userId, accessProfileId) {
    return q(sb.rpc("set_user_access_profile", {
      p_user_id: userId, p_access_profile_id: accessProfileId
    }));
  }

  function getUserProjectAssignments(userId) {
    return q(sb.rpc("get_user_project_assignments", { p_user_id: userId }));
  }

  function assignUserProject(userId, projectId, role, endsOn) {
    return q(sb.rpc("assign_user_project", {
      p_user_id: userId, p_project_id: projectId,
      p_role: role || "member", p_ends_on: endsOn || null
    }));
  }

  function unassignUserProject(assignmentId) {
    return q(sb.rpc("unassign_user_project", { p_assignment_id: assignmentId }));
  }

  function setUserPermissionOverride(userId, permissionCode, effect, reason, o) {
    o = o || {};
    return q(sb.rpc("set_user_permission_override", {
      p_user_id: userId,
      p_permission_code: permissionCode,
      p_effect: effect,
      p_reason: reason,
      p_expires_at: o.expiresAt || null,
      p_project_id: o.projectId || null
    }));
  }

  function clearUserPermissionOverride(userId, permissionCode) {
    return q(sb.rpc("clear_user_permission_override", {
      p_user_id: userId, p_permission_code: permissionCode
    }));
  }

  function resetUserPermissions(userId) {
    return q(sb.rpc("reset_user_permissions", { p_user_id: userId }));
  }

  function getAccessProfilePermissions(accessProfileId) {
    return q(sb.rpc("get_access_profile_permissions", {
      p_access_profile_id: accessProfileId
    }));
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
  // ---- bore logs (0073 / 0074) -----------------------------------------------
  // A bore log arrives either as an office scan uploaded here, or from the
  // WhatsApp bot. Either way it lands in bore_log_submissions as a DRAFT and
  // stays there until a person checks it against the original image and
  // approves it — only then is a bore_logs row written.
  //
  // This is the ONLY place in this file that touches Supabase Storage;
  // everything else is RPCs and views. The bucket is PRIVATE, so viewing a scan
  // means asking Storage for a short-lived signed URL. That URL is never stored
  // anywhere — a saved one is a dead link waiting to happen (0073).

  var BORE_BUCKET = "bore-logs";

  function getBoreLogSubmissions(o) {
    o = o || {};
    return q(sb.rpc("get_bore_log_submissions", {
      p_status: o.status || null,
      p_project_id: o.projectId || null,
      p_limit: o.limit || null
    }));
  }

  function getBoreLogSubmission(submissionId) {
    return q(sb.rpc("get_bore_log_submission", { p_submission_id: submissionId }));
  }

  // FULL REPLACE of the draft (the set_pile_design precedent): the form always
  // submits complete state, so clearing a field has to work. Never touches
  // bore_logs — nothing here is official yet.
  function saveBoreLogDraft(submissionId, fields, o) {
    o = o || {};
    return q(sb.rpc("save_bore_log_draft", {
      p_submission_id: submissionId,
      p_fields: fields,
      p_pile_id: o.pileId || null,
      p_clear_pile: !!o.clearPile
    }));
  }

  function approveBoreLogSubmission(submissionId, note) {
    return q(sb.rpc("approve_bore_log_submission", {
      p_submission_id: submissionId, p_note: note || null
    }));
  }

  function rejectBoreLogSubmission(submissionId, reason) {
    return q(sb.rpc("reject_bore_log_submission", {
      p_submission_id: submissionId, p_reason: reason
    }));
  }

  // The object path is submissions/{id}/…, so the id must exist BEFORE the file
  // goes up — hence generated here rather than by the database.
  function newSubmissionId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;          // version 4
    b[8] = (b[8] & 0x3f) | 0x80;          // variant 1
    var h = [];
    for (var i = 0; i < 16; i++) h.push(("0" + b[i].toString(16)).slice(-2));
    return h.slice(0, 4).join("") + "-" + h.slice(4, 6).join("") + "-" +
           h.slice(6, 8).join("") + "-" + h.slice(8, 10).join("") + "-" +
           h.slice(10, 16).join("");
  }

  // Storage object keys are not a place for spaces, slashes or Chinese
  // characters. The original name is kept intact on the row.
  function safeObjectName(name) {
    var s = String(name || "file").replace(/[^A-Za-z0-9._-]/g, "_");
    return s.length > 80 ? s.slice(-80) : s;
  }

  // sha-256, hex. Lets the office be told "this same scan is already in the
  // system" instead of quietly creating a second submission for it.
  // crypto.subtle needs a secure origin; on plain http it is simply absent, and
  // a missing hash is not worth failing an upload over.
  async function fileHash(file) {
    if (!(window.crypto && crypto.subtle && file)) return null;
    try {
      var digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      var bytes = new Uint8Array(digest), out = "";
      for (var i = 0; i < bytes.length; i++) out += ("0" + bytes[i].toString(16)).slice(-2);
      return out;
    } catch (e) { return null; }
  }

  // Upload the file(s) FIRST, then create the row that points at them.
  //
  // If the upload succeeds and the row creation then fails, the objects are
  // orphaned — but harmlessly: the Storage read policy only grants access to
  // paths a submission row actually references, so an orphan is unreadable by
  // anyone and invisible in the inbox.
  async function uploadBoreLog(files, o) {
    o = o || {};
    if (!files || !files.length) throw new Error("Choose a file to upload.");

    var submissionId = newSubmissionId();
    var paths = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var path = "submissions/" + submissionId + "/" + (i + 1) + "-" + safeObjectName(f.name);
      var up = await sb.storage.from(BORE_BUCKET).upload(path, f, {
        contentType: f.type || "application/octet-stream",
        upsert: false
      });
      if (up.error) throw up.error;
      paths.push(path);
    }

    await q(sb.rpc("create_bore_log_submission", {
      p_submission_id: submissionId,
      p_source: "dashboard",
      p_storage_paths: paths,
      p_project_id: o.projectId || null,
      p_pile_id: o.pileId || null,
      p_file_hash: await fileHash(files[0]),
      p_original_filename: files[0].name || null,
      p_mime_type: files[0].type || null,
      p_file_size_bytes: files[0].size || null,
      p_wa_message_id: null,
      p_wa_sender: null,
      p_captured_at: null
    }));

    return submissionId;
  }

  // Five minutes is plenty to look at one scan, and keeps a copied link from
  // being useful for long afterwards.
  async function boreLogFileUrl(path, seconds) {
    var res = await sb.storage.from(BORE_BUCKET).createSignedUrl(path, seconds || 300);
    if (res.error) throw res.error;
    return res.data.signedUrl;
  }

  window.Dash = {
    signIn: signIn,
    signUp: signUp,
    signInWithProvider: signInWithProvider,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
    recoveryPending: recoveryPending,
    linkError: linkError,
    signOutQuiet: signOutQuiet,
    signOut: signOut,
    getUser: getUser,
    requireLogin: requireLogin,
    getMyProfile: getMyProfile,
    getMyAccess: getMyAccess,
    can: can,

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

    addPiles: addPiles,
    updatePileIdentity: updatePileIdentity,
    setPileDesign: setPileDesign,
    deletePile: deletePile,
    previewPileSteel: previewPileSteel,
    getProjectZones: getProjectZones,
    addZone: addZone,
    deleteZone: deleteZone,
    deleteZoneAndPiles: deleteZoneAndPiles,

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

    getBoreLogSubmissions: getBoreLogSubmissions,
    getBoreLogSubmission: getBoreLogSubmission,
    saveBoreLogDraft: saveBoreLogDraft,
    approveBoreLogSubmission: approveBoreLogSubmission,
    rejectBoreLogSubmission: rejectBoreLogSubmission,
    uploadBoreLog: uploadBoreLog,
    boreLogFileUrl: boreLogFileUrl,

    getUserAccounts: getUserAccounts,
    getUserEffectiveAccess: getUserEffectiveAccess,
    getAdminReference: getAdminReference,
    getUnlinkedLogins: getUnlinkedLogins,
    createUserAccount: createUserAccount,
    updateUserAccount: updateUserAccount,
    approveUserAccount: approveUserAccount,
    setUserStatus: setUserStatus,
    setUserAccessProfile: setUserAccessProfile,
    getUserProjectAssignments: getUserProjectAssignments,
    assignUserProject: assignUserProject,
    unassignUserProject: unassignUserProject,
    setUserPermissionOverride: setUserPermissionOverride,
    clearUserPermissionOverride: clearUserPermissionOverride,
    resetUserPermissions: resetUserPermissions,
    getAccessProfilePermissions: getAccessProfilePermissions,

    todayKL: todayKL,
    currentYearKL: currentYearKL,
    klTime: klTime,
    klDateTime: klDateTime
  };
})();
