    -- Thêm RLS policy cho phép DELETE call_requests
    -- Chạy script này trong Supabase SQL Editor

    -- Bật RLS cho call_requests table (nếu chưa có)
    ALTER TABLE call_requests ENABLE ROW LEVEL SECURITY;

    -- Policy cho phép user xóa call_requests của chính họ
    CREATE POLICY "Users can delete their own call requests" ON call_requests
        FOR DELETE
        USING (
            caller_id::uuid = auth.uid() 
            OR receiver_id::uuid = auth.uid()
        );

    -- Policy cho phép user xóa tất cả call_requests (nếu cần)
    -- CHỈ DÙNG KHI CẦN THIẾT - CẨN THẬN VỚI BẢO MẬT
    -- CREATE POLICY "Users can delete all call requests" ON call_requests
    --     FOR DELETE
    --     USING (true);

    -- Kiểm tra policies hiện tại
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
    FROM pg_policies 
    WHERE tablename = 'call_requests';
