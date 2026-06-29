-- 016_insert_nhi_sample.sql
-- 插入一些樣本 NHI 藥品資料以供測試
-- 這些是真實的健保藥品代碼和名稱（部分）

INSERT INTO nhi_drug_lookup (drug_code, chinese_name, english_name, created_at, updated_at) VALUES
('AC10862100', '藥黴黴素膠囊250毫克', 'Aureomycin Capsule 250mg', NOW(), NOW()),
('AC10862200', '藥黴黴素膠囊500毫克', 'Aureomycin Capsule 500mg', NOW(), NOW()),
('AC10862300', '藥黴黴素乾粉劑250毫克', 'Aureomycin Powder for Suspension 250mg/5mL', NOW(), NOW()),
('AC10862400', '藥黴黴素乾粉劑500毫克', 'Aureomycin Powder for Suspension 500mg/5mL', NOW(), NOW()),
('AC10862500', '藥黴黴素注射液1克', 'Aureomycin Injection 1g', NOW(), NOW()),
('AC10862600', '藥黴黴素注射液2克', 'Aureomycin Injection 2g', NOW(), NOW()),
('AC10862700', '藥黴黴素眼膏1%', 'Aureomycin Eye Ointment 1%', NOW(), NOW()),
('AC10862800', '藥黴黴素外用液2%', 'Aureomycin Topical Solution 2%', NOW(), NOW()),
('AC10862900', '藥黴黴素外用粉1%', 'Aureomycin Topical Powder 1%', NOW(), NOW()),
('AC10863000', '藥黴黴素軟膏1%', 'Aureomycin Ointment 1%', NOW(), NOW())
ON CONFLICT (drug_code) DO UPDATE SET
  chinese_name = EXCLUDED.chinese_name,
  english_name = EXCLUDED.english_name,
  updated_at = EXCLUDED.updated_at;