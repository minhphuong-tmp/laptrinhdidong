-- ✅ SERVER-SIDE ENCRYPTION: Thêm column client_message_id vào bảng messages
-- Column này lưu UUID từ client, ổn định qua reload, dùng để map với local cache

-- Kiểm tra và thêm column client_message_id nếu chưa có
DO $$
BEGIN
    -- Thêm column client_message_id nếu chưa tồn tại
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'messages'
        AND column_name = 'client_message_id'
    ) THEN
        ALTER TABLE public.messages
        ADD COLUMN client_message_id uuid;
        
        -- Comment cho column
        COMMENT ON COLUMN public.messages.client_message_id IS 
        '✅ SERVER-SIDE ENCRYPTION: UUID từ client, ổn định qua reload. Dùng để map plaintext từ local cache.';
        
        -- Tạo index để tối ưu query (optional)
        CREATE INDEX IF NOT EXISTS idx_messages_client_message_id 
        ON public.messages(client_message_id) 
        WHERE client_message_id IS NOT NULL;
    END IF;
END $$;








