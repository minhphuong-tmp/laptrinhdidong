import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Load data from cache
 * @param {string} key - Cache key
 * @param {number} maxAge - Maximum age in milliseconds (default: 30 minutes)
 * @returns {Promise<{data: any, fromCache: boolean} | null>}
 */
export const loadFromCache = async (key, maxAge = 30 * 60 * 1000) => {
    try {
        const cached = await AsyncStorage.getItem(key);
        if (!cached) {
            return null;
        }

        const parsed = JSON.parse(cached);
        const { data, timestamp, isDemo } = parsed;

        // Check if cache is expired
        const age = Date.now() - timestamp;
        if (age > maxAge) {
            // Cache expired, remove it
            await AsyncStorage.removeItem(key);
            return null;
        }

        return { data, fromCache: true, isDemo: isDemo || false, timestamp: parsed.timestamp };
    } catch (error) {
        console.log(`❌ [Cache] Error loading cache for ${key}:`, error);
        return null;
    }
};

/**
 * Save data to cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {boolean} isDemo - Whether this is demo data
 */
export const saveToCache = async (key, data, isDemo = false) => {
    try {
        await AsyncStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now(),
            isDemo
        }));
    } catch (error) {
        console.log(`❌ [Cache] Error saving cache for ${key}:`, error);
    }
};

/**
 * Load personal notifications from cache
 */
export const loadPersonalNotificationsCache = async (userId) => {
    return await loadFromCache(`notificationsCache_${userId}`);
};

/**
 * Load documents from cache
 */
export const loadDocumentsCache = async (userId) => {
    return await loadFromCache(`documentsCache_${userId}`);
};

/**
 * Load profile posts from cache
 */
export const loadProfilePostsCache = async (userId) => {
    return await loadFromCache(`profilePostsCache_${userId}`);
};

/**
 * Load members from cache
 */
export const loadMembersCache = async (userId) => {
    return await loadFromCache(`membersCache_${userId}`);
};

/**
 * Load activities from cache
 */
export const loadActivitiesCache = async (userId) => {
    return await loadFromCache(`activitiesCache_${userId}`);
};

/**
 * Load events from cache
 */
export const loadEventsCache = async (userId) => {
    return await loadFromCache(`eventsCache_${userId}`);
};

/**
 * Load club notifications from cache
 */
export const loadClubNotificationsCache = async (userId) => {
    return await loadFromCache(`clubNotificationsCache_${userId}`);
};

/**
 * Load leaderboard from cache
 */
export const loadLeaderboardCache = async (userId) => {
    return await loadFromCache(`leaderboardCache_${userId}`);
};

/**
 * Load finance from cache
 */
export const loadFinanceCache = async (userId) => {
    return await loadFromCache(`financeCache_${userId}`);
};

/**
 * Load contact from cache
 */
export const loadContactCache = async (userId) => {
    return await loadFromCache(`contactCache_${userId}`);
};

/**
 * Check which screens have cached data
 * @param {string} userId - User ID
 * @returns {Promise<Array<string>>} Array of screen names that have cache
 */
export const checkCachedScreens = async (userId) => {
    if (!userId) return [];

    const cachedScreens = [];
    const cacheKeys = [
        { key: `notificationsCache_${userId}`, screen: 'personalNotifications' },
        { key: `conversations_cache_${userId}`, screen: 'chatList' },
        { key: `documentsCache_${userId}`, screen: 'documents' },
        { key: `membersCache_${userId}`, screen: 'members' },
        { key: `activitiesCache_${userId}`, screen: 'activities' },
        { key: `eventsCache_${userId}`, screen: 'events' },
        { key: `clubNotificationsCache_${userId}`, screen: 'notifications' },
        { key: `profilePostsCache_${userId}`, screen: 'profile' },
        { key: `leaderboardCache_${userId}`, screen: 'leaderboard' },
        { key: `financeCache_${userId}`, screen: 'finance' },
        { key: `contactCache_${userId}`, screen: 'contact' }
    ];

    for (const { key, screen } of cacheKeys) {
        try {
            const cached = await AsyncStorage.getItem(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                // Check if cache is not expired (30 minutes)
                // Hỗ trợ cả format mới { data: [...], timestamp: ... } và format cũ { conversations: [...], timestamp: ... }
                if (parsed.timestamp) {
                    const age = Date.now() - parsed.timestamp;
                    if (age <= 30 * 60 * 1000) {
                        // Kiểm tra xem có data không (format mới) hoặc có conversations không (format cũ cho chatList)
                        if (parsed.data || parsed.conversations) {
                            cachedScreens.push(screen);
                        }
                    }
                }
            }
        } catch (error) {
            // Silent error
        }
    }

    return cachedScreens;
};

/**
 * Clear all cache for a user
 * @param {string} userId - User ID
 */
export const clearAllCache = async (userId) => {
    if (!userId) return;

    try {
        const cacheKeys = [
            `notificationsCache_${userId}`,
            `conversations_cache_${userId}`,
            `documentsCache_${userId}`,
            `membersCache_${userId}`,
            `activitiesCache_${userId}`,
            `eventsCache_${userId}`,
            `clubNotificationsCache_${userId}`,
            `profilePostsCache_${userId}`,
            `leaderboardCache_${userId}`,
            `financeCache_${userId}`,
            `contactCache_${userId}`
        ];

        // Clear all message caches (need to get all conversation IDs first)
        // For now, we'll clear them when needed

        await Promise.all(
            cacheKeys.map(key => AsyncStorage.removeItem(key))
        );

        console.log('🗑️ [Cache] Đã clear tất cả cache cho user:', userId);
    } catch (error) {
        console.log('❌ [Cache] Error clearing all cache:', error);
    }
};

