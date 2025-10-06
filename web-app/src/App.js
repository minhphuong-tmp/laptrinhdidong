import React from 'react';
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import Chat from './pages/Chat';
import ChatList from './pages/ChatList';
import Home from './pages/Home';
import Login from './pages/Login';
import NewChat from './pages/NewChat';
import SignUp from './pages/SignUp';

function App() {
    return (
        <AuthProvider>
            <Router>
                <div className="App">
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/signup" element={<SignUp />} />
                        <Route path="/" element={<ProtectedRoute />}>
                            <Route index element={<Navigate to="/home" replace />} />
                            <Route path="home" element={<Home />} />
                            <Route path="chat" element={<ChatList />} />
                            <Route path="chat/:id" element={<Chat />} />
                            <Route path="new-chat" element={<NewChat />} />
                        </Route>
                    </Routes>
                </div>
            </Router>
        </AuthProvider>
    );
}

function ProtectedRoute() {
    const { user, loading } = useAuth();

    console.log('ProtectedRoute - user:', user, 'loading:', loading);

    if (loading) {
        console.log('Still loading...');
        return <div>Loading...</div>;
    }

    if (!user) {
        console.log('No user, redirecting to login');
        return <Navigate to="/login" replace />;
    }

    console.log('User exists, rendering Outlet');
    return <Outlet />;
}

export default App;
