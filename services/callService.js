import { supabase } from '../lib/supabase';

// ===== CALL REQUESTS =====

// Cleanup các cuộc gọi cũ
export const cleanupOldCalls = async (userId) => {
    try {
        console.log(`Cleaning up old calls for user: ${userId}`);

        // Xóa TẤT CẢ cuộc gọi của user này (không chỉ ringing)
        const { data, error } = await supabase
            .from('call_requests')
            .delete()
            .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
            .select('id, caller_id, receiver_id, status');

        if (error) {
            console.log('Cleanup old calls error:', error);
            return { success: false, msg: 'Không thể cleanup cuộc gọi cũ' };
        }

        console.log(`Cleaned up ${data?.length || 0} old calls for user: ${userId}`);
        return { success: true };
    } catch (error) {
        console.log('Cleanup old calls error:', error);
        return { success: false, msg: 'Không thể cleanup cuộc gọi cũ' };
    }
};

// Tạo cuộc gọi mới
export const createCallRequest = async (data) => {
    try {
        console.log('=== CREATE CALL REQUEST DEBUG ===');
        console.log('Caller ID:', data.callerId);
        console.log('Receiver ID:', data.receiverId);
        console.log('Conversation ID:', data.conversationId);
        console.log('Call Type:', data.callType || 'voice');

        // Cleanup các cuộc gọi cũ trước
        console.log('Step 1: Cleaning up old calls...');
        const cleanup1 = await cleanupOldCalls(data.callerId);
        const cleanup2 = await cleanupOldCalls(data.receiverId);
        console.log('Cleanup results:', { cleanup1, cleanup2 });

        // Kiểm tra xem có calls nào còn lại không
        console.log('Step 2: Checking for existing calls...');
        const { data: existingCalls, error: checkError } = await supabase
            .from('call_requests')
            .select('id, caller_id, receiver_id, status')
            .or(`caller_id.eq.${data.callerId},receiver_id.eq.${data.callerId}`)
            .or(`caller_id.eq.${data.receiverId},receiver_id.eq.${data.receiverId}`);

        if (checkError) {
            console.log('Check existing calls error:', checkError);
        } else {
            console.log('Existing calls found:', existingCalls);
        }

        // Xóa tất cả records cũ để tránh conflict
        console.log('Step 3: Deleting old records...');

        // Xóa records của caller
        const { data: deleted1, error: deleteError1 } = await supabase
            .from('call_requests')
            .delete()
            .or(`caller_id.eq.${data.callerId},receiver_id.eq.${data.callerId}`)
            .select('id');

        // Xóa records của receiver
        const { data: deleted2, error: deleteError2 } = await supabase
            .from('call_requests')
            .delete()
            .or(`caller_id.eq.${data.receiverId},receiver_id.eq.${data.receiverId}`)
            .select('id');

        if (deleteError1) {
            console.log('Delete error 1:', deleteError1);
        } else {
            console.log('Deleted caller records:', deleted1?.length || 0);
        }
        if (deleteError2) {
            console.log('Delete error 2:', deleteError2);
        } else {
            console.log('Deleted receiver records:', deleted2?.length || 0);
        }

        console.log('Force delete completed');

        // Kiểm tra lại xem còn records nào không
        console.log('Step 4: Final check for remaining records...');
        const { data: remainingCalls, error: finalCheckError } = await supabase
            .from('call_requests')
            .select('id, caller_id, receiver_id, status')
            .or(`caller_id.eq.${data.callerId},receiver_id.eq.${data.callerId}`)
            .or(`caller_id.eq.${data.receiverId},receiver_id.eq.${data.receiverId}`);

        if (finalCheckError) {
            console.log('Final check error:', finalCheckError);
        } else {
            console.log('Remaining calls after delete:', remainingCalls?.length || 0);
            if (remainingCalls && remainingCalls.length > 0) {
                console.log('Remaining calls:', remainingCalls);
            }
        }

        // Tạo cuộc gọi mới
        console.log('Step 5: Creating new call...');
        const { data: callRequest, error } = await supabase
            .from('call_requests')
            .insert({
                caller_id: data.callerId,
                receiver_id: data.receiverId,
                conversation_id: data.conversationId,
                call_type: data.callType || 'voice',
                status: 'ringing',
                created_at: new Date().toISOString()
            })
            .select(`
                *,
                caller:users!call_requests_caller_id_fkey(id, name, image),
                receiver:users!call_requests_receiver_id_fkey(id, name, image)
            `)
            .single();

        if (error) {
            console.log('createCallRequest error:', error);
            console.log('Error details:', JSON.stringify(error, null, 2));
            return { success: false, msg: 'Không thể tạo cuộc gọi' };
        }

        console.log('Call created successfully:', callRequest);
        return { success: true, data: callRequest };
    } catch (error) {
        console.log('createCallRequest catch error:', error);
        return { success: false, msg: 'Không thể tạo cuộc gọi' };
    }
};

