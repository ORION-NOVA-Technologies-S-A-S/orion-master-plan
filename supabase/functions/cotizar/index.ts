// Recibe las solicitudes de cotización de la página principal de Orion Nova Technologies.
// 1) valida los datos, 2) frena abusos, 3) guarda en public.cotizaciones,
// 4) avisa a Orion Nova por correo y envía una confirmación al cliente (Brevo).
// Solo responde "ok" si la solicitud quedó guardada.
//
// Secretos (Supabase > Edge Functions > Secrets): BREVO_API_KEY, CORREO_REMITENTE.
// Opcional: CORREO_AVISOS (a dónde llegan los avisos; si no existe, se usa CORREO_REMITENTE).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = ["https://orionnovatechnologies.com", "https://www.orionnovatechnologies.com", "https://orion-nova-technologies-s-a-s.github.io"];
const SERVICIOS: Record<string, string> = {
  "ia-automatizacion": "Inteligencia artificial y automatización",
  "web-movil": "Desarrollo web y aplicaciones móviles",
  "software-medida": "Software a la medida",
  "ciberseguridad": "Ciberseguridad",
  "nube-redes": "Nube, servidores y bases de datos",
  "iot-datos": "IoT y analítica de datos",
  "marketing": "Marketing digital",
  "nova-restaurantes": "Unir mi restaurante u hotel a NOVA",
  "otro": "Otro",
};
const PRESUPUESTO: Record<string, string> = {
  "menos-2m": "Menos de $2.000.000", "2m-5m": "$2.000.000 a $5.000.000", "5m-15m": "$5.000.000 a $15.000.000",
  "mas-15m": "Más de $15.000.000", "por-definir": "Por definir",
};
const PLAZO: Record<string, string> = {
  "menos-1-mes": "Menos de 1 mes", "1-3-meses": "1 a 3 meses", "3-6-meses": "3 a 6 meses", "flexible": "Flexible",
};

