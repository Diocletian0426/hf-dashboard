// -----------------------------------------------------------------------------
// xlsx-lite — writes a real .xlsx workbook in the browser, with no library.
//
// WHY THIS EXISTS. The office pays wages from the attendance month view, and the
// only way to get those hours into a payroll sheet was to retype them. The
// dashboard vendors its few dependencies and loads nothing from a CDN, so a
// spreadsheet library was not on the table — and a CSV is the wrong answer for
// the people using it: Excel mangles names that are not plain ASCII, re-reads
// employee codes and dates as it sees fit, and cannot hold a second sheet.
//
// WHAT IT IS. An .xlsx is a zip of small XML files. This writes that zip
// uncompressed ("stored"), which needs a CRC-32 and nothing else. About a
// hundred lines; no compression, no formulas, no styling beyond what a payroll
// sheet needs:
//     bold            — headings and the total row
//     0.00            — hours as real NUMBERS, so they can be summed and multiplied
//     dd mmm yyyy     — real DATES, so they sort and filter as dates
//     h:mm AM/PM      — real TIMES, so a punch-out minus a punch-in is arithmetic
//     formulas        — a total that is =SUM(...), so it follows the rows if HR edits them
//     frozen top rows, column widths
//
// USE
//     var blob = XlsxLite.build([
//       { name: "Summary", widths: [14, 30], freezeRows: 1,
//         rows: [ [ {v:"Code", bold:true}, {v:"Name", bold:true} ],
//                 [ "HS015", "Thet Zaw Tun" ],
//                 [ {v: 7.5, hours: true}, {v: "2026-08-17", date: true} ] ] }
//     ]);
//     XlsxLite.download(blob, "Attendance 2026-08.xlsx");
//
// A cell is a string, a number, null, or {v, bold?, hours?, date?, time?, f?}.
// `date` takes an ISO "YYYY-MM-DD" string; `time` takes "HH:MM" (24 h); `f` is a
// formula without the "=" and `v` beside it is the value to show until Excel
// recalculates. Nothing here touches the network or the database.
// -----------------------------------------------------------------------------
(function () {
  "use strict";

  /* ---- CRC-32 (the zip format wants one per file) ---- */
  var CRC_TABLE = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---- a stored (uncompressed) zip ---- */
  function zip(files) {                       // files: [{name, bytes}]
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.bytes), len = f.bytes.length;
      // 0x0800 = the file name is UTF-8; method 0 = stored; date 1980-01-01
      var head = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
                           u32(crc), u32(len), u32(len), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, f.bytes);
      central.push({ name: name, crc: crc, len: len, offset: offset });
      offset += head.length + name.length + len;
    });
    var cdStart = offset, cdLen = 0;
    central.forEach(function (c) {
      var rec = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
                          u32(c.crc), u32(c.len), u32(c.len), u16(c.name.length),
                          u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      parts.push(new Uint8Array(rec), c.name);
      cdLen += rec.length + c.name.length;
    });
    parts.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length),
                                        u16(files.length), u32(cdLen), u32(cdStart), u16(0))));
    return new Blob(parts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ---- the XML ---- */
  // Characters XML 1.0 forbids outright would make Excel refuse the whole file, so
  // they are dropped. Done by character CODE, deliberately: written as a regex of
  // escapes, the escapes were saved as the raw control characters themselves, and
  // a source file with a NUL byte in it is one that git calls binary and an editor
  // can quietly break.
  function allowed(code) {
    return code === 9 || code === 10 || code === 13 ||
           (code >= 32 && code !== 65534 && code !== 65535);
  }
  function esc(s) {
    s = String(s);
    var out = "";
    for (var i = 0; i < s.length; i++) if (allowed(s.charCodeAt(i))) out += s.charAt(i);
    return out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function colName(i) {                       // 0 -> A, 26 -> AA
    var s = "";
    for (i = i + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }
  // Excel counts days from 1899-12-30
  function dateSerial(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return null;
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  // "HH:MM" -> the fraction of a day Excel stores a time as
  function timeFraction(hhmm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
    if (!m) return null;
    return (Number(m[1]) * 60 + Number(m[2])) / 1440;
  }

  // cellXfs, by index: 0 plain · 1 bold · 2 hours · 3 bold hours · 4 date · 5 bold date
  //                    6 time · 7 bold time      (18 is Excel's built-in "h:mm AM/PM")
  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\ mmm\\ yyyy"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="8">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="2" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
      '<xf numFmtId="18" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="18" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function cellXml(cell, ref) {
    if (cell === null || cell === undefined || cell === "") return "";
    var c = (typeof cell === "object") ? cell : { v: cell };
    var bold = c.bold ? 1 : 0;
    if (c.f) {                                  // a formula, with the value to show until Excel recalculates
      return '<c r="' + ref + '" s="' + ((c.hours ? 2 : 0) + bold) + '"><f>' + esc(c.f) + "</f>" +
             ((typeof c.v === "number" && isFinite(c.v)) ? "<v>" + c.v + "</v>" : "") + "</c>";
    }
    if (c.v === null || c.v === undefined || c.v === "") return "";
    if (c.time) {
      var t = timeFraction(c.v);
      if (t !== null) return '<c r="' + ref + '" s="' + (6 + bold) + '"><v>' + t + "</v></c>";
    }
    if (c.date) {
      var n = dateSerial(c.v);
      if (n !== null) return '<c r="' + ref + '" s="' + (4 + bold) + '"><v>' + n + "</v></c>";
    }
    if (typeof c.v === "number" && isFinite(c.v)) {
      return '<c r="' + ref + '" s="' + ((c.hours ? 2 : 0) + bold) + '"><v>' + c.v + "</v></c>";
    }
    // inline strings: no shared-strings table to keep in step
    return '<c r="' + ref + '" t="inlineStr"' + (bold ? ' s="1"' : "") +
           '><is><t xml:space="preserve">' + esc(c.v) + "</t></is></c>";
  }

  function sheetXml(sheet) {
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (sheet.freezeRows) {
      xml += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + sheet.freezeRows +
             '" topLeftCell="A' + (sheet.freezeRows + 1) + '" activePane="bottomLeft" state="frozen"/>' +
             "</sheetView></sheetViews>";
    }
    if (sheet.widths && sheet.widths.length) {
      xml += "<cols>" + sheet.widths.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join("") + "</cols>";
    }
    xml += "<sheetData>" + (sheet.rows || []).map(function (row, r) {
      return '<row r="' + (r + 1) + '">' + (row || []).map(function (cell, c) {
        return cellXml(cell, colName(c) + (r + 1));
      }).join("") + "</row>";
    }).join("") + "</sheetData></worksheet>";
    return xml;
  }

  // Excel refuses these in a sheet name, and anything past 31 characters
  function safeSheetName(s, i) {
    var n = String(s || "").replace(/[\\\/\?\*\[\]:]/g, " ").trim().slice(0, 31);
    return n || ("Sheet" + (i + 1));
  }

  function build(sheets) {
    var enc = new TextEncoder();
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var files = [
      { name: "[Content_Types].xml", text: head +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
                 '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join("") + "</Types>" },
      { name: "_rels/.rels", text: head +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>" },
      { name: "xl/workbook.xml", text: head +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) {
          return '<sheet name="' + esc(safeSheetName(s.name, i)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join("") + "</sheets></workbook>" },
      { name: "xl/_rels/workbook.xml.rels", text: head +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join("") +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>" },
      { name: "xl/styles.xml", text: STYLES }
    ].concat(sheets.map(function (s, i) {
      return { name: "xl/worksheets/sheet" + (i + 1) + ".xml", text: sheetXml(s) };
    }));
    return zip(files.map(function (f) { return { name: f.name, bytes: enc.encode(f.text) }; }));
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  window.XlsxLite = { build: build, download: download, colName: colName };
})();
