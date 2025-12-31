USE office_expense_dbV2;

-- =====================================================
-- Add previous_status column ONLY if it does NOT exist
-- =====================================================
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'office_expense_dbV2'
    AND TABLE_NAME = 'gst_claims'
    AND COLUMN_NAME = 'previous_status'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE gst_claims ADD COLUMN previous_status VARCHAR(50) DEFAULT NULL AFTER bill_url;',
  'SELECT "previous_status already exists" AS msg;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =====================================================
-- Add last_status_change column ONLY if it does NOT exist
-- =====================================================
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'office_expense_dbV2'
    AND TABLE_NAME = 'gst_claims'
    AND COLUMN_NAME = 'last_status_change'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE gst_claims ADD COLUMN last_status_change DATETIME DEFAULT NULL AFTER previous_status;',
  'SELECT "last_status_change already exists" AS msg;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =====================================================
-- Modify created_at safely (will run even if identical)
-- =====================================================
SET @sql := 'ALTER TABLE gst_claims MODIFY created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;';
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =====================================================
-- Modify updated_at safely (will run even if identical)
-- =====================================================
SET @sql := 'ALTER TABLE gst_claims MODIFY updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;';
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =====================================================
-- Add index ONLY if NOT exists
-- =====================================================
SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'office_expense_dbV2'
    AND TABLE_NAME = 'gst_claims'
    AND INDEX_NAME = 'idx_last_status_change'
);

SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE gst_claims ADD INDEX idx_last_status_change (last_status_change);',
  'SELECT "idx_last_status_change already exists" AS msg;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Final check
DESCRIBE gst_claims;
