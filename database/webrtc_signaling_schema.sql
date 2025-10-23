-- WebRTC Signaling Table
-- Chạy script này trong Supabase SQL Editor

-- Tạo bảng webrtc_signaling để lưu signaling data
CREATE TABLE IF NOT EXISTS webrtc_signaling (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'offer', 'answer', 'ice-candidate', 'call-ended'
    data JSONB NOT NULL, -- SDP, ICE candidate, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo index để tối ưu query
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_receiver 
ON webrtc_signaling(receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_sender 
ON webrtc_signaling(sender_id, created_at DESC);

-- Bật RLS
ALTER TABLE webrtc_signaling ENABLE ROW LEVEL SECURITY;

-- Policy cho phép user gửi signaling data
CREATE POLICY "Users can send signaling data" ON webrtc_signaling
    FOR INSERT
    WITH CHECK (sender_id::uuid = auth.uid());

-- Policy cho phép user nhận signaling data
CREATE POLICY "Users can receive signaling data" ON webrtc_signaling
    FOR SELECT
    USING (receiver_id::uuid = auth.uid());

-- Policy cho phép user xóa signaling data cũ
CREATE POLICY "Users can delete old signaling data" ON webrtc_signaling
    FOR DELETE
    USING (sender_id::uuid = auth.uid() OR receiver_id::uuid = auth.uid());

-- Bật Realtime cho webrtc_signaling
ALTER PUBLICATION supabase_realtime ADD TABLE webrtc_signaling;

-- Tạo function để cleanup signaling data cũ (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_signaling_data()
RETURNS void AS $$
BEGIN
    DELETE FROM webrtc_signaling 
    WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Tạo trigger để auto cleanup (chạy mỗi 30 phút)
-- Note: Cần setup pg_cron extension trong Supabase
-- SELECT cron.schedule('cleanup-signaling', '*/30 * * * *', 'SELECT cleanup_old_signaling_data();');

-- Kiểm tra bảng đã tạo
SELECT 
    schemaname, 
    tablename, 
    tableowner 
FROM pg_tables 
WHERE tablename = 'webrtc_signaling';
