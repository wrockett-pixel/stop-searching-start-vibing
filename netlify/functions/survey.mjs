// Live "Who's in the room?" survey. Answers live in Netlify Blobs only for the
// current session; "Clear the room" deletes them. Nothing is archived.
import { getStore } from "@netlify/blobs";

const STAGES = ["egg", "hatchling", "apex"];
const GRADES = ["K–2", "3–5", "6–8", "9–12", "Other"];
const SUBJECTS = ["ELA", "Math", "Science", "Social Studies", "World Languages", "Fine Arts", "CTE",
  "Special Education", "Media / Tech Coach", "Other"];

const HELP = ["prompts", "publish", "canvas", "fixing", "access", "integrity", "tools", "time"];

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
  // Live-demo ideas: i<round>/<time>-<device>, newest first, at most 40.
  const ideas = await st.list({ prefix: `i${round}/` });
  const keys = ideas.blobs.map((b) => b.key).sort().reverse().slice(0, 40);
  s.ideas = (await Promise.all(keys.map((k) => st.get(k, { type: "json" })))).filter(Boolean);
  // Help poll: one key per device, h<round>/<device>/<pick>+<pick>; questions like ideas.
  s.help = Object.fromEntries(HELP.map((h) => [h, 0]));
  s.helpTotal = 0;
  for (const { key } of (await st.list({ prefix: `h${round}/` })).blobs) {
    const picks = (key.split("/")[2] || "").split("+").filter((x) => HELP.includes(x));
    if (!picks.length) continue;
    s.helpTotal++;
    picks.forEach((x) => s.help[x]++);
  }
  const qs = (await st.list({ prefix: `q${round}/` })).blobs.map((b) => b.key).sort().reverse().slice(0, 40);
  s.questions = (await Promise.all(qs.map((k) => st.get(k, { type: "json" })))).filter(Boolean);
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
    if (req.method === "GET") {
      const s = await summary(st, round);
      console.log(JSON.stringify({ op: "get", round, total: s.total, ideas: s.ideas.length }));
      return json(s);
    }
    if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

    let d;
    try { d = JSON.parse(await req.text()); } catch { return json({ ok: false, error: "bad request" }, 400); }

    if (d.action === "clear") {
      const pin = Netlify.env.get("SURVEY_PIN");
      if (!pin || String(d.pin || "") !== pin) return json({ ok: false, error: "wrong pin" }, 403);
      // Clear just one page's survey; check-ins and the round stay as they are.
      if (d.scope === "ideas") { await deletePrefix(st, `i${round}/`); return json(await summary(st, round)); }
      if (d.scope === "share") { await deletePrefix(st, `h${round}/`); await deletePrefix(st, `q${round}/`); return json(await summary(st, round)); }
      await deletePrefix(st, `r${round}/`);
      await deletePrefix(st, `i${round}/`);
      await deletePrefix(st, `h${round}/`);
      await deletePrefix(st, `q${round}/`);
      await st.setJSON("meta/round", { n: round + 1 });
      return json(await summary(st, round + 1));
    }

    const id = String(d.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);

    if (d.action === "help") {
      const picks = [...new Set((Array.isArray(d.picks) ? d.picks : []).filter((x) => HELP.includes(x)))].slice(0, 3);
      if (!id || !picks.length) return json({ ok: false, error: "bad help" }, 400);
      await deletePrefix(st, `h${round}/${id}/`);
      await st.set(`h${round}/${id}/${picks.join("+")}`, "1");
      return json(await summary(st, round));
    }

    if (d.action === "question") {
      const text = String(d.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!id || text.length < 3) return json({ ok: false, error: "bad question" }, 400);
      const mine = await st.list({ prefix: `q${round}/` });
      if (mine.blobs.filter((b) => b.key.endsWith("-" + id)).length >= 3) return json({ ok: false, error: "limit" }, 429);
      await st.setJSON(`q${round}/${String(Date.now()).padStart(14, "0")}-${id}`, { text, t: Date.now() });
      return json(await summary(st, round));
    }

    if (d.action === "idea") {
      const text = String(d.text || "").replace(/\s+/g, " ").trim().slice(0, 160);
      if (!id || text.length < 3) return json({ ok: false, error: "bad idea" }, 400);
      const mine = await st.list({ prefix: `i${round}/` });
      if (mine.blobs.filter((b) => b.key.endsWith("-" + id)).length >= 3) return json({ ok: false, error: "limit" }, 429);
      const idea = { text, subject: SUBJECTS.includes(d.subject) ? d.subject : "", grade: GRADES.includes(d.grade) ? d.grade : "", t: Date.now() };
      await st.setJSON(`i${round}/${String(Date.now()).padStart(14, "0")}-${id}`, idea);
      return json(await summary(st, round));
    }

    if (!id || !STAGES.includes(d.stage)) return json({ ok: false, error: "bad answer" }, 400);
    const grade = GRADES.includes(d.grade) ? d.grade : "";
    const subject = SUBJECTS.includes(d.subject) ? d.subject : "";
    const prefix = `r${round}/${id}/`;
    await deletePrefix(st, prefix); // changing an answer replaces the old one
    const key = prefix + [d.stage, grade, subject].map(encodeURIComponent).join("~");
    await st.set(key, "1");
    const s = await summary(st, round);
    const listed = (await st.list({ prefix: `r${round}/` })).blobs.map((x) => x.key);
    console.log(JSON.stringify({ op: "checkin", round, key, total: s.total, listed }));
    return json(s);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "server error" }, 500);
  }
};

export const config = { path: "/api/survey" };
