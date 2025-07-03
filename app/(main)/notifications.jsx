import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Header from '../../components/Header'
import NotificationItem from '../../components/NotificationItem'
import ScreenWrapper from '../../components/ScreenWrapper'
import { theme } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'
import { hp, wp } from '../../helpers/common'
import { fetchNotification } from '../../services/notificationService'
const Notifications = () => {
    const [notifications, setNotification] = useState([])
    const { user } = useAuth();
    const router = useRouter();
    useEffect(() => {
        getNotificaionts();


    }, [])
    const getNotificaionts = async () => {
        let res = await fetchNotification(user?.id);
        if (res.success) {
            console.log('notifications', res.data);
            setNotification(res.data);
        }
    }
    return (
        <ScreenWrapper>
            <View style={styles.containner}>
                <Header title="Thông báo"></Header>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.lifeStyle}>
                    {
                        notifications.map(item => {
                            return (
                                <NotificationItem
                                    item={item}
                                    key={item?.id}
                                    router={router}
                                >

                                </NotificationItem>
                            )
                        })
                    }
                    {
                        notifications.length == 0 && (
                            <Text style={styles.noData}>Không có thông báo nào </Text>
                        )
                    }

                </ScrollView>
            </View>
        </ScreenWrapper >
    )
}

export default Notifications

const styles = StyleSheet.create({
    containner: {
        flex: 1,
        paddingHorizontal: wp(4),
    },
    lifeStyle: {
        paddingVertical: 20,
        gap: 10
    },
    noData: {
        fontSize: hp(2),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        textAlign: 'center',
    }
})