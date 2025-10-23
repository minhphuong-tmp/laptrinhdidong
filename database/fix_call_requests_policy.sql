-- Fix Row Level Security policy for call_requests table
-- This allows users to create and read their own call requests

-- Enable RLS on call_requests table
ALTER TABLE call_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own call requests" ON call_requests;
DROP POLICY IF EXISTS "Users can create call requests" ON call_requests;
DROP POLICY IF EXISTS "Users can update their own call requests" ON call_requests;

-- Create policy for viewing call requests
-- Users can view call requests where they are either the caller or receiver
CREATE POLICY "Users can view their own call requests" ON call_requests
    FOR SELECT
    USING (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    );

-- Create policy for creating call requests
-- Users can create call requests where they are the caller
CREATE POLICY "Users can create call requests" ON call_requests
    FOR INSERT
    WITH CHECK (
        caller_id = auth.uid()::text
    );

-- Create policy for updating call requests
-- Users can update call requests where they are either the caller or receiver
CREATE POLICY "Users can update their own call requests" ON call_requests
    FOR UPDATE
    USING (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    )
    WITH CHECK (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    );

-- Create policy for deleting call requests
-- Users can delete call requests where they are either the caller or receiver
CREATE POLICY "Users can delete their own call requests" ON call_requests
    FOR DELETE
    USING (
        caller_id = auth.uid()::text OR 
        receiver_id = auth.uid()::text
    );

-- Grant necessary permissions
GRANT ALL ON call_requests TO authenticated;
GRANT ALL ON call_requests TO anon;


