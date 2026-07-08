-- Migration 10 : champ commentaire libre par rôle de figuration (pour la liste du jour)
alter table depouillement_roles
  add column if not exists commentaire text;
