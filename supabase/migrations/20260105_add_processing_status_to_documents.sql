-- Migration: Add processing_status column to documents table
-- This migration adds support for tracking document merge status

-- Step 1: Add processing_status column
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'completed' 
CHECK (processing_status IN ('processing', 'completed', 'failed'));

-- Step 2: Add comment explaining the column
COMMENT ON COLUMN documents.processing_status IS 'Status of document processing: processing (chunks uploaded, merging), completed (ready), failed (merge failed)';

-- Step 3: Add index for better query performance (optional, for filtering by status)
CREATE INDEX IF NOT EXISTS idx_documents_processing_status 
ON documents(processing_status) 
WHERE processing_status = 'processing';







