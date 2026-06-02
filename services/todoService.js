import { supabase } from '../lib/supabase';

export const todoService = {
    // Lấy tất cả todos của user hiện tại
    getAllTodos: async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.log('No authenticated user');
                return { success: false, msg: 'User not authenticated', data: [] };
            }

            console.log('Getting todos for user:', user.id);

            const { data: notes, error } = await supabase
                .from('notes')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.log('Error getting notes:', error);
                return { success: false, msg: error.message, data: [] };
            }

            console.log('Found notes:', notes?.length || 0);
            return { success: true, data: notes || [] };
        } catch (error) {
            console.log('Error getting notes:', error);
            return { success: false, msg: error.message, data: [] };
        }
    },

    // Thêm todo mới
    addTodo: async (todoData) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { success: false, msg: 'User not authenticated' };
            }

            const { data: newNote, error } = await supabase
                .from('notes')
                .insert({
                    user_id: user.id,
                    title: todoData.title,
                    description: todoData.description || '',
                    priority: todoData.priority || 'medium',
                    deadline: todoData.deadline || null,
                    completed: false
                })
                .select()
                .single();

            if (error) {
                console.log('Error adding note:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: newNote };
        } catch (error) {
            console.log('Error adding note:', error);
            return { success: false, msg: error.message };
        }
    },

    // Cập nhật todo
    updateTodo: async (todoId, updateData) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { success: false, msg: 'User not authenticated' };
            }

            const { data: updatedNote, error } = await supabase
                .from('notes')
                .update({
                    title: updateData.title,
                    description: updateData.description || '',
                    priority: updateData.priority || 'medium',
                    deadline: updateData.deadline || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', todoId)
                .eq('user_id', user.id) // Đảm bảo chỉ update notes của user hiện tại
                .select()
                .single();

            if (error) {
                console.log('Error updating note:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: updatedNote };
        } catch (error) {
            console.log('Error updating note:', error);
            return { success: false, msg: error.message };
        }
    },

    // Toggle trạng thái completed
    toggleTodo: async (todoId) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { success: false, msg: 'User not authenticated' };
            }

            // Lấy note hiện tại để toggle completed
            const { data: currentNote, error: fetchError } = await supabase
                .from('notes')
                .select('completed')
                .eq('id', todoId)
                .eq('user_id', user.id)
                .single();

            if (fetchError) {
                console.log('Error fetching note:', fetchError);
                return { success: false, msg: fetchError.message };
            }

            const { data: updatedNote, error } = await supabase
                .from('notes')
                .update({
                    completed: !currentNote.completed,
                    updated_at: new Date().toISOString()
                })
                .eq('id', todoId)
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) {
                console.log('Error toggling note:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: updatedNote };
        } catch (error) {
            console.log('Error toggling note:', error);
            return { success: false, msg: error.message };
        }
    },

    // Xóa todo
    deleteTodo: async (todoId) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { success: false, msg: 'User not authenticated' };
            }

            const { error } = await supabase
                .from('notes')
                .delete()
                .eq('id', todoId)
                .eq('user_id', user.id);

            if (error) {
                console.log('Error deleting note:', error);
                return { success: false, msg: error.message };
            }

            return { success: true };
        } catch (error) {
            console.log('Error deleting note:', error);
            return { success: false, msg: error.message };
        }
    },

    // Filter todos theo điều kiện
    filterTodos: (todos, filter) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

        switch (filter) {
            case 'active':
                return todos.filter(todo => !todo.completed);
            case 'completed':
                return todos.filter(todo => todo.completed);
            case 'today':
                return todos.filter(todo => {
                    if (!todo.deadline) return false;
                    const deadline = new Date(todo.deadline);
                    return deadline >= today && deadline < tomorrow;
                });
            case 'overdue':
                return todos.filter(todo => {
                    if (!todo.deadline || todo.completed) return false;
                    return new Date(todo.deadline) < today;
                });
            case 'upcoming':
                return todos.filter(todo => {
                    if (!todo.deadline) return false;
                    const deadline = new Date(todo.deadline);
                    return deadline >= tomorrow;
                });
            case 'high':
                return todos.filter(todo => todo.priority === 'high');
            case 'medium':
                return todos.filter(todo => todo.priority === 'medium');
            case 'low':
                return todos.filter(todo => todo.priority === 'low');
            default:
                return todos;
        }
    },

    // Sắp xếp todos theo thứ tự ưu tiên
    sortTodos: (todos) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };

        return todos.sort((a, b) => {
            // Completed todos go to bottom
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }

            // Sort by priority (high to low)
            const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
            if (priorityDiff !== 0) {
                return priorityDiff;
            }

            // Sort by deadline (earliest first, nulls last)
            if (!a.deadline && !b.deadline) return 0;
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return new Date(a.deadline) - new Date(b.deadline);
        });
    }
};