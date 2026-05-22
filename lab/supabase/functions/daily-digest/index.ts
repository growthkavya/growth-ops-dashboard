// Growth Lab — Daily Digest Edge Function
//
// Sends a 9pm IST email to each Reporting Manager + super-admin with:
//   • Pending attendance approvals
//   • Unacknowledged daily check-ins
//   • Ideas waiting for decision
//   • At-risk interns (auto-flagged)
//   • Tasks overdue
//
// Required Supabase secrets (set via `supabase secrets set ...`):
//   SUPABASE_URL              — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
//   RESEND_API_KEY            — from https://resend.com/api-keys (free tier: 3k/mo)
//   DIGEST_FROM_EMAIL         — e.g. "Growth Lab <growth-lab@ssei.co.in>"  (must be verified at Resend)
//   DIGEST_DASHBOARD_URL      — e.g. "https://growthkavya.github.io/growth-ops-dashboard/lab/"
//
// Deploy:
//   supabase functions deploy daily-digest --no-verify-jwt
// Schedule (in Supabase SQL editor, requires pg_cron + pg_net):
//   See migration_growth_lab_v5.sql

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL   = Deno.env.get("DIGEST_FROM_EMAIL") || "Growth Lab <onboarding@resend.dev>";
const DASH_URL     = Deno.env.get("DIGEST_DASHBOARD_URL") || "https://growthkavya.github.io/growth-ops-dashboard/lab/";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

interface Recipient { id: string; email: string; full_name: string; role: string; }

interface InternFlag { internId: string; internName: string; flags: string[]; }

async function getRecipients(): Promise<Recipient[]> {
  // Everyone who needs a digest: admin (Vidyut, Kavya) + member (Saloni, Shubhankar, Chirag)
  const { data, error } = await sb
    .from("profiles")
    .select("id, email, full_name, role")
    .in("role", ["admin", "member"]);
  if (error) throw error;
  return (data || []).filter((p) => p.email);
}

async function buildDigestForRecipient(r: Recipient) {
  const isSuper = r.role === "admin";
  // Interns relevant to this recipient
  let internsQ = sb.from("interns").select("id, name, tags, supervisor_id, start_date, auth_user_id")
    .contains("tags", ["growth_lab"]).eq("status", "active");
  if (!isSuper) internsQ = internsQ.eq("supervisor_id", r.id);
  const { data: interns } = await internsQ;
  if (!interns || !interns.length) return null;
  const internIds = interns.map((i: any) => i.id);

  const today = new Date().toISOString().slice(0, 10);
  const past14 = new Date(); past14.setDate(past14.getDate() - 14);
  const past14Str = past14.toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";

  const [{ data: pendingAttn }, { data: unackCheckins }, { data: newIdeas }, { data: overdueTasks }, { data: monthAttn }, { data: kras }, { data: ideas }, { data: checkinsRecent }] = await Promise.all([
    sb.from("gl_attendance").select("*, interns!inner(name)").eq("approval_status", "pending").in("intern_id", internIds),
    sb.from("gl_daily_checkin").select("*, interns!inner(name)").eq("rm_acknowledged", false).in("intern_id", internIds).gte("checkin_date", past14Str),
    sb.from("gl_idea").select("*, interns!inner(name)").eq("status", "new").in("intern_id", internIds),
    sb.from("gl_task").select("*, interns!inner(name)").in("intern_id", internIds).not("status", "in", '("done","cancelled")').lt("due_date", today),
    sb.from("gl_attendance").select("intern_id,attendance_date,status").in("intern_id", internIds).gte("attendance_date", past14Str),
    sb.from("gl_kra").select("intern_id,percent_done").in("intern_id", internIds).eq("period_month", monthStart),
    sb.from("gl_idea").select("intern_id,created_at").in("intern_id", internIds),
    sb.from("gl_daily_checkin").select("intern_id,checkin_date").in("intern_id", internIds).gte("checkin_date", past14Str),
  ]);

  // Compute at-risk
  const flags: InternFlag[] = [];
  const nowD = new Date();
  for (const intern of interns) {
    const internFlags: string[] = [];
    const monthly = (monthAttn || []).filter((e: any) => e.intern_id === intern.id);
    const present = monthly.filter((e: any) => e.status === "present").length;
    const half = monthly.filter((e: any) => e.status === "half-day").length;
    const absent = monthly.filter((e: any) => e.status === "absent").length;
    const totalCounted = present + absent + half;
    const attnPct = totalCounted ? Math.round(((present + half * 0.5) / totalCounted) * 100) : null;
    const myCheckins = (checkinsRecent || []).filter((c: any) => c.intern_id === intern.id);
    const lastCheckin = myCheckins.length ? myCheckins.sort((a: any, b: any) => b.checkin_date.localeCompare(a.checkin_date))[0].checkin_date : null;
    const daysSince = lastCheckin ? Math.round((nowD.getTime() - new Date(lastCheckin).getTime()) / 86400000) : 999;
    if (daysSince >= 3) internFlags.push(`No check-in for ${daysSince}d`);
    if (attnPct != null && attnPct < 80) internFlags.push(`Attendance ${attnPct}%`);
    const myKRAs = (kras || []).filter((k: any) => k.intern_id === intern.id);
    const kraAvg = myKRAs.length ? Math.round(myKRAs.reduce((s: number, k: any) => s + (k.percent_done || 0), 0) / myKRAs.length) : null;
    if (kraAvg != null && kraAvg < 50 && nowD.getDate() > 15) internFlags.push(`KRA avg ${kraAvg}%`);
    const myIdeas = (ideas || []).filter((i: any) => i.intern_id === intern.id).length;
    const startDate = new Date(intern.start_date);
    if (myIdeas === 0 && (nowD.getTime() - startDate.getTime()) / 86400000 > 14) internFlags.push("No ideas in 14d");
    if (internFlags.length) flags.push({ internId: intern.id, internName: intern.name, flags: internFlags });
  }

  const data = {
    pendingAttn: pendingAttn || [],
    unackCheckins: unackCheckins || [],
    newIdeas: newIdeas || [],
    overdueTasks: overdueTasks || [],
    flags,
    internCount: interns.length,
  };
  // Skip if nothing to report
  if (!data.pendingAttn.length && !data.unackCheckins.length && !data.newIdeas.length && !data.overdueTasks.length && !data.flags.length) {
    return null;
  }
  return data;
}

