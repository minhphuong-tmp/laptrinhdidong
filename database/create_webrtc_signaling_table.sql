-- Create webrtc_signaling table with correct structure
CREATE TABLE IF NOT EXISTS webrtc_signaling (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_id TEXT NOT NULL,
    caller_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    message_type TEXT NOT NULL, -- 'offer', 'answer', 'ice-candidate'
    message_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_call_id ON webrtc_signaling(call_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_caller_id ON webrtc_signaling(caller_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_receiver_id ON webrtc_signaling(receiver_id);

-- Enable RLS
ALTER TABLE webrtc_signaling ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view signaling data" ON webrtc_signaling;
DROP POLICY IF EXISTS "Users can create signaling data" ON webrtc_signaling;
DROP POLICY IF EXISTS "Users can update signaling data" ON webrtc_signaling;

-- Create policy for viewing signaling data
CREATE POLICY "Users can view signaling data" ON webrtc_signaling
    FOR SELECT
    USING (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    );

-- Create policy for creating signaling data
CREATE POLICY "Users can create signaling data" ON webrtc_signaling
    FOR INSERT
    WITH CHECK (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    );

-- Create policy for updating signaling data
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

-- Grant permissions
GRANT ALL ON webrtc_signaling TO authenticated;
GRANT ALL ON webrtc_signaling TO anon;


