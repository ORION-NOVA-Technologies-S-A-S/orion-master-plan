-- Solicitudes de cotización de la página principal (ya aplicado en el proyecto de Supabase de NOVA).
-- Solo entran por la función supabase/functions/cotizar (servidor). Solo administración puede leerlas.
create table if not exists public.cotizaciones (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  correo text not null check (correo ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(correo) <= 120),
  celular text check (celular is null or celular ~ '^3[0-9]{9}$'),
  empresa text check (empresa is null or char_length(empresa) <= 100),
  servicio text not null check (servicio in ('ia-automatizacion','web-movil','software-medida','ciberseguridad','nube-redes','iot-datos','marketing','nova-restaurantes','otro')),
  descripcion text not null check (char_length(btrim(descripcion)) between 10 and 2000),
  presupuesto text check (presupuesto is null or presupuesto in ('menos-2m','2m-5m','5m-15m','mas-15m','por-definir')),
  plazo text check (plazo is null or plazo in ('menos-1-mes','1-3-meses','3-6-meses','flexible')),
  acepta_datos boolean not null check (acepta_datos),
  estado text not null default 'nuevo' check (estado in ('nuevo','contactado','propuesta','cerrado'))
);
create index if not exists cotizaciones_fecha_idx on public.cotizaciones (created_at desc);
alter table public.cotizaciones enable row level security;
revoke all on public.cotizaciones from anon, authenticated;
grant select, update (estado), delete on public.cotizaciones to authenticated;
create policy cotizaciones_admin_select on public.cotizaciones for select to authenticated using (public.is_admin());
create policy cotizaciones_admin_update on public.cotizaciones for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy cotizaciones_admin_delete on public.cotizaciones for delete to authenticated using (public.is_admin());
create table if not exists privado.form_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ip_hash text not null,
  correo text not null
);
create index if not exists form_log_idx on privado.form_log (created_at);
create or replace function public.cotizacion_guard(p_ip_hash text, p_correo text)
returns boolean language plpgsql security definer set search_path = privado as $$
begin
  delete from privado.form_log where created_at < now() - interval '2 days';
  if (select count(*) from privado.form_log where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from privado.form_log where correo = lower(p_correo) and created_at > now() - interval '1 hour') >= 3 then
    return false;
  end if;
  insert into privado.form_log (ip_hash, correo) values (p_ip_hash, lower(p_correo));
  return true;
end $$;
revoke execute on function public.cotizacion_guard(text, text) from public, anon, authenticated;
grant execute on function public.cotizacion_guard(text, text) to service_role;
grant select, insert on public.cotizaciones to service_role;
