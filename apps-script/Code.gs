/**
 * Stop Searching, Start Vibing: Apps Script backup of the presentation.
 *
 * SETUP (once):
 *  1. Upload the folder "Vibing Backup Assets" to your Google Drive (keep the name).
 *  2. Paste this file into Code.gs and the presentation into a file named Index (Index.html).
 *  3. Run the function "setup" once and approve the permissions. Check the log: every file should say "found".
 *  4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *
 * OPTIONAL: if you make a short link for this web app (for example on tinyurl), put it below
 * so the title page and the QR codes show it.
 */
const ASSET_FOLDER = 'Vibing Backup Assets';
const SHORT_LINK = '';            // e.g. 'https://tinyurl.com/Vibing-FVA-backup'  (leave '' to use the web app link)
const SHORT_LABEL = '';           // e.g. 'tinyurl.com/Vibing-FVA-backup'
const DEFAULT_PIN = '110393';     // presenter PIN for clearing the live surveys

const IMAGES = ['hero.webp','egg.webp','hatchling.webp','apex.webp','why.webp','vibe.webp','tired.webp','jars.webp','hatch.webp','lantern.webp','kit.webp'];
const VIDEOS = ['checks-for-understanding-v2.mp4','virtual-labs-v2.mp4','unit-reviews-v2.mp4','accessibility-v2.mp4','night-vision-build-v2.mp4','one-prompt-every-learner-v2.mp4'];
const PDFS = ['From-Egg-to-Apex.pdf','One-Prompt-Every-Learner-Prompt.pdf'];

/* ---------------- web app ---------------- */
function doGet(e) {
  const files = assetFiles_();
  let html = HtmlService.createHtmlOutputFromFile('Index').getContent();
  const imgs = {};
  IMAGES.forEach(function (n) {
    const f = files[n];
    imgs[n] = f ? imageData_(f) : '';
  });
  html = html.replace(/\{\{IMG:([^}]+)\}\}/g, function (_, n) { return imgs[n] || ''; });
  html = html.replace(/\{\{VID:([^}]+)\}\}/g, function (_, n) { return files[n] ? 'https://drive.google.com/file/d/' + files[n].getId() + '/preview' : ''; });
  html = html.replace(/\{\{PDF:([^}]+)\}\}/g, function (_, n) { return files[n] ? 'https://drive.google.com/file/d/' + files[n].getId() + '/view' : '#'; });
  const url = ScriptApp.getService().getUrl();
  const boot = '<script>window.GAS_URL=' + JSON.stringify(url) +
    ';window.GAS_SHORT=' + JSON.stringify(SHORT_LINK) + ';window.GAS_SHORT_LABEL=' + JSON.stringify(SHORT_LABEL) +
    ';window.GAS_PAGE=' + JSON.stringify((e && e.parameter && e.parameter.p) || '') +
    ';window.GAS_IMG=' + JSON.stringify({ 'egg.webp': imgs['egg.webp'], 'hatchling.webp': imgs['hatchling.webp'], 'apex.webp': imgs['apex.webp'] }) + ';</script>';
  html = html.replace('<!--GAS_BOOT-->', boot);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Stop Searching, Start Vibing')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function imageData_(file) {
  const cache = CacheService.getScriptCache();
  const key = 'img_' + file.getId() + '_' + file.getLastUpdated().getTime();
  // Cache entries are limited to 100 KB, so big images are split into chunks.
  const meta = cache.get(key);
  if (meta) {
    const n = Number(meta), parts = cache.getAll(Array.from({ length: n }, function (_, i) { return key + '_' + i; }));
    let ok = true, s = '';
    for (let i = 0; i < n; i++) { const p = parts[key + '_' + i]; if (!p) { ok = false; break; } s += p; }
    if (ok) return s;
  }
  const blob = file.getBlob();
  const data = 'data:' + (blob.getContentType() || 'image/webp') + ';base64,' + Utilities.base64Encode(blob.getBytes());
  const size = 90000, chunks = {};
  for (let i = 0; i * size < data.length; i++) chunks[key + '_' + i] = data.slice(i * size, (i + 1) * size);
  try { cache.putAll(chunks, 21600); cache.put(key, String(Object.keys(chunks).length), 21600); } catch (err) {}
  return data;
}

function assetFiles_() {
  const out = {};
  const folders = DriveApp.getFoldersByName(ASSET_FOLDER);
  if (!folders.hasNext()) return out;
  const it = folders.next().getFiles();
  while (it.hasNext()) { const f = it.next(); out[f.getName()] = f; }
  return out;
}

/** Run once from the editor: checks every file and lets audience members open the PDFs. */
function setup() {
  const files = assetFiles_();
  if (!Object.keys(files).length) { Logger.log('Could not find a Drive folder named "' + ASSET_FOLDER + '". Upload it first.'); return; }
  IMAGES.concat(VIDEOS, PDFS).forEach(function (n) { Logger.log((files[n] ? 'found    ' : 'MISSING  ') + n); });
  PDFS.concat(VIDEOS).forEach(function (n) {
    const f = files[n]; if (!f) return;
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); Logger.log('shared   ' + n + ' (anyone with the link)'); }
    catch (err) {
      try { f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); Logger.log('shared   ' + n + ' (your school only)'); }
      catch (err2) { Logger.log('could not share ' + n + ': ' + err2); }
    }
  });
  if (!PropertiesService.getScriptProperties().getProperty('SURVEY_PIN')) PropertiesService.getScriptProperties().setProperty('SURVEY_PIN', DEFAULT_PIN);
  Logger.log('Done. Now deploy: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).');
}

