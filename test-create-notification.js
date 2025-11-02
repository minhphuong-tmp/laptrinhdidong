// Script để tạo notification test với postId
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dkeewztofowsqkcahhzn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZWV3enRvZm93c3FrY2FoaHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEzMTcwNzcsImV4cCI6MjA0Njg5MzA3N30.JlRCMKjSLEUNVF_U2THB8nXHvvtCAFiOzTRm9qcDNAk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestNotification() {
    try {
        // Lấy user đầu tiên để test
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id')
            .limit(2);

        if (userError) {
            console.error('Error fetching users:', userError);
            return;
        }

        if (users.length < 2) {
            console.error('Need at least 2 users to test');
            return;
        }

        console.log('Found users:', users);

        const receiverId = users[0].id;
        const senderId = users[1].id;

        // Lấy 1 post để test
        const { data: posts, error: postError } = await supabase
            .from('posts')
            .select('id')
            .limit(1);

        if (postError) {
            console.error('Error fetching posts:', postError);
            return;
        }

        if (posts.length === 0) {
            console.error('No posts found');
            return;
        }

        const postId = posts[0].id;
        console.log('Using post ID:', postId);

        // Tạo notification với postId trong message field
        const notificationData = {
            receiver_id: receiverId,
            sender_id: senderId,
            type: 'comment',
            title: 'Đã bình luận bài viết của bạn',
            content: 'Test comment notification',
            message: JSON.stringify({ postId: postId, commentId: null }),
            is_read: false
        };

        console.log('Creating notification:', notificationData);

        const { data, error } = await supabase
            .from('notifications')
            .insert([notificationData])
            .select();

        if (error) {
            console.error('Error creating notification:', error);
            return;
        }

        console.log('✅ Notification created successfully:', data);
        console.log('📧 Receiver ID:', receiverId);
        console.log('👤 Sender ID:', senderId);
        console.log('📝 Post ID:', postId);
    } catch (error) {
        console.error('Error:', error);
    }
}

createTestNotification();




