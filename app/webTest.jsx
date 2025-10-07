import { StyleSheet, Text, View } from 'react-native';

const WebTest = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>🚀 Kiểm tra Web App</Text>
            <Text style={styles.subtitle}>React Native Web đã hoạt động!</Text>
            <View style={styles.card}>
                <Text style={styles.cardTitle}>✅ Tính năng đã hoàn thành:</Text>
                <Text style={styles.feature}>• Chat realtime với Supabase</Text>
                <Text style={styles.feature}>• GroupAvatar cho nhóm chat</Text>
                <Text style={styles.feature}>• Nút xóa conversation</Text>
                <Text style={styles.feature}>• Realtime subscription</Text>
                <Text style={styles.feature}>• Mobile app hoạt động hoàn hảo</Text>
            </View>
            <View style={styles.card}>
                <Text style={styles.cardTitle}>⚠️ Web đang trong quá trình:</Text>
                <Text style={styles.feature}>• Sửa lỗi Metro bundler</Text>
                <Text style={styles.feature}>• Tối ưu cho web platform</Text>
                <Text style={styles.feature}>• RichTextEditor compatibility</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 18,
        color: '#666',
        marginBottom: 30,
        textAlign: 'center',
    },
    card: {
        backgroundColor: 'white',
        padding: 20,
        borderRadius: 12,
        marginVertical: 10,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 10,
    },
    feature: {
        fontSize: 14,
        color: '#666',
        marginVertical: 2,
    },
});

export default WebTest;

