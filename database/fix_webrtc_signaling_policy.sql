-- Fix Row Level Security policy for webrtc_signaling table
-- This allows users to create and read signaling data

-- Enable RLS on webrtc_signaling table
ALTER TABLE webrtc_signaling ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view signaling data" ON webrtc_signaling;
DROP POLICY IF EXISTS "Users can create signaling data" ON webrtc_signaling;
DROP POLICY IF EXISTS "Users can update signaling data" ON webrtc_signaling;

-- Create policy for viewing signaling data
-- Users can view signaling data where they are involved in the call
CREATE POLICY "Users can view signaling data" ON webrtc_signaling
    FOR SELECT
    USING (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    );

-- Create policy for creating signaling data
-- Users can create signaling data where they are the caller or receiver
CREATE POLICY "Users can create signaling data" ON webrtc_signaling
    FOR INSERT
    WITH CHECK (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    );

-- Create policy for updating signaling data
-- Users can update signaling data where they are involved
CREATE POLICY "Users can update signaling data" ON webrtc_signaling
    FOR UPDATE
    USING (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    )
    WITH CHECK (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    );

-- Grant necessary permissions
GRANT ALL ON webrtc_signaling TO authenticated;
GRANT ALL ON webrtc_signaling TO anon;


