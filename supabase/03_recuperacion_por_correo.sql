-- Recuperación de contraseña por correo (gratis con Brevo). Ya aplicado en el proyecto de Supabase de NOVA.
-- Reemplaza la búsqueda por celular (Twilio), que queda archivada como privado.recovery_lookup_twilio.
create table if not exists privado.recovery_codes (
  uid uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
alter function public.recovery_lookup(text) rename to recovery_lookup_twilio;
alter function public.recovery_lookup_twilio(text) set schema privado;
create function public.recovery_lookup(p_username text)
returns table (uid uuid, email text, name text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, lower(nullif(btrim(d.data->>'email'), '')), coalesce(d.data->>'name', d.data->>'username')
  from auth.users u
  left join public.docs d on d.path = 'data/users/' || u.id::text || '/account'
  where u.email = lower(p_username) || '@usuarios.novaia.app'
  limit 1;
$$;
create or replace function public.recovery_code_set(p_uid uuid, p_hash text)
returns void language sql security definer set search_path = privado as $$
  insert into privado.recovery_codes (uid, code_hash, expires_at, attempts, created_at)
  values (p_uid, p_hash, now() + interval '10 minutes', 0, now())
  on conflict (uid) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = now();
$$;
create or replace function public.recovery_code_check(p_uid uuid, p_hash text)
returns text language plpgsql security definer set search_path = privado as $$
declare r privado.recovery_codes;
begin
  select * into r from privado.recovery_codes where uid = p_uid for update;
  if not found then return 'vencido'; end if;
  if r.expires_at < now() then delete from privado.recovery_codes where uid = p_uid; return 'vencido'; end if;
  if r.attempts >= 5 then delete from privado.recovery_codes where uid = p_uid; return 'bloqueado'; end if;
  if r.code_hash = p_hash then delete from privado.recovery_codes where uid = p_uid; return 'ok'; end if;
  update privado.recovery_codes set attempts = attempts + 1 where uid = p_uid;
  return 'mal';
end $$;
create or replace function public.recovery_stats()
returns jsonb language sql stable security definer set search_path = public, privado as $$
  select coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from privado.recovery_log where created_at > now() - interval '7 days' group by kind) t), '{}'::jsonb)
    || jsonb_build_object(
      'cuentas', (select count(*) from public.docs where coll = 'account'),
      'con_correo', (select count(*) from public.docs where coll = 'account' and coalesce(btrim(data->>'email'), '') <> ''));
$$;
revoke execute on function public.recovery_lookup(text) from public, anon, authenticated;
revoke execute on function public.recovery_code_set(uuid, text) from public, anon, authenticated;
revoke execute on function public.recovery_code_check(uuid, text) from public, anon, authenticated;
revoke execute on function public.recovery_stats() from public, anon, authenticated;
grant execute on function public.recovery_lookup(text) to service_role;
grant execute on function public.recovery_code_set(uuid, text) to service_role;
grant execute on function public.recovery_code_check(uuid, text) to service_role;
grant execute on function public.recovery_stats() to service_role;