function corsFor(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

async function brevo(to: string, toName: string, subject: string, html: string, text: string, replyTo?: { email: string; name: string }) {
  if (!Deno.env.get("BREVO_API_KEY") || !Deno.env.get("CORREO_REMITENTE")) return false;
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": Deno.env.get("BREVO_API_KEY")!, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "Orion Nova Technologies", email: Deno.env.get("CORREO_REMITENTE") },
        to: [{ email: to, name: toName || to }],
        ...(replyTo ? { replyTo } : {}),
        subject, htmlContent: html, textContent: text,
      }),
    });
    if (!r.ok) console.error("brevo", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) { console.error("brevo", String(e)); return false; }
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { ok: false, msg: "Método no permitido." });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return reply(400, { ok: false, msg: "Solicitud inválida." }); }

  // Campo trampa: las personas no lo ven; los robots lo llenan
  if (clean(b.sitio_web, 200)) return reply(200, { ok: true, msg: "Recibido." });

  const d = {
    nombre: clean(b.nombre, 80),
    correo: clean(b.correo, 120).toLowerCase(),
    celular: clean(b.celular, 20).replace(/[\s()+-]/g, "").replace(/^57(?=3\d{9}$)/, "") || null,
    empresa: clean(b.empresa, 100) || null,
    servicio: clean(b.servicio, 40),
    descripcion: clean(b.descripcion, 2000),
    presupuesto: clean(b.presupuesto, 20) || null,
    plazo: clean(b.plazo, 20) || null,
    acepta_datos: b.acepta_datos === true,
  };
  const errs: Record<string, string> = {};
  if (d.nombre.length < 2) errs.nombre = "Escribe tu nombre.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.correo)) errs.correo = "Revisa tu correo: debe verse como nombre@empresa.com.";
  if (d.celular && !/^3\d{9}$/.test(d.celular)) errs.celular = "El celular debe tener 10 dígitos y empezar por 3.";
  if (!SERVICIOS[d.servicio]) errs.servicio = "Elige el servicio que te interesa.";
  if (d.descripcion.length < 10) errs.descripcion = "Cuéntanos un poco más de tu proyecto (mínimo 10 caracteres).";
  if (d.presupuesto && !PRESUPUESTO[d.presupuesto]) errs.presupuesto = "Elige una opción de presupuesto.";
  if (d.plazo && !PLAZO[d.plazo]) errs.plazo = "Elige una opción de plazo.";
  if (!d.acepta_datos) errs.acepta_datos = "Necesitamos tu autorización para tratar tus datos.";
  if (Object.keys(errs).length) return reply(400, { ok: false, msg: "Revisa los campos marcados.", errores: errs });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sin-ip";
  const { data: okGuard } = await db.rpc("cotizacion_guard", { p_ip_hash: await sha256("orion:" + ip), p_correo: d.correo });
  if (okGuard !== true) return reply(429, { ok: false, msg: "Recibimos varias solicitudes seguidas. Espera una hora o escríbenos por WhatsApp al 300 444 0009." });

  const { data: row, error } = await db.from("cotizaciones").insert(d).select("id, created_at").single();
  if (error || !row) {
    console.error("insert", error?.message);
    return reply(500, { ok: false, msg: "No pudimos guardar tu solicitud. Intenta de nuevo o escríbenos por WhatsApp al 300 444 0009." });
  }

  // Avisos por correo (de mejor esfuerzo: la solicitud ya quedó guardada)
  const folio = "ON-" + String(row.id).padStart(5, "0");
  const filas: [string, string][] = [
    ["Folio", folio], ["Nombre", d.nombre], ["Correo", d.correo], ["Celular", d.celular || "—"], ["Empresa", d.empresa || "—"],
    ["Servicio", SERVICIOS[d.servicio]], ["Presupuesto", d.presupuesto ? PRESUPUESTO[d.presupuesto] : "—"],
    ["Plazo", d.plazo ? PLAZO[d.plazo] : "—"], ["Proyecto", d.descripcion],
  ];
  const tabla = filas.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#94a3b8;vertical-align:top">${k}</td><td style="padding:6px 0;color:#fff;white-space:pre-wrap">${esc(v)}</td></tr>`).join("");
  const shell = (title: string, body: string) => `<div style="font-family:Arial,Helvetica,sans-serif;background:#08111F;padding:28px;color:#e2e8f0"><div style="max-width:560px;margin:0 auto;background:#101B32;border:1px solid #1e2b47;border-radius:14px;padding:28px"><p style="margin:0 0 6px;letter-spacing:.2em;font-size:12px;color:#06B6D4">ORION NOVA TECHNOLOGIES</p><h1 style="margin:0 0 16px;font-size:22px;color:#fff">${title}</h1>${body}</div></div>`;
  const avisos = Deno.env.get("CORREO_AVISOS") || Deno.env.get("CORREO_REMITENTE") || "";
  const [aviso, confirma] = await Promise.all([
    avisos ? brevo(avisos, "Orion Nova", `Nueva cotización ${folio}: ${SERVICIOS[d.servicio]}`,
      shell("Nueva solicitud de cotización", `<table style="font-size:14px;border-collapse:collapse">${tabla}</table><p style="margin:18px 0 0;font-size:13px;color:#94a3b8">También la ves en tu panel: Mi cuenta → Solicitudes.</p>`),
      filas.map(([k, v]) => `${k}: ${v}`).join("\n"), { email: d.correo, name: d.nombre }) : Promise.resolve(false),
    brevo(d.correo, d.nombre, `Recibimos tu solicitud (${folio})`,
      shell("Recibimos tu solicitud", `<p style="color:#cbd5e1;margin:0 0 14px">Hola ${esc(d.nombre.split(" ")[0])}, gracias por escribirnos. Tu solicitud de <b style="color:#fff">${esc(SERVICIOS[d.servicio])}</b> quedó registrada con el folio <b style="color:#67E8F9">${folio}</b>.</p><p style="color:#cbd5e1;margin:0 0 14px">Revisaremos lo que nos contaste y te contactaremos para conversar sobre tu proyecto y preparar la propuesta.</p><p style="color:#94a3b8;font-size:13px;margin:0">Si necesitas agregar algo, responde este correo o escríbenos por WhatsApp al +57 300 444 0009.</p>`),
      `Hola ${d.nombre}, recibimos tu solicitud (${folio}) de ${SERVICIOS[d.servicio]}. Te contactaremos pronto. WhatsApp: +57 300 444 0009.`),
  ]);
  return reply(200, { ok: true, folio, confirmacion: confirma, aviso, msg: `Solicitud recibida. Tu folio es ${folio}.` });
});
