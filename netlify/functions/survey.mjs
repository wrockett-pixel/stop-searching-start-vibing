// Live "Who's in the room?" survey. Answers live in Netlify Blobs only for the
// current session; "Clear the room" deletes them. Nothing is archived.
import { getStore } from "@netlify/blobs";

const STAGES = ["egg", "hatchling", "apex"];
const GRADES = ["K–2", "3–5", "6–8", "9–12", "Other"];
const SUBJECTS = ["ELA", "Math", "Science", "Social Studies", "World Languages", "Fine Arts", "CTE",
  "Special Education", "Media / Tech Coach", "Other"];

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  // The same presentation is mirrored on GitHub Pages, which calls this from another origin.
  "access-control-allow-origin": "*",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const store = () => getStore({ name: "survey", consistency: "strong" });

async function currentRound(st) {
  const meta = await st.get("meta/round", { type: "json" });
  return (meta && meta.n) || 1;
}

// One key per device per round: r<round>/<device>/<stage>~<grade>~<subject>.
// Totals come from listing keys, so there is no shared counter to race on.
async function summary(st, round) {
  const { blobs } = await st.list({ prefix: `r${round}/` });
  const s = { ok: true, round, total: 0, stage: { egg: 0, hatchling: 0, apex: 0 }, grade: {}, subject: {} };
  const seen = new Set();
  for (const { key } of blobs) {
    const parts = key.split("/");
    if (parts.length !== 3 || seen.has(parts[1])) continue;
    seen.add(parts[1]);
    const [stage, grade, subject] = parts[2].split("~").map((v) => decodeURIComponent(v));
    if (!STAGES.includes(stage)) continue;
    s.total++;
    s.stage[stage]++;
    if (grade) s.grade[grade] = (s.grade[grade] || 0) + 1;
    if (subject) s.subject[subject] = (s.subject[subject] || 0) + 1;
  }
  return s;
}

async function deletePrefix(st, prefix) {
  const { blobs } = await st.list({ prefix });
  await Promise.all(blobs.map((b) => st.delete(b.key)));
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...HEADERS, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" } });
  }
  try {
    const st = store();
    const round = await currentRound(st);
    if (req.method === "GET") return json(await summary(st, round));
    if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

    let d;
    try { d = JSON.parse(await req.text()); } catch { return json({ ok: false, error: "bad request" }, 400); }

    if (d.action === "clear") {
      const pin = Netlify.env.get("SURVEY_PIN");
      if (!pin || String(d.pin || "") !== pin) return json({ ok: false, error: "wrong pin" }, 403);
      await deletePrefix(st, `r${round}/`);
      await st.setJSON("meta/round", { n: round + 1 });
      return json(await summary(st, round + 1));
    }

    const id = String(d.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);
    if (!id || !STAGES.includes(d.stage)) return json({ ok: false, error: "bad answer" }, 400);
    const grade = GRADES.includes(d.grade) ? d.grade : "";
    const subject = SUBJECTS.includes(d.subject) ? d.subject : "";
    const prefix = `r${round}/${id}/`;
    await deletePrefix(st, prefix); // changing an answer replaces the old one
    await st.set(prefix + [d.stage, grade, subject].map(encodeURIComponent).join("~"), "1");
    return json(await summary(st, round));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "server error" }, 500);
  }
};

export const config = { path: "/api/survey" };
