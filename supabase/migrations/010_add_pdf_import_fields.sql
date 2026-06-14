ALTER TABLE public.manifests 
ADD COLUMN order_number text,
ADD COLUMN delivery_date date,
ADD COLUMN source_file text;

ALTER TABLE public.drug_items 
ADD COLUMN bonus_quantity integer DEFAULT 0;
