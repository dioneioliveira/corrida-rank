// Envia ao administrador o e-mail de confirmação do aceite (disclaimer) de um novo participante.
// Segredos: RESEND_API_KEY (obrigatório), ADMIN_EMAIL (padrão abaixo), MAIL_FROM (padrão: onboarding@resend.dev).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u.user) return new Response("não autenticado", { status: 401, headers: cors });

    const { data: c } = await admin.from("consentimentos").select("*").eq("user_id", u.user.id).maybeSingle();
    if (!c) return new Response("sem aceite registrado", { status: 404, headers: cors });
    if (c.email_notificado) return Response.json({ ok: true, ja_enviado: true }, { headers: cors });
    const { data: p } = await admin.from("profiles").select("nome,cidade,sexo").eq("id", u.user.id).maybeSingle();

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("MAIL_FROM") ?? "Corrida Rank <onboarding@resend.dev>",
        to: [Deno.env.get("ADMIN_EMAIL") ?? "dioneioliveirasbs@gmail.com"],
        subject: `Aceite confirmado: ${p?.nome ?? u.user.email}`,
        html: `<h2>Novo participante aceitou o termo</h2>
          <p><b>Nome:</b> ${esc(p?.nome ?? "-")}<br><b>Cidade:</b> ${esc(p?.cidade ?? "-")}<br>
          <b>E-mail:</b> ${esc(u.user.email ?? "-")}<br><b>Aceito em:</b> ${new Date(c.aceito_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<br>
          <b>Versão do termo:</b> ${esc(c.versao)}</p><blockquote>${esc(c.texto)}</blockquote>`,
      }),
    });
    if (!r.ok) throw new Error(`Resend: ${r.status} ${await r.text()}`);
    await admin.from("consentimentos").update({ email_notificado: true }).eq("user_id", u.user.id);
    return Response.json({ ok: true }, { headers: cors });
  } catch (e) {
    return new Response(String(e), { status: 500, headers: cors });
  }
});
