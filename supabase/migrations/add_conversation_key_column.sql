-- ✅ CLIENT-SIDE PRIVACY LOCK: Thêm column conversation_key vào bảng conversations
-- Column này lưu ConversationKey (plaintext) dạng base64 string
-- Backend quản lý và tạo key này khi init conversation

-- Kiểm tra và thêm column conversation_key nếu chưa có
DO $$
BEGIN
    -- Thêm column conversation_key nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'conversation_key'
    ) THEN
        ALTER TABLE public.conversations
        ADD COLUMN conversation_key text;
        
        -- Comment cho column
        COMMENT ON COLUMN public.conversations.conversation_key IS 
        '✅ CLIENT-SIDE PRIVACY LOCK: ConversationKey (plaintext) dạng base64 string. Backend quản lý và tạo key này khi init conversation.';
    END IF;
END $$;

-- Tạo index để tối ưu query (nếu cần)
-- CREATE INDEX IF NOT EXISTS idx_conversations_conversation_key 
-- ON public.conversations(conversation_key) 
-- WHERE conversation_key IS NOT NULL;








