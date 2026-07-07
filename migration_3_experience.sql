-- Migration 3 : champ dédié à l'expérience / parcours (théâtre, tournages, formations)
alter table personnes
  add column if not exists experience_parcours text;
