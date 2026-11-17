BEGIN;

-- pg_restore checks copied rows with an empty caller search path.
-- Preserve CHECK semantics while resolving their nested helper calls deterministically.
ALTER FUNCTION public.p08_has_exact_keys(jsonb, text[])
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.p08_valid_correction(jsonb)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.p08_valid_facts(jsonb)
  SET search_path = pg_catalog, public, pg_temp;

COMMIT;
