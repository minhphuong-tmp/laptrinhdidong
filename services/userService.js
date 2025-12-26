import { supabase } from "../lib/supabase";

export const getUserData = async (userId) => {
    try {
        // Lấy dữ liệu từ bảng users tùy chỉnh
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select()
            .eq('id', userId)
            .single();

        // Lấy dữ liệu từ Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (userError) {
            console.log('User data error:', userError);
            return { success: false, msg: userError?.message };
        }

        if (authError) {
            console.log('Auth data error:', authError);
            return { success: false, msg: authError?.message };
        }

        // Merge dữ liệu từ cả hai nguồn
        const mergedData = {
            ...userData,
            email: authData.user?.email || userData.email, // Ưu tiên email từ auth
            email_confirmed_at: authData.user?.email_confirmed_at,
            created_at: authData.user?.created_at,
            updated_at: authData.user?.updated_at
        };


        return { success: true, data: mergedData };
    } catch (error) {
        console.log('got error: ', error);
        return { success: false, msg: error.message };
    }
};


export const updateUser = async (userId, data) => {
    try {
        const { error } = await supabase
            .from('users')
            .update(data)
            .eq('id', userId);

        if (error) {
            return { success: false, msg: error?.message };
        }

        return { success: true, data };
    } catch (error) {
        console.log('got error: ', error);
        return { success: false, msg: error.message };
    }

};
