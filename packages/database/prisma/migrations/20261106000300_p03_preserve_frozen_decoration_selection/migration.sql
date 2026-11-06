-- Protect the original binding as well as the destination of alternate SQL updates.
CREATE OR REPLACE FUNCTION prevent_frozen_decoration_selection_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE frozen UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.field = 'decoration' THEN
    SELECT decoration_entry_id INTO frozen FROM sales_order_pieces WHERE id = OLD.piece_id;
    IF frozen IS NOT NULL THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Submitted decoration selection is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
      END IF;
      IF ROW(NEW.piece_id, NEW.field, NEW.entry_id) IS DISTINCT FROM ROW(OLD.piece_id, OLD.field, OLD.entry_id) THEN
        RAISE EXCEPTION 'Submitted decoration selection is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.field = 'decoration' THEN
    SELECT decoration_entry_id INTO frozen FROM sales_order_pieces WHERE id = NEW.piece_id;
    IF frozen IS NOT NULL AND NEW.entry_id IS DISTINCT FROM frozen THEN
      RAISE EXCEPTION 'Submitted decoration selection is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
