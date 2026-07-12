-- Migration 13 : informations de production par film (pour la feuille d'émargement)
alter table films
  add column if not exists nom_production text,
  add column if not exists adresse_production text,
  add column if not exists telephone_production text,
  add column if not exists realisateur text,
  add column if not exists directeur_production text;
