import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseUrl } from '../constants';
import { saveToCache } from '../utils/cacheHelper';
import { saveMessagesCache } from '../utils/messagesCache';
import { activityService } from './activityService';
import { getConversations, getMessages } from './chatService';
import { clubMemberService } from './clubMemberService';
import { documentService } from './documentService';
import { notificationService } from './notificationService';
import { fetchPost } from './postService';

/**
 * Check network connection (đơn giản: try-catch khi gọi API)
 * Nếu API call fail với network error → không có mạng
 * @returns {boolean} true nếu có mạng (hoặc không chắc chắn), false nếu chắc chắn không có mạng
 */
const hasNetwork = async () => {
    // Đơn giản: giả định có mạng, nếu API call fail thì sẽ catch
    // Có thể cải thiện sau bằng cách dùng @react-native-community/netinfo
    return true;
};

/**
 * Prefetch conversations
 * @param {string} userId - User ID
 */
export const prefetchConversations = async (userId) => {
    if (!userId) {
        return;
    }

    try {
        // Check network (đơn giản: try-catch)
        if (!(await hasNetwork())) {
            return;
        }

        // Load conversations (không log metrics để nhanh hơn)
        const result = await getConversations(userId, { logMetrics: false });

        if (!result.success || !result.data) {
            return;
        }

        // Cache vào AsyncStorage (dùng cache chung)
        await saveToCache(`conversations_cache_${userId}`, result.data);
    } catch (error) {
        // Silent error handling
    }
};

/**
 * Prefetch messages cho một conversation
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID để giải mã messages
 */
export const prefetchMessages = async (conversationId, userId) => {
    if (!conversationId || !userId) {
        return;
    }

    try {
        // Check network
        if (!(await hasNetwork())) {
            return;
        }

        // Load tất cả messages (limit lớn để lấy hết)
        const result = await getMessages(conversationId, userId, 1000, 0);

        if (!result.success || !result.data) {
            return;
        }

        // Cache vào AsyncStorage (lưu cả encrypted messages, sẽ decrypt khi load)
        await saveMessagesCache(conversationId, result.data);
    } catch (error) {
        // Silent error handling
    }
};

/**
 * Prefetch notifications
 * @param {string} userId - User ID
 */
export const prefetchNotifications = async (userId) => {
    if (!userId) {
        return;
    }

    try {
        // Check network
        if (!(await hasNetwork())) {
            return;
        }

        // Load notifications
        const notifications = await notificationService.getPersonalNotifications(userId);

        if (!notifications || !Array.isArray(notifications)) {
            return;
        }

        // Cache vào AsyncStorage
        const key = `notificationsCache_${userId}`;
        await AsyncStorage.setItem(key, JSON.stringify({
            data: notifications,
            timestamp: Date.now()
        }));
    } catch (error) {
        // Silent error handling
    }
};

/**
 * Smart prefetch (dựa trên predictions)
 * @param {string} userId - User ID
 * @param {Array} predictions - Array of predictions [{ screen: string, priority: number, reason: string }]
 */
// Track các screen đã log để tránh log trùng lặp (persist trong session)
const loggedScreens = new Set();

/**
 * Reset logged screens để log lại khi quay lại home
 */
export const resetLoggedScreens = () => {
    loggedScreens.clear();
};

