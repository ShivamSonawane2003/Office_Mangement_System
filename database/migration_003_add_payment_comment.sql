USE office_expense_dbV2;

-- =====================================================
-- Add payment_comment column ONLY if it does NOT exist
-- =====================================================
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'office_expense_dbV2'
    AND TABLE_NAME = 'gst_claims'
    AND COLUMN_NAME = 'payment_comment'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE gst_claims ADD COLUMN payment_comment VARCHAR(500) NULL AFTER payment_status;',
  'SELECT "payment_comment already exists" AS msg;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Final check
DESCRIBE gst_claims;