// Trả lời cuộc gọi
export const answerCall = async (callId) => {
    try {
        const { data, error } = await supabase
            .from('call_requests')
            .update({
                status: 'answered',
                answered_at: new Date().toISOString()
            })
            .eq('id', callId)
            .select(`
                *,
                caller:users!call_requests_caller_id_fkey(id, name, image),
                receiver:users!call_requests_receiver_id_fkey(id, name, image)
            `)
            .single();

        if (error) {
            console.log('answerCall error:', error);
            return { success: false, msg: 'Không thể trả lời cuộc gọi' };
        }

        return { success: true, data };
    } catch (error) {
        console.log('answerCall error:', error);
        return { success: false, msg: 'Không thể trả lời cuộc gọi' };
    }
};

// Từ chối cuộc gọi
export const declineCall = async (callId) => {
    try {
        const { data, error } = await supabase
            .from('call_requests')
            .update({
                status: 'declined',
                ended_at: new Date().toISOString()
            })
            .eq('id', callId)
            .select(`
                *,
                caller:users!call_requests_caller_id_fkey(id, name, image),
                receiver:users!call_requests_receiver_id_fkey(id, name, image)
            `)
            .single();

        if (error) {
            console.log('declineCall error:', error);
            return { success: false, msg: 'Không thể từ chối cuộc gọi' };
        }

        return { success: true, data };
    } catch (error) {
        console.log('declineCall error:', error);
        return { success: false, msg: 'Không thể từ chối cuộc gọi' };
    }
};