/* ---------------- live surveys (same rules as the website) ---------------- */
const STAGES = ['egg', 'hatchling', 'apex'];
const GRADES = ['K–2', '3–5', '6–8', '9–12', 'Other'];
const SUBJECTS = ['ELA', 'Math', 'Science', 'Social Studies', 'World Languages', 'Fine Arts', 'CTE', 'Special Education', 'Media / Tech Coach', 'Other'];
const HELP = ['prompts', 'publish', 'canvas', 'fixing', 'access', 'integrity', 'tools', 'time'];

function store_() { return PropertiesService.getScriptProperties(); }
function round_(all) { return Number(all['meta_round'] || 1); }

function summary_(all, round) {
  const s = { ok: true, round: round, total: 0, stage: { egg: 0, hatchling: 0, apex: 0 }, grade: {}, subject: {}, ideas: [], help: {}, helpTotal: 0, questions: [] };
  HELP.forEach(function (h) { s.help[h] = 0; });
  const ideaKeys = [], qKeys = [];
  Object.keys(all).forEach(function (k) {
    const p = k.split('|');
    if (p[0] === 'r' + round) {
      const v = JSON.parse(all[k]);
      if (STAGES.indexOf(v.stage) < 0) return;
      s.total++; s.stage[v.stage]++;
      if (v.grade) s.grade[v.grade] = (s.grade[v.grade] || 0) + 1;
      if (v.subject) s.subject[v.subject] = (s.subject[v.subject] || 0) + 1;
    } else if (p[0] === 'h' + round) {
      const picks = JSON.parse(all[k]); s.helpTotal++;
      picks.forEach(function (x) { if (s.help[x] !== undefined) s.help[x]++; });
    } else if (p[0] === 'i' + round) ideaKeys.push(k);
    else if (p[0] === 'q' + round) qKeys.push(k);
  });
  ideaKeys.sort().reverse().slice(0, 40).forEach(function (k) { s.ideas.push(JSON.parse(all[k])); });
  qKeys.sort().reverse().slice(0, 40).forEach(function (k) { s.questions.push(JSON.parse(all[k])); });
  return s;
}

function surveyGet() { const all = store_().getProperties(); return summary_(all, round_(all)); }

function surveyPost(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const st = store_();
    let all = st.getProperties();
    const round = round_(all);
    d = d || {};
    const del = function (prefix) { Object.keys(all).forEach(function (k) { if (k.indexOf(prefix) === 0) { st.deleteProperty(k); delete all[k]; } }); };
    const set = function (k, v) { st.setProperty(k, JSON.stringify(v)); all[k] = JSON.stringify(v); };
    if (d.action === 'clear') {
      const pin = st.getProperty('SURVEY_PIN') || DEFAULT_PIN;
      if (String(d.pin || '') !== pin) return { ok: false, error: 'wrong pin', status: 403 };
      if (d.scope === 'ideas') { del('i' + round + '|'); return summary_(all, round); }
      if (d.scope === 'share') { del('h' + round + '|'); del('q' + round + '|'); return summary_(all, round); }
      ['r', 'i', 'h', 'q'].forEach(function (x) { del(x + round + '|'); });
      st.setProperty('meta_round', String(round + 1)); all['meta_round'] = String(round + 1);
      return summary_(all, round + 1);
    }
    const id = String(d.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
    const stamp = ('00000000000000' + Date.now()).slice(-14);
    const countMine = function (prefix) { return Object.keys(all).filter(function (k) { return k.indexOf(prefix) === 0 && k.slice(-id.length - 1) === '-' + id; }).length; };
    if (d.action === 'help') {
      const picks = (Array.isArray(d.picks) ? d.picks : []).filter(function (x, i, a) { return HELP.indexOf(x) >= 0 && a.indexOf(x) === i; }).slice(0, 3);
      if (!id || !picks.length) return { ok: false, error: 'bad help', status: 400 };
      set('h' + round + '|' + id, picks);
      return summary_(all, round);
    }
    if (d.action === 'question' || d.action === 'idea') {
      const max = d.action === 'idea' ? 160 : 200, pre = (d.action === 'idea' ? 'i' : 'q') + round + '|';
      const text = String(d.text || '').replace(/\s+/g, ' ').trim().slice(0, max);
      if (!id || text.length < 3) return { ok: false, error: 'bad ' + d.action, status: 400 };
      if (countMine(pre) >= 3) return { ok: false, error: 'limit', status: 429 };
      const v = d.action === 'idea'
        ? { text: text, subject: SUBJECTS.indexOf(d.subject) >= 0 ? d.subject : '', grade: GRADES.indexOf(d.grade) >= 0 ? d.grade : '', t: Date.now() }
        : { text: text, t: Date.now() };
      set(pre + stamp + '-' + id, v);
      return summary_(all, round);
    }
    if (!id || STAGES.indexOf(d.stage) < 0) return { ok: false, error: 'bad answer', status: 400 };
    set('r' + round + '|' + id, { stage: d.stage, grade: GRADES.indexOf(d.grade) >= 0 ? d.grade : '', subject: SUBJECTS.indexOf(d.subject) >= 0 ? d.subject : '' });
    return summary_(all, round);
  } finally { lock.releaseLock(); }
}
