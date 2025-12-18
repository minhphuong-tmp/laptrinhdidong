import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY_PREFIX = 'conversations_cache_';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 phút

/**
 * Lấy cache key cho user
 */
const getCacheKey = (userId) => `${CACHE_KEY_PREFIX}${userId}`;

/**
 * Lưu conversations vào cache
 */
export const saveConversationsCache = async (userId, conversations) => {
    try {
        const cacheKey = getCacheKey(userId);
        const cacheData = {
            conversations,
            timestamp: Date.now()
        };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        console.log('💾 [Cache] Lỗi khi lưu cache:', error);
    }
};

/**
 * Load conversations từ cache
 */
export const loadConversationsCache = async (userId) => {
    try {
        const cacheKey = getCacheKey(userId);
        const cachedData = await AsyncStorage.getItem(cacheKey);

        if (!cachedData) {
            // No cache
            return null;
        }

        const { conversations, timestamp } = JSON.parse(cachedData);
        const age = Date.now() - timestamp;

        // Kiểm tra cache còn hiệu lực không (5 phút)
        if (age > CACHE_EXPIRY_MS) {
            // Cache expired
            await AsyncStorage.removeItem(cacheKey); // Xóa cache cũ
            return null;
        }

        return conversations;
    } catch (error) {
        // Silent on cache load error
        return null;
    }
};

/**
 * Xóa cache của user
 */
export const clearConversationsCache = async (userId) => {
    try {
        const cacheKey = getCacheKey(userId);
        await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
        // Silent on cache clear error
    }
};


