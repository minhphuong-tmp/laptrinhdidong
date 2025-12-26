import { unreadService } from './unreadService';
import { userBehaviorTracker } from './userBehaviorTracker';

/**
 * Get predictions (kết hợp unread + frequency)
 * Logic:
 * - Nếu có unread messages → Prefetch chatList (100% priority)
 * - Nếu có unread notifications → Prefetch notifications (100% priority)
 * - Sau đó lấy top sidebar items theo frequency:
 *   - Nếu đã có unread → chỉ lấy top 1 sidebar item
 *   - Nếu không có unread → lấy top 3 sidebar items
 * 
 * @param {string} userId - User ID
 * @returns {Array} Array of predictions [{ screen: string, priority: number, reason: string }]
 */
export const getPredictions = async (userId) => {
    if (!userId) {
        return [];
    }

    try {
        const predictions = [];

        // Bước 1: Check unread (từ database, không cache)
        const { messages: unreadMessages, notifications: unreadNotifications } =
            await unreadService.getAllUnreadCounts(userId);

        // Bước 2: Nếu có unread → Ưu tiên 100%
        if (unreadMessages > 0) {
            predictions.push({
                screen: 'chatList',
                priority: 100,
                reason: 'unread_messages'
            });
        }

        if (unreadNotifications > 0) {
            predictions.push({
                screen: 'personalNotifications', // Thông báo cá nhân, không phải notifications CLB
                priority: 100,
                reason: 'unread_notifications'
            });
        }

        // Bước 3: Lấy top sidebar items
        // Tính số lượng đã có trong predictions (unread items)
        const unreadItemsCount = (unreadMessages > 0 ? 1 : 0) + (unreadNotifications > 0 ? 1 : 0);
        // Lấy top 3 tổng cộng, trừ đi số lượng unread items đã có
        const topCount = 3 - unreadItemsCount;

        const { behavior, behaviorWithTimestamp } = await userBehaviorTracker.getUserBehavior(userId);

        // Filter sidebar items (bao gồm cả chatList để tính frequency, nhưng loại trừ 'home' và 'personalNotifications')
        // 'notifications' là sidebar item (thông báo CLB), 'personalNotifications' là thông báo cá nhân
        const sidebarItems = [
            'chatList', // Thêm chatList để tính frequency
            'notifications', // Thông báo CLB
            'members',
            'activities',
            'documents',
            'events',
            'leaderboard',
            'finance',
            'contact',
            'profile'
        ];

        // Loại trừ các màn hình đã được thêm ở bước 2 (unread items)
        const excludedScreens = [];
        if (unreadMessages > 0) {
            excludedScreens.push('chatList');
        }
        if (unreadNotifications > 0) {
            excludedScreens.push('personalNotifications');
        }

        const sidebarBehavior = {};
        sidebarItems.forEach(item => {
            // Bỏ qua các màn hình đã được thêm ở bước 2
            if (excludedScreens.includes(item)) {
                return;
            }
            if (behavior[item]) {
                sidebarBehavior[item] = behavior[item];
            }
        });

        // Lấy top N sidebar items
        // Sort: 1) Theo frequency (visit_count) descending, 2) Nếu bằng nhau thì theo last_visit_at (mới hơn = ưu tiên hơn)
        const itemsWithTimestamp = Object.entries(sidebarBehavior)
            .map(([screen, count]) => {
                const timestamp = behaviorWithTimestamp[screen]?.last_visit_at;
                return { screen, count, timestamp };
            });

        // Format timestamp thành dạng dễ đọc
        const formatTimestamp = (timestamp) => {
            if (!timestamp) return 'N/A';
            const date = new Date(timestamp);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        };

        // Sort trước
        const sorted = itemsWithTimestamp
            .sort((a, b) => {
                // Nếu frequency khác nhau → sort theo frequency
                if (b.count !== a.count) {
                    return b.count - a.count;
                }

                // Nếu frequency bằng nhau → sort theo last_visit_at (mới hơn = ưu tiên hơn)
                if (!a.timestamp && !b.timestamp) return 0;
                if (!a.timestamp) return 1; // A không có timestamp → ưu tiên B
                if (!b.timestamp) return -1; // B không có timestamp → ưu tiên A

                // So sánh timestamp (mới hơn = lớn hơn)
                return new Date(b.timestamp) - new Date(a.timestamp);
            });

        // Lấy top N
        const topItems = sorted.slice(0, topCount);

        // Log so sánh khi có sự lựa chọn (nhiều hơn 1 item cùng frequency với item cuối trong top N)
        if (topItems.length > 0) {
            const lastItemFrequency = topItems[topItems.length - 1].count;

            // Tìm tất cả items có cùng frequency với item cuối cùng trong top N
            const sameFrequencyItems = sorted.filter(item => item.count === lastItemFrequency);

            // Nếu có nhiều hơn 1 item cùng frequency → cần so sánh và lựa chọn
            if (sameFrequencyItems.length > 1) {
                const sortedByTime = [...sameFrequencyItems].sort((a, b) => {
                    if (!a.timestamp && !b.timestamp) return 0;
                    if (!a.timestamp) return 1;
                    if (!b.timestamp) return -1;
                    return new Date(b.timestamp) - new Date(a.timestamp);
                });

                // Log so sánh tất cả các màn hình cùng frequency (kể cả không nằm trong top N)
                const comparisonText = sortedByTime
                    .map(item => `${item.screen} (${formatTimestamp(item.timestamp)})`)
                    .join(' và ');
                console.log(`🔍 So sánh ${comparisonText}`);
            }
        }

        // Convert về format [screen, count]
        const sortedFormatted = topItems.map(({ screen, count }) => [screen, count]);

        sortedFormatted.forEach(([screen, count]) => {
            predictions.push({
                screen,
                priority: count, // Dùng visit_count làm priority
                reason: 'frequency'
            });
        });
        return predictions;
    } catch (error) {
        console.log('❌ [Prediction] Lỗi khi get predictions:', error);
        return [];
    }
};

export const predictionService = {
    getPredictions
};


