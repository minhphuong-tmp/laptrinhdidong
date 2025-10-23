-- Check webrtc_signaling table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'webrtc_signaling' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if table exists and has data
SELECT COUNT(*) as total_signaling FROM webrtc_signaling;

-- Check recent signaling data
SELECT * FROM webrtc_signaling 
ORDER BY created_at DESC 
LIMIT 5;


