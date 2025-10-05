-- Chat Database Schema
-- Tạo bảng conversations (cuộc trò chuyện)
CREATE TABLE conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT, -- Tên nhóm (null nếu là chat 1-1)
    type TEXT NOT NULL DEFAULT 'direct', -- 'direct' hoặc 'group'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE CASCADE
);

-- Tạo bảng conversation_members (thành viên cuộc trò chuyện)
CREATE TABLE conversation_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_admin BOOLEAN DEFAULT FALSE, -- Admin của nhóm
    UNIQUE(conversation_id, user_id)
);

-- Tạo bảng messages (tin nhắn)
CREATE TABLE messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT, -- Nội dung tin nhắn
    message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'image', 'video', 'emoji'
    file_url TEXT, -- URL file nếu là ảnh/video
    file_name TEXT, -- Tên file
    file_size INTEGER, -- Kích thước file
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL, -- Tin nhắn được reply
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo bảng message_reads (tin nhắn đã đọc)
CREATE TABLE message_reads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

-- Tạo indexes để tối ưu performance
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX idx_conversation_members_user_id ON conversation_members(user_id);
CREATE INDEX idx_conversation_members_conversation_id ON conversation_members(conversation_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX idx_message_reads_user_id ON message_reads(user_id);

-- Tạo function để cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Tạo triggers để tự động cập nhật updated_at
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at 
    BEFORE UPDATE ON messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tạo RLS (Row Level Security) policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

-- Policy cho conversations: chỉ thành viên mới thấy được
CREATE POLICY "Users can view conversations they are members of" ON conversations
    FOR SELECT USING (
        id IN (
            SELECT conversation_id FROM conversation_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy cho conversation_members: chỉ thành viên mới thấy được
CREATE POLICY "Users can view conversation members" ON conversation_members
    FOR SELECT USING (
        user_id = auth.uid() OR
        conversation_id IN (
            SELECT conversation_id FROM conversation_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy cho messages: chỉ thành viên mới thấy được
CREATE POLICY "Users can view messages in their conversations" ON messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy cho message_reads: chỉ user đó mới thấy được
CREATE POLICY "Users can view their own message reads" ON message_reads
    FOR SELECT USING (user_id = auth.uid());

-- Policy cho INSERT: chỉ thành viên mới gửi được tin nhắn
CREATE POLICY "Users can send messages to their conversations" ON messages
    FOR INSERT WITH CHECK (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members 
            WHERE user_id = auth.uid()
        ) AND sender_id = auth.uid()
    );

-- Policy cho INSERT conversation_members: chỉ admin mới thêm được thành viên
CREATE POLICY "Admins can add members to conversations" ON conversation_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversation_members 
            WHERE conversation_id = conversation_members.conversation_id 
            AND user_id = auth.uid() 
            AND is_admin = true
        )
    );
