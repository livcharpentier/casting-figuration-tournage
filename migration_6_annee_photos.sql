-- Migration 6 : année de prise de vue pour chaque photo de la galerie (documents_personne)
-- (la photo principale a déjà "photo_annee" sur la table personnes)
alter table documents_personne
  add column if not exists annee_photo int;
