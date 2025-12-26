-- ============================================================
-- Migration: Check encrypted_conversation_key format
-- ============================================================
-- Script này kiểm tra tất cả conversations có encrypted_conversation_key
-- không đúng format "iv:cipher" (phải chứa dấu ':')
--
-- Cách chạy:
-- 1. Chạy script này trong Supabase SQL Editor
-- 2. Xem kết quả để biết conversation nào cần fix
-- 3. Chạy script Node.js migrate_encrypted_conversation_key.js để fix
-- ============================================================

-- Query tất cả conversations có encrypted_conversation_key không đúng format
SELECT 
    id,
    created_by,
    type,
    CASE 
        WHEN encrypted_conversation_key IS NULL THEN 'NULL'
        WHEN encrypted_conversation_key = '' THEN 'EMPTY'
        WHEN encrypted_conversation_key NOT LIKE '%:%' THEN 'INVALID_FORMAT'
        ELSE 'VALID'
    END as format_status,
    CASE 
        WHEN encrypted_conversation_key IS NULL OR encrypted_conversation_key = '' THEN ''
        WHEN encrypted_conversation_key NOT LIKE '%:%' THEN LEFT(encrypted_conversation_key, 50)
        ELSE 'iv:cipher format'
    END as preview,
    created_at
FROM conversations
WHERE encrypted_conversation_key IS NOT NULL
    AND encrypted_conversation_key != ''
ORDER BY created_at DESC;

-- Count summary
SELECT 
    COUNT(*) FILTER (WHERE encrypted_conversation_key IS NULL) as null_count,
    COUNT(*) FILTER (WHERE encrypted_conversation_key = '') as empty_count,
    COUNT(*) FILTER (WHERE encrypted_conversation_key IS NOT NULL 
                     AND encrypted_conversation_key != '' 
                     AND encrypted_conversation_key NOT LIKE '%:%') as invalid_format_count,
    COUNT(*) FILTER (WHERE encrypted_conversation_key LIKE '%:%') as valid_format_count,
    COUNT(*) as total
FROM conversations;