export const smartPrefetch = async (userId, predictions) => {
    if (!userId || !predictions || predictions.length === 0) {
        return;
    }
    // Lấy số lượng từ database cho tất cả các màn hình để log
    const screenCounts = {};
    const chatListMessagesCount = {}; // Lưu số messages cho chatList
    try {
        const { supabase } = require('../lib/supabase');

        for (const prediction of predictions) {
            try {
                let count = 0;
                switch (prediction.screen) {
                    case 'personalNotifications':
                        const { count: notifCount } = await supabase
                            .from('notifications')
                            .select('*', { count: 'exact', head: true })
                            .eq('receiverId', userId);
                        count = notifCount || 0;
                        break;
                    case 'chatList':
                        const { count: convCount } = await supabase
                            .from('conversation_members')
                            .select('*', { count: 'exact', head: true })
                            .eq('user_id', userId);
                        count = convCount || 0;

                        // Đếm tổng số messages từ tất cả conversations của user
                        if (count > 0) {
                            try {
                                // Lấy tất cả conversation_ids của user
                                const { data: conversationMembers } = await supabase
                                    .from('conversation_members')
                                    .select('conversation_id')
                                    .eq('user_id', userId);

                                if (conversationMembers && conversationMembers.length > 0) {
                                    const conversationIds = conversationMembers.map(cm => cm.conversation_id);
                                    const { count: messagesCount } = await supabase
                                        .from('messages')
                                        .select('*', { count: 'exact', head: true })
                                        .in('conversation_id', conversationIds);
                                    chatListMessagesCount[prediction.screen] = messagesCount || 0;
                                }
                            } catch (e) {
                                // Silent
                            }
                        }
                        break;
                    case 'notifications':
                        const { count: clubNotifCount } = await supabase
                            .from('notifications_clb')
                            .select('*', { count: 'exact', head: true });
                        count = clubNotifCount || 0;
                        break;
                    case 'documents':
                        const { count: docCount } = await supabase
                            .from('documents')
                            .select('*', { count: 'exact', head: true });
                        count = docCount || 0;
                        break;
                    case 'members':
                        const { count: memberCount } = await supabase
                            .from('club_members')
                            .select('*', { count: 'exact', head: true });
                        count = memberCount || 0;
                        break;
                    case 'activities':
                        const { count: activityCount } = await supabase
                            .from('activities')
                            .select('*', { count: 'exact', head: true });
                        count = activityCount || 0;
                        break;
                    case 'events':
                        const { count: eventCount } = await supabase
                            .from('activities')
                            .select('*', { count: 'exact', head: true })
                            .eq('type', 'event');
                        count = eventCount || 0;
                        break;
                    case 'profile':
                        const { count: postCount } = await supabase
                            .from('posts')
                            .select('*', { count: 'exact', head: true })
                            .eq('userId', userId);
                        count = postCount || 0;
                        break;
                }
                if (count > 0) {
                    screenCounts[prediction.screen] = count;
                }
            } catch (e) {
                // Silent
            }
        }
    } catch (e) {
        // Silent
    }

    const screenNames = predictions.map(p => {
        if (p.screen === 'chatList' && screenCounts[p.screen]) {
            // Format đặc biệt cho chatList với cả conversations và messages
            const conversationsCount = screenCounts[p.screen];
            const messagesCount = chatListMessagesCount[p.screen] || 0;
            if (messagesCount > 0) {
                return `chatList (${conversationsCount} conversations và ${messagesCount} messages)`;
            } else {
                return `chatList (${conversationsCount} conversations)`;
            }
        } else if (screenCounts[p.screen]) {
            return `${p.screen} (${screenCounts[p.screen]})`;
        }
        return p.screen;
    }).join(', ');
    console.log(` Load top 3 vào cache : ${screenNames}`);

    // Prefetch theo predictions (song song để nhanh hơn)
    const prefetchPromises = [];

    for (const prediction of predictions) {
        switch (prediction.screen) {
            case 'chatList':
                // Prefetch conversations và messages cho top conversations
                prefetchPromises.push(
                    (async () => {
                        try {
                            // Kiểm tra xem đã có cache chưa
                            const cacheKey = `conversations_cache_${userId}`;
                            const existingCache = await AsyncStorage.getItem(cacheKey);

                            if (!existingCache) {
                                // Chưa có cache → tạo cache mới
                                // Prefetch conversations trước
                                await prefetchConversations(userId);

                                // Sau đó prefetch messages cho TẤT CẢ conversations
                                const result = await getConversations(userId, { logMetrics: false });
                                if (result.success && result.data) {
                                    if (!loggedScreens.has('chatList')) {
                                        loggedScreens.add('chatList');
                                    }

                                    // Prefetch messages cho TẤT CẢ conversations (song song)
                                    const messagePromises = result.data.map(async (conv) => {
                                        await prefetchMessages(conv.id, userId);
                                        if (!loggedScreens.has(`chatList_messages_${conv.id}`)) {
                                            loggedScreens.add(`chatList_messages_${conv.id}`);
                                        }
                                    });
                                    await Promise.allSettled(messagePromises);
                                } else {
                                    if (!loggedScreens.has('chatList')) {
                                        loggedScreens.add('chatList');
                                    }
                                }
                            } else {
                                // Đã có cache → không động vào cache (cache chỉ được update khi vào màn hình)
                                if (!loggedScreens.has('chatList')) {
                                    loggedScreens.add('chatList');
                                }
                            }
                        } catch (error) {
                            // Silent
                        }
                    })()
                );
                break;

            case 'notifications':
                // Thông báo CLB
                prefetchPromises.push(
                    (async () => {
                        try {
                            const notifications = await notificationService.getClubNotifications(userId);
                            if (notifications && Array.isArray(notifications)) {
                                const key = `clubNotificationsCache_${userId}`;
                                await AsyncStorage.setItem(key, JSON.stringify({
                                    data: notifications,
                                    timestamp: Date.now()
                                }));
                                if (!loggedScreens.has('notifications')) {
                                    loggedScreens.add('notifications');
                                }
                            }
                        } catch (error) {
                            // Silent
                        }
                    })()
                );
                break;

            case 'personalNotifications':
                // Thông báo cá nhân - chỉ cache nếu chưa có cache
                prefetchPromises.push(
                    (async () => {
                        try {
                            // Kiểm tra xem đã có cache chưa
                            const cacheKey = `notificationsCache_${userId}`;
                            const existingCache = await AsyncStorage.getItem(cacheKey);

                            if (!existingCache) {
                                // Chưa có cache → tạo cache mới
                                const notifications = await notificationService.getPersonalNotifications(userId, false);
                                if (notifications && Array.isArray(notifications)) {
                                    await AsyncStorage.setItem(cacheKey, JSON.stringify({
                                        data: notifications,
                                        timestamp: Date.now()
                                    }));
                                    if (!loggedScreens.has('personalNotifications')) {
                                        loggedScreens.add('personalNotifications');
                                    }
                                }
                            } else {
                                // Đã có cache → không động vào cache (cache chỉ được update khi vào màn hình)
                                if (!loggedScreens.has('personalNotifications')) {
                                    loggedScreens.add('personalNotifications');
                                }
                            }
                        } catch (error) {

                        }
                    })()
                );
                break;

            case 'members':
                prefetchPromises.push(
                    (async () => {
                        try {
                            const result = await clubMemberService.getAllMembers();
                            if (result.success && result.data) {
                                const key = `membersCache_${userId}`;
                                await AsyncStorage.setItem(key, JSON.stringify({
                                    data: result.data,
                                    timestamp: Date.now()
                                }));
                                if (!loggedScreens.has('members')) {
                                    loggedScreens.add('members');
                                }
                            } else {
                                if (!loggedScreens.has('members')) {
                                    loggedScreens.add('members');
                                }
                            }
                        } catch (error) {
                            // Silent
                        }
                    })()
                );
                break;

            case 'activities':
                prefetchPromises.push(
                    (async () => {
                        try {
                            const result = await activityService.getAllActivities();
                            if (result.success && result.data) {
                                const key = `activitiesCache_${userId}`;
                                await AsyncStorage.setItem(key, JSON.stringify({
                                    data: result.data,
                                    timestamp: Date.now()
                                }));
                                if (!loggedScreens.has('activities')) {
                                    loggedScreens.add('activities');
                                }
                            }
                        } catch (error) {
                            // Silent error handling
                        }
                    })()
                );
                break;

            case 'events':
                // Events dùng cùng data với activities
                prefetchPromises.push(
                    (async () => {
                        try {
                            const result = await activityService.getAllActivities();
                            if (result.success && result.data) {
                                const key = `eventsCache_${userId}`;
                                await AsyncStorage.setItem(key, JSON.stringify({
                                    data: result.data,
                                    timestamp: Date.now()
                                }));
                                if (!loggedScreens.has('events')) {
                                    loggedScreens.add('events');
                                }
                            }
                        } catch (error) {
                            // Silent error handling
                        }
                    })()
                );
                break;

            case 'documents':
                prefetchPromises.push(
                    (async () => {
                        try {
                            const result = await documentService.getAllDocuments();
                            if (result.success && result.data) {
                                const key = `documentsCache_${userId}`;
                                await AsyncStorage.setItem(key, JSON.stringify({
                                    data: result.data,
                                    timestamp: Date.now()
                                }));
                                if (!loggedScreens.has('documents')) {
                                    loggedScreens.add('documents');
                                }
                            }
                        } catch (error) {
                            // Silent error handling
                        }
                    })()
                );
                break;

            case 'profile':
                prefetchPromises.push(
                    (async () => {
                        try {
                            // Load tất cả user posts (limit lớn để lấy hết)
                            const result = await fetchPost(1000, userId);
                            if (result.success && result.data) {
                                const key = `profilePostsCache_${userId}`;
                                await AsyncStorage.setItem(key, JSON.stringify({
                                    data: result.data,
                                    timestamp: Date.now()
                                }));
                                if (!loggedScreens.has('profile')) {
                                    loggedScreens.add('profile');
                                }
                            }
                        } catch (error) {
                            // Silent error handling
                        }
                    })()
                );
                break;

            case 'leaderboard':
                // Leaderboard - cache demo data
                prefetchPromises.push(
                    (async () => {
                        try {
                            const demoData = [
                                {
                                    id: 1,
                                    name: 'Nguyễn Văn A',
                                    avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
                                    points: 1250,
                                    rank: 1,
                                    badge: 'Gold',
                                    activities: 15,
                                    joinDate: '2023-01-15'
                                },
                                {
                                    id: 2,
                                    name: 'Trần Thị B',
                                    avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
                                    points: 1100,
                                    rank: 2,
                                    badge: 'Silver',
                                    activities: 12,
                                    joinDate: '2023-02-20'
                                },
                                {
                                    id: 3,
                                    name: 'Lê Văn C',
                                    avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
                                    points: 850,
                                    rank: 3,
                                    badge: 'Bronze',
                                    activities: 10,
                                    joinDate: '2023-03-10'
                                },
                                {
                                    id: 4,
                                    name: 'Phạm Thị D',
                                    avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
                                    points: 720,
                                    rank: 4,
                                    badge: 'Member',
                                    activities: 8,
                                    joinDate: '2023-04-05'
                                },
                                {
                                    id: 5,
                                    name: 'Hoàng Văn E',
                                    avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
                                    points: 650,
                                    rank: 5,
                                    badge: 'Member',
                                    activities: 7,
                                    joinDate: '2023-05-12'
                                }
                            ];
                            const key = `leaderboardCache_${userId}`;
                            await AsyncStorage.setItem(key, JSON.stringify({
                                data: demoData,
                                timestamp: Date.now(),
                                isDemo: true
                            }));
                            if (!loggedScreens.has('leaderboard')) {
                                loggedScreens.add('leaderboard');
                            }
                        } catch (error) {
                            // Silent
                        }
                    })()
                );
                break;

            case 'finance':
                // Finance - cache demo data
                prefetchPromises.push(
                    (async () => {
                        try {
                            const demoData = {
                                transactions: [
                                    {
                                        id: 1,
                                        type: 'income',
                                        title: 'Đóng phí thành viên',
                                        amount: 500000,
                                        date: '2024-01-15',
                                        category: 'Membership',
                                        description: 'Phí thành viên tháng 1/2024'
                                    },
                                    {
                                        id: 2,
                                        type: 'expense',
                                        title: 'Mua thiết bị workshop',
                                        amount: 2000000,
                                        date: '2024-01-10',
                                        category: 'Equipment',
                                        description: 'Mua laptop và thiết bị cho workshop'
                                    },
                                    {
                                        id: 3,
                                        type: 'income',
                                        title: 'Tài trợ từ công ty ABC',
                                        amount: 5000000,
                                        date: '2024-01-08',
                                        category: 'Sponsorship',
                                        description: 'Tài trợ cho dự án Hackathon'
                                    },
                                    {
                                        id: 4,
                                        type: 'expense',
                                        title: 'Chi phí tổ chức sự kiện',
                                        amount: 1500000,
                                        date: '2024-01-05',
                                        category: 'Event',
                                        description: 'Chi phí thuê phòng và thiết bị'
                                    },
                                    {
                                        id: 5,
                                        type: 'income',
                                        title: 'Bán vé workshop',
                                        amount: 800000,
                                        date: '2024-01-03',
                                        category: 'Ticket',
                                        description: 'Bán vé workshop React Native'
                                    }
                                ],
                                budget: {
                                    total: 10000000,
                                    spent: 3500000,
                                    remaining: 6500000
                                }
                            };
                            const key = `financeCache_${userId}`;
                            await AsyncStorage.setItem(key, JSON.stringify({
                                data: demoData,
                                timestamp: Date.now(),
                                isDemo: true
                            }));
                            if (!loggedScreens.has('finance')) {
                                loggedScreens.add('finance');
                            }
                        } catch (error) {
                            // Silent
                        }
                    })()
                );
                break;

            case 'contact':
                // Contact - cache demo data
                prefetchPromises.push(
                    (async () => {
                        try {
                            const demoData = [
                                {
                                    id: 1,
                                    type: 'phone',
                                    title: 'Hotline',
                                    value: '0123 456 789',
                                    action: 'call'
                                },
                                {
                                    id: 2,
                                    type: 'mail',
                                    title: 'Email',
                                    value: 'kma.club@example.com',
                                    action: 'email'
                                },
                                {
                                    id: 3,
                                    type: 'location',
                                    title: 'Địa chỉ',
                                    value: 'Tòa A, Trường Đại học KMA',
                                    action: 'map'
                                },
                                {
                                    id: 4,
                                    type: 'chat',
                                    title: 'Facebook',
                                    value: 'KMA Club Official',
                                    action: 'facebook'
                                }
                            ];
                            const key = `contactCache_${userId}`;
                            await AsyncStorage.setItem(key, JSON.stringify({
                                data: demoData,
                                timestamp: Date.now(),
                                isDemo: true
                            }));
                            if (!loggedScreens.has('contact')) {
                                loggedScreens.add('contact');
                            }
                        } catch (error) {
                            // Silent
                        }
                    })()
                );
                break;

            default:
                // Các trang khác - chưa có service
                break;
        }
    }

    // Chờ tất cả prefetch hoàn thành (không block UI)
    try {
        await Promise.allSettled(prefetchPromises);
    } catch (error) {
        // Silent error handling
    }
};

