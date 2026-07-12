-- Migration 15 : champs pour le tableau pré-paye (Hot Cost) par rôle
alter table depouillement_roles
  add column if not exists cachet_brut numeric,
  add column if not exists heure_debut time,
  add column if not exists heure_fin time,
  add column if not exists abattement numeric,
  add column if not exists code_salarie text;
