-- KB sections: rag_documents.family diventa la "sezione" della knowledge base
-- (cartella del wiki Obsidian, o frontmatter `section:` della nota) invece di
-- un enum fisso. Il vincolo nato per ('certificato','shochu','generale')
-- rifiuterebbe ogni sezione nuova (es. 'concetti'), facendo ripiegare la sync
-- GitHub su 'generale'. Dopo questa migration, un click su "Aggiorna KB da
-- GitHub" ri-sincronizza i documenti con la loro sezione reale.
alter table public.rag_documents
  drop constraint if exists rag_documents_family_check;
