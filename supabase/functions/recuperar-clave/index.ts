// Recuperar contraseña por CORREO (gratis con Brevo: unos 300 correos al día).
// Ecosistema Orion Nova (página principal y NOVA Restaurantes comparten cuentas).
// La versión con Twilio (WhatsApp/SMS) está en el historial de Git para cuando se contrate.
//
// Secretos necesarios (Supabase > Edge Functions > Secrets):
//   BREVO_API_KEY      (Brevo > SMTP & API > API Keys, empieza por xkeysib-)
//   CORREO_REMITENTE   (el correo verificado en Brevo > Senders, ej. orion.nova.techno@gmail.com)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = ["https://orionnovatechnologies.com", "https://www.orionnovatechnologies.com", "https://orion-nova-technologies-s-a-s.github.io"];
const USER_RE = /^[a-z0-9_.]{3,20}$/;
const GENERIC = "Si el usuario existe y tiene correo registrado, te enviamos un código. Revisa tu bandeja de entrada y la carpeta de spam.";

function corsFor(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function pwPolicy(p: string, user: string): string | null {
  const cls = (/[a-z]/.test(p) ? 1 : 0) + (/[A-Z]/.test(p) ? 1 : 0) + (/\d/.test(p) ? 1 : 0) + (/[^A-Za-z0-9]/.test(p) ? 1 : 0);
  if (p.toLowerCase().includes(user.toLowerCase())) return "La contraseña no puede contener tu usuario.";
  if (p.length < 10) return "La contraseña necesita al menos 10 caracteres.";
  if (p.length > 72) return "La contraseña es demasiado larga (máximo 72 caracteres).";
  if (cls < 3) return "Combina al menos tres tipos: minúscula, mayúscula, número y símbolo.";
  return null;
}

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
// El código nunca se guarda en claro: solo su huella, mezclada con un secreto del servidor
const codeHash = (uid: string, code: string) => sha256("orion-reset:" + uid + ":" + code + ":" + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function sendMail(to: string, name: string, code: string) {
  const first = esc((name || "").split(" ")[0] || "");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#05070f;padding:28px;color:#e9edf8">
  <div style="max-width:480px;margin:0 auto;background:#0e1530;border:1px solid #1f2a52;border-radius:14px;padding:28px">
    <p style="margin:0 0 6px;letter-spacing:.2em;font-size:12px;color:#53c6ff">ORION NOVA TECHNOLOGIES</p>
    <h1 style="margin:0 0 16px;font-size:22px">Recupera tu contraseña</h1>
    <p style="margin:0 0 16px;color:#cdd4e6">Hola${first ? " " + first : ""}, este es tu código para crear una contraseña nueva:</p>
    <p style="margin:0 0 16px;font-size:34px;font-weight:bold;letter-spacing:.3em;color:#ffffff">${code}</p>
    <p style="margin:0 0 8px;color:#cdd4e6">Vence en 10 minutos. Escríbelo en la página donde lo pediste.</p>
    <p style="margin:16px 0 0;font-size:13px;color:#97a3c7">ORI te recuerda: nadie de Orion Nova te pedirá este código. Si tú no lo pediste, ignora este correo y tu contraseña seguirá igual.</p>
  </div></div>`;
  const text = `Orion Nova Technologies\n\nTu código para recuperar la contraseña es ${code}. Vence en 10 minutos.\n\nNadie de Orion Nova te pedirá este código. Si no lo pediste, ignora este correo.`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": Deno.env.get("BREVO_API_KEY")!, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Orion Nova Technologies", email: Deno.env.get("CORREO_REMITENTE") },
      to: [{ email: to, name: name || to }],
      subject: "Tu código para recuperar la contraseña: " + code,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!r.ok) console.error("brevo", r.status, await r.text().catch(() => ""));
  return r.ok;
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { ok: false, msg: "Método no permitido." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { ok: false, msg: "Solicitud inválida." }); }
  const accion = String(body.accion || "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const configured = !!Deno.env.get("BREVO_API_KEY") && !!Deno.env.get("CORREO_REMITENTE");

  // Estado de la conexión con Brevo: solo administradores con sesión iniciada
  if (accion === "estado") {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who } = jwt ? await db.auth.getUser(jwt) : { data: null };
    if (!who?.user) return reply(401, { ok: false, msg: "Inicia sesión como administrador." });
    const { data: adm } = await db.from("admins").select("uid").eq("uid", who.user.id).maybeSingle();
    if (!adm) return reply(403, { ok: false, msg: "Solo administración puede ver este estado." });
    const env = { key: !!Deno.env.get("BREVO_API_KEY"), from: Deno.env.get("CORREO_REMITENTE") || "" };
    let cuenta: { plan: string; creditos: number | null } | null = null, err: string | null = null, remitenteOk: boolean | null = null;
    if (configured) {
      try {
        const h = { "api-key": Deno.env.get("BREVO_API_KEY")!, accept: "application/json" };
        const r = await fetch("https://api.brevo.com/v3/account", { headers: h });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const p = Array.isArray(j.plan) ? j.plan[0] : null;
          cuenta = { plan: String(p?.type || "free"), creditos: typeof p?.credits === "number" ? p.credits : null };
          const s = await fetch("https://api.brevo.com/v3/senders", { headers: h });
          const sj = await s.json().catch(() => ({}));
          if (s.ok && Array.isArray(sj.senders)) {
            const f = sj.senders.find((x: { email?: string }) => String(x.email || "").toLowerCase() === env.from.toLowerCase());
            remitenteOk = !!(f && f.active);
          }
        } else err = r.status === 401 ? "clave" : "brevo";
      } catch (_) { err = "red"; }
    }
    const { data: stats } = await db.rpc("recovery_stats");
    return reply(200, { ok: true, env: { key: env.key, from: !!env.from, remitente: env.from }, cuenta, remitenteOk, err, stats: stats || {} });
  }

  if (!configured) {
    return reply(503, { ok: false, msg: "La recuperación por correo todavía no está activada. Escríbenos al WhatsApp 300 444 0009." });
  }
  const usuario = String(body.usuario || "").trim().toLowerCase();
  if (!USER_RE.test(usuario)) return reply(400, { ok: false, msg: "Escribe un usuario válido." });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sin-ip";
  const ipHash = await sha256("orion:" + ip);
  const guard = async (kind: string) => {
    const { data, error } = await db.rpc("recovery_guard", { p_username: usuario, p_ip_hash: ipHash, p_kind: kind });
    return !error && data === true;
  };
  const { data: rows } = await db.rpc("recovery_lookup", { p_username: usuario });
  const acct = Array.isArray(rows) && rows[0] ? rows[0] as { uid: string; email: string | null; name: string | null } : null;
  const email = acct && acct.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(acct.email) ? acct.email : null;

  if (accion === "enviar") {
    if (!(await guard("enviar"))) return reply(429, { ok: false, msg: "Demasiadas solicitudes. Espera una hora antes de pedir otro código." });
    if (!acct || !email) return reply(200, { ok: true, msg: GENERIC });
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    const code = String(n).padStart(6, "0");
    await db.rpc("recovery_code_set", { p_uid: acct.uid, p_hash: await codeHash(acct.uid, code) });
    await sendMail(email, acct.name || "", code);
    return reply(200, { ok: true, msg: GENERIC });
  }

  if (accion === "confirmar") {
    const codigo = String(body.codigo || "").replace(/\D/g, "");
    const clave = String(body.clave || "");
    if (codigo.length !== 6) return reply(400, { ok: false, msg: "Escribe el código de 6 dígitos que te llegó al correo." });
    const bad = pwPolicy(clave, usuario);
    if (bad) return reply(400, { ok: false, msg: bad });
    if (!(await guard("confirmar"))) return reply(429, { ok: false, msg: "Demasiados intentos. Espera una hora y pide un código nuevo." });
    const wrong = { ok: false, msg: "El código no es correcto o ya venció. Pide uno nuevo." };
    if (!acct) return reply(400, wrong);
    const { data: res } = await db.rpc("recovery_code_check", { p_uid: acct.uid, p_hash: await codeHash(acct.uid, codigo) });
    if (res === "bloqueado") return reply(400, { ok: false, msg: "Fallaste el código demasiadas veces. Pide uno nuevo." });
    if (res !== "ok") return reply(400, wrong);

    const { error } = await db.auth.admin.updateUserById(acct.uid, { password: clave });
    if (error) {
      console.error("updateUser", error.message);
      return reply(400, { ok: false, msg: /weak|password/i.test(error.message) ? "El servidor pide una contraseña más fuerte." : "No se pudo cambiar la contraseña. Intenta de nuevo." });
    }
    await guard("exito");
    try {
      const path = "audit/" + acct.uid;
      const { data: cur } = await db.from("docs").select("data").eq("path", path).maybeSingle();
      const ev = Array.isArray(cur?.data?.events) ? cur!.data.events.slice(-39) : [];
      ev.push({ t: Date.now(), e: "recuperacion-completada", d: "correo" });
      await db.rpc("doc_set", { p_path: path, p_data: { events: ev.slice(-40) } });
    } catch (_) { /* mejor esfuerzo */ }
    return reply(200, { ok: true, msg: "Contraseña actualizada. Ya puedes ingresar con tu nueva contraseña." });
  }

  return reply(400, { ok: false, msg: "Acción no válida." });
});
