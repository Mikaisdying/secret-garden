-- ===========================================================
-- Secret Garden — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
-- ===========================================================

create extension if not exists pgcrypto with schema extensions;

-- ===== Flowers =====

create table if not exists public.flowers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  author      text not null,
  message     text not null,
  plot_x      real not null,
  plot_y      real not null,
  scale       real not null default 1,
  hue         real not null default 0,
  strokes     jsonb not null,
  actions     jsonb,
  is_private  boolean not null default false,
  seal        text,

  -- Keep in sync with LIMITS in js/data.js and maxlength in plant.html.
  constraint flowers_name_len    check (char_length(btrim(name))    between 1 and 40),
  constraint flowers_author_len  check (char_length(btrim(author))  between 1 and 30),
  constraint flowers_message_len check (char_length(btrim(message)) between 5 and 220),
  constraint flowers_plot        check (plot_x between 0 and 100 and plot_y between 0 and 100),
  constraint flowers_scale       check (scale between 0.5 and 2),
  constraint flowers_strokes     check (case when jsonb_typeof(strokes) = 'array'
                                             then jsonb_array_length(strokes) > 0
                                                  and pg_column_size(strokes) <= 512000
                                             else false end),
  constraint flowers_actions     check (actions is null
                                        or (jsonb_typeof(actions) = 'array'
                                            and pg_column_size(actions) <= 2048000)),
  constraint flowers_seal        check (seal is null or char_length(seal) <= 20)
);

alter table public.flowers drop constraint if exists flowers_name_len;
alter table public.flowers add constraint flowers_name_len check (char_length(btrim(name)) between 1 and 40);
alter table public.flowers drop constraint if exists flowers_author_len;
alter table public.flowers add constraint flowers_author_len check (char_length(btrim(author)) between 1 and 30);

create index if not exists flowers_created_at_idx on public.flowers (created_at);

alter table public.flowers enable row level security;

drop policy if exists "Anyone can read flowers" on public.flowers;
create policy "Anyone can read flowers"
  on public.flowers for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can plant a flower" on public.flowers;
create policy "Anyone can plant a flower"
  on public.flowers for insert
  to anon, authenticated
  with check (true);

-- Column-level grants: visitors can only fill in the flower itself, never
-- choose its id or backdate created_at. No update/delete for anyone —
-- deleting goes through delete_flower() below.
revoke all on public.flowers from anon, authenticated;
grant select on public.flowers to anon, authenticated;
grant insert (name, author, message, plot_x, plot_y, scale, hue, strokes, actions, is_private, seal)
  on public.flowers to anon, authenticated;

-- ===== Admin key (private schema, not exposed through the API) =====

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.settings (
  id              boolean primary key default true check (id),
  admin_key_hash  text not null
);

-- No policies on purpose: nobody reads this through the API. delete_flower()
-- runs as the table owner, which RLS does not apply to.
alter table private.settings enable row level security;
revoke all on private.settings from anon, authenticated;

-- Only the SHA-256 hash is stored. To change the key, re-run this with the
-- new value (lowercase, since the site lowercases ?key= before sending it).
insert into private.settings (id, admin_key_hash)
values (true, encode(extensions.digest('mikaskleinesiesta', 'sha256'), 'hex'))
on conflict (id) do update set admin_key_hash = excluded.admin_key_hash;

-- ===== delete_flower(flower_id, admin_key) =====

create or replace function public.delete_flower(flower_id uuid, admin_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  select admin_key_hash into expected from private.settings where id;
  if expected is null
     or encode(extensions.digest(lower(coalesce(admin_key, '')), 'sha256'), 'hex') <> expected then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.flowers where id = flower_id;
  return found;
end;
$$;

revoke all on function public.delete_flower(uuid, text) from public;
grant execute on function public.delete_flower(uuid, text) to anon, authenticated;

-- ===== Seed flowers (only when the garden is empty) =====

do $$
declare
  petal_colors text[] := array['#e9e2f3', '#d8a3a0', '#e3b94f', '#9fc1d0', '#c2aed1'];
  seeds jsonb := '[
    {"name":"Moonflower","author":"Mika","message":"Even on the quietest nights, I hope you find something worth looking at.","created_at":"2024-03-02T20:10:00Z","plot_x":22,"plot_y":62,"scale":1,"is_private":false,"seal":null},
    {"name":"Wren''s Wish","author":"Wren","message":"For the version of you that hasn''t arrived yet — take your time.","created_at":"2024-04-11T14:32:00Z","plot_x":68,"plot_y":70,"scale":1.1,"is_private":false,"seal":null},
    {"name":"Small Gold Thing","author":"Theo","message":"This one''s for the mornings you almost didn''t get out of bed, and did anyway.","created_at":"2024-05-29T09:00:00Z","plot_x":45,"plot_y":48,"scale":0.9,"is_private":false,"seal":null},
    {"name":"Late Bloomer","author":"Ana","message":"Some things take longer to open. That''s not the same as being wrong.","created_at":"2024-06-14T18:45:00Z","plot_x":81,"plot_y":40,"scale":1,"is_private":false,"seal":null},
    {"name":"Whispered Thing","author":"Mika","message":"This one isn''t for everyone. If you''re reading it, you probably know why.","created_at":"2024-07-20T21:15:00Z","plot_x":34,"plot_y":34,"scale":1,"is_private":true,"seal":"lavender"}
  ]';
  seed jsonb;
  i int := 0;
  strokes jsonb;
  angle int;
  a float8;
  mid float8;
begin
  if exists (select 1 from public.flowers) then
    return;
  end if;

  for seed in select * from jsonb_array_elements(seeds) loop
    i := i + 1;
    strokes := '[]'::jsonb;
    foreach angle in array array[0, 72, 144, 216, 288] loop
      a := radians(angle);
      mid := a + 0.5;
      strokes := strokes || jsonb_build_array(jsonb_build_object(
        'color', petal_colors[i], 'size', 6,
        'points', jsonb_build_array(
          jsonb_build_object('x', 60, 'y', 60),
          jsonb_build_object('x', 60 + cos(a) * 4, 'y', 60 + sin(a) * 4),
          jsonb_build_object('x', 60 + cos(mid) * 18.2, 'y', 60 + sin(mid) * 18.2),
          jsonb_build_object('x', 60 + cos(a) * 26, 'y', 60 + sin(a) * 26),
          jsonb_build_object('x', 60 + cos(a - 0.5) * 18.2, 'y', 60 + sin(a - 0.5) * 18.2),
          jsonb_build_object('x', 60, 'y', 60)
        )
      ));
    end loop;
    strokes := strokes || jsonb_build_array(jsonb_build_object(
      'color', '#6b7f52', 'size', 5,
      'points', '[{"x":60,"y":60},{"x":56,"y":90},{"x":63,"y":120}]'::jsonb
    ));

    insert into public.flowers (name, author, message, created_at, plot_x, plot_y, scale, strokes, is_private, seal)
    values (
      seed->>'name', seed->>'author', seed->>'message', (seed->>'created_at')::timestamptz,
      (seed->>'plot_x')::real, (seed->>'plot_y')::real, (seed->>'scale')::real,
      strokes, (seed->>'is_private')::boolean, seed->>'seal'
    );
  end loop;
end;
$$;
