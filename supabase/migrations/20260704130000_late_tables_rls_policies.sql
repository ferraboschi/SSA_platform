-- CONSISTENCY FIX. Three tables added by later migrations enabled RLS but never
-- got the standard policy set the init tables have. RLS-on + no-policy means the
-- session (authenticated) client sees ZERO rows — so the Anomalie page, which
-- reads corsi_crediti and corsi_partecipanti with the session client, silently
-- gets nothing. Not a security hole (service-role still works), but a
-- misconfiguration. Bring them in line with every sibling table: authenticated
-- staff may SELECT; only is_staff() may write; service-role bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array['corsi_crediti', 'corsi_partecipanti', 'corsi_presenze']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (true);', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_staff());', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff());', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_staff());', t || '_delete', t);
  end loop;
end $$;
