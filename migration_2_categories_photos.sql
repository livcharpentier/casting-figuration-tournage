-- Migration 2 : catégorisation des photos (portrait, pied, véhicule, tenue chic, animal...)
alter table documents_personne
  add column if not exists categorie_photo text
  check (categorie_photo in ('portrait', 'pied', 'vehicule', 'tenue_chic', 'animal', 'autre'));

create index if not exists idx_documents_categorie on documents_personne(categorie_photo);
