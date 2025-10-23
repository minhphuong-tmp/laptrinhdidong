-- Check call_requests table structure and data
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'call_requests' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if table exists and has data
SELECT COUNT(*) as total_calls FROM call_requests;

-- Check recent call requests
SELECT * FROM call_requests 
ORDER BY created_at DESC 
LIMIT 5;


