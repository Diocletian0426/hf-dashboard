/* =============================================================================
   HF Dashboard — SHARED UI HELPERS (window.UI)
   =============================================================================
   One copy of the small helpers every page used to redefine, plus the
   plain-language label map so raw database values never reach the screen.

   Load order (script tags):
     vendor/supabase.js -> config.js -> dashboard-client.js -> ui.js
       -> [claims-ui.js on money pages] -> shell.js -> page script

   NOTE: shell.js deliberately does NOT use this file (attendance.html loads
   shell without it — that page is owned separately and never edited).

   What lives here:
     text        UI.esc / UI.escHtml
     dates       UI.dstr / UI.mstr / UI.daysSince
     numbers     UI.f1 / UI.fmtRM / UI.fmtPct
     labels      UI.LABELS / UI.label / UI.badge  (humanize raw enum values)
     glossary    UI.help  (plain-language tooltip for jargon)
     states      UI.loadingRow / UI.emptyRow / UI.empty / UI.errorBanner / UI.okBanner
     tables      UI.td  (emits <td data-label="…"> for .table-stack)
     memory      UI.openState / UI.saveScroll / UI.restoreScroll
                 (open cards + scroll survive the reload-after-save)
     domain      UI.PILE_STAGES / UI.STAGE_COLORS / UI.stageOf
                 UI.TEST_GRACE_DAYS / UI.testBuckets
   ============================================================================= */
