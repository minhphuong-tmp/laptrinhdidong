import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createDirectConversation, createGroupConversation } from '../services/chatService';
import { getAllUsers } from '../services/userService';
import './NewChat.css';

const NewChat = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [isGroup, setIsGroup] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const result = await getAllUsers();
            if (result.success) {
                // Lọc bỏ user hiện tại
                const filteredUsers = result.data.filter(u => u.id !== user.id);
                setUsers(filteredUsers);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUserToggle = (userId) => {
        if (isGroup) {
            // Nhóm: có thể chọn nhiều người
            setSelectedUsers(prev =>
                prev.includes(userId)
                    ? prev.filter(id => id !== userId)
                    : [...prev, userId]
            );
        } else {
            // 1-1: chỉ chọn 1 người
            setSelectedUsers(prev =>
                prev.includes(userId) ? [] : [userId]
            );
        }
    };

    const handleCreateChat = async () => {
        if (selectedUsers.length === 0) {
            alert('Vui lòng chọn ít nhất một người');
            return;
        }

        if (isGroup && !groupName.trim()) {
            alert('Vui lòng nhập tên nhóm');
            return;
        }

        setCreating(true);
        try {
            let result;

            if (isGroup) {
                result = await createGroupConversation(
                    groupName.trim(),
                    user.id,
                    selectedUsers
                );
            } else {
                result = await createDirectConversation(user.id, selectedUsers[0]);
            }

            if (result.success) {
                navigate(`/chat/${result.data.id}`);
            } else {
                alert(result.msg);
            }
        } catch (error) {
            console.error('Error creating chat:', error);
            alert('Không thể tạo cuộc trò chuyện');
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <div className="new-chat-container">
                <div className="loading">Đang tải...</div>
            </div>
        );
    }

    return (
        <div className="new-chat-container">
            <header className="new-chat-header">
                <button
                    onClick={() => navigate('/chat')}
                    className="back-button"
                >
                    ← Quay lại
                </button>
                <h1>Tạo cuộc trò chuyện</h1>
            </header>

            <div className="chat-type-selector">
                <button
                    className={`type-button ${!isGroup ? 'active' : ''}`}
                    onClick={() => {
                        setIsGroup(false);
                        setSelectedUsers([]);
                        setGroupName('');
                    }}
                >
                    💬 Chat 1-1
                </button>
                <button
                    className={`type-button ${isGroup ? 'active' : ''}`}
                    onClick={() => {
                        setIsGroup(true);
                        setSelectedUsers([]);
                        setGroupName('');
                    }}
                >
                    👥 Tạo nhóm
                </button>
            </div>

            {isGroup && (
                <div className="group-name-section">
                    <label htmlFor="groupName">Tên nhóm</label>
                    <input
                        type="text"
                        id="groupName"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Nhập tên nhóm..."
                        className="group-name-input"
                    />
                </div>
            )}

            <div className="users-section">
                <h3>Chọn người tham gia</h3>
                <div className="users-list">
                    {users.map((userItem) => (
                        <div
                            key={userItem.id}
                            className={`user-item ${selectedUsers.includes(userItem.id) ? 'selected' : ''}`}
                            onClick={() => handleUserToggle(userItem.id)}
                        >
                            <div className="user-avatar">
                                {userItem.image || '👤'}
                            </div>
                            <div className="user-info">
                                <h4 className="user-name">{userItem.name}</h4>
                                <p className="user-email">{userItem.email}</p>
                            </div>
                            <div className="user-checkbox">
                                {selectedUsers.includes(userItem.id) ? '✓' : '○'}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="selected-users">
                <h4>Đã chọn ({selectedUsers.length})</h4>
                <div className="selected-list">
                    {selectedUsers.map(userId => {
                        const userItem = users.find(u => u.id === userId);
                        return (
                            <div key={userId} className="selected-user">
                                <span>{userItem?.name}</span>
                                <button
                                    onClick={() => handleUserToggle(userId)}
                                    className="remove-button"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="create-section">
                <button
                    onClick={handleCreateChat}
                    className="create-button"
                    disabled={selectedUsers.length === 0 || creating}
                >
                    {creating ? 'Đang tạo...' : isGroup ? 'Tạo nhóm' : 'Tạo cuộc trò chuyện'}
                </button>
            </div>
        </div>
    );
};

export default NewChat;

