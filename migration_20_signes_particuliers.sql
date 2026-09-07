-- Migration 20 : signes particuliers (physique atypique, tatouages, cicatrices, petite taille, etc.)
alter table personnes
  add column if not exists signes_particuliers text;
