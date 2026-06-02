-- Migration: Add encryptedForReceiver and encryptedForSync columns to messages table
-- This migration adds support for the new E2EE architecture with PIN-based sync

-- Step 1: Add new columns to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS encrypted_for_receiver TEXT,
ADD COLUMN IF NOT EXISTS encrypted_for_sync TEXT;

-- Step 2: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_encrypted_for_sync 
ON messages(encrypted_for_sync) 
WHERE encrypted_for_sync IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_encrypted_for_receiver 
ON messages(encrypted_for_receiver) 
WHERE encrypted_for_receiver IS NOT NULL;

-- Step 3: Add pin column to users table (plaintext - for personal project)
-- Note: This is a security risk but acceptable for personal projects
ALTER TABLE users
ADD COLUMN IF NOT EXISTS pin TEXT,
ADD COLUMN IF NOT EXISTS pin_salt TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 4: Add index for pin lookup
CREATE INDEX IF NOT EXISTS idx_users_pin 
ON users(pin) 
WHERE pin IS NOT NULL;

-- Step 5: Add comment explaining the new architecture
COMMENT ON COLUMN messages.encrypted_for_receiver IS 'Message encrypted with receiver public key (RSA)';
COMMENT ON COLUMN messages.encrypted_for_sync IS 'Message encrypted with master key derived from PIN (AES-256-GCM)';
COMMENT ON COLUMN users.pin IS 'PIN in plaintext (for personal project only - security risk)';
COMMENT ON COLUMN users.pin_salt IS 'Salt for PIN derivation (PBKDF2)';
