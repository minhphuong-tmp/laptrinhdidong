import React, { useEffect, useState } from 'react';
import {
    Alert,
    Linking,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Header from '../../components/Header';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { loadContactCache } from '../../utils/cacheHelper';

const Contact = () => {
    const { user } = useAuth();
    const [message, setMessage] = useState('');

    // MOCK DATA - Thông tin liên hệ
    const [contactInfo, setContactInfo] = useState([
        {
            id: 1,
            type: 'phone',
            title: 'Hotline',
            value: '0123 456 789',
            action: 'call'
        },
        {
            id: 2,
            type: 'mail',
            title: 'Email',
            value: 'kma.club@example.com',
            action: 'email'
        },
        {
            id: 3,
            type: 'location',
            title: 'Địa chỉ',
            value: 'Tòa A, Trường Đại học KMA',
            action: 'map'
        },
        {
            id: 4,
            type: 'chat',
            title: 'Facebook',
            value: 'KMA Club Official',
            action: 'facebook'
        }
    ]);

    useEffect(() => {
        loadContact();
    }, []);

    const loadContact = async (useCache = true) => {
        // Load từ cache trước (nếu có)
        if (useCache && user?.id) {
            const cacheStartTime = Date.now();
            const cached = await loadContactCache(user.id);
            if (cached && cached.data && cached.data.length > 0) {
                const dataSize = JSON.stringify(cached.data).length;
                const dataSizeKB = (dataSize / 1024).toFixed(2);
                const loadTime = Date.now() - cacheStartTime;
                console.log('Load dữ liệu từ cache: contact');
                console.log(`- Dữ liệu đã load: ${cached.data.length} items (${dataSizeKB} KB)`);
                console.log(`- Tổng thời gian load: ${loadTime} ms`);
                setContactInfo(cached.data);
                return;
            }
        }
        console.log('Load dữ liệu từ CSDL: contact (demo data)');
    };

    const handleContact = async (item) => {
        try {
            switch (item.action) {
                case 'call':
                    await Linking.openURL(`tel:${item.value}`);
                    break;
                case 'email':
                    await Linking.openURL(`mailto:${item.value}`);
                    break;
                case 'map':
                    await Linking.openURL('https://maps.google.com');
                    break;
                case 'facebook':
                    await Linking.openURL('https://facebook.com/kma.club');
                    break;
                default:
                    Alert.alert('Thông báo', 'Chức năng đang được phát triển');
            }
        } catch (error) {
            Alert.alert('Lỗi', 'Không thể mở ứng dụng');
        }
    };

    const handleSendMessage = () => {
        if (message.trim()) {
            Alert.alert('Thành công', 'Tin nhắn đã được gửi! Chúng tôi sẽ phản hồi sớm nhất có thể.');
            setMessage('');
        } else {
            Alert.alert('Lỗi', 'Vui lòng nhập tin nhắn');
        }
    };

    const renderContactItem = (item) => (
        <TouchableOpacity
            style={styles.contactItem}
            onPress={() => handleContact(item)}
        >
            <View style={styles.contactIcon}>
                <Icon name={item.type} size={hp(2.5)} color={theme.colors.primary} />
            </View>
            <View style={styles.contactInfo}>
                <Text style={styles.contactTitle}>{item.title}</Text>
                <Text style={styles.contactValue}>{item.value}</Text>
            </View>
            <Icon name="arrowLeft" size={hp(2)} color={theme.colors.textSecondary} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Header title="Liên hệ và hỗ trợ" showBackButton />

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Thông tin liên hệ</Text>
                {contactInfo.map(renderContactItem)}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Gửi tin nhắn</Text>
                <View style={styles.messageContainer}>
                    <TextInput
                        style={styles.messageInput}
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Nhập tin nhắn của bạn..."
                        placeholderTextColor={theme.colors.textSecondary}
                        multiline
                        textAlignVertical="top"
                    />
                    <TouchableOpacity
                        style={styles.sendButton}
                        onPress={handleSendMessage}
                    >
                        <Icon name="send" size={hp(2)} color="white" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Câu hỏi thường gặp</Text>
                <View style={styles.faqContainer}>
                    <TouchableOpacity style={styles.faqItem}>
                        <Text style={styles.faqQuestion}>Làm thế nào để tham gia CLB?</Text>
                        <Icon name="arrowLeft" size={hp(2)} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.faqItem}>
                        <Text style={styles.faqQuestion}>Lịch hoạt động của CLB?</Text>
                        <Icon name="arrowLeft" size={hp(2)} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.faqItem}>
                        <Text style={styles.faqQuestion}>Quy định và điều lệ CLB?</Text>
                        <Icon name="arrowLeft" size={hp(2)} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Giờ làm việc</Text>
                <View style={styles.hoursContainer}>
                    <View style={styles.hoursItem}>
                        <Text style={styles.hoursDay}>Thứ 2 - Thứ 6</Text>
                        <Text style={styles.hoursTime}>8:00 - 17:00</Text>
                    </View>
                    <View style={styles.hoursItem}>
                        <Text style={styles.hoursDay}>Thứ 7</Text>
                        <Text style={styles.hoursTime}>8:00 - 12:00</Text>
                    </View>
                    <View style={styles.hoursItem}>
                        <Text style={styles.hoursDay}>Chủ nhật</Text>
                        <Text style={styles.hoursTime}>Nghỉ</Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 35, // Giống trang home và notifications
    },
    section: {
        backgroundColor: theme.colors.background,
        marginHorizontal: wp(4),
        marginVertical: hp(1),
        padding: wp(4),
        borderRadius: theme.radius.md,
        ...theme.shadows.small,
    },
    sectionTitle: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: hp(2),
    },
    contactItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: hp(1.5),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    contactIcon: {
        width: hp(4),
        height: hp(4),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: wp(3),
    },
    contactInfo: {
        flex: 1,
    },
    contactTitle: {
        fontSize: hp(1.5),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(0.3),
    },
    contactValue: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
    },
    messageContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    messageInput: {
        flex: 1,
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
        padding: wp(3),
        fontSize: hp(1.4),
        color: theme.colors.text,
        minHeight: hp(8),
        maxHeight: hp(15),
        marginRight: wp(2),
    },
    sendButton: {
        backgroundColor: theme.colors.primary,
        padding: wp(3),
        borderRadius: theme.radius.full,
        justifyContent: 'center',
        alignItems: 'center',
    },
    faqContainer: {
        marginTop: hp(1),
    },
    faqItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: hp(1.5),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    faqQuestion: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        flex: 1,
    },
    hoursContainer: {
        marginTop: hp(1),
    },
    hoursItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: hp(1),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    hoursDay: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
    },
    hoursTime: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
    },
});

export default Contact;



