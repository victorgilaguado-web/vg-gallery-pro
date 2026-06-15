-- VG Gallery — esquema completo para un proyecto Supabase NUEVO.
-- Pegar y ejecutar entero en el SQL Editor del proyecto nuevo.
-- (Las imágenes van a Cloudinary, así que no se usa Storage.)

-- ── Tablas ────────────────────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text,
  slug text,
  password text,
  client_logo text,
  created_at timestamptz default now()
);

create table if not exists days (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text,
  sort_order int,
  created_at timestamptz default now()
);

create table if not exists looks (
  id uuid primary key default gen_random_uuid(),
  day_id uuid references days(id) on delete cascade,
  name text,
  sort_order int,
  created_at timestamptz default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  look_id uuid references looks(id) on delete cascade,
  day_id uuid,
  url text,
  thumb_url text,
  label text default '',
  stars int default 0,
  color int,
  note text default '',
  sort_order int,
  created_at timestamptz default now()
);

create table if not exists moodboard (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  url text,
  created_at timestamptz default now()
);

create table if not exists photo_reviews (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  reviewer text not null,
  stars int default 0,
  color int,
  note text default '',
  updated_at timestamptz default now(),
  unique (photo_id, reviewer)
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  reviewer text,
  summary jsonb,
  created_at timestamptz default now()
);

-- ── Seguridad (RLS) ───────────────────────────────────────────────────────
alter table projects      enable row level security;
alter table days          enable row level security;
alter table looks         enable row level security;
alter table photos        enable row level security;
alter table photo_reviews enable row level security;
alter table submissions   enable row level security;
alter table moodboard     enable row level security;

-- Cualquiera puede LEER las galerías
create policy "read projects"  on projects  for select using (true);
create policy "read days"      on days      for select using (true);
create policy "read looks"     on looks     for select using (true);
create policy "read photos"    on photos    for select using (true);
create policy "read moodboard" on moodboard for select using (true);

-- Clientes (anónimos) guardan sus selecciones + envíos
create policy "write reviews"     on photo_reviews for all using (true) with check (true);
create policy "write submissions" on submissions   for all using (true) with check (true);

-- Solo el admin con login puede escribir proyectos/estructura/fotos
create policy "admin projects"  on projects  for all to authenticated using (true) with check (true);
create policy "admin days"      on days      for all to authenticated using (true) with check (true);
create policy "admin looks"     on looks     for all to authenticated using (true) with check (true);
create policy "admin photos"    on photos    for all to authenticated using (true) with check (true);
create policy "admin moodboard" on moodboard for all to authenticated using (true) with check (true);