// Kết thúc cuộc gọi
export const endCall = async (callId, duration = 0) => {
    try {
        // First, get the current call data to check answered_at
        const { data: currentCall, error: fetchError } = await supabase
            .from('call_requests')
            .select('answered_at, ended_at, duration')
            .eq('id', callId)
            .single();

        let finalDuration = duration;

        // Always recalculate from timestamps if available (most accurate)
        // Priority: 1) Calculate from answered_at and ended_at, 2) Use existing duration, 3) Use passed duration
        if (currentCall && !fetchError) {
            if (currentCall.answered_at && currentCall.ended_at) {
                // Both timestamps available - calculate from them (most accurate)
                const answeredTime = new Date(currentCall.answered_at);
                const endedTime = new Date(currentCall.ended_at);
                const calculatedDuration = Math.floor((endedTime.getTime() - answeredTime.getTime()) / 1000);
                if (calculatedDuration >= 0) {
                    finalDuration = calculatedDuration;
                    console.log('📞 Calculated duration from timestamps in endCall:', finalDuration, 'seconds', {
                        answered_at: currentCall.answered_at,
                        ended_at: currentCall.ended_at,
                        calculated: finalDuration
                    });
                } else {
                    console.log('⚠️ Calculated duration is negative, using existing duration');
                    finalDuration = currentCall.duration || duration || 0;
                }
            } else if (currentCall.answered_at && !currentCall.ended_at) {
                // Only answered_at available - calculate from answered_at to now
                const answeredTime = new Date(currentCall.answered_at);
                const endedTime = new Date(); // Current time (will be set as ended_at)
                const calculatedDuration = Math.floor((endedTime.getTime() - answeredTime.getTime()) / 1000);
                if (calculatedDuration >= 0) {
                    finalDuration = calculatedDuration;
                    console.log('📞 Calculated duration from answered_at to now:', finalDuration, 'seconds');
                } else {
                    finalDuration = currentCall.duration || duration || 0;
                }
            } else if (currentCall.duration && currentCall.duration > 0) {
                // Use existing duration from database if available
                finalDuration = currentCall.duration;
                console.log('📞 Using existing duration from database:', finalDuration, 'seconds');
            }
        }

        // Prepare update data
        const updateData = {
            status: 'ended'
        };

        // Only update ended_at if it's not already set (to preserve the original end time)
        const endedAtTime = currentCall?.ended_at ? new Date(currentCall.ended_at) : new Date();
        if (!currentCall?.ended_at) {
            updateData.ended_at = endedAtTime.toISOString();
        }

        // Recalculate duration from answered_at and ended_at after setting ended_at
        if (currentCall?.answered_at) {
            const answeredTime = new Date(currentCall.answered_at);
            const calculatedDuration = Math.floor((endedAtTime.getTime() - answeredTime.getTime()) / 1000);
            if (calculatedDuration >= 0) {
                finalDuration = calculatedDuration;
                console.log('📞 Recalculated duration after setting ended_at:', finalDuration, 'seconds', {
                    answered_at: currentCall.answered_at,
                    ended_at: updateData.ended_at || currentCall.ended_at,
                    calculated: finalDuration
                });
            }
        }

        updateData.duration = finalDuration;

        const { data, error } = await supabase
            .from('call_requests')
            .update(updateData)
            .eq('id', callId)
            .select(`
                *,
                caller:users!call_requests_caller_id_fkey(id, name, image),
                receiver:users!call_requests_receiver_id_fkey(id, name, image)
            `)
            .single();

        if (error) {
            console.log('endCall error:', error);
            return { success: false, msg: 'Không thể kết thúc cuộc gọi' };
        }

        return { success: true, data };
    } catch (error) {
        console.log('endCall error:', error);
        return { success: false, msg: 'Không thể kết thúc cuộc gọi' };
    }
};

// Lấy cuộc gọi đang ring
export const getActiveCall = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('call_requests')
            .select(`
                *,
                caller:users!call_requests_caller_id_fkey(id, name, image),
                receiver:users!call_requests_receiver_id_fkey(id, name, image)
            `)
            .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
            .in('status', ['ringing', 'answered'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            console.log('getActiveCall error:', error);
            return { success: false, msg: 'Không thể lấy cuộc gọi' };
        }

        return { success: true, data: data || null };
    } catch (error) {
        console.log('getActiveCall error:', error);
        return { success: false, msg: 'Không thể lấy cuộc gọi' };
    }
};

// ===== CALL HISTORY =====

// Lấy lịch sử cuộc gọi
export const getCallHistory = async (userId, limit = 50, offset = 0) => {
    try {
        const { data, error } = await supabase
            .from('call_history')
            .select(`
                *,
                caller:users!call_history_caller_id_fkey(id, name, image),
                receiver:users!call_history_receiver_id_fkey(id, name, image)
            `)
            .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.log('getCallHistory error:', error);
            return { success: false, msg: 'Không thể lấy lịch sử cuộc gọi' };
        }

        return { success: true, data };
    } catch (error) {
        console.log('getCallHistory error:', error);
        return { success: false, msg: 'Không thể lấy lịch sử cuộc gọi' };
    }
};

// Xóa lịch sử cuộc gọi
export const deleteCallHistory = async (callId) => {
    try {
        const { error } = await supabase
            .from('call_history')
            .delete()
            .eq('id', callId);

        if (error) {
            console.log('deleteCallHistory error:', error);
            return { success: false, msg: 'Không thể xóa lịch sử cuộc gọi' };
        }

        return { success: true };
    } catch (error) {
        console.log('deleteCallHistory error:', error);
        return { success: false, msg: 'Không thể xóa lịch sử cuộc gọi' };
    }
};
