-- Migration 12 : case "présent(e)" pour le pointage des figurants par jour
alter table depouillement_roles
  add column if not exists present boolean;
