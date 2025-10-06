import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { deleteConversation, getConversations } from '../services/chatService';
import './ChatList.css';

const ChatList = () => {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadConversations();
            setupRealtimeSubscription();
        }
    }, [user]);

    const loadConversations = async () => {
        try {
            const result = await getConversations(user.id);
            if (result.success) {
                setConversations(result.data);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
        } finally {
            setLoading(false);
        }
    };

    const setupRealtimeSubscription = () => {
        const channel = supabase
            .channel('messages')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                () => {
                    loadConversations();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    };

    const handleDeleteConversation = async (conversationId) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa cuộc trò chuyện này?')) {
            try {
                const result = await deleteConversation(conversationId, user.id);
                if (result.success) {
                    setConversations(conversations.filter(conv => conv.id !== conversationId));
                } else {
                    alert(result.msg);
                }
            } catch (error) {
                console.error('Error deleting conversation:', error);
                alert('Không thể xóa cuộc trò chuyện');
            }
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
        return date.toLocaleDateString('vi-VN');
    };

    const getConversationName = (conversation) => {
        if (conversation.type === 'group') {
            return conversation.name || 'Nhóm chat';
        }

        // Tìm người khác trong cuộc trò chuyện 1-1
        const otherMember = conversation.conversation_members?.find(
            member => member.user_id !== user.id
        );
        return otherMember?.user?.name || 'Người dùng';
    };

    const getConversationAvatar = (conversation) => {
        if (conversation.type === 'group') {
            return '👥';
        }

        const otherMember = conversation.conversation_members?.find(
            member => member.user_id !== user.id
        );
        return otherMember?.user?.image || '👤';
    };

    if (loading) {
        return (
            <div className="chat-list-container">
                <div className="loading">Đang tải...</div>
            </div>
        );
    }

    return (
        <div className="chat-list-container">
            <header className="chat-list-header">
                <h1>Tin nhắn</h1>
                <Link to="/new-chat" className="new-chat-button">
                    ➕ Tạo mới
                </Link>
            </header>

            <div className="conversations-list">
                {conversations.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">💬</div>
                        <h3>Chưa có cuộc trò chuyện nào</h3>
                        <p>Hãy tạo cuộc trò chuyện đầu tiên của bạn!</p>
                        <Link to="/new-chat" className="create-first-button">
                            Tạo cuộc trò chuyện
                        </Link>
                    </div>
                ) : (
                    conversations.map((conversation) => (
                        <div key={conversation.id} className="conversation-item">
                            <Link to={`/chat/${conversation.id}`} className="conversation-link">
                                <div className="conversation-avatar">
                                    {getConversationAvatar(conversation)}
                                </div>
                                <div className="conversation-content">
                                    <div className="conversation-header">
                                        <h3 className="conversation-name">
                                            {getConversationName(conversation)}
                                        </h3>
                                        <span className="conversation-time">
                                            {conversation.messages[0] &&
                                                formatTime(conversation.messages[0].created_at)
                                            }
                                        </span>
                                    </div>
                                    <p className="conversation-preview">
                                        {conversation.messages[0]?.content || 'Chưa có tin nhắn'}
                                    </p>
                                </div>
                            </Link>
                            <button
                                className="delete-button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleDeleteConversation(conversation.id);
                                }}
                                title="Xóa cuộc trò chuyện"
                            >
                                🗑️
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ChatList;