/**
 * Check current cached screens and log
 * @param {string} userId - User ID
 */
export const checkCurrentCache = async (userId) => {
    if (!userId) return;

    try {
        const { checkCachedScreens, loadFromCache } = require('../utils/cacheHelper');
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const cachedScreens = await checkCachedScreens(userId);

        if (cachedScreens.length > 0) {
            // Lấy số lượng cho từng màn hình
            const cacheInfoParts = [];

            for (const screen of cachedScreens) {
                try {
                    let count = 0;
                    let unit = '';
                    let isChatListHandled = false; // Flag để biết đã xử lý chatList chưa

                    switch (screen) {
                        case 'personalNotifications':
                            const notificationsCache = await loadFromCache(`notificationsCache_${userId}`);
                            if (notificationsCache && notificationsCache.data && Array.isArray(notificationsCache.data)) {
                                count = notificationsCache.data.length;
                                unit = 'notifications';
                            }
                            break;
                        case 'chatList':
                            try {
                                let conversations = null;
                                // Thử load từ cache với format mới
                                const conversationsCache = await loadFromCache(`conversations_cache_${userId}`);
                                if (conversationsCache && conversationsCache.data && Array.isArray(conversationsCache.data)) {
                                    conversations = conversationsCache.data;
                                    count = conversations.length;
                                    unit = 'conversations';
                                } else {
                                    // Thử load format cũ { conversations: [...], timestamp: ... }
                                    const cached = await AsyncStorage.getItem(`conversations_cache_${userId}`);
                                    if (cached) {
                                        const parsed = JSON.parse(cached);
                                        if (parsed.conversations && Array.isArray(parsed.conversations)) {
                                            conversations = parsed.conversations;
                                            count = conversations.length;
                                            unit = 'conversations';
                                        }
                                    }
                                }

                                // Đếm tổng số messages từ tất cả conversations
                                let totalMessagesCount = 0;
                                if (conversations && conversations.length > 0) {
                                    try {
                                        const { supabase } = require('../lib/supabase');
                                        const conversationIds = conversations.map(c => c.id);
                                        if (conversationIds.length > 0) {
                                            const { count: messagesCount } = await supabase
                                                .from('messages')
                                                .select('*', { count: 'exact', head: true })
                                                .in('conversation_id', conversationIds);
                                            totalMessagesCount = messagesCount || 0;
                                        }
                                    } catch (e) {
                                        // Silent
                                    }
                                }

                                // Format log với cả conversations và messages
                                if (count > 0) {
                                    if (totalMessagesCount > 0) {
                                        cacheInfoParts.push(`chatList (${count} conversations và ${totalMessagesCount} messages)`);
                                    } else {
                                        cacheInfoParts.push(`chatList (${count} conversations)`);
                                    }
                                    isChatListHandled = true; // Đánh dấu đã xử lý
                                }
                            } catch (e) {
                                // Silent
                            }
                            break;
                        case 'notifications':
                            const clubNotificationsCache = await loadFromCache(`clubNotificationsCache_${userId}`);
                            if (clubNotificationsCache && clubNotificationsCache.data && Array.isArray(clubNotificationsCache.data)) {
                                count = clubNotificationsCache.data.length;
                                unit = 'notifications';
                            }
                            break;
                        case 'documents':
                            const documentsCache = await loadFromCache(`documentsCache_${userId}`);
                            if (documentsCache && documentsCache.data && Array.isArray(documentsCache.data)) {
                                count = documentsCache.data.length;
                                unit = 'documents';
                            }
                            break;
                        case 'members':
                            const membersCache = await loadFromCache(`membersCache_${userId}`);
                            if (membersCache && membersCache.data && Array.isArray(membersCache.data)) {
                                count = membersCache.data.length;
                                unit = 'members';
                            }
                            break;
                        case 'activities':
                            const activitiesCache = await loadFromCache(`activitiesCache_${userId}`);
                            if (activitiesCache && activitiesCache.data && Array.isArray(activitiesCache.data)) {
                                count = activitiesCache.data.length;
                                unit = 'activities';
                            }
                            break;
                        case 'events':
                            const eventsCache = await loadFromCache(`eventsCache_${userId}`);
                            if (eventsCache && eventsCache.data && Array.isArray(eventsCache.data)) {
                                count = eventsCache.data.length;
                                unit = 'events';
                            }
                            break;
                        case 'profile':
                            const profilePostsCache = await loadFromCache(`profilePostsCache_${userId}`);
                            if (profilePostsCache && profilePostsCache.data && Array.isArray(profilePostsCache.data)) {
                                count = profilePostsCache.data.length;
                                unit = 'posts';
                            }
                            break;
                        case 'leaderboard':
                            const leaderboardCache = await loadFromCache(`leaderboardCache_${userId}`);
                            if (leaderboardCache && leaderboardCache.data && Array.isArray(leaderboardCache.data)) {
                                count = leaderboardCache.data.length;
                                unit = 'entries';
                            }
                            break;
                        case 'finance':
                            const financeCache = await loadFromCache(`financeCache_${userId}`);
                            if (financeCache && financeCache.data && Array.isArray(financeCache.data)) {
                                count = financeCache.data.length;
                                unit = 'transactions';
                            }
                            break;
                        case 'contact':
                            const contactCache = await loadFromCache(`contactCache_${userId}`);
                            if (contactCache && contactCache.data && Array.isArray(contactCache.data)) {
                                count = contactCache.data.length;
                                unit = 'contacts';
                            }
                            break;
                    }

                    // Chỉ push nếu chưa được xử lý đặc biệt (như chatList)
                    if (!isChatListHandled) {
                        if (count > 0 && unit) {
                            const info = `${screen} (${count} ${unit})`;
                            cacheInfoParts.push(info);
                        } else if (count > 0) {
                            const info = `${screen} (${count})`;
                            cacheInfoParts.push(info);
                        } else {
                            cacheInfoParts.push(screen);
                        }
                    }
                } catch (e) {
                    // Nếu có lỗi, vẫn hiển thị tên màn hình
                    cacheInfoParts.push(screen);
                }
            }

            console.log(` Cache hiện tại: ${cacheInfoParts.join(', ')}`);
        } else {
            console.log(' Cache hiện tại: không có');
        }
    } catch (error) {
        console.log('[Cache] Error checking cache:', error);
    }
};

export const prefetchService = {
    prefetchConversations,
    prefetchMessages,
    prefetchNotifications,
    smartPrefetch,
    resetLoggedScreens,
    checkCurrentCache
};

