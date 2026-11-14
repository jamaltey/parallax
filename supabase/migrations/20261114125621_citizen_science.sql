-- Additive migration: only Parallax citizen-science objects are created.
-- Failure on an existing table is intentional: do not silently reuse unrelated tables.
begin;
create function public.parallax_valid_observations(items jsonb, change_type text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; ids text[] := '{}'; dates timestamptz[] := '{}'; obsids text[] := '{}'; d timestamptz;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 12 or octet_length(items::text) > 200000 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if coalesce(jsonb_typeof(item) <> 'object'
      or not (item ?& array['id','obsId','observedAt','band','url','collection','mission','product','isMock','imageHash','imageVersion','ra','dec','view','processingVersion','wavelengthMin','wavelengthMax'])
      or item->>'mission' <> 'SPHEREx' or item->>'product' <> 'spectral-exposure' or item->'isMock' <> 'false'::jsonb
      or length(item->>'id') not between 1 and 1000 or length(item->>'obsId') not between 1 and 100
      or item->>'collection' not in ('spherex_dr1','spherex_qr3')
      or item->>'band' !~ '^SPHEREx-D[1-6]$'
      or item->>'url' !~ '^https://irsa[.]ipac[.]caltech[.]edu/ibe/data/spherex/(dr1|qr3)/level2/[A-Za-z0-9_/-]+[.]fits$'
      or position('level2_' || (item->>'obsId') || 'D' || right(item->>'band',1) || '_spx_' || (item->>'processingVersion') || '.fits' in item->>'url') = 0
      or item->>'imageVersion' <> 'spherex-image-hdu-v1' or item->>'imageHash' !~ '^[a-f0-9]{64}$'
      or (item->>'id') = any(ids)
      or jsonb_typeof(item->'ra') <> 'number' or jsonb_typeof(item->'dec') <> 'number'
      or not ((item->>'ra')::double precision >= 0 and (item->>'ra')::double precision < 360)
      or not ((item->>'dec')::double precision between -90 and 90)
      or not ((item->>'wavelengthMin')::double precision > 0 and (item->>'wavelengthMax')::double precision > (item->>'wavelengthMin')::double precision)
      or not (item->'view' ?& array['ra','dec','fov'])
      or not ((item->'view'->>'ra')::double precision >= 0 and (item->'view'->>'ra')::double precision < 360)
      or not ((item->'view'->>'dec')::double precision between -90 and 90)
      or not ((item->'view'->>'fov')::double precision between 0.01 and 180)
      or exists (select 1 from jsonb_each(item) e where e.value = 'null'::jsonb and e.key in ('id','obsId','observedAt','band','url','collection','mission','product','imageHash','imageVersion','ra','dec','view','processingVersion','wavelengthMin','wavelengthMax'))
    , true) then return false; end if;
    d := (item->>'observedAt')::timestamptz;
    if not isfinite(d) then return false; end if;
    ids := array_append(ids,item->>'id'); dates := array_append(dates,d); obsids := array_append(obsids,item->>'obsId');
  end loop;
  if change_type = 'moving' and ((select count(distinct v) from unnest(dates) v) < 2 or (select count(distinct v) from unnest(obsids) v) < 2) then return false; end if;
  return true;
exception when others then return false;
end $$;
revoke all on function public.parallax_valid_observations(jsonb,text) from public;
grant execute on function public.parallax_valid_observations(jsonb,text) to authenticated;

create table public.candidates (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 ra double precision not null check (ra >= 0 and ra < 360),
 dec double precision not null check (dec between -90 and 90),
 center_ra double precision not null check (center_ra >= 0 and center_ra < 360),
 center_dec double precision not null check (center_dec between -90 and 90),
 fov double precision not null check (fov between 0.01 and 180),
 type text not null check (type in ('moving','brightness','transient','artifact')),
 description text not null default '' check (length(description) <= 2000),
 confidence text not null check (confidence in ('low','medium','high')),
 observations jsonb not null,
 status text not null default 'unreviewed' check (status in ('unreviewed','needs_investigation')),
 created_at timestamptz not null default now(),
 constraint valid_observations check (public.parallax_valid_observations(observations,type))
);
create table public.classifications (
 id uuid primary key default gen_random_uuid(),
 candidate_id uuid not null references public.candidates(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 verdict text not null check (verdict in ('agree','disagree','unsure')),
 created_at timestamptz not null default now(),
 constraint one_review_per_user unique (candidate_id,user_id)
);
create index candidates_user_id_idx on public.candidates(user_id);
create index candidates_type_created_idx on public.candidates(type,created_at desc);
create index candidates_created_idx on public.candidates(created_at desc);
create index classifications_user_id_idx on public.classifications(user_id);

alter table public.candidates enable row level security;
alter table public.classifications enable row level security;
revoke all on public.candidates, public.classifications from anon, authenticated;
grant select on public.candidates, public.classifications to anon, authenticated;
grant insert (id,user_id,ra,dec,center_ra,center_dec,fov,type,description,confidence,observations) on public.candidates to authenticated;
grant insert (candidate_id,user_id,verdict) on public.classifications to authenticated;
create policy "Public community candidates" on public.candidates for select to anon,authenticated using (true);
create policy "Own immutable candidate submissions" on public.candidates for insert to authenticated with check (user_id = (select auth.uid()) and status = 'unreviewed');
create policy "Public community reviews" on public.classifications for select to anon,authenticated using (true);
create policy "Review other observers only" on public.classifications for insert to authenticated with check (
 user_id = (select auth.uid()) and exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id <> (select auth.uid()))
);
-- No client UPDATE or DELETE privileges/policies. Reports and verdicts are immutable.
-- Status is never derived from a vote and cannot be supplied by a contributor.
create view public.candidate_summary with (security_invoker = true) as
 select c.*, count(r.id)::integer as review_count,
 count(r.id) filter (where verdict = 'agree')::integer as agree_count,
 count(r.id) filter (where verdict = 'disagree')::integer as disagree_count,
 count(r.id) filter (where verdict = 'unsure')::integer as unsure_count,
 100.0 * count(r.id) filter (where verdict = 'agree') / nullif(count(r.id) filter (where verdict in ('agree','disagree')),0) as agreement
 from public.candidates c left join public.classifications r on r.candidate_id = c.id group by c.id;
revoke all on public.candidate_summary from anon,authenticated;
grant select on public.candidate_summary to anon,authenticated;
commit;
