-- 019_add_nhi_import_last_row.sql
-- 為健保署藥品對照表增量匯入狀態表補上以「資料列索引」為單位的進度欄位
ALTER TABLE public.nhi_import_state
  ADD COLUMN IF NOT EXISTS last_row BIGINT NOT NULL DEFAULT 0;
