-- Migration 4 : champ métier / profession réelle (utile pour caster des vrais infirmiers, pompiers, policiers, etc.)
alter table personnes
  add column if not exists metier text;

create index if not exists idx_personnes_metier on personnes(metier);
