-- Migration 14 : infos nécessaires à la génération des contrats (lettre d'engagement)

-- Infos légales de la société de production, par film
alter table films
  add column if not exists forme_juridique text,   -- ex "SARL"
  add column if not exists capital_social text,     -- ex "45 000 Euros"
  add column if not exists rcs text,                -- ex "RCS Tours 502 529 472"
  add column if not exists siret text,
  add column if not exists code_ape text,
  add column if not exists numero_objet text;        -- N° objet du film (agrément)

-- Infos administratives des personnes, nécessaires pour un contrat de travail
alter table personnes
  add column if not exists lieu_naissance text,
  add column if not exists nationalite text,
  add column if not exists num_secu_sociale text,
  add column if not exists situation_familiale text, -- ex "CÉLIBATAIRE", "MARIÉ(E)"
  add column if not exists nb_enfants_charge text,
  add column if not exists nom_jeune_fille text,
  add column if not exists centre_secu_sociale text,  -- ex "CPAM Poitiers"
  add column if not exists personne_a_prevenir text;  -- nom + tel
