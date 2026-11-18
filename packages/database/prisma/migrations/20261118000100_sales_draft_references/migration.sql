BEGIN;

-- Block concurrent draft inserts until the backfill and allocator are both ready.
LOCK TABLE public.sales_drafts IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.sales_draft_references (
  draft_id uuid PRIMARY KEY REFERENCES public.sales_drafts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  number bigserial NOT NULL,
  CONSTRAINT sales_draft_references_number_key UNIQUE (number),
  CONSTRAINT ck_sales_draft_references_positive CHECK (number > 0)
);

INSERT INTO public.sales_draft_references (draft_id)
SELECT d.id
FROM public.sales_drafts d
WHERE d.status = 'DRAFT' OR EXISTS (
  SELECT 1 FROM public.sales_commands c
  WHERE c.draft_id = d.id AND c.operation IN ('CREATE_DRAFT', 'SAVE_DRAFT', 'SUBMIT_DRAFT')
)
ORDER BY d.created_at, d.id;

CREATE FUNCTION public.assign_sales_draft_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO public.sales_draft_references (draft_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_draft_reference_on_insert
AFTER INSERT ON public.sales_drafts FOR EACH ROW
WHEN (NEW.status = 'DRAFT')
EXECUTE FUNCTION public.assign_sales_draft_reference();

CREATE FUNCTION public.enforce_sales_draft_reference_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.draft_id IS DISTINCT FROM OLD.draft_id OR NEW.number IS DISTINCT FROM OLD.number THEN
    RAISE EXCEPTION 'Draft reference is immutable' USING ERRCODE = '23514',
      CONSTRAINT = 'ck_sales_draft_reference_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_draft_reference_immutable
BEFORE UPDATE ON public.sales_draft_references FOR EACH ROW
EXECUTE FUNCTION public.enforce_sales_draft_reference_identity();

COMMIT;
