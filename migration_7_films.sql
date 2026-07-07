-- Migration 7 : support de plusieurs films (dépouillement et PDT séparés par film,
-- base comédiens/figurants et trombinoscope restent communs à tous les films)

create table if not exists films (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  created_at timestamptz default now()
);

alter table films enable row level security;
create policy "allow_all_films" on films for all using (true) with check (true);

alter table depouillement_jours add column if not exists film_id uuid references films(id) on delete cascade;
create index if not exists idx_depouillement_jours_film on depouillement_jours(film_id);

-- Crée un film "LEDR2" par défaut et y rattache les jours de tournage déjà existants
-- (qui n'étaient pas encore associés à un film avant cette mise à jour)
do $$
declare
  new_film_id uuid;
begin
  if not exists (select 1 from films where nom = 'LEDR2') then
    insert into films (nom, description) values ('LEDR2', 'Les Enfants de la Résistance 2 - film principal') returning id into new_film_id;
    update depouillement_jours set film_id = new_film_id where film_id is null;
  end if;
end $$;
