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

- `index.html` — página principal de Orion Nova Technologies: servicios, soluciones, portafolio, NOVA y ORI, metodología, preguntas frecuentes y formulario de cotización. También tiene el login, el panel de cuenta y el chat con NOVA. Se publica con GitHub Pages desde la rama `main`, carpeta raíz. Es un solo archivo HTML sin dependencias; se edita directamente.
- `privacidad.html` — política de tratamiento de datos personales (generada desde `docs/04_Legal/Protección de Datos.md`).
- `assets/imagenes/image.png` — logo oficial (sin modificar). `assets/portafolio/` — capturas de los productos.
- Usa el mismo proyecto de Supabase que NOVA Restaurantes. Solo lleva la clave pública (`sb_publishable_…`).
- `supabase/functions/cotizar/` — recibe las cotizaciones, las guarda en `public.cotizaciones`, frena abusos y avisa por correo (Brevo). Tabla y reglas en `supabase/04_cotizaciones.sql`.
- `supabase/functions/recuperar-clave/` — recuperar contraseña con un código por correo (Brevo). Secretos en Supabase > Edge Functions > Secrets: `BREVO_API_KEY` y `CORREO_REMITENTE` (opcional `CORREO_AVISOS`). Nunca en este repositorio.
- `supabase/01…03_*.sql` — solicitudes antiguas, límites contra abuso y códigos cifrados. La versión con Twilio (WhatsApp/SMS) queda en el historial de Git para cuando se contrate.
