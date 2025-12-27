-- Migration: Remove index on encrypted_for_receiver
-- Reason: Index row size exceeds btree maximum when storing encrypted_keys for multiple devices
-- We don't need to index this column as we don't query by it

-- Drop the index if it exists
DROP INDEX IF EXISTS idx_messages_encrypted_for_receiver;

-- Add comment explaining why we don't index this column
COMMENT ON COLUMN messages.encrypted_for_receiver IS 'Message encrypted with receiver public key (RSA). Contains JSON: {ciphertext, encrypted_keys: [{device_id, encrypted_key}]}. Not indexed due to size limitations.';


