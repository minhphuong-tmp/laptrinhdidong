import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getConversationById, getMessages, markConversationAsRead, sendMessage } from '../services/chatService';
import './Chat.css';

const Chat = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (id && user) {
            loadConversation();
            loadMessages();
            setupRealtimeSubscription();
        }
    }, [id, user]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadConversation = async () => {
        try {
            const result = await getConversationById(id);
            if (result.success) {
                setConversation(result.data);
            }
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    };

    const loadMessages = async () => {
        try {
            const result = await getMessages(id);
            if (result.success) {
                setMessages(result.data);
                // Đánh dấu đã đọc
                await markConversationAsRead(id, user.id);
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const setupRealtimeSubscription = () => {
        const channel = supabase
            .channel(`messages-${id}`)
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${id}`
                },
                async (payload) => {
                    // Lấy thông tin đầy đủ của tin nhắn mới
                    const { data: newMessage } = await supabase
                        .from('messages')
                        .select(`
              *,
              sender:users(id, name, image)
            `)
                        .eq('id', payload.new.id)
                        .single();

                    if (newMessage) {
                        setMessages(prev => [...prev, newMessage]);
                        // Đánh dấu đã đọc nếu là tin nhắn của mình
                        if (newMessage.sender_id === user.id) {
                            await markConversationAsRead(id, user.id);
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || sending) return;

        setSending(true);
        try {
            const result = await sendMessage({
                conversation_id: id,
                sender_id: user.id,
                content: newMessage.trim(),
                message_type: 'text'
            });

            if (result.success) {
                setNewMessage('');
                // Tin nhắn sẽ được thêm qua realtime subscription
            } else {
                alert(result.msg);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Không thể gửi tin nhắn');
        } finally {
            setSending(false);
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getConversationName = () => {
        if (!conversation) return 'Chat';

        if (conversation.type === 'group') {
            return conversation.name || 'Nhóm chat';
        }

        const otherMember = conversation.conversation_members?.find(
            member => member.user_id !== user.id
        );
        return otherMember?.user?.name || 'Người dùng';
    };

    const getConversationAvatar = () => {
        if (!conversation) return '👥';

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
            <div className="chat-container">
                <div className="loading">Đang tải...</div>
            </div>
        );
    }

    return (
        <div className="chat-container">
            <header className="chat-header">
                <Link to="/chat" className="back-button">
                    ← Quay lại
                </Link>
                <div className="chat-info">
                    <div className="chat-avatar">
                        {getConversationAvatar()}
                    </div>
                    <div className="chat-details">
                        <h1 className="chat-title">{getConversationName()}</h1>
                        <p className="chat-subtitle">
                            {conversation?.type === 'group' ? 'Nhóm chat' : 'Tin nhắn riêng'}
                        </p>
                    </div>
                </div>
            </header>

            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="empty-messages">
                        <div className="empty-icon">💬</div>
                        <p>Chưa có tin nhắn nào</p>
                        <p>Hãy gửi tin nhắn đầu tiên!</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <div
                            key={message.id}
                            className={`message ${message.sender_id === user.id ? 'own' : 'other'}`}
                        >
                            <div className="message-content">
                                <p className="message-text">{message.content}</p>
                                <span className="message-time">
                                    {formatTime(message.created_at)}
                                </span>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="message-form">
                <div className="input-group">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Nhập tin nhắn..."
                        className="message-input"
                        disabled={sending}
                    />
                    <button
                        type="submit"
                        className="send-button"
                        disabled={!newMessage.trim() || sending}
                    >
                        {sending ? '⏳' : '📤'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Chat;

