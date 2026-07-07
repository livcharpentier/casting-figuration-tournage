-- Migration 8 : documents de production par film (bible, PDT, scénario)
create table if not exists film_documents (
  id uuid primary key default gen_random_uuid(),
  film_id uuid references films(id) on delete cascade,
  type_document text not null check (type_document in ('bible', 'pdt', 'scenario')),
  nom_fichier text,
  fichier_url text,
  contenu_extrait jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_film_documents_film on film_documents(film_id);

alter table film_documents enable row level security;
create policy "allow_all_film_documents" on film_documents for all using (true) with check (true);
