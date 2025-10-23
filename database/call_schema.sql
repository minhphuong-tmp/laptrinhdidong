-- Call system schema for Supabase
-- Chạy script này trong Supabase SQL Editor

-- 1. Tạo bảng call_requests để quản lý cuộc gọi
CREATE TABLE IF NOT EXISTS call_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    call_type VARCHAR(10) NOT NULL DEFAULT 'voice', -- 'voice' or 'video'
    status VARCHAR(20) NOT NULL DEFAULT 'ringing', -- 'ringing', 'answered', 'declined', 'missed', 'ended'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    answered_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER DEFAULT 0, -- Duration in seconds
    UNIQUE(caller_id, receiver_id, status) -- Chỉ cho phép 1 cuộc gọi đang ring giữa 2 người
);

-- 2. Tạo bảng call_history để lưu lịch sử cuộc gọi
CREATE TABLE IF NOT EXISTS call_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_request_id UUID REFERENCES call_requests(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    call_type VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL,
    duration INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE
);

-- 3. Tạo indexes để tối ưu performance
CREATE INDEX IF NOT EXISTS idx_call_requests_caller ON call_requests(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_requests_receiver ON call_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_requests_status ON call_requests(status);
CREATE INDEX IF NOT EXISTS idx_call_requests_conversation ON call_requests(conversation_id);

CREATE INDEX IF NOT EXISTS idx_call_history_caller ON call_history(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_history_receiver ON call_history(receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_history_conversation ON call_history(conversation_id);

-- 4. Enable RLS (Row Level Security)
ALTER TABLE call_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

-- 5. Tạo policies cho call_requests
CREATE POLICY "Users can view their own call requests" ON call_requests
    FOR SELECT USING (caller_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can create call requests" ON call_requests
    FOR INSERT WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Users can update their own call requests" ON call_requests
    FOR UPDATE USING (caller_id = auth.uid() OR receiver_id = auth.uid());

-- 6. Tạo policies cho call_history
CREATE POLICY "Users can view their own call history" ON call_history
    FOR SELECT USING (caller_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can insert call history" ON call_history
    FOR INSERT WITH CHECK (caller_id = auth.uid() OR receiver_id = auth.uid());

-- 7. Enable Realtime cho call_requests
ALTER PUBLICATION supabase_realtime ADD TABLE call_requests;

-- 8. Tạo function để tự động tạo call_history khi call kết thúc
CREATE OR REPLACE FUNCTION create_call_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Chỉ tạo history khi call kết thúc (status = 'ended')
    IF NEW.status = 'ended' AND OLD.status != 'ended' THEN
        INSERT INTO call_history (
            call_request_id,
            caller_id,
            receiver_id,
            conversation_id,
            call_type,
            status,
            duration,
            created_at,
            ended_at
        ) VALUES (
            NEW.id,
            NEW.caller_id,
            NEW.receiver_id,
            NEW.conversation_id,
            NEW.call_type,
            NEW.status,
            NEW.duration,
            NEW.created_at,
            NEW.ended_at
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Tạo trigger để tự động tạo call_history
CREATE TRIGGER trigger_create_call_history
    AFTER UPDATE ON call_requests
    FOR EACH ROW
    EXECUTE FUNCTION create_call_history();

