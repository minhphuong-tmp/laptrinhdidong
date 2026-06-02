import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import AddTodoForm from '../../components/AddTodoForm';
import Header from '../../components/Header';
import Loading from '../../components/Loading';
import ScreenWrapper from '../../components/ScreenWrapper';
import TodoFilter from '../../components/TodoFilter';
import TodoItem from '../../components/TodoItem';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';
import { todoService } from '../../services/todoService';

const Todo = () => {
    const { user } = useAuth();
    const [todos, setTodos] = useState([]);
    const [filteredTodos, setFilteredTodos] = useState([]);
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editTodo, setEditTodo] = useState(null);
    const [todoStats, setTodoStats] = useState({});
    const subscriptionRef = useRef(null);

    // Load todos khi component mount
    useEffect(() => {
        if (user?.id) {
            loadTodos();
        } else {
            // Clear todos khi không có user
            setTodos([]);
            setFilteredTodos([]);
        }
    }, [user?.id]);

    // Realtime subscription để cập nhật notes
    useEffect(() => {
        if (!user?.id) return;

        // Cleanup existing subscription first
        if (subscriptionRef.current) {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
        }

        console.log('Setting up notes realtime subscription for user:', user.id);

        const channel = supabase
            .channel(`notes-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'notes',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                console.log('Notes realtime event:', payload);
                console.log('Current user ID:', user?.id);
                console.log('Payload user ID:', payload.new?.user_id);

                // Chỉ xử lý events của user hiện tại
                if (payload.new?.user_id !== user?.id) {
                    console.log('Ignoring event from different user');
                    return;
                }

                if (payload.eventType === 'INSERT') {
                    // Thêm note mới
                    setTodos(prev => [payload.new, ...prev]);
                } else if (payload.eventType === 'UPDATE') {
                    // Cập nhật note
                    setTodos(prev => prev.map(note =>
                        note.id === payload.new.id ? payload.new : note
                    ));
                } else if (payload.eventType === 'DELETE') {
                    // Xóa note
                    setTodos(prev => prev.filter(note => note.id !== payload.old.id));
                }
            })
            .subscribe((status) => {
                console.log('Notes channel status:', status);
            });

        subscriptionRef.current = channel;

        return () => {
            console.log('Unsubscribing from notes channel');
            if (subscriptionRef.current) {
                subscriptionRef.current.unsubscribe();
                subscriptionRef.current = null;
            }
        };
    }, [user?.id]);

    // Filter todos khi todos hoặc selectedFilter thay đổi
    useEffect(() => {
        filterAndSortTodos();
        calculateStats();
    }, [todos, selectedFilter]);

    const loadTodos = async () => {
        try {
            setLoading(true);
            const result = await todoService.getAllTodos();
            if (result.success) {
                setTodos(result.data);
            } else {
                Alert.alert('Lỗi', 'Không thể tải danh sách ghi chú');
            }
        } catch (error) {
            console.log('Error loading todos:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi tải dữ liệu');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const filterAndSortTodos = () => {
        const filtered = todoService.filterTodos(todos, selectedFilter);
        const sorted = todoService.sortTodos(filtered);
        setFilteredTodos(sorted);
    };

    const calculateStats = () => {
        const stats = {
            total: todos.length,
            active: todos.filter(t => !t.completed).length,
            completed: todos.filter(t => t.completed).length,
            today: todoService.filterTodos(todos, 'today').length,
            overdue: todoService.filterTodos(todos, 'overdue').length,
            upcoming: todoService.filterTodos(todos, 'upcoming').length,
        };
        setTodoStats(stats);
    };

    const handleAddTodo = async (todoData) => {
        try {
            const result = await todoService.addTodo(todoData);
            if (result.success) {
                // Không cần optimistic update vì realtime sẽ handle
                Alert.alert('Thành công', 'Đã thêm ghi chú mới');
            } else {
                Alert.alert('Lỗi', result.msg || 'Không thể thêm ghi chú');
            }
        } catch (error) {
            console.log('Error adding todo:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi thêm ghi chú');
        }
    };

    const handleUpdateTodo = async (todoData) => {
        try {
            const result = await todoService.updateTodo(editTodo.id, todoData);
            if (result.success) {
                // Không cần optimistic update vì realtime sẽ handle
                setEditTodo(null);
                Alert.alert('Thành công', 'Đã cập nhật ghi chú');
            } else {
                Alert.alert('Lỗi', result.msg || 'Không thể cập nhật ghi chú');
            }
        } catch (error) {
            console.log('Error updating todo:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi cập nhật ghi chú');
        }
    };

    const handleToggleTodo = async (todoId) => {
        try {
            const result = await todoService.toggleTodo(todoId);
            if (result.success) {
                // Không cần optimistic update vì realtime sẽ handle
                // Chỉ hiển thị thông báo nếu cần
            } else {
                Alert.alert('Lỗi', result.msg || 'Không thể cập nhật trạng thái');
            }
        } catch (error) {
            console.log('Error toggling todo:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi cập nhật trạng thái');
        }
    };

    const handleDeleteTodo = async (todoId) => {
        try {
            const result = await todoService.deleteTodo(todoId);
            if (result.success) {
                // Không cần optimistic update vì realtime sẽ handle
                Alert.alert('Thành công', 'Đã xóa ghi chú');
            } else {
                Alert.alert('Lỗi', result.msg || 'Không thể xóa ghi chú');
            }
        } catch (error) {
            console.log('Error deleting todo:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi xóa ghi chú');
        }
    };

    const handleEditTodo = (todo) => {
        setEditTodo(todo);
        setShowAddForm(true);
    };

    const handleFilterChange = (filter) => {
        setSelectedFilter(filter);
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadTodos();
    };

    const handleSaveTodo = (todoData) => {
        if (editTodo) {
            handleUpdateTodo(todoData);
        } else {
            handleAddTodo(todoData);
        }
    };

    const handleCloseForm = () => {
        setShowAddForm(false);
        setEditTodo(null);
    };

    const renderTodoItem = ({ item }) => (
        <TodoItem
            item={item}
            onToggle={handleToggleTodo}
            onEdit={handleEditTodo}
            onDelete={handleDeleteTodo}
        />
    );

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>
                {selectedFilter === 'all' ? 'Chưa có ghi chú nào' : 'Không có ghi chú phù hợp'}
            </Text>
            <Text style={styles.emptySubtitle}>
                {selectedFilter === 'all'
                    ? 'Hãy thêm ghi chú đầu tiên của bạn!'
                    : 'Thử thay đổi bộ lọc để xem ghi chú khác'
                }
            </Text>
        </View>
    );

    if (loading && !refreshing) {
        return (
            <ScreenWrapper bg="white">
                <View style={styles.container}>
                    <Header title="Ghi chú" />
                    <View style={styles.loadingContainer}>
                        <Loading size="large" />
                        <Text style={styles.loadingText}>Đang tải ghi chú...</Text>
                    </View>
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper bg="white">
            <View style={styles.container}>
                <Header title="Ghi chú" />

                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[theme.colors.primary]}
                        />
                    }
                >
                    {/* Filter Component */}
                    <TodoFilter
                        selectedFilter={selectedFilter}
                        onFilterChange={handleFilterChange}
                        todoStats={todoStats}
                    />

                    {/* Todo List */}
                    <View style={styles.todoListContainer}>
                        {filteredTodos.length > 0 ? (
                            <FlatList
                                data={filteredTodos}
                                keyExtractor={(item) => item.id}
                                renderItem={renderTodoItem}
                                scrollEnabled={false}
                                showsVerticalScrollIndicator={false}
                            />
                        ) : (
                            renderEmptyState()
                        )}
                    </View>
                </ScrollView>

                {/* Floating Add Button */}
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setShowAddForm(true)}
                >
                    <Icon name="plus" size={hp(3)} color="white" />
                </TouchableOpacity>

                {/* Add/Edit Todo Form */}
                <AddTodoForm
                    visible={showAddForm}
                    onClose={handleCloseForm}
                    onSave={handleSaveTodo}
                    editTodo={editTodo}
                />
            </View>
        </ScreenWrapper>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: wp(4),
    },

    content: {
        flex: 1,
        paddingBottom: hp(2),
    },

    todoListContainer: {
        marginTop: hp(1),
        paddingBottom: hp(10), // Space for floating button
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: hp(2),
    },

    loadingText: {
        fontSize: hp(1.8),
        color: theme.colors.textLight,
        textAlign: 'center',
    },

    emptyContainer: {
        alignItems: 'center',
        paddingVertical: hp(8),
        paddingHorizontal: wp(8),
    },

    emptyIcon: {
        fontSize: hp(8),
        marginBottom: hp(2),
    },

    emptyTitle: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: hp(1),
    },

    emptySubtitle: {
        fontSize: hp(1.6),
        color: theme.colors.textLight,
        textAlign: 'center',
        lineHeight: hp(2.2),
    },

    addButton: {
        position: 'absolute',
        bottom: hp(3),
        right: wp(6),
        width: wp(14),
        height: wp(14),
        borderRadius: wp(7),
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
});

export default Todo;
