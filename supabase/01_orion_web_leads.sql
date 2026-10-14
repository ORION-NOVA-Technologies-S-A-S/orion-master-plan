-- Página principal de Orion Nova Technologies: solicitudes de contacto (ya aplicado en el proyecto de Supabase de NOVA)
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^3[0-9]{9}$'),
  service text not null default 'otro' check (service in ('web','app','asistente','automatizacion','ciberseguridad','iot','marketing','nova-restaurantes','otro')),
  message text not null default '' check (char_length(message) <= 1000),
  source text not null default 'web' check (source in ('web','chat')),
  uid uuid default auth.uid(),
  status text not null default 'nuevo' check (status in ('nuevo','contactado','cerrado'))
);
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;
grant insert (name, phone, service, message, source) on public.leads to anon, authenticated;
grant select, update (status), delete on public.leads to authenticated;
create policy leads_insert on public.leads for insert to anon, authenticated with check (status = 'nuevo' and (uid is null or uid = auth.uid()));
create policy leads_admin_select on public.leads for select to authenticated using (public.is_admin());
create policy leads_admin_update on public.leads for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy leads_admin_delete on public.leads for delete to authenticated using (public.is_admin());
create or replace function public.leads_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.leads where phone = new.phone and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Demasiadas solicitudes desde este número. Intenta más tarde.';
  end if;
  new.name := btrim(new.name);
  return new;
end $$;
revoke execute on function public.leads_rate_limit() from public, anon, authenticated;
create trigger leads_rate_limit before insert on public.leads for each row execute function public.leads_rate_limit();
