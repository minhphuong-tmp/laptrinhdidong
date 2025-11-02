-- Tạo bảng notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('like', 'comment', 'tag', 'follow', 'post_mention', 'club_announcement', 'event_reminder', 'system')),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo index để tối ưu performance
CREATE INDEX IF NOT EXISTS idx_notifications_receiver_id ON notifications(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sender_id ON notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Tạo trigger để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Tạo policies cho RLS
-- Users chỉ có thể xem thông báo của chính họ
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (auth.uid() = receiver_id);

-- Users có thể tạo thông báo (thường là system hoặc admin)
CREATE POLICY "Users can create notifications" ON notifications
    FOR INSERT WITH CHECK (true);

-- Users có thể cập nhật thông báo của chính họ (chủ yếu để đánh dấu đã đọc)
CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = receiver_id);

-- Users có thể xóa thông báo của chính họ
CREATE POLICY "Users can delete their own notifications" ON notifications
    FOR DELETE USING (auth.uid() = receiver_id);

-- Tạo một số thông báo mẫu
INSERT INTO notifications (receiver_id, sender_id, type, title, content, is_read) VALUES
-- Thông báo cho user đầu tiên (thay đổi ID theo user thật)
('fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'like', 'Phương đã thích bài viết của bạn', 'Bài viết "Workshop React Native"', false),
('fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'comment', 'Minh đã bình luận bài viết của bạn', 'Tuyệt vời! Tôi cũng muốn tham gia workshop này', false),
('fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'tag', 'Bạn đã được gắn thẻ trong một bài viết', 'Phương đã gắn thẻ bạn trong bài viết "Thành viên mới"', false),
('fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'follow', 'Nguyễn Văn A đã theo dõi bạn', 'Người dùng mới đã theo dõi bạn', true),
('fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'club_announcement', 'Cuộc họp CLB tuần này', 'Thông báo cuộc họp CLB vào thứ 7 tuần này lúc 9h sáng tại phòng A101', false),
('fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'fa17da7f-84f1-49c1-a8c3-e2bd31a29e07', 'event_reminder', 'Workshop lập trình', 'Tham gia workshop "React Native từ cơ bản đến nâng cao" vào chủ nhật tuần sau', true);


