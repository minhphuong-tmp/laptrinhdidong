import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../assets/icons';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';
import Button from './Button';

const AddTodoForm = ({ visible, onClose, onSave, editTodo = null }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('medium');
    const [deadline, setDeadline] = useState(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (visible) {
            if (editTodo) {
                // Edit mode - populate form with existing data
                setTitle(editTodo.title || '');
                setDescription(editTodo.description || '');
                setPriority(editTodo.priority || 'medium');
                setDeadline(editTodo.deadline ? new Date(editTodo.deadline) : null);
            } else {
                // Add mode - reset form
                resetForm();
            }
        }
    }, [visible, editTodo]);

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setPriority('medium');
        setDeadline(null);
    };

    const handleSave = () => {
        if (!title.trim()) {
            Alert.alert('Lỗi', 'Vui lòng nhập tiêu đề ghi chú');
            return;
        }

        const todoData = {
            title: title.trim(),
            description: description.trim(),
            priority,
            deadline: deadline ? deadline.toISOString() : null,
        };

        onSave(todoData);
        onClose();
    };

    const handleDateChange = (event, selectedDate) => {
        setShowDatePicker(false);
        if (selectedDate) {
            setDeadline(selectedDate);
        }
    };

    const formatDate = (date) => {
        if (!date) return 'Chọn ngày';
        return date.toLocaleDateString('vi-VN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getPriorityColor = (priorityLevel) => {
        switch (priorityLevel) {
            case 'high': return '#FF4444';
            case 'medium': return '#FF9500';
            case 'low': return '#34C759';
            default: return theme.colors.gray;
        }
    };

    const getPriorityLabel = (priorityLevel) => {
        switch (priorityLevel) {
            case 'high': return 'Cao';
            case 'medium': return 'Trung bình';
            case 'low': return 'Thấp';
            default: return '';
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose}>
                        <Icon name="arrowLeft" size={hp(3)} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {editTodo ? 'Sửa ghi chú' : 'Thêm ghi chú'}
                    </Text>
                    <View style={{ width: hp(3) }} />
                </View>

                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {/* Title Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Tiêu đề *</Text>
                        <TextInput
                            style={styles.textInput}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Nhập tiêu đề ghi chú..."
                            placeholderTextColor={theme.colors.textLight}
                            multiline
                            maxLength={100}
                        />
                    </View>

                    {/* Description Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Mô tả</Text>
                        <TextInput
                            style={[styles.textInput, styles.textArea]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Nhập mô tả chi tiết..."
                            placeholderTextColor={theme.colors.textLight}
                            multiline
                            numberOfLines={4}
                            maxLength={500}
                        />
                    </View>

                    {/* Priority Selection */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Độ ưu tiên</Text>
                        <View style={styles.priorityRow}>
                            {['low', 'medium', 'high'].map((level) => (
                                <TouchableOpacity
                                    key={level}
                                    style={[
                                        styles.priorityButton,
                                        priority === level && {
                                            backgroundColor: getPriorityColor(level),
                                            borderColor: getPriorityColor(level),
                                        }
                                    ]}
                                    onPress={() => setPriority(level)}
                                >
                                    <Text style={[
                                        styles.priorityText,
                                        priority === level && styles.priorityTextActive
                                    ]}>
                                        {getPriorityLabel(level)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Deadline Selection */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Hạn chót</Text>
                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <Text style={styles.dateButtonIcon}>📅</Text>
                            <Text style={[
                                styles.dateButtonText,
                                !deadline && styles.dateButtonPlaceholder
                            ]}>
                                {formatDate(deadline)}
                            </Text>
                            {deadline && (
                                <TouchableOpacity
                                    style={styles.clearDateButton}
                                    onPress={() => setDeadline(null)}
                                >
                                    <Icon name="delete" size={hp(2)} color={theme.colors.textLight} />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Save Button */}
                    <View style={styles.buttonContainer}>
                        <Button
                            title={editTodo ? 'Cập nhật' : 'Thêm ghi chú'}
                            onPress={handleSave}
                            buttonStyle={styles.saveButton}
                        />
                    </View>
                </ScrollView>

                {/* Date Picker */}
                {showDatePicker && (
                    <View style={styles.datePickerContainer}>
                        <DateTimePicker
                            value={deadline || new Date()}
                            mode="date"
                            display="spinner"
                            onChange={handleDateChange}
                            minimumDate={new Date()}
                            style={styles.datePicker}
                            locale="vi-VN"
                            textColor={theme.colors.text}
                        />
                        <View style={styles.datePickerButtons}>
                            <TouchableOpacity 
                                style={styles.datePickerButton}
                                onPress={() => setShowDatePicker(false)}
                            >
                                <Text style={styles.datePickerButtonText}>Hủy</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'white',
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.gray + '30',
    },

    headerTitle: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
    },

    content: {
        flex: 1,
        paddingHorizontal: wp(4),
        paddingTop: hp(2),
    },

    inputGroup: {
        marginBottom: hp(3),
    },

    label: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
        marginBottom: hp(1),
    },

    textInput: {
        borderWidth: 1,
        borderColor: theme.colors.gray + '50',
        borderRadius: theme.radius.md,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        fontSize: hp(1.7),
        color: theme.colors.text,
        backgroundColor: theme.colors.gray + '10',
    },

    textArea: {
        height: hp(12),
        textAlignVertical: 'top',
    },

    priorityRow: {
        flexDirection: 'row',
        gap: wp(3),
    },

    priorityButton: {
        flex: 1,
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(3),
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.gray + '50',
        backgroundColor: theme.colors.gray + '10',
        alignItems: 'center',
    },

    priorityText: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
    },

    priorityTextActive: {
        color: 'white',
        fontWeight: theme.fonts.bold,
    },

    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.gray + '50',
        borderRadius: theme.radius.md,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.gray + '10',
    },

    dateButtonIcon: {
        fontSize: hp(2),
        marginRight: wp(2),
    },

    dateButtonText: {
        flex: 1,
        fontSize: hp(1.7),
        color: theme.colors.text,
    },

    dateButtonPlaceholder: {
        color: theme.colors.textLight,
    },

    clearDateButton: {
        padding: wp(1),
    },

    buttonContainer: {
        paddingVertical: hp(3),
    },

    saveButton: {
        backgroundColor: theme.colors.primary,
    },

    datePickerContainer: {
        position: 'absolute',
        bottom: 0,
        left: wp(10), // Dịch sang phải
        right: wp(5),
        backgroundColor: 'white',
        borderTopLeftRadius: theme.radius.lg,
        borderTopRightRadius: theme.radius.lg,
        paddingTop: hp(2),
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: -2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },

    datePicker: {
        backgroundColor: 'white',
        height: hp(25),
        alignSelf: 'center', // Căn giữa picker
        width: '100%',
    },

    datePickerButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: hp(2),
        paddingHorizontal: wp(4),
        borderTopWidth: 1,
        borderTopColor: theme.colors.gray + '30',
    },

    datePickerButton: {
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(6),
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.gray + '20',
    },

    datePickerButtonText: {
        fontSize: hp(1.7),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        textAlign: 'center',
    },
});

export default AddTodoForm;
