USE office_expense_dbV2;

-- =====================================================
-- Add ocr_extracted_gst_amount column ONLY if it does NOT exist
-- =====================================================
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'office_expense_dbV2'
    AND TABLE_NAME = 'gst_claims'
    AND COLUMN_NAME = 'ocr_extracted_gst_amount'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE gst_claims ADD COLUMN ocr_extracted_gst_amount FLOAT NULL AFTER gst_amount;',
  'SELECT "ocr_extracted_gst_amount already exists" AS msg;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Final check
DESCRIBE gst_claims;

