-- Migration 9 : ajouter "depouillement" comme type de document importable pour un film
alter table film_documents drop constraint if exists film_documents_type_document_check;
alter table film_documents add constraint film_documents_type_document_check
  check (type_document in ('bible', 'pdt', 'scenario', 'depouillement'));
