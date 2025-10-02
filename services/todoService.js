import AsyncStorage from '@react-native-async-storage/async-storage';

const TODO_STORAGE_KEY = '@todos';

export const todoService = {
    // Lấy tất cả todos
    getAllTodos: async () => {
        try {
            const todosJson = await AsyncStorage.getItem(TODO_STORAGE_KEY);
            if (todosJson) {
                const todos = JSON.parse(todosJson);
                return { success: true, data: todos };
            }
            return { success: true, data: [] };
        } catch (error) {
            console.log('Error getting todos:', error);
            return { success: false, msg: error.message, data: [] };
        }
    },

    // Thêm todo mới
    addTodo: async (todoData) => {
        try {
            const { data: currentTodos } = await todoService.getAllTodos();
            
            const newTodo = {
                id: Date.now().toString(), // Simple ID generation
                title: todoData.title,
                description: todoData.description || '',
                completed: false,
                priority: todoData.priority || 'medium', // low, medium, high
                deadline: todoData.deadline || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const updatedTodos = [...currentTodos, newTodo];
            await AsyncStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(updatedTodos));
            
            return { success: true, data: newTodo };
        } catch (error) {
            console.log('Error adding todo:', error);
            return { success: false, msg: error.message };
        }
    },

    // Cập nhật todo
    updateTodo: async (todoId, updateData) => {
        try {
            const { data: currentTodos } = await todoService.getAllTodos();
            
            const updatedTodos = currentTodos.map(todo => {
                if (todo.id === todoId) {
                    return {
                        ...todo,
                        ...updateData,
                        updatedAt: new Date().toISOString(),
                    };
                }
                return todo;
            });

            await AsyncStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(updatedTodos));
            
            const updatedTodo = updatedTodos.find(todo => todo.id === todoId);
            return { success: true, data: updatedTodo };
        } catch (error) {
            console.log('Error updating todo:', error);
            return { success: false, msg: error.message };
        }
    },

    // Xóa todo
    deleteTodo: async (todoId) => {
        try {
            const { data: currentTodos } = await todoService.getAllTodos();
            
            const updatedTodos = currentTodos.filter(todo => todo.id !== todoId);
            await AsyncStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(updatedTodos));
            
            return { success: true };
        } catch (error) {
            console.log('Error deleting todo:', error);
            return { success: false, msg: error.message };
        }
    },

    // Toggle completed status
    toggleTodo: async (todoId) => {
        try {
            const { data: currentTodos } = await todoService.getAllTodos();
            
            const todo = currentTodos.find(t => t.id === todoId);
            if (!todo) {
                return { success: false, msg: 'Todo not found' };
            }

            return await todoService.updateTodo(todoId, { 
                completed: !todo.completed 
            });
        } catch (error) {
            console.log('Error toggling todo:', error);
            return { success: false, msg: error.message };
        }
    },

    // Filter todos
    filterTodos: (todos, filter) => {
        switch (filter) {
            case 'active':
                return todos.filter(todo => !todo.completed);
            case 'completed':
                return todos.filter(todo => todo.completed);
            case 'today':
                const today = new Date().toDateString();
                return todos.filter(todo => {
                    if (!todo.deadline) return false;
                    return new Date(todo.deadline).toDateString() === today;
                });
            case 'overdue':
                const now = new Date();
                return todos.filter(todo => {
                    if (!todo.deadline || todo.completed) return false;
                    return new Date(todo.deadline) < now;
                });
            case 'upcoming':
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 7); // Next 7 days
                return todos.filter(todo => {
                    if (!todo.deadline || todo.completed) return false;
                    const deadlineDate = new Date(todo.deadline);
                    return deadlineDate > new Date() && deadlineDate <= tomorrow;
                });
            default: // 'all'
                return todos;
        }
    },

    // Sort todos by priority and deadline
    sortTodos: (todos) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        
        return todos.sort((a, b) => {
            // Completed todos go to bottom
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            
            // Sort by priority
            const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
            if (priorityDiff !== 0) return priorityDiff;
            
            // Sort by deadline (closest first)
            if (a.deadline && b.deadline) {
                return new Date(a.deadline) - new Date(b.deadline);
            }
            if (a.deadline) return -1;
            if (b.deadline) return 1;
            
            // Sort by creation date (newest first)
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    },

    // Clear all todos (for testing)
    clearAllTodos: async () => {
        try {
            await AsyncStorage.removeItem(TODO_STORAGE_KEY);
            return { success: true };
        } catch (error) {
            console.log('Error clearing todos:', error);
            return { success: false, msg: error.message };
        }
    }
};
