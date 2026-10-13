/**
 * Campaign Tracker feed. A read-only web app, bound to the Campaign_Master_Tracker sheet,
 * that hands the 5 pm Campaign Signal job the rows the team has filled in.
 *
 *   GET <web app url>?token=<FEED_TOKEN>
 *
 * It ONLY READS. Nothing in this file writes to the sheet.
 *
 * It serves an ALLOW-LIST of columns, matched by header text. Cohort Link, Message Copy,
 * CTA link and Image Asset are never served: the cohort links point at sheets of customer
 * phone numbers, and the page this feeds is public. A column renamed in the sheet stops
 * being served until its new name is added below; the response lists it under `missing`
 * so the dashboard can say so.
 *
 * Script properties (Project Settings > Script properties):
 *   FEED_TOKEN   required, a long random string. The job sends it; anything else is refused.
 */

var TABS = {
  'WhatsApp Campaign Tracker': {
    headerRow: 5,
    columns: [
      'Campaign Date', 'Campaign Name', 'Cohort', 'Number Used', 'Campaign Type',
      'Brief Description / Purpose', 'Goal', 'Cohort Status', 'Cohort Data Count',
      'Message Category', 'CTA Link Type', 'Scheduled Time', 'Campaign Status',
      'Targeted Messages', 'Sent', 'Delivered', 'Read', 'Total Clicks', 'Unique Clicks',
      'Total Campaign Cost (₹)', 'Conversions', 'Revenue from Conversions (₹)',
      'Post-Campaign Notes / Learnings'
    ]
  }
};
var MAX_ROWS = 5000;

function doGet(e) {
  var token = PropertiesService.getScriptProperties().getProperty('FEED_TOKEN');
  var given = (e && e.parameter && e.parameter.token) || '';
  if (!token || given.length !== token.length || !safeEqual_(given, token)) {
    return json_({ ok: false, error: 'bad token' });
  }
  return json_(read_());
}

function read_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var out = {
    ok: true,
    generated: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    tabs: {}
  };
  Object.keys(TABS).forEach(function (name) {
    var spec = TABS[name];
    var sh = ss.getSheetByName(name);
    if (!sh) { out.tabs[name] = { error: 'tab not found' }; return; }
    var lastRow = Math.min(sh.getLastRow(), spec.headerRow + MAX_ROWS);
    var lastCol = sh.getLastColumn();
    var header = sh.getRange(spec.headerRow, 1, 1, lastCol).getValues()[0].map(function (h) {
      return String(h).trim();
    });
    var want = [], missing = [];
    spec.columns.forEach(function (c) {
      var i = indexOfIgnoreCase_(header, c);
      if (i < 0) missing.push(c); else want.push(i);
    });
    var rows = [];
    if (lastRow > spec.headerRow) {
      var values = sh.getRange(spec.headerRow + 1, 1, lastRow - spec.headerRow, lastCol).getValues();
      values.forEach(function (r, k) {
        var cells = want.map(function (i) {
          var v = r[i];
          if (v instanceof Date) {
            return Utilities.formatDate(v, tz, /time/i.test(header[i]) ? 'HH:mm' : 'yyyy-MM-dd');
          }
          return v;
        });
        if (cells.some(function (v) { return v !== '' && v !== null; })) {
          rows.push([spec.headerRow + 1 + k].concat(cells));   // first cell: the sheet row number
        }
      });
    }
    out.tabs[name] = {
      header: ['Row'].concat(want.map(function (i) { return header[i]; })),
      rows: rows,
      missing: missing,
      truncated: sh.getLastRow() > spec.headerRow + MAX_ROWS
    };
  });
  return out;
}

function indexOfIgnoreCase_(arr, s) {
  var t = s.toLowerCase();
  for (var i = 0; i < arr.length; i++) if (arr[i].toLowerCase() === t) return i;
  return -1;
}

function safeEqual_(a, b) {
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to check it works. The log shows each tab, its row count and any missing column. */
function selfTest() {
  var r = read_();
  Object.keys(r.tabs).forEach(function (k) {
    var t = r.tabs[k];
    Logger.log(k + ': ' + (t.error || (t.rows.length + ' rows' +
      (t.missing.length ? ', MISSING columns: ' + t.missing.join(', ') : ', every column found'))));
  });
}
