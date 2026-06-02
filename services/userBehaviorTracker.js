import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const CACHE_KEY_PREFIX = 'userBehavior_';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 giờ (cache lâu hơn vì chỉ là frequency)

/**
 * Lấy cache key cho user
 */
const getCacheKey = (userId) => `${CACHE_KEY_PREFIX}${userId}`;

/**
 * Lấy local cache
 */
const getLocalCache = async (userId) => {
    try {
        const key = getCacheKey(userId);
        const cachedData = await AsyncStorage.getItem(key);

        if (!cachedData) {
            return null;
        }

        const { behavior, timestamp } = JSON.parse(cachedData);
        const age = Date.now() - timestamp;

        // Kiểm tra cache còn hiệu lực không (24 giờ)
        if (age > CACHE_EXPIRY_MS) {
            // Cache expired
            await AsyncStorage.removeItem(key);
            return null;
        }

        return behavior;
    } catch (error) {
        console.log('💾 [Cache] Lỗi khi đọc cache:', error);
        return null;
    }
};

/**
 * Lưu local cache
 */
const saveLocalCache = async (userId, behavior) => {
    try {
        const key = getCacheKey(userId);
        const cacheData = {
            behavior,
            timestamp: Date.now()
        };
        await AsyncStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
        console.log('💾 [Cache] Lỗi khi lưu cache:', error);
    }
};

/**
 * Update local cache khi track visit (real-time sync)
 */
const updateLocalCache = async (userId, screenName) => {
    try {
        const behavior = await getLocalCache(userId) || {};
        behavior[screenName] = (behavior[screenName] || 0) + 1;
        await saveLocalCache(userId, behavior);
    } catch (error) {
        console.log('💾 [Cache] Lỗi khi update cache:', error);
    }
};

/**
 * Track screen visit (upsert vào database + update local cache)
 * @param {string} userId - User ID
 * @param {string} screenName - Tên screen ('home', 'chatList', 'notifications', etc.)
 */
export const trackScreenVisit = async (userId, screenName) => {
    if (!userId || !screenName) {
        return;
    }

    try {
        // 1. Query xem có record không
        const { data: existingData, error: queryError } = await supabase
            .from('user_behavior')
            .select('visit_count')
            .eq('user_id', userId)
            .eq('screen_name', screenName)
            .single();

        if (queryError && queryError.code !== 'PGRST116') { 
            console.log(' [Track] Lỗi khi query database:', queryError);
            await updateLocalCache(userId, screenName);
            return;
        }

        const currentCount = existingData?.visit_count || 0;
        const newCount = currentCount + 1;

        // Không log khi track "home"
        if (screenName !== 'home') {
        }

        // 2. Upsert vào database (insert hoặc update)
        const { error: upsertError } = await supabase
            .from('user_behavior')
            .upsert({
                user_id: userId,
                screen_name: screenName,
                visit_count: newCount,
                last_visit_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,screen_name'
            });

        if (upsertError) {
            console.log(' [Track] Lỗi khi upsert vào database:', upsertError);
            // Vẫn update local cache dù database fail
        } else {
            // Không log khi track "home"
            if (screenName !== 'home') {
            }
        }

        // 3. Update local cache ngay (real-time sync)
        await updateLocalCache(userId, screenName);
    } catch (error) {
        console.log(' [Track] Lỗi khi track visit:', error);
        // Vẫn update local cache dù có lỗi
        await updateLocalCache(userId, screenName);
    }
};

// Track đã log behavior để tránh log trùng lặp
const behaviorLogged = new Set();

/**
 * Get user behavior (từ cache hoặc database)
 * @param {string} userId - User ID
 * @param {boolean} shouldLog - Có log hay không (mặc định false)
 * @returns {Object} Behavior object { 'home': 50, 'chatList': 100, ... }
 */
export const getUserBehavior = async (userId, shouldLog = false) => {
    if (!userId) {
        return {};
    }

    try {
        // Luôn query database để lấy dữ liệu mới nhất
        const { data, error } = await supabase
            .from('user_behavior')
            .select('id, user_id, screen_name, visit_count, last_visit_at, created_at, updated_at')
            .eq('user_id', userId)
            .order('visit_count', { ascending: false });

        if (error) {
            console.log('❌ [Hành vi] Lỗi khi truy vấn database:', error);
            console.log('❌ [Hành vi] Chi tiết lỗi:', JSON.stringify(error, null, 2));

            // Fallback về cache nếu database fail
            const cached = await getLocalCache(userId);
            if (cached && shouldLog && !behaviorLogged.has(userId)) {
                const cachedWithoutHome = { ...cached };
                delete cachedWithoutHome.home;
                console.log(' [Hành vi người dùng - Từ Cache (DB lỗi)]:', JSON.stringify(cachedWithoutHome, null, 2));
                behaviorLogged.add(userId);
            }
            // Trả về format tương tự khi có data
            return { behavior: cached || {}, behaviorWithTimestamp: {} };
        }

        // Format và cache lại (bao gồm cả last_visit_at để sort khi frequency bằng nhau)
        const behavior = {};
        const behaviorWithTimestamp = {};
        if (data && data.length > 0) {
            data.forEach(item => {
                behavior[item.screen_name] = item.visit_count;
                behaviorWithTimestamp[item.screen_name] = {
                    visit_count: item.visit_count,
                    last_visit_at: item.last_visit_at
                };
            });
        }

        // Save vào cache để dùng lần sau
        await saveLocalCache(userId, behavior);

        // Chỉ log nếu được yêu cầu và chưa log trước đó
        if (shouldLog && !behaviorLogged.has(userId)) {
            const behaviorWithoutHome = { ...behavior };
            delete behaviorWithoutHome.home;
            console.log(' [Hành vi người dùng - Đã định dạng]:', JSON.stringify(behaviorWithoutHome, null, 2));
            behaviorLogged.add(userId);
        }

        // Trả về cả behavior và behaviorWithTimestamp để có thể sort theo last_visit_at
        return { behavior, behaviorWithTimestamp };
    } catch (error) {
        console.log('❌ [Hành vi] Lỗi khi lấy hành vi:', error);

        // Fallback về cache nếu có lỗi
        const cached = await getLocalCache(userId);
        if (cached && shouldLog && !behaviorLogged.has(userId)) {
            const cachedWithoutHome = { ...cached };
            delete cachedWithoutHome.home;
            console.log(' [Hành vi người dùng - Từ Cache (Lỗi)]:', JSON.stringify(cachedWithoutHome, null, 2));
            behaviorLogged.add(userId);
        }
        // Trả về format tương tự khi có data
        return { behavior: cached || {}, behaviorWithTimestamp: {} };
    }
};

/**
 * Clear cache của user (dùng khi logout hoặc reset)
 * @param {string} userId - User ID
 */
export const clearUserBehaviorCache = async (userId) => {
    try {
        const key = getCacheKey(userId);
        await AsyncStorage.removeItem(key);
        console.log('✅ [Cache] Đã xóa cache hành vi cho user:', userId);
    } catch (error) {
        console.log('❌ [Cache] Lỗi khi clear cache:', error);
    }
};

export const userBehaviorTracker = {
    trackScreenVisit,
    getUserBehavior,
    clearUserBehaviorCache
};

