-- Simple fix for webrtc_signaling table
-- Disable RLS completely to allow WebRTC to work

-- Disable RLS on webrtc_signaling table
ALTER TABLE webrtc_signaling DISABLE ROW LEVEL SECURITY;

-- Grant all permissions to authenticated users
GRANT ALL ON webrtc_signaling TO authenticated;
GRANT ALL ON webrtc_signaling TO anon;

-- This allows all authenticated users to read/write signaling data
-- Perfect for testing WebRTC functionality


