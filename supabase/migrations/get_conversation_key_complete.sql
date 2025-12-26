-- ============================================================
-- ✅ CLIENT-SIDE PRIVACY LOCK: RPC Function get_conversation_key
-- ============================================================
-- Function này cho phép client lấy ConversationKey (plaintext) từ backend
-- để encrypt messages khi gửi (không cần PIN)
--
-- YÊU CẦU:
-- - User phải authenticated (auth.uid() không null)
-- - User phải là member của conversation
-- - Conversation phải tồn tại
-- - Conversation phải có conversation_key đã được init
--
-- TRẢ VỀ:
-- JSON: { "conversation_key": "base64_string" }
--
-- LỖI:
-- - User not authenticated → P0001
-- - Conversation not found → P0002
-- - User is not a member → P0003
-- - Conversation key not initialized → P0004
-- ============================================================

-- Bước 1: Đảm bảo có column conversation_key trong bảng conversations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'conversation_key'
    ) THEN
        ALTER TABLE public.conversations
        ADD COLUMN conversation_key text;
        
        COMMENT ON COLUMN public.conversations.conversation_key IS 
        '✅ CLIENT-SIDE PRIVACY LOCK: ConversationKey (plaintext) dạng base64 string. Backend quản lý và tạo key này khi init conversation.';
    END IF;
END $$;

-- Bước 2: Tạo function get_conversation_key
CREATE OR REPLACE FUNCTION public.get_conversation_key(conversation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    is_member boolean;
    conversation_key_text text;
    conversation_exists boolean;
    key_exists boolean;
BEGIN
    -- Lấy user ID hiện tại từ auth
    current_user_id := auth.uid();
    
    -- Kiểm tra user đã đăng nhập
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated' USING ERRCODE = 'P0001';
    END IF;
    
    -- Kiểm tra conversation tồn tại
    SELECT EXISTS (
        SELECT 1
        FROM conversations
        WHERE conversations.id = get_conversation_key.conversation_id
    ) INTO conversation_exists;
    
    -- Nếu conversation không tồn tại
    IF NOT conversation_exists THEN
        RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
    END IF;
    
    -- Kiểm tra user là member của conversation
    SELECT EXISTS (
        SELECT 1
        FROM conversation_members
        WHERE conversation_members.conversation_id = get_conversation_key.conversation_id
        AND conversation_members.user_id = current_user_id
    ) INTO is_member;
    
    -- Nếu user không phải member → raise exception
    IF NOT is_member THEN
        RAISE EXCEPTION 'User is not a member of this conversation' USING ERRCODE = 'P0003';
    END IF;
    
    -- Lấy conversation_key từ bảng conversations
    -- Ưu tiên: conversation_key (plaintext) > encrypted_conversation_key (nếu cần decrypt)
    SELECT 
        COALESCE(
            conversations.conversation_key,
            conversations.encrypted_conversation_key
        ),
        (COALESCE(
            conversations.conversation_key,
            conversations.encrypted_conversation_key
        ) IS NOT NULL)
    INTO 
        conversation_key_text,
        key_exists
    FROM conversations
    WHERE conversations.id = get_conversation_key.conversation_id;
    
    -- Nếu conversation chưa có key → raise exception
    IF NOT key_exists OR conversation_key_text IS NULL OR conversation_key_text = '' THEN
        RAISE EXCEPTION 'Conversation key not initialized. Please initialize the conversation first.' USING ERRCODE = 'P0004';
    END IF;
    
    -- Trả về conversation_key dạng JSON
    RETURN json_build_object(
        'conversation_key', conversation_key_text
    );
END;
$$;

-- Bước 3: Grant execute permission cho authenticated users
GRANT EXECUTE ON FUNCTION public.get_conversation_key(uuid) TO authenticated;

-- Bước 4: Comment cho function
COMMENT ON FUNCTION public.get_conversation_key(uuid) IS 
'✅ CLIENT-SIDE PRIVACY LOCK: Lấy ConversationKey (plaintext) từ backend. Yêu cầu user phải là member của conversation. Trả về conversation_key dạng base64 string trong JSON object.';

-- ============================================================
-- TEST FUNCTION (Optional - Comment out khi không cần)
-- ============================================================
-- SELECT public.get_conversation_key('your-conversation-id-here');
-- ============================================================








