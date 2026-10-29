// -----------------------------------------------------------------------------
// correct-form.js — Rule The Times: the office's correction form, shared.
//
// One ruling, two times, a reason the worker reads. The Exceptions page uses
// it inside a row's panel (15 Oct review: no more hopping to the Attendance
// page to rule a time). The Attendance page's Correct Hours form is the same
// shape and switches to this file in its next change, so the rule lives in
// one place. This file is pure: it builds HTML from a shift and reads the
// answer back. The page that owns the elements wires the clicks and calls
// Dash.setDayCorrection.
//
//   var spec = { id: "k1", workDate: "2026-10-14",
//                inAt: <ISO tap>, outAt: <ISO tap or null>,
//                officialInAt, officialOutAt, adjusted };    // the ruling already standing, if any
//   var form = CorrectForm.start(spec);                       // { tIn, tOut, next, why }
//   el.innerHTML = CorrectForm.html(spec, form, { busy, err, invalid, saveLabel });
//   var got = CorrectForm.read(spec, form);                   // { inISO, outISO, why } | { error, field }
//
// Inputs carry data-cf="tIn|tOut|next|why"; the reason chips data-cf-reason;
// the buttons data-cf-save / data-cf-cancel. The page keeps `form` in its own
// state and updates it on input, so a re-render never loses what was typed.
//
// WHAT GOES TO THE DATABASE (the Attendance page's rule, kept): only the end
// that was changed. An end left as the worker's tap goes as null ("keep the
// tap"); an end the office ruled on before goes as that ruling, because a
// save replaces the whole correction and would otherwise drop it.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  var REASONS = ["Forgot To Punch Out", "Forgot To Punch In", "Phone Problem", "Punched At The Wrong Time"];

  var KL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  function parts(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    if (isNaN(d)) return null;
    var p = {};
    KL.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    if (p.hour === "24") p.hour = "00";
    return p;
  }
  function klDate(ts) { var p = parts(ts); return p ? p.year + "-" + p.month + "-" + p.day : ""; }
  function klHHMM(ts) { var p = parts(ts); return p ? p.hour + ":" + p.minute : ""; }
  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function nextDay(ts, workDate) { var d = klDate(ts); return !!d && d > String(workDate).slice(0, 10); }

  // the time standing on each end: the office's ruling if one stands, else the tap
  function standing(spec) {
    var same = function (a, b) { return a && b && new Date(a).getTime() === new Date(b).getTime(); };
    var rIn  = spec.adjusted && spec.officialInAt  && !same(spec.officialInAt,  spec.inAt)  ? spec.officialInAt  : null;
    var rOut = spec.adjusted && spec.officialOutAt && !same(spec.officialOutAt, spec.outAt) ? spec.officialOutAt : null;
    return { ruledIn: rIn, ruledOut: rOut, inAt: rIn || spec.inAt || null, outAt: rOut || spec.outAt || null };
  }

  // the chips in the day's order (owner, 27 Oct 2026): the reason the worker's
  // own taps point to comes first — no punch-out, no punch-in, or both there
  // and one of them wrong. spec.inAt / spec.outAt are the taps.
  function reasonsFor(spec) {
    var first = !spec.outAt ? "Forgot To Punch Out" : !spec.inAt ? "Forgot To Punch In" : "Punched At The Wrong Time";
    return [first].concat(REASONS.filter(function (r) { return r !== first; }));
  }

  function start(spec) {
    var s = standing(spec);
    return { tIn: klHHMM(s.inAt), tOut: klHHMM(s.outAt), next: nextDay(s.outAt, spec.workDate), why: "" };
  }

  function html(spec, form, ui) {
    ui = ui || {};
    var dis = ui.busy ? " disabled" : "";
    var bad = function (f) { return ui.invalid === f ? ' aria-invalid="true"' : ""; };
    return '<div class="cf" data-cf-id="' + esc(spec.id) + '">' +
      '<div class="cf-times">' +
        '<label>Punch In<input type="time" data-cf="tIn" step="60" value="' + esc(form.tIn) + '"' + bad("tIn") + dis + "></label>" +
        '<label>Punch Out<input type="time" data-cf="tOut" step="60" value="' + esc(form.tOut) + '"' + bad("tOut") + dis + "></label>" +
        '<label class="cf-next"><input type="checkbox" data-cf="next"' + (form.next ? " checked" : "") + dis +
          "> Punch Out Was The Next Day</label>" +
      "</div>" +
      '<div class="cf-reasons">' + REASONS.map(function (r) {
        return '<button type="button" data-cf-reason="' + esc(r) + '"' + dis + ">" + esc(r) + "</button>";
      }).join("") + "</div>" +
      '<label class="cf-why">Reason (required)' +
        '<input type="text" data-cf="why" maxlength="500" autocomplete="off" value="' + esc(form.why) + '"' +
        ' placeholder="press a reason above, or write it"' + bad("why") + dis + "></label>" +
      '<div class="cf-err" role="alert">' + esc(ui.err || "") + "</div>" +
      '<div class="cf-actions">' +
        '<button type="button" class="btn btn-primary" data-cf-save' + dis + ">" +
          (ui.busy ? "Saving…" : esc(ui.saveLabel || "Save Ruling")) + "</button>" +
        '<button type="button" class="btn" data-cf-cancel' + dis + ">Cancel</button>" +
        '<span class="muted">The worker will see this reason. Malaysia time.</span>' +
      "</div>" +
    "</div>";
  }

  function read(spec, form) {
    var s = standing(spec), date = String(spec.workDate).slice(0, 10);
    var tIn = form.tIn || "", tOut = form.tOut || "", next = !!form.next, why = String(form.why || "").trim();
    var inISO  = (tIn && tIn !== klHHMM(s.inAt)) ? date + "T" + tIn + ":00+08:00" : s.ruledIn;
    var outISO = (tOut && (tOut !== klHHMM(s.outAt) || next !== nextDay(s.outAt, date)))
      ? (next ? addDays(date, 1) : date) + "T" + tOut + ":00+08:00" : s.ruledOut;
    if (!inISO && !outISO) {
      return { error: "Nothing has been changed yet. Change the time that is wrong, then save.", field: tOut ? "tIn" : "tOut" };
    }
    if (tIn && tOut && !next && tOut <= tIn) {
      return { error: "Punch Out is not after Punch In. If the worker finished after midnight, tick Punch Out Was The Next Day.", field: "tOut" };
    }
    if (!why) return { error: "Give a reason. The worker reads it in their app.", field: "why" };
    return { inISO: inISO, outISO: outISO, why: why };
  }

  window.CorrectForm = { REASONS: REASONS, reasonsFor: reasonsFor, start: start, html: html, read: read, standing: standing,
                         klHHMM: klHHMM, klDate: klDate };
})();
