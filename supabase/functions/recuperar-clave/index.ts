// Recuperar contraseña por WhatsApp o SMS con Twilio Verify.
// Ecosistema Orion Nova (página principal y NOVA Restaurantes comparten cuentas).
//
// Secretos necesarios (Supabase > Edge Functions > Secrets):
//   TWILIO_ACCOUNT_SID   (empieza por AC…)
//   TWILIO_AUTH_TOKEN
//   TWILIO_VERIFY_SID    (empieza por VA…)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = [
  "https://orion-nova-technologies-s-a-s.github.io",
];
const USER_RE = /^[a-z0-9_.]{3,20}$/;
const GENERIC = "Si el usuario existe y tiene celular registrado, te enviamos un código. Revisa tu WhatsApp o tus mensajes de texto.";

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

async function twilio(path: string, form: Record<string, string>) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!, tok = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const r = await fetch("https://verify.twilio.com/v2/Services/" + Deno.env.get("TWILIO_VERIFY_SID") + path, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(sid + ":" + tok), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { ok: false, msg: "Método no permitido." });

  if (!Deno.env.get("TWILIO_ACCOUNT_SID") || !Deno.env.get("TWILIO_AUTH_TOKEN") || !Deno.env.get("TWILIO_VERIFY_SID")) {
    return reply(503, { ok: false, msg: "La recuperación por WhatsApp o SMS todavía no está activada. Escríbenos al WhatsApp 300 444 0009." });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { ok: false, msg: "Solicitud inválida." }); }
  const accion = String(body.accion || "");
  const usuario = String(body.usuario || "").trim().toLowerCase();
  if (!USER_RE.test(usuario)) return reply(400, { ok: false, msg: "Escribe un usuario válido." });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sin-ip";
  const ipHash = await sha256("orion:" + ip);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const guard = async (kind: string) => {
    const { data, error } = await db.rpc("recovery_guard", { p_username: usuario, p_ip_hash: ipHash, p_kind: kind });
    return !error && data === true;
  };
  const { data: rows } = await db.rpc("recovery_lookup", { p_username: usuario });
  const acct = Array.isArray(rows) && rows[0] ? rows[0] as { uid: string; phone: string | null; ch: string } : null;
  const phone = acct && acct.phone && /^\+573\d{9}$/.test(acct.phone) ? acct.phone : null;

  if (accion === "enviar") {
    if (!(await guard("enviar"))) return reply(429, { ok: false, msg: "Demasiadas solicitudes. Espera una hora antes de pedir otro código." });
    if (!acct || !phone) return reply(200, { ok: true, msg: GENERIC });
    const canal = acct.ch === "sms" ? "sms" : "whatsapp";
    let r = await twilio("/Verifications", { To: phone, Channel: canal, Locale: "es" });
    if (!r.ok && canal === "whatsapp") r = await twilio("/Verifications", { To: phone, Channel: "sms", Locale: "es" });
    if (!r.ok) console.error("twilio enviar", r.status, JSON.stringify(r.j));
    return reply(200, { ok: true, msg: GENERIC });
  }

  if (accion === "confirmar") {
    const codigo = String(body.codigo || "").trim();
    const clave = String(body.clave || "");
    if (!/^\d{4,10}$/.test(codigo)) return reply(400, { ok: false, msg: "Escribe el código que te llegó." });
    const bad = pwPolicy(clave, usuario);
    if (bad) return reply(400, { ok: false, msg: bad });
    if (!(await guard("confirmar"))) return reply(429, { ok: false, msg: "Demasiados intentos. Espera una hora y pide un código nuevo." });
    const wrong = { ok: false, msg: "El código no es correcto o ya venció. Pide uno nuevo." };
    if (!acct || !phone) return reply(400, wrong);
    const r = await twilio("/VerificationCheck", { To: phone, Code: codigo });
    if (!r.ok || (r.j as { status?: string }).status !== "approved") return reply(400, wrong);

    const { error } = await db.auth.admin.updateUserById(acct.uid, { password: clave });
    if (error) {
      console.error("updateUser", error.message);
      return reply(400, { ok: false, msg: /weak|password/i.test(error.message) ? "El servidor pide una contraseña más fuerte." : "No se pudo cambiar la contraseña. Intenta de nuevo." });
    }
    await guard("exito");
    // Registro en la auditoría que también usa NOVA
    try {
      const path = "audit/" + acct.uid;
      const { data: cur } = await db.from("docs").select("data").eq("path", path).maybeSingle();
      const ev = Array.isArray(cur?.data?.events) ? cur!.data.events.slice(-39) : [];
      ev.push({ t: Date.now(), e: "recuperacion-completada", d: acct.ch === "sms" ? "SMS" : "WhatsApp" });
      await db.rpc("doc_set", { p_path: path, p_data: { events: ev.slice(-40) } });
    } catch (_) { /* mejor esfuerzo */ }
    return reply(200, { ok: true, msg: "Contraseña actualizada. Ya puedes ingresar con tu nueva contraseña." });
  }

  return reply(400, { ok: false, msg: "Acción no válida." });
});
