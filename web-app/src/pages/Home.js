import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Home.css';

const Home = () => {
    const { userData, signOut } = useAuth();

    console.log('Home component rendering with userData:', userData);

    const handleSignOut = async () => {
        await signOut();
    };

    return (
        <div className="home-container">
            <header className="home-header">
                <div className="header-content">
                    <h1 className="app-title">Chat App</h1>
                    <div className="user-info">
                        <span className="user-name">Xin chào, {userData?.name || 'User'}!</span>
                        <button onClick={handleSignOut} className="signout-button">
                            Đăng xuất
                        </button>
                    </div>
                </div>
            </header>

            <main className="home-main">
                <div className="welcome-section">
                    <h2 className="welcome-title">Chào mừng đến với Chat App!</h2>
                    <p className="welcome-description">
                        Ứng dụng chat realtime với Supabase. Bạn có thể tạo cuộc trò chuyện 1-1 hoặc nhóm chat.
                    </p>
                </div>

                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon">💬</div>
                        <h3 className="feature-title">Chat 1-1</h3>
                        <p className="feature-description">
                            Trò chuyện riêng tư với bạn bè và đồng nghiệp
                        </p>
                        <Link to="/new-chat" className="feature-button">
                            Tạo cuộc trò chuyện
                        </Link>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">👥</div>
                        <h3 className="feature-title">Nhóm chat</h3>
                        <p className="feature-description">
                            Tạo nhóm chat với nhiều người cùng lúc
                        </p>
                        <Link to="/new-chat" className="feature-button">
                            Tạo nhóm chat
                        </Link>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">📱</div>
                        <h3 className="feature-title">Realtime</h3>
                        <p className="feature-description">
                            Tin nhắn được đồng bộ realtime với Supabase
                        </p>
                        <Link to="/chat" className="feature-button">
                            Xem tin nhắn
                        </Link>
                    </div>
                </div>

                <div className="quick-actions">
                    <Link to="/chat" className="quick-action-button primary">
                        📨 Xem tin nhắn
                    </Link>
                    <Link to="/new-chat" className="quick-action-button secondary">
                        ➕ Tạo cuộc trò chuyện mới
                    </Link>
                </div>
            </main>
        </div>
    );
};

export default Home;