function renderEmail(r: Recipient, d: any): { subject: string; html: string; text: string } {
  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const subject = `🌱 Growth Lab digest · ${dateStr}`;

  const sec = (label: string, items: string[]) => items.length === 0 ? "" : `
    <div style="margin: 18px 0;">
      <div style="font-weight:600; font-size:13px; color:#09256B; margin-bottom:6px;">${label} (${items.length})</div>
      <ul style="margin:0; padding-left:18px; font-size:13px; color:#2D2D2D;">
        ${items.map((i) => `<li style="margin:3px 0;">${i}</li>`).join("")}
      </ul>
    </div>`;

  const html = `
<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fafbfc;">
  <div style="background: white; border-radius: 12px; padding: 28px; box-shadow: 0 2px 8px rgba(9,37,107,0.08);">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:18px;">
      <div style="width:40px; height:40px; background:#09256B; color:#C99959; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px;">SSEI</div>
      <div>
        <div style="font-weight:700; font-size:18px; color:#09256B;">Growth Lab</div>
        <div style="font-size:12px; color:#718096;">${dateStr} · digest for ${r.full_name}</div>
      </div>
    </div>
    <p style="font-size:14px; color:#2D2D2D;">Here's what needs you in the Growth Lab right now.</p>

    ${sec("⏳ Attendance pending approval", d.pendingAttn.map((e: any) => `${e.interns.name} · ${e.attendance_date} · ${e.daily_work_summary?.slice(0, 80) || "(empty summary)"}`))}
    ${sec("💬 Daily check-ins to acknowledge", d.unackCheckins.map((c: any) => `${c.interns.name} · ${c.checkin_date}`))}
    ${sec("💡 Ideas waiting for decision", d.newIdeas.map((i: any) => `${i.interns.name} · "${i.title}"`))}
    ${sec("🚨 Overdue tasks", d.overdueTasks.map((t: any) => `${t.interns.name} · ${t.title} · due ${t.due_date}`))}
    ${sec("⚠️ At-risk interns", d.flags.map((f: any) => `<strong>${f.internName}</strong> · ${f.flags.join(" · ")}`))}

    <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #E2E8F0; text-align: center;">
      <a href="${DASH_URL}" style="display:inline-block; background:#09256B; color:white; padding:11px 22px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px;">Open dashboard →</a>
    </div>
    <p style="font-size: 11px; color: #8a93a5; margin-top: 18px; text-align: center;">Daily at 9pm IST · ${d.internCount} intern${d.internCount === 1 ? "" : "s"} in your scope</p>
  </div>
</body></html>`;

  const text = [
    `Growth Lab digest · ${dateStr}`,
    "",
    `Pending approvals: ${d.pendingAttn.length}`,
    `Unack check-ins: ${d.unackCheckins.length}`,
    `New ideas: ${d.newIdeas.length}`,
    `Overdue tasks: ${d.overdueTasks.length}`,
    `At-risk interns: ${d.flags.length}`,
    "",
    `Open: ${DASH_URL}`,
  ].join("\n");
  return { subject, html, text };
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const recipients = await getRecipients();
    const results: any[] = [];
    for (const r of recipients) {
      try {
        const d = await buildDigestForRecipient(r);
        if (!d) { results.push({ to: r.email, skipped: "nothing to report" }); continue; }
        const { subject, html, text } = renderEmail(r, d);
        const sendRes = await sendEmail(r.email, subject, html, text);
        results.push({ to: r.email, sent: sendRes.id });
      } catch (e: any) {
        results.push({ to: r.email, error: e.message });
      }
    }
    return new Response(JSON.stringify({ ok: true, results }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
