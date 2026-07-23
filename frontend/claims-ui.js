/* =============================================================================
   HF Dashboard — SHARED CLAIMS RENDERING (window.ClaimsUI)
   =============================================================================
   Loaded ONLY by the two money pages — project.html (view-only mirror) and
   claims.html (the working page). Before this file the whole rendering stack
   was copy-pasted between them and had started to drift.

   Requires ui.js (window.UI) to be loaded first.

   ClaimsUI.CLAIM_BADGE          status -> badge class
   ClaimsUI.summaryCards(sum)    the 5 money stat cards
   ClaimsUI.linesTable(lines)    one claim's lines, paper-IPC layout
                                 (Previous | This claim | Cumulative)
   ClaimsUI.registerTable(register, open, innerFor)
                                 the claim register; innerFor(claim) supplies
                                 the fold-open cell (read-only lines on the
                                 hub, action bars / edit modes on claims.html)
   ClaimsUI.bqTable(bq, note)    the Bill of Quantities status block
   ============================================================================= */
(function () {
  "use strict";

  var ClaimsUI = {};

  ClaimsUI.CLAIM_BADGE = { submitted: "badge-pending", certified: "badge-approved", paid: "badge-gray" };

  ClaimsUI.summaryCards = function (sum) {
    var vo = Number(sum.contract_sum_vo) || 0;
    var gap = Number(sum.claimed_not_certified) || 0;
    var cards = [
      ["Contract sum" + (vo > 0 ? " · incl. VO " + UI.fmtRM(vo) : ""), UI.fmtRM(sum.contract_sum), ""],
      ["Claimed to date · " + UI.fmtPct(sum.pct_claimed), UI.fmtRM(sum.claimed_to_date), ""],
      ["Certified to date · " + UI.fmtPct(sum.pct_certified), UI.fmtRM(sum.certified_to_date), ""],
      ["Retention held", UI.fmtRM(sum.retention_held), ""],
      ["Claimed, not certified", UI.fmtRM(sum.claimed_not_certified), gap > 0 ? " stale-warn" : ""]
    ];
    return '<div class="cards">' + cards.map(function (c) {
      return '<div class="card"><div class="label">' + c[0] + "</div>" +
             '<div class="value money' + c[2] + '">' + c[1] + "</div></div>";
    }).join("") + "</div>";
  };

  // the lines INSIDE one claim, laid out like page 2 of the paper IPC:
  // PREVIOUS qty | THIS CLAIM qty | CUMULATIVE qty per BQ item
  ClaimsUI.linesTable = function (lines) {
    if (!lines.length) {
      return '<div class="muted-line" style="padding:8px 12px">No lines recorded for this claim.</div>';
    }
    var certAny = false, totalThis = 0, totalCert = 0;
    var rows = lines.map(function (l) {
      totalThis += Number(l.amount_claimed) || 0;
      totalCert += Number(l.amount_certified) || 0;
      if (l.qty_certified !== null) certAny = true;
      return "<tr>" +
        "<td>" + UI.escHtml(l.item_code || "") + "</td>" +
        '<td class="wrap">' + UI.escHtml(l.description) + "</td>" +
        "<td>" + UI.escHtml(l.unit || "") + "</td>" +
        '<td class="num">' + (l.rate === null ? "—" : UI.fmtRM(l.rate)) + "</td>" +
        '<td class="num">' + (Number(l.prev_qty_claimed) ? l.prev_qty_claimed : "—") + "</td>" +
        '<td class="num"><strong>' + l.qty_claimed + "</strong></td>" +
        '<td class="num">' + l.cum_qty_claimed + "</td>" +
        '<td class="num">' + UI.fmtRM(l.amount_claimed) + "</td>" +
        '<td class="num">' + (l.qty_certified === null ? "—" : l.qty_certified) + "</td>" +
      "</tr>";
    }).join("");
    return '<table class="claim-lines">' +
           "<thead><tr><th>#</th><th>Description</th><th>Unit</th>" +
           '<th class="num">Rate</th><th class="num">Previous</th>' +
           '<th class="num">This claim</th><th class="num">Cumulative</th>' +
           '<th class="num">Amount</th><th class="num">Certified qty</th></tr></thead>' +
           "<tbody>" + rows + "</tbody>" +
           '<tfoot><tr><td colspan="7">This claim total</td>' +
           '<td class="num">' + UI.fmtRM(totalThis) + "</td>" +
           '<td class="num">' + (certAny ? UI.fmtRM(totalCert) : "—") + "</td></tr></tfoot></table>";
  };

  // the claim register. innerFor(claim) -> HTML for the fold-open detail cell.
  ClaimsUI.registerTable = function (register, open, innerFor) {
    if (!register.length) {
      return '<div class="muted-line">No claims submitted yet.</div>';
    }
    var rows = register.map(function (c) {
      var isOpen = !!open[c.claim_no];
      var main = '<tr class="claim-row" data-claim="' + c.claim_no +
        '" title="Click to open this claim' + "'" + 's lines">' +
        '<td><span class="claim-caret">' + (isOpen ? "&#9662;" : "&#9656;") + "</span> <strong>" + c.claim_no + "</strong></td>" +
        "<td>" + UI.mstr(c.period_to) + "</td>" +
        '<td class="num">' + UI.fmtRM(c.claimed_amount) + "</td>" +
        '<td class="num">' + UI.fmtRM(c.certified_amount) + "</td>" +
        '<td class="num">' + UI.fmtPct(c.pct_certified_vs_claimed) + "</td>" +
        "<td>" + UI.badge(c.status, ClaimsUI.CLAIM_BADGE[c.status] || "badge-gray") + "</td>" +
        "<td>" + UI.dstr(c.submitted_date) + "</td>" +
        "<td>" + UI.dstr(c.certified_date) + "</td>" +
      "</tr>";
      var detail = '<tr class="claim-lines-row"' + (isOpen ? "" : ' style="display:none"') +
                   '><td colspan="8">' + innerFor(c) + "</td></tr>";
      return main + detail;
    }).join("");
    return '<div class="table-wrap table-sticky-first"><table>' +
           "<thead><tr><th>#</th><th>Period</th>" +
           '<th class="num">Claimed</th><th class="num">Certified</th>' +
           '<th class="num">% certified</th><th>Status</th>' +
           "<th>Submitted</th><th>Certified on</th></tr></thead>" +
           "<tbody>" + rows + "</tbody></table></div>";
  };

  // Bill of Quantities status. note = the short reminder in the header line
  // ("rates visible" on the hub, "BQ entry stays a working-session job" on
  // the claims page). Description wraps (td.wrap) so item + rate stay on
  // screen together.
  ClaimsUI.bqTable = function (bq, note) {
    if (!bq.length) return "";
    var rows = bq.map(function (b) {
      var desc = UI.escHtml(b.description) +
        (b.remarks ? ' <span class="muted-line">(' + UI.escHtml(b.remarks) + ")</span>" : "") +
        (b.is_variation ? ' <span class="badge badge-anomaly" title="Variation order">VO</span>' : "");
      return "<tr>" +
        "<td>" + UI.escHtml(b.item_code || "") + "</td>" +
        '<td class="wrap">' + desc + "</td>" +
        "<td>" + UI.escHtml(b.unit || "") + "</td>" +
        '<td class="num">' + (b.rate === null ? "—" : UI.fmtRM(b.rate)) + "</td>" +
        '<td class="num">' + b.contract_qty + "</td>" +
        '<td class="num">' + UI.fmtRM(b.amount) + "</td>" +
        '<td class="num">' + b.cum_qty_claimed + "</td>" +
        '<td class="num">' + (b.cum_qty_certified === null ? "—" : b.cum_qty_certified) + "</td>" +
        '<td class="num">' + UI.fmtPct(b.pct_certified) + "</td>" +
      "</tr>";
    }).join("");
    return '<details class="zone"><summary><span class="zone-name">Bill of Quantities — item status</span>' +
           '<span class="zone-count">' + bq.length + " items" + (note ? " · " + note : "") + "</span></summary>" +
           '<div class="table-wrap table-sticky-first"><table>' +
           "<thead><tr><th>#</th><th>Description</th><th>Unit</th>" +
           '<th class="num">Rate</th><th class="num">Contract</th><th class="num">Amount</th>' +
           '<th class="num">Claimed</th><th class="num">Certified</th>' +
           '<th class="num">% cert</th></tr></thead>' +
           "<tbody>" + rows + "</tbody></table></div></details>";
  };

  window.ClaimsUI = ClaimsUI;
})();
