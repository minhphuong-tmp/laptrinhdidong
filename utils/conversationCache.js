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
        console.log('💾 [Cache] Đã lưu conversations:', conversations.length, 'items');
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
            console.log('💾 [Cache] Không có cache');
            return null;
        }

        const { conversations, timestamp } = JSON.parse(cachedData);
        const age = Date.now() - timestamp;

        // Kiểm tra cache còn hiệu lực không (5 phút)
        if (age > CACHE_EXPIRY_MS) {
            console.log('💾 [Cache] Cache đã hết hạn:', Math.round(age / 1000), 'giây');
            await AsyncStorage.removeItem(cacheKey); // Xóa cache cũ
            return null;
        }

        console.log('💾 [Cache] Đã load từ cache:', conversations.length, 'items, tuổi:', Math.round(age / 1000), 'giây');
        return conversations;
    } catch (error) {
        console.log('💾 [Cache] Lỗi khi load cache:', error);
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
        console.log('💾 [Cache] Đã xóa cache');
    } catch (error) {
        console.log('💾 [Cache] Lỗi khi xóa cache:', error);
    }
};


