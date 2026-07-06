-- ============================================
-- CASTING FIGURATION - Schéma de base de données
-- ============================================

-- Table principale : comédiens ET figurants
create table if not exists personnes (
  id uuid primary key default gen_random_uuid(),
  type_personne text not null check (type_personne in ('comedien', 'figurant', 'comedien_figurant')),
  -- comedien = ne fait pas de figuration
  -- figurant = figurant pur
  -- comedien_figurant = comédien qui fait aussi de la figuration

  nom text not null,
  prenom text not null,
  date_naissance date,
  age int,

  -- Physique
  taille_cm int,
  poids_kg int,
  pointure int,
  tour_taille int,
  tour_poitrine int,
  couleur_yeux text,
  couleur_cheveux text,
  morphologie text,

  -- Contact
  telephone text,
  email text,
  adresse text,

  -- Compétences / autorisations
  permis_conduire boolean default false,
  types_permis text, -- ex "B, moto"
  langues text,
  competences_particulieres text, -- danse, chant, sport, instrument...

  -- Contenu pro
  lien_showreel text,
  lien_site_web text,
  agence text,

  -- Photo principale (trombinoscope)
  photo_url text,
  photo_annee int,

  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_personnes_type on personnes(type_personne);
create index if not exists idx_personnes_taille on personnes(taille_cm);
create index if not exists idx_personnes_permis on personnes(permis_conduire);

-- Documents liés à une personne (CV, démo, autres fichiers)
create table if not exists documents_personne (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid references personnes(id) on delete cascade,
  type_document text not null check (type_document in ('cv', 'demo_video', 'demo_lien', 'photo', 'autre')),
  libelle text, -- étiquette libre ex "Book 2025", "Extrait court-métrage"
  fichier_url text, -- si upload dans le bucket storage
  lien_externe text, -- si lien youtube/vimeo/site
  created_at timestamptz default now()
);

create index if not exists idx_documents_personne on documents_personne(personne_id);

-- Jours de tournage avec besoins en figuration (dépouillement)
create table if not exists depouillement_jours (
  id uuid primary key default gen_random_uuid(),
  jour_tournage text not null, -- ex "J20"
  date_tournage date,
  sequences text, -- séquences du jour
  created_at timestamptz default now()
);

create unique index if not exists idx_depouillement_jour on depouillement_jours(jour_tournage);

-- Rôles/personnages castés pour un jour donné
create table if not exists depouillement_roles (
  id uuid primary key default gen_random_uuid(),
  jour_id uuid references depouillement_jours(id) on delete cascade,
  personne_id uuid references personnes(id) on delete set null,

  type_role text not null check (type_role in ('silhouette', 'silhouette_parlante', 'enfant', 'cascadeur', 'petit_role')),
  sequence text, -- numéro(s) de séquence concernée(s)
  nom_personnage text, -- ce que le personnage fera dans le film

  -- snapshot au moment du dépouillement (peut différer de la fiche personne si mise à jour)
  photo_url_snapshot text,
  age_snapshot int,
  taille_snapshot int,
  adresse_snapshot text,
  annee_photo_snapshot int,

  created_at timestamptz default now()
);

create index if not exists idx_depouillement_roles_jour on depouillement_roles(jour_id);
create index if not exists idx_depouillement_roles_personne on depouillement_roles(personne_id);

-- Checklist HMC (Habillage / Maquillage / Coiffure) - collaboratif temps réel
create table if not exists hmc_checklist (
  id uuid primary key default gen_random_uuid(),
  jour_id uuid references depouillement_jours(id) on delete cascade,
  role_id uuid references depouillement_roles(id) on delete cascade,

  nom text not null,
  prenom text not null,
  telephone text,
  numero_costume text,

  habillage_fait boolean default false,
  habillage_heure time,
  coiffure_fait boolean default false,
  coiffure_heure time,
  maquillage_fait boolean default false,
  maquillage_heure time,

  updated_at timestamptz default now()
);

create index if not exists idx_hmc_jour on hmc_checklist(jour_id);

-- ============================================
-- Row Level Security (accès ouvert, comme les autres apps)
-- ============================================
alter table personnes enable row level security;
alter table documents_personne enable row level security;
alter table depouillement_jours enable row level security;
alter table depouillement_roles enable row level security;
alter table hmc_checklist enable row level security;

create policy "allow_all_personnes" on personnes for all using (true) with check (true);
create policy "allow_all_documents_personne" on documents_personne for all using (true) with check (true);
create policy "allow_all_depouillement_jours" on depouillement_jours for all using (true) with check (true);
create policy "allow_all_depouillement_roles" on depouillement_roles for all using (true) with check (true);
create policy "allow_all_hmc_checklist" on hmc_checklist for all using (true) with check (true);

-- ============================================
-- Realtime (pour la synchro HMC en direct)
-- ============================================
alter publication supabase_realtime add table hmc_checklist;

-- ============================================
-- Storage bucket pour photos / CV / démos
-- ============================================
insert into storage.buckets (id, name, public)
values ('casting-media', 'casting-media', true)
on conflict (id) do nothing;

create policy "public_read_casting_media" on storage.objects
  for select using (bucket_id = 'casting-media');

create policy "public_insert_casting_media" on storage.objects
  for insert with check (bucket_id = 'casting-media');

create policy "public_update_casting_media" on storage.objects
  for update using (bucket_id = 'casting-media');

create policy "public_delete_casting_media" on storage.objects
  for delete using (bucket_id = 'casting-media');
