-- Recuperación de contraseña por WhatsApp/SMS (ya aplicado en el proyecto de Supabase de NOVA).
-- Lo usa la función supabase/functions/recuperar-clave. Solo el servidor (service_role) puede usarlo.
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table if not exists privado.recovery_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  username text not null,
  ip_hash text not null,
  kind text not null check (kind in ('enviar','confirmar','exito'))
);
create index if not exists recovery_log_user_idx on privado.recovery_log (username, created_at);
create index if not exists recovery_log_ip_idx on privado.recovery_log (ip_hash, created_at);
create or replace function public.recovery_lookup(p_username text)
returns table (uid uuid, phone text, ch text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, d.data->>'phone', coalesce(d.data->>'ch','whatsapp')
  from auth.users u
  left join public.docs d on d.path = 'data/users/' || u.id::text || '/account'
  where u.email = lower(p_username) || '@usuarios.novaia.app'
  limit 1;
$$;
create or replace function public.recovery_guard(p_username text, p_ip_hash text, p_kind text)
returns boolean
language plpgsql security definer set search_path = public, privado as $$
declare n_user int; n_ip int;
begin
  delete from privado.recovery_log where created_at < now() - interval '2 days';
  select count(*) into n_user from privado.recovery_log where username = lower(p_username) and kind = p_kind and created_at > now() - interval '1 hour';
  select count(*) into n_ip from privado.recovery_log where ip_hash = p_ip_hash and kind = p_kind and created_at > now() - interval '1 hour';
  if (p_kind = 'enviar' and (n_user >= 3 or n_ip >= 10)) or (p_kind = 'confirmar' and (n_user >= 8 or n_ip >= 20)) then
    return false;
  end if;
  insert into privado.recovery_log (username, ip_hash, kind) values (lower(p_username), p_ip_hash, p_kind);
  return true;
end $$;
revoke execute on function public.recovery_lookup(text) from public, anon, authenticated;
revoke execute on function public.recovery_guard(text, text, text) from public, anon, authenticated;
grant execute on function public.recovery_lookup(text) to service_role;
grant execute on function public.recovery_guard(text, text, text) to service_role;
