import { StyleSheet, Text, View } from 'react-native';
import Header from '../../components/Header';
import ScreenWrapper from '../../components/ScreenWrapper';
import { theme } from '../../constants/theme';
import { hp, wp } from '../../helpers/common';

const Stats = () => {
    return (
        <ScreenWrapper bg="white">
            <View style={styles.container}>
                <Header title="Thống kê" />

                <View style={styles.content}>
                    <Text style={styles.title}>Trang thống kê</Text>
                    <Text style={styles.subtitle}>Sẽ hiển thị thống kê người đăng nhiều bài nhất</Text>
                </View>
            </View>
        </ScreenWrapper>
    );
};

export default Stats;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: wp(4),
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
    },
    title: {
        fontSize: hp(3),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: hp(1.8),
        color: theme.colors.textLight,
        textAlign: 'center',
        paddingHorizontal: wp(10),
    },
});
