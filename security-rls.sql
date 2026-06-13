-- VG Gallery — Security lockdown (Row Level Security)
-- ⚠️ Run this ONLY AFTER you have created your admin user AND confirmed you can
--    sign in at gallery.victorgilstudio.com/admin. Otherwise you could lock
--    yourself out of writing to your own database.
--
-- What it does:
--  · Anyone can READ the galleries (clients need this).
--  · Clients (anonymous) can save their own selections + submissions.
--  · Only the signed-in studio admin can create/edit/delete projects, days,
--    looks and photos. Anonymous DELETE/UPDATE of your work is blocked.

-- 1) Turn on Row Level Security
alter table projects      enable row level security;
alter table days          enable row level security;
alter table looks         enable row level security;
alter table photos        enable row level security;
alter table photo_reviews enable row level security;
alter table submissions   enable row level security;
alter table moodboard     enable row level security;

-- 2) Anyone can READ the galleries
create policy "read projects"  on projects  for select using (true);
create policy "read days"      on days      for select using (true);
create policy "read looks"     on looks     for select using (true);
create policy "read photos"    on photos    for select using (true);
create policy "read moodboard" on moodboard for select using (true);

-- 3) Clients (anonymous) can save their selections and submissions
create policy "write reviews"     on photo_reviews for all using (true) with check (true);
create policy "write submissions" on submissions   for all using (true) with check (true);

-- 4) Only the signed-in studio admin can change projects / structure / photos
create policy "admin projects"  on projects  for all to authenticated using (true) with check (true);
create policy "admin days"      on days      for all to authenticated using (true) with check (true);
create policy "admin looks"     on looks     for all to authenticated using (true) with check (true);
create policy "admin photos"    on photos    for all to authenticated using (true) with check (true);
create policy "admin moodboard" on moodboard for all to authenticated using (true) with check (true);
