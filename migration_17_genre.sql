-- Migration 17 : genre (Homme/Femme/Enfant) sélectionnable sur la fiche personne
alter table personnes
  add column if not exists genre text check (genre in ('Homme', 'Femme', 'Enfant'));

create index if not exists idx_personnes_genre on personnes(genre);
