CREATE OR REPLACE FUNCTION public.reset_nhi_import_state()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.nhi_import_state
  SET last_line = 0
  WHERE id = 1;
END;
$$;