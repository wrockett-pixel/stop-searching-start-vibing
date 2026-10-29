/**
 * "Who's in the room?" live check-in for Stop Searching, Start Vibing (GaETC 2026)
 *
 * SETUP (about 5 minutes)
 * 1. Make a new Google Sheet (use a personal Google account if your district
 *    blocks web apps that "Anyone" can open). Name it "GaETC Check-ins".
 * 2. Extensions > Apps Script. Delete what's there and paste this whole file.
 * 3. Change PIN below to a number only you and Lindsay know. Save.
 * 4. Deploy > New deployment > gear icon > Web app.
 *      Execute as: Me
 *      Who has access: Anyone
 *    Click Deploy, approve the permissions, and copy the Web app URL
 *    (it ends in /exec). Give that URL to Claude, or paste it into
 *    RESPONSES_URL in index.html.
 * 5. If you edit this script later: Deploy > Manage deployments > pencil >
 *    Version: New version > Deploy. The URL stays the same.
 *
 * Between sessions, use "Clear the room" in Present mode. Answers move to the
 * Archive tab with the date and time, then the live count resets.
 */
const PIN = '1234';            // CHANGE THIS before your session
const LIVE = 'Check-ins';
const ARCHIVE = 'Archive';
const STAGES = ['egg', 'hatchling', 'apex'];

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}
function live_() { return sheet_(LIVE, ['Device', 'Stage', 'Grade', 'Content', 'Checked in']); }
function round_() { return Number(PropertiesService.getScriptProperties().getProperty('round') || 1); }

function doGet() { return out_(summary_()); }

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad request' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (d.action === 'clear') {
      if (String(d.pin) !== PIN) return out_({ ok: false, error: 'wrong pin' });
      clear_(String(d.label || 'Session').slice(0, 40));
    } else {
      if (STAGES.indexOf(d.stage) < 0) return out_({ ok: false, error: 'bad stage' });
      upsert_(d);
    }
    CacheService.getScriptCache().remove('summary');
  } finally {
    lock.releaseLock();
  }
  return out_(summary_());
}

// One row per device: checking in again updates that person's row.
function upsert_(d) {
  const sh = live_();
  const row = [String(d.id || '').slice(0, 40), d.stage, String(d.grade || '').slice(0, 20),
               String(d.subject || '').slice(0, 40), new Date()];
  if (!row[0]) return;
  const last = sh.getLastRow();
  if (last > 1) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(row[0]);
    if (i >= 0) { sh.getRange(i + 2, 1, 1, 5).setValues([row]); return; }
  }
  sh.appendRow(row);
}

function clear_(label) {
  const sh = live_();
  const last = sh.getLastRow();
  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, 5).getValues();
    const ar = sheet_(ARCHIVE, ['Session', 'Device', 'Stage', 'Grade', 'Content', 'Checked in']);
    const tag = label + ' · ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, h:mm a');
    ar.getRange(ar.getLastRow() + 1, 1, rows.length, 6).setValues(rows.map(r => [tag].concat(r)));
    sh.deleteRows(2, last - 1);
  }
  PropertiesService.getScriptProperties().setProperty('round', String(round_() + 1));
}

// Totals only; no device ids leave the Sheet. Cached 3 s so a full room of phones stays fast.
function summary_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('summary');
  if (hit) return JSON.parse(hit);
  const s = { ok: true, round: round_(), total: 0, stage: { egg: 0, hatchling: 0, apex: 0 }, grade: {}, subject: {} };
  const sh = live_();
  const last = sh.getLastRow();
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 4).getValues().forEach(r => {
      if (!r[0]) return;
      s.total++;
      if (s.stage[r[1]] !== undefined) s.stage[r[1]]++;
      if (r[2]) s.grade[r[2]] = (s.grade[r[2]] || 0) + 1;
      if (r[3]) s.subject[r[3]] = (s.subject[r[3]] || 0) + 1;
    });
  }
  cache.put('summary', JSON.stringify(s), 3);
  return s;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
