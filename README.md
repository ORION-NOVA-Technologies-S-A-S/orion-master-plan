# ORION NOVA TECHNOLOGIES

<p align="center">

# ORION MASTER PLAN

**Versión:** 1.0.0

**Estado:** En desarrollo

**Tipo:** Documento Maestro Empresarial

</p>

---

## Descripción

Bienvenido al repositorio oficial del **ORION MASTER PLAN**.

Este repositorio contiene la documentación estratégica, empresarial y tecnológica para la construcción de **ORION NOVA Technologies S.A.S.**, una empresa enfocada en el desarrollo de Inteligencia Artificial, Automatización, Robótica e Internet de las Cosas (IoT).

Nuestro primer producto será:

> **ORION Nexus AI**

Un asistente inteligente humanoide capaz de colaborar con personas, automatizar procesos y conectar el mundo digital con el físico.

---

## Objetivos

- Construir la empresa ORION NOVA Technologies.
- Diseñar la arquitectura empresarial.
- Diseñar ORION Core.
- Desarrollar ORION Nexus AI.
- Crear el ecosistema tecnológico ORION.

---

## Estado del proyecto

| Módulo | Estado |
|---------|---------|
| Empresa | 🟡 En diseño |
| Arquitectura | 🟡 En diseño |
| ORION Core | ⚪ Pendiente |
| ORION Nexus AI | ⚪ Pendiente |
| Avatar Humanoide | ⚪ Pendiente |
| IoT | ⚪ Pendiente |

---

## Roadmap

- Sprint 0 - Fundación
- Sprint 1 - Empresa
- Sprint 2 - Arquitectura
- Sprint 3 - Desarrollo
- Sprint 4 - IA
- Sprint 5 - Avatar
- Sprint 6 - IoT

---

## Licencia

ORION NOVA Technologies S.A.S.

Todos los derechos reservados.

---

## Página web

- `index.html` — página principal de Orion Nova Technologies (NOVA, ORI, login y contacto). Se publica con GitHub Pages desde la rama `main`, carpeta raíz.
- Usa el mismo proyecto de Supabase que NOVA Restaurantes: una sola cuenta Orion para todo el ecosistema. Solo lleva la clave pública (`sb_publishable_…`).
- `supabase/01_orion_web_leads.sql` — tabla de solicitudes de contacto con RLS (solo administración las ve).
- `supabase/functions/recuperar-clave/` — recuperar contraseña con un código por correo (Brevo, gratis). Secretos en Supabase > Edge Functions > Secrets: `BREVO_API_KEY` y `CORREO_REMITENTE`. Nunca en este repositorio.
- `supabase/02_recuperacion_clave.sql` y `03_recuperacion_por_correo.sql` — límites contra abuso y códigos cifrados. La versión con Twilio (WhatsApp/SMS) queda en el historial de Git para cuando se contrate.
- `web/` — plantilla fuente y logos.
