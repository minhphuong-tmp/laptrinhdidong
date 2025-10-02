import React from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../assets/icons';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';

const TodoItem = ({ item, onToggle, onEdit, onDelete }) => {
    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'high': return '#FF4444';
            case 'medium': return '#FF9500';
            case 'low': return '#34C759';
            default: return theme.colors.gray;
        }
    };

    const getPriorityLabel = (priority) => {
        switch (priority) {
            case 'high': return 'Cao';
            case 'medium': return 'TB';
            case 'low': return 'Thấp';
            default: return '';
        }
    };

    const formatDeadline = (deadline) => {
        if (!deadline) return null;
        
        const date = new Date(deadline);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'Hôm nay';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Ngày mai';
        } else {
            return date.toLocaleDateString('vi-VN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
        }
    };

    const isOverdue = () => {
        if (!item.deadline || item.completed) return false;
        return new Date(item.deadline) < new Date();
    };

    const handleDelete = () => {
        Alert.alert(
            'Xóa ghi chú',
            'Bạn có chắc muốn xóa ghi chú này?',
            [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Xóa', style: 'destructive', onPress: () => onDelete(item.id) }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.todoItem}>
                {/* Checkbox */}
                <TouchableOpacity 
                    style={[
                        styles.checkbox,
                        item.completed && styles.checkboxCompleted
                    ]}
                    onPress={() => onToggle(item.id)}
                >
                    {item.completed && (
                        <Text style={styles.checkmark}>✓</Text>
                    )}
                </TouchableOpacity>

                {/* Content */}
                <View style={styles.content}>
                    <View style={styles.titleRow}>
                        <Text 
                            style={[
                                styles.title,
                                item.completed && styles.titleCompleted
                            ]}
                            numberOfLines={2}
                        >
                            {item.title}
                        </Text>
                        
                        {/* Priority Badge */}
                        <View style={[
                            styles.priorityBadge,
                            { backgroundColor: getPriorityColor(item.priority) }
                        ]}>
                            <Text style={styles.priorityText}>
                                {getPriorityLabel(item.priority)}
                            </Text>
                        </View>
                    </View>

                    {/* Description */}
                    {item.description && (
                        <Text 
                            style={[
                                styles.description,
                                item.completed && styles.descriptionCompleted
                            ]}
                            numberOfLines={2}
                        >
                            {item.description}
                        </Text>
                    )}

                    {/* Deadline */}
                    {item.deadline && (
                        <View style={styles.deadlineRow}>
                            <Text style={styles.deadlineIcon}>📅</Text>
                            <Text style={[
                                styles.deadline,
                                isOverdue() && styles.deadlineOverdue
                            ]}>
                                {formatDeadline(item.deadline)}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                    <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => onEdit(item)}
                    >
                        <Icon name="edit" size={hp(2)} color={theme.colors.textLight} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={handleDelete}
                    >
                        <Icon name="delete" size={hp(2)} color="#FF4444" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: hp(0.5),
    },

    todoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: theme.radius.lg,
        padding: wp(4),
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },

    checkbox: {
        width: wp(6),
        height: wp(6),
        borderRadius: wp(1), // Hình vuông với góc bo nhẹ
        borderWidth: 2,
        borderColor: '#000000', // Viền đen
        backgroundColor: 'transparent', // Nền trong suốt khi chưa tích
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: wp(3),
    },

    checkboxCompleted: {
        backgroundColor: theme.colors.primary,
    },

    checkmark: {
        fontSize: hp(2),
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
    },

    content: {
        flex: 1,
    },

    titleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: hp(0.5),
    },

    title: {
        flex: 1,
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
        marginRight: wp(2),
    },

    titleCompleted: {
        textDecorationLine: 'line-through',
        color: theme.colors.textLight,
    },

    priorityBadge: {
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.3),
        borderRadius: theme.radius.sm,
        minWidth: wp(8),
        alignItems: 'center',
    },

    priorityText: {
        fontSize: hp(1.2),
        fontWeight: theme.fonts.bold,
        color: 'white',
    },

    description: {
        fontSize: hp(1.5),
        color: theme.colors.textLight,
        marginBottom: hp(0.5),
        lineHeight: hp(2),
    },

    descriptionCompleted: {
        textDecorationLine: 'line-through',
        color: theme.colors.gray,
    },

    deadlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(1),
    },

    deadlineIcon: {
        fontSize: hp(1.6),
    },

    deadline: {
        fontSize: hp(1.4),
        color: theme.colors.textLight,
        fontWeight: theme.fonts.medium,
    },

    deadlineOverdue: {
        color: '#FF4444',
        fontWeight: theme.fonts.bold,
    },

    actionButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(2),
        marginLeft: wp(2),
    },

    actionButton: {
        padding: wp(2),
    },
});

export default TodoItem;