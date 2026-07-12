-- Migration 18 : autoriser les demi-pointures (ex 39.5) pour le champ pointure
alter table personnes
  alter column pointure type numeric using pointure::numeric;
