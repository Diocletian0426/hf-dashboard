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
     icons       UI.ICONS / UI.icon      (inline SVG glyphs, no icon font)
     charts      UI.donut / UI.sparkline (card-sized SVG, no chart library)
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
    casing_installed: "Casing Installed",
    boring_in_progress: "Boring",
    bored_complete: "Bored",
    cage_in_progress: "Cage Going In",
    cage_installed: "Cage Installed",
    casting_in_progress: "Casting",
    cast_complete: "Cast Complete",
    head_trimmed: "Head Trimmed",

    /* generic statuses (issues, tests, claims, leave, plans) */
    open: "Open",
    in_progress: "In Progress",
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
    pending_review: "Pending Review",

    /* punch verification */
    verified: "Verified",
    outside_geofence: "Outside Site Area",
    low_accuracy: "Weak GPS Signal",
    no_gps: "No GPS",
    no_geofence: "Site Has No GPS Boundary",

    /* machine status + common machine types */
    operating: "Operating",
    standby: "Standby",
    breakdown: "Breakdown",
    maintenance: "Under Maintenance",
    rotary_drilling_rig: "Rotary Drilling Rig",
    crawler_crane: "Crawler Crane",
    mobile_crane: "Mobile Crane",
    excavator: "Excavator",
    vibro_hammer: "Vibro Hammer",
    generator: "Generator",
    welding_machine: "Welding Machine",
    concrete_pump: "Concrete Pump",

    /* issue categories */
    machinery: "Machinery",
    material: "Material",
    manpower: "Manpower",
    design: "Design",
    safety: "Safety",
    weather: "Weather",
    client: "Client / Consultant",
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
    // Title Case (owner rule 2026-08-03): every word of a label or
    // parameter value gets a capital — "in_progress" -> "In Progress"
    return key.replace(/_/g, " ").replace(/(^|\s)([a-z])/g, function (m, sp, c) {
      return sp + c.toUpperCase();
    });
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

  /* ------------------------------- icons --------------------------------- */
  // Hand-drawn 24x24 strokes — no icon font, because no CDN is allowed and
  // vendoring a whole set for a handful of glyphs is not worth it. They
  // inherit currentColor, so whatever tints the parent tints the icon.
  // (shell.js keeps its own copy on purpose — attendance.html loads shell
  // WITHOUT ui.js, so shell must never depend on this file.)

  UI.ICONS = {
    site:     '<path d="M3 20.5h18"/><path d="M7 20.5V6.5"/><path d="M4 6.5h15"/>' +
              '<path d="M7 6.5 9.8 3.2h3.6"/><path d="M15 6.5v3.4"/>' +
              '<rect x="13.4" y="9.9" width="3.2" height="2.8" rx="0.6"/>',
    issue:    '<path d="M12 4.6 20.6 19.5H3.4z"/><path d="M12 10v4.2"/><path d="M12 17.2v.4"/>',
    machine:  '<rect x="2.6" y="12.6" width="10" height="6" rx="1.5"/>' +
              '<path d="M12.6 15.2h3.6l3-5.6"/><path d="M19.2 9.6h2.2"/>' +
              '<circle cx="6" cy="20.4" r="1.4"/><circle cx="15.6" cy="20.4" r="1.4"/>',
    worker:   '<circle cx="9" cy="7.4" r="3"/><path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"/>' +
              '<circle cx="17.2" cy="9" r="2.2"/><path d="M17.2 13.4c2.3 0 4.2 1.9 4.2 4.2"/>',
    pile:     '<rect x="9" y="4" width="6" height="16" rx="1.4"/><path d="M9 9h6M9 14h6"/>' +
              '<path d="M5.5 20.5h13"/>',
    concrete: '<rect x="2.6" y="10.6" width="9" height="6" rx="1.4"/>' +
              '<path d="M11.6 12.4h3.2l2.6 4.2"/><circle cx="17.4" cy="12.6" r="3.4"/>' +
              '<circle cx="6" cy="19" r="1.5"/><circle cx="16.4" cy="19" r="1.5"/>',
    steel:    '<path d="M4 5.5h16"/><path d="M4 18.5h16"/><path d="M9.5 5.5v13"/><path d="M14.5 5.5v13"/>',
    tests:    '<path d="M9.5 3.5v6.2L4.7 18a1.6 1.6 0 0 0 1.4 2.5h11.8a1.6 1.6 0 0 0 1.4-2.5l-4.8-8.3V3.5"/>' +
              '<path d="M8.6 3.5h6.8"/><path d="M7.6 14.5h8.8"/>',
    alert:    '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.6v5"/><path d="M12 15.9v.4"/>',
    clock:    '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 1.9"/>',
    person:   '<circle cx="12" cy="8.2" r="3.4"/><path d="M5.4 20a6.6 6.6 0 0 1 13.2 0"/>',
    check:    '<circle cx="12" cy="12" r="8.6"/><path d="M8.4 12.2l2.5 2.5 4.7-5"/>',
    plus:     '<path d="M12 5v14"/><path d="M5 12h14"/>',
    play:     '<circle cx="12" cy="12" r="8.6"/><path d="M10.3 8.9 15.4 12l-5.1 3.1z"/>',
    search:   '<circle cx="11" cy="11" r="6.4"/><path d="M15.7 15.7 20.4 20.4"/>',
    download: '<path d="M12 4v11"/><path d="M8.2 11.4 12 15.2l3.8-3.8"/><path d="M4.5 19.5h15"/>',
    question: '<circle cx="12" cy="12" r="8.6"/>' +
              '<path d="M9.7 9.5a2.4 2.4 0 1 1 2.9 2.6v1.4"/><path d="M12.6 16.2v.4"/>'
  };

  UI.icon = function (name, cls) {
    if (!UI.ICONS[name]) return "";
    return '<svg class="ic' + (cls ? " " + UI.esc(cls) : "") + '" viewBox="0 0 24 24" fill="none" ' +
           'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
           'aria-hidden="true">' + UI.ICONS[name] + "</svg>";
  };

  /* ------------------------- small chart pieces --------------------------- */
  // Used by the site cards on the Overview and the project cards on Projects.

  var DON_R = 26, DON_C = 2 * Math.PI * DON_R;

  UI.donut = function (pct) {
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return '<svg class="donut" viewBox="0 0 64 64" aria-hidden="true">' +
             '<circle class="donut-track" cx="32" cy="32" r="' + DON_R + '"/>' +
             '<circle class="donut-fill" cx="32" cy="32" r="' + DON_R + '" ' +
                     'stroke-dasharray="' + DON_C.toFixed(1) + '" ' +
                     'stroke-dashoffset="' + (DON_C * (1 - pct / 100)).toFixed(1) + '" ' +
                     'transform="rotate(-90 32 32)"/>' +
             '<text class="donut-num" x="32" y="32">' + pct + "%</text>" +
           "</svg>";
  };

  // rows: [{ log_date, <valueKey> }] oldest first. Real data only — an empty
  // set says so in words rather than drawing a fake flat line.
  UI.sparkline = function (rows, valueKey, emptyMsg) {
    rows = rows || [];
    if (!rows.length)
      return '<div class="sc-spark-none">' + UI.escHtml(emptyMsg || "No daily data") + "</div>";

    var W = 300, H = 62, L = 20, R = 4, T = 6, B = 15;
    var vals = rows.map(function (r) { return Number(r[valueKey]) || 0; });
    var max = Math.max(1, Math.max.apply(null, vals));
    var n = rows.length;
    function px(i) { return n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1); }
    function py(v) { return T + (1 - v / max) * (H - T - B); }

    var pts = vals.map(function (v, i) { return px(i).toFixed(1) + " " + py(v).toFixed(1); });
    var line = "M" + pts.join(" L");
    var area = line + " L" + px(n - 1).toFixed(1) + " " + py(0).toFixed(1) +
                      " L" + px(0).toFixed(1) + " " + py(0).toFixed(1) + " Z";
    var dots = vals.map(function (v, i) {
      return '<circle class="spark-dot" cx="' + px(i).toFixed(1) + '" cy="' + py(v).toFixed(1) + '" r="1.9"/>';
    }).join("");

    // first / last plus two inside — more ticks than that collide at card width
    var ticks = [0, Math.floor((n - 1) / 3), Math.floor(2 * (n - 1) / 3), n - 1]
      .filter(function (v, i, a) { return a.indexOf(v) === i; })
      .map(function (i) {
        var d = new Date(rows[i].log_date + "T00:00:00");
        return '<text class="spark-tick" x="' + px(i).toFixed(1) + '" y="' + (H - 3) +
               '" text-anchor="' + (i === 0 ? "start" : i === n - 1 ? "end" : "middle") + '">' +
               d.getDate() + " " + d.toLocaleString("en-MY", { month: "short" }) + "</text>";
      }).join("");

    return '<svg class="sc-spark" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
             UI.esc(valueKey.replace(/_/g, " ") + " per day") + '">' +
             '<text class="spark-ax" x="0" y="' + (py(max) + 3).toFixed(1) + '">' + max + "</text>" +
             '<text class="spark-ax" x="0" y="' + (py(0) + 3).toFixed(1) + '">0</text>' +
             '<path class="spark-area" d="' + area + '"/>' +
             '<path class="spark-line" d="' + line + '"/>' + dots + ticks +
           "</svg>";
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
