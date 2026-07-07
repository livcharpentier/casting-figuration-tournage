-- Migration 5 : liens distincts Instagram et Agent (en plus de showreel/site web déjà existants)
alter table personnes
  add column if not exists lien_instagram text,
  add column if not exists lien_agent text;
