import { useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userBehaviorTracker } from '../services/userBehaviorTracker';

/**
 * NavigationTracker component - Track screen visits tự động
 * Tích hợp vào app/_layout.jsx để track tất cả navigation
 */
export const NavigationTracker = ({ children }) => {
    const { user } = useAuth();
    const segments = useSegments();

    useEffect(() => {
        if (!user?.id) return;

        // Get current screen name từ segments
        // segments = ['(main)', 'home'] hoặc ['(main)', 'chatList'], etc.
        const screenName = segments[segments.length - 1] || 'home';

        // Track chỉ các screens trong sidebar và main screens
        const trackableScreens = [
            'home',
            'chatList',
            'notifications',
            'profile',
            'members',
            'activities',
            'documents',
            'events',
            'leaderboard',
            'finance',
            'contact',
            'personalNotifications' // Thêm nếu cần
        ];

        if (trackableScreens.includes(screenName)) {
            userBehaviorTracker.trackScreenVisit(user.id, screenName);
            // Không log khi vào trang home
            if (screenName !== 'home') {
            }
        }
    }, [segments, user?.id]);

    return children;
};


