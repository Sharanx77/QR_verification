create extension if not exists pgcrypto;

create table if not exists public.organizers (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (char_length(btrim(username)) between 3 and 100),
  password_hash text not null,
  role text not null default 'organizer' check (role in ('administrator','organizer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  usn text not null unique,
  qr_token_hash text unique,
  qr_token_identifier text,
  qr_token_ciphertext text,
  is_eligible boolean not null default true,
  is_revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  verified_by uuid not null references public.organizers(id)
);

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(id) on delete set null,
  organizer_id uuid references public.organizers(id),
  qr_token_identifier text,
  scanned_at timestamptz not null default now(),
  result text not null check (result in ('valid','duplicate','invalid','unknown_revoked')),
  successful boolean not null default false
);

create table if not exists public.event_settings (
  id smallint primary key default 1 check (id = 1),
  event_name text not null default 'College Inauguration',
  event_status text not null default 'active' check (event_status in ('draft','active','closed'))
);

insert into public.event_settings (id) values (1) on conflict (id) do nothing;

create index if not exists participants_usn_idx on public.participants (upper(usn));
create index if not exists participants_eligible_idx on public.participants (is_eligible);
create index if not exists attendance_checked_in_idx on public.attendance (checked_in_at);
create index if not exists attendance_verified_by_idx on public.attendance (verified_by);
create index if not exists scan_logs_scanned_at_idx on public.scan_logs (scanned_at desc);
create index if not exists scan_logs_organizer_idx on public.scan_logs (organizer_id);
create index if not exists scan_logs_participant_idx on public.scan_logs (participant_id);

alter table public.organizers enable row level security;
alter table public.participants enable row level security;
alter table public.attendance enable row level security;
alter table public.scan_logs enable row level security;
alter table public.event_settings enable row level security;

-- Browser clients receive no direct table access. The Express backend uses the service role only.
create policy "No direct organizer access" on public.organizers for all using (false) with check (false);
create policy "No direct participant access" on public.participants for all using (false) with check (false);
create policy "No direct attendance access" on public.attendance for all using (false) with check (false);
create policy "No direct scan log access" on public.scan_logs for all using (false) with check (false);
create policy "No direct event access" on public.event_settings for all using (false) with check (false);

create or replace function public.verify_qr(
  p_qr_token_hash text,
  p_qr_token_identifier text,
  p_organizer_id uuid
)
returns table (
  status text,
  participant_id uuid,
  participant_usn text,
  checked_in_at timestamptz,
  verified_by_username text,
  previous_success_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.participants%rowtype;
  v_attendance public.attendance%rowtype;
  v_success_count bigint;
  v_verified_username text;
begin
  select * into v_participant
  from public.participants
  where qr_token_hash = p_qr_token_hash
  limit 1;

  if v_participant.id is null then
    insert into public.scan_logs(participant_id, organizer_id, qr_token_identifier, result, successful)
    values (null, p_organizer_id, p_qr_token_identifier, 'unknown_revoked', false);
    return query select 'unknown_revoked'::text, null::uuid, null::text, null::timestamptz, null::text, 0::bigint;
    return;
  end if;

  if not v_participant.is_eligible or v_participant.is_revoked then
    insert into public.scan_logs(participant_id, organizer_id, qr_token_identifier, result, successful)
    values (v_participant.id, p_organizer_id, p_qr_token_identifier, 'unknown_revoked', false);
    return query select 'unknown_revoked'::text, v_participant.id, v_participant.usn, null::timestamptz, null::text, 0::bigint;
    return;
  end if;

  select a.* into v_attendance
  from public.attendance a
  where a.participant_id = v_participant.id
  for update;

  select count(*) into v_success_count
  from public.scan_logs sl
  where sl.participant_id = v_participant.id and sl.successful = true;

  if v_attendance.id is not null then
    select o.username into v_verified_username
    from public.organizers o
    where o.id = v_attendance.verified_by;

    insert into public.scan_logs(participant_id, organizer_id, qr_token_identifier, result, successful)
    values (v_participant.id, p_organizer_id, p_qr_token_identifier, 'duplicate', false);

    return query select 'duplicate'::text, v_participant.id, v_participant.usn,
      v_attendance.checked_in_at, v_verified_username, greatest(v_success_count, 1::bigint);
    return;
  end if;

  insert into public.attendance(participant_id, checked_in_at, verified_by)
  values (v_participant.id, now(), p_organizer_id)
  on conflict (participant_id) do nothing
  returning * into v_attendance;

  if v_attendance.id is not null then
    select o.username into v_verified_username
    from public.organizers o
    where o.id = p_organizer_id;

    insert into public.scan_logs(participant_id, organizer_id, qr_token_identifier, result, successful)
    values (v_participant.id, p_organizer_id, p_qr_token_identifier, 'valid', true);

    return query select 'valid'::text, v_participant.id, v_participant.usn,
      v_attendance.checked_in_at, v_verified_username, 1::bigint;
  else
    select a.* into v_attendance
    from public.attendance a
    where a.participant_id = v_participant.id;

    select o.username into v_verified_username
    from public.organizers o
    where o.id = v_attendance.verified_by;

    insert into public.scan_logs(participant_id, organizer_id, qr_token_identifier, result, successful)
    values (v_participant.id, p_organizer_id, p_qr_token_identifier, 'duplicate', false);

    return query select 'duplicate'::text, v_participant.id, v_participant.usn,
      v_attendance.checked_in_at, v_verified_username, greatest(v_success_count, 1::bigint);
  end if;
end;
$$;

revoke all on function public.verify_qr(text,text,uuid) from public, anon, authenticated;
grant execute on function public.verify_qr(text,text,uuid) to service_role;

grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.organizers,
  public.participants,
  public.attendance,
  public.scan_logs,
  public.event_settings
to service_role;
