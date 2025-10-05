-- Script để enable Realtime cho các bảng chat
-- Chạy script này trong Supabase SQL Editor

-- 1. Kiểm tra Realtime publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 2. Add các bảng vào Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;

-- 3. Kiểm tra lại
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 4. Test Realtime bằng cách insert một tin nhắn test
-- INSERT INTO messages (conversation_id, sender_id, content, message_type) 
-- VALUES ('your-conversation-id', 'your-user-id', 'Test message', 'text');
