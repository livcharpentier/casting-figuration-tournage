-- Migration 19 : infos du parent/tuteur (pour les mineurs)
alter table personnes
  add column if not exists parent_nom text,
  add column if not exists parent_prenom text,
  add column if not exists parent_telephone text,
  add column if not exists parent_email text,
  add column if not exists parent_profession text,
  add column if not exists parent_notes text; -- autres infos utiles sur le parent/tuteur
