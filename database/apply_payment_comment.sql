-- Quick migration script to add payment_comment column
-- Run this in MySQL: mysql -u root -p office_expense_dbV2 < database/apply_payment_comment.sql

USE office_expense_dbV2;

-- Check if column exists, if not add it
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

-- Verify the column was added
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE, 
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'office_expense_dbV2'
  AND TABLE_NAME = 'gst_claims'
  AND COLUMN_NAME = 'payment_comment';

