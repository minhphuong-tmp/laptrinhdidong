-- Temporarily disable RLS for webrtc_signaling table to allow WebRTC to work
-- This is a temporary solution for testing

-- Disable RLS on webrtc_signaling table
ALTER TABLE webrtc_signaling DISABLE ROW LEVEL SECURITY;

-- Grant all permissions
GRANT ALL ON webrtc_signaling TO authenticated;
GRANT ALL ON webrtc_signaling TO anon;

-- Note: This allows all authenticated users to read/write signaling data
-- For production, you should implement proper RLS policies


