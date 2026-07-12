-- Migration 16 : RIB (IBAN/BIC) pour faciliter les virements de paie
alter table personnes
  add column if not exists iban text,
  add column if not exists bic text,
  add column if not exists titulaire_rib text; -- si différent du nom du figurant
