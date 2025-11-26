-- Add missing columns to PostgreSQL database
-- Run this script using psql or pgAdmin

-- Add date_format column to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS date_format VARCHAR DEFAULT 'YYYY-MM-DD';

-- Add validate_timestamps column to app_settings table
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS validate_timestamps BOOLEAN DEFAULT TRUE;

-- Verify the columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'devices' AND column_name = 'date_format'
UNION ALL
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'app_settings' AND column_name = 'validate_timestamps';
