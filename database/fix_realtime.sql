-- Script để sửa RLS cho Realtime hoạt động
-- Chạy script này trong Supabase SQL Editor

-- 1. Kiểm tra RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('messages', 'conversations', 'conversation_members');

-- 2. Tạm thời tắt RLS để test (CHỈ ĐỂ TEST!)
-- ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversation_members DISABLE ROW LEVEL SECURITY;

-- 3. Hoặc tạo policies đúng cho Realtime
-- Xóa policies cũ nếu có
DROP POLICY IF EXISTS "Users can view messages" ON messages;
DROP POLICY IF EXISTS "Users can insert messages" ON messages;
DROP POLICY IF EXISTS "Users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view conversation members" ON conversation_members;

-- Tạo policies mới cho messages
CREATE POLICY "Users can view messages" ON messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages" ON messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid() AND
        conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

-- Tạo policies cho conversations
CREATE POLICY "Users can view conversations" ON conversations
    FOR SELECT USING (
        id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

-- Tạo policies cho conversation_members
CREATE POLICY "Users can view conversation members" ON conversation_members
    FOR SELECT USING (
        user_id = auth.uid() OR
        conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

-- 4. Kiểm tra Realtime có được enable không
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 5. Enable Realtime cho các bảng (nếu chưa có)
-- ALTER PUBLICATION supabase_realtime ADD TABLE messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;