(function () {
  "use strict";

  var UI = {};

  /* ---------------------------- text escaping ---------------------------- */

  // for attribute values (title="…", value="…")
  UI.esc = function (s) {
    return String(s === null || s === undefined ? "" : s).replace(/"/g, "&quot;");
  };

  // for text content
  UI.escHtml = function (s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  /* ---------------------------- dates + numbers -------------------------- */

  var D_FMT = new Intl.DateTimeFormat("en-MY", { day: "2-digit", month: "short", year: "numeric" });
  var M_FMT = new Intl.DateTimeFormat("en-MY", { month: "short", year: "numeric" });
  var RM_FMT = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // "14 Jul 2026" from a YYYY-MM-DD string
  UI.dstr = function (d) {
    if (!d) return "—";
    return D_FMT.format(new Date(d + "T00:00:00"));
  };

  // "Jul 2026" — claim periods read as a month, not a day
  UI.mstr = function (d) {
    if (!d) return "—";
    return M_FMT.format(new Date(d + "T00:00:00"));
  };

  // whole days from dateStr to today (Malaysia time); null when no date
  UI.daysSince = function (dateStr) {
    if (!dateStr) return null;
    return Math.round((new Date(Dash.todayKL()) - new Date(dateStr)) / 86400000);
  };

  UI.f1 = function (v) { return (Math.round(v * 10) / 10).toString(); };

  UI.fmtRM = function (v) {
    if (v === null || v === undefined || v === "") return "—";
    return "RM " + RM_FMT.format(Number(v));
  };

  UI.fmtPct = function (v) {
    return (v === null || v === undefined || v === "") ? "—" : Number(v) + "%";
  };

  /* ------------------------ plain-language labels ------------------------ */
  // Raw database values -> what the office should read. Anything missing
  // falls back to sentence case with the underscores removed.

  UI.LABELS = {
    /* designations (staff.designation) */
    management: "Management",
    office: "Office",
    site_supervisor: "Site Supervisor",
    site: "Site Crew",

    /* pile construction status */
    planned: "Planned",
    casing_installed: "Casing installed",
    boring_in_progress: "Boring",
    bored_complete: "Bored",
    cage_in_progress: "Cage going in",
    cage_installed: "Cage installed",
    casting_in_progress: "Casting",
    cast_complete: "Cast complete",
    head_trimmed: "Head trimmed",

    /* generic statuses (issues, tests, claims, leave, plans) */
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
    closed: "Closed",
    pending: "Pending",
    scheduled: "Scheduled",
    completed: "Completed",
    passed: "Passed",
    failed: "Failed",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
    executed: "Executed",
    submitted: "Submitted",
    certified: "Certified",
    paid: "Paid",
    pending_review: "Pending review",

    /* punch verification */
    verified: "Verified",
    outside_geofence: "Outside site area",
    low_accuracy: "Weak GPS signal",
    no_gps: "No GPS",
    no_geofence: "Site has no GPS boundary",

    /* machine status + common machine types */
    operating: "Operating",
    standby: "Standby",
    breakdown: "Breakdown",
    maintenance: "Under maintenance",
    rotary_drilling_rig: "Rotary drilling rig",
    crawler_crane: "Crawler crane",
    mobile_crane: "Mobile crane",
    excavator: "Excavator",
    vibro_hammer: "Vibro hammer",
    generator: "Generator",
    welding_machine: "Welding machine",
    concrete_pump: "Concrete pump",

    /* issue categories */
    machinery: "Machinery",
    material: "Material",
    manpower: "Manpower",
    design: "Design",
    safety: "Safety",
    weather: "Weather",
    client: "Client / consultant",
    other: "Other",

    /* priorities */
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low"
  };

  UI.label = function (v) {
    if (v === null || v === undefined || v === "") return "—";
    var key = String(v);
    if (UI.LABELS[key] !== undefined) return UI.LABELS[key];
    var s = key.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // status/priority pill with the human label. clsOverride skips the
  // value-derived class ("badge-open" etc.) when the caller knows better.
  UI.badge = function (value, clsOverride) {
    if (value === null || value === undefined || value === "") return "";
    var cls = clsOverride || ("badge-" + String(value));
    return '<span class="badge ' + UI.esc(cls) + '">' + UI.escHtml(UI.label(value)) + "</span>";
  };

  /* ------------------------------- glossary ------------------------------ */
  // Jargon gets a dotted underline + plain-language explanation.
  // Desktop: hover (title). Touch: tap toggles a small bubble.

  UI.GLOSSARY = {
    retention: "Money the client holds back from every claim until the job is done.",
    certified: "The amount the client's consultant approved for payment.",
    drift: "The WhatsApp bot last saw this person at a different site than this roster says.",
    geofence: "The GPS boundary around a site, used to verify punch in/out locations.",
    mobilised: "The date the machine arrived on this site.",
    "hour meter": "The machine's running-hours clock — servicing is due by hours, not dates.",
    "rock socket": "The part of the pile drilled into rock below the soil.",
    "work vs time": "Compares piles done (%) against contract time used (%)."
  };

  UI.help = function (term, text) {
    var t = text || UI.GLOSSARY[String(term).toLowerCase()] || "";
    if (!t) return UI.escHtml(term);
    return '<span class="help" tabindex="0" title="' + UI.esc(t) + '" data-help="' +
           UI.esc(t) + '">' + UI.escHtml(term) + "</span>";
  };

  // tap-to-toggle bubble for .help on touch devices (event delegation, once)
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    var openPop = document.querySelector(".help-pop");
    if (openPop && (!t.classList || !t.classList.contains("help"))) openPop.remove();
    if (!t.classList || !t.classList.contains("help")) return;
    if (openPop && openPop.parentNode === t) return;  // just closed its own
    var pop = document.createElement("span");
    pop.className = "help-pop";
    pop.textContent = t.getAttribute("data-help") || "";
    t.appendChild(pop);
  });

  /* --------------------------- state helpers ----------------------------- */

  UI.loadingRow = function (colspan) {
    return '<tr><td colspan="' + colspan + '" class="empty">Loading…</td></tr>';
  };

  UI.emptyRow = function (colspan, msg) {
    return '<tr><td colspan="' + colspan + '" class="empty">' + UI.escHtml(msg) + "</td></tr>";
  };

  UI.empty = function (msg, hint) {
    return '<div class="empty">' + UI.escHtml(msg) +
           (hint ? '<br><span class="muted">' + UI.escHtml(hint) + "</span>" : "") + "</div>";
  };

  UI.errorBanner = function (msg) {
    return '<div class="banner banner-red">Could not load: ' + UI.escHtml(msg) + "</div>";
  };

  UI.okBanner = function (msg) {
    return '<div class="banner banner-green">' + UI.escHtml(msg) + "</div>";
  };

  /* ------------------------------- tables -------------------------------- */
  // <td data-label="…"> — the label shows when the table stacks on a phone
  // (.table-stack). Pass label "" for cells that should span full width.

  UI.td = function (label, html, cls) {
    return "<td" + (label ? ' data-label="' + UI.esc(label) + '"' : "") +
           (cls ? ' class="' + UI.esc(cls) + '"' : "") + ">" +
           (html === null || html === undefined || html === "" ? "—" : html) + "</td>";
  };

  /* ----------------- open-state + scroll survive reloads ------------------ */
  // The house write pattern is "save -> window.location.reload()". These make
  // that bearable: call saveScroll() + openState.saveFrom() just before the
  // reload, and load()/restoreScroll() when the page boots.

  function pageKey() { return window.location.pathname.split("/").pop() + window.location.search; }

  UI.openState = function (ns) {
    var key = "hf-open:" + pageKey() + ":" + (ns || "g");
    return {
      // -> { groupKey: true, … } of the groups the user had open
      load: function () {
        try { return JSON.parse(sessionStorage.getItem(key) || "{}"); }
        catch (e) { return {}; }
      },
      saveMap: function (obj) {
        try { sessionStorage.setItem(key, JSON.stringify(obj || {})); } catch (e) {}
      },
      // scan <details data-group="…"> under container (or document) and save
      // which ones are open right now
      saveFrom: function (container) {
        var root = container || document;
        var out = {};
        var els = root.querySelectorAll("details[data-group]");
        for (var i = 0; i < els.length; i++) {
          if (els[i].open) out[els[i].getAttribute("data-group")] = true;
        }
        this.saveMap(out);
        return out;
      }
    };
  };

  UI.saveScroll = function () {
    try { sessionStorage.setItem("hf-scroll:" + pageKey(), String(window.scrollY || 0)); }
    catch (e) {}
  };

  UI.restoreScroll = function () {
    try {
      var k = "hf-scroll:" + pageKey();
      var y = sessionStorage.getItem(k);
      if (y !== null) {
        sessionStorage.removeItem(k);
        window.scrollTo(0, Number(y) || 0);
      }
    } catch (e) {}
  };

  /* --------------------------- domain constants --------------------------- */
  // Pile lifecycle (one canonical copy — was duplicated on the hub + pile pages)

  UI.PILE_STAGES = [
    ["Planned", ["planned"]],
    ["Boring",  ["casing_installed", "boring_in_progress"]],
    ["Bored",   ["bored_complete"]],
    ["Cage",    ["cage_in_progress", "cage_installed"]],
    ["Cast",    ["casting_in_progress", "cast_complete"]],
    ["Trimmed", ["head_trimmed"]]
  ];

  UI.STAGE_COLORS = {
    "Planned": "#e5e7eb", "Boring": "#5598e7", "Bored": "#2a78d6",
    "Cage": "#1c5cab", "Cast": "#1baf7a", "Trimmed": "#008300"
  };

  UI.stageOf = function (status) {
    for (var i = 0; i < UI.PILE_STAGES.length; i++)
      if (UI.PILE_STAGES[i][1].indexOf(status) !== -1) return UI.PILE_STAGES[i][0];
    return "Planned";
  };

  // Test chasing buckets: Curing -> To arrange (RED "not booked" after the
  // grace) -> Booked ("date missed" when a booked date passed) -> done.
  // Canonical copy = the hub's (the tests-page copy had drifted).
  UI.TEST_GRACE_DAYS = 7;

  UI.testBuckets = function (tests) {
    var done = ["completed", "passed"];
    var b = { missed: [], notBooked: [], toArrange: [], booked: [], curing: [] };
    tests.forEach(function (t) {
      if (done.indexOf(t.status) !== -1 || t.test_result || t.actual_test_date) return;
      if (t.is_overdue === true) { b.missed.push(t); return; }
      if (t.scheduled_test_date) { b.booked.push(t); return; }
      if (t.days_until_eligible === null || t.days_until_eligible === undefined) return;
      if (t.days_until_eligible > 0) { b.curing.push(t); return; }
      if (-t.days_until_eligible > UI.TEST_GRACE_DAYS) b.notBooked.push(t);
      else b.toArrange.push(t);
    });
    return b;
  };

  window.UI = UI;
})();
