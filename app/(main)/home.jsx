import { useRouter } from 'expo-router';
import { Alert, Button, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../../assets/icons';
import ScreenWrapper from '../../components/ScreenWrapper';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';


const Home = () => {
    const { user, setAuth } = useAuth();
    const router = useRouter();


    const onLogout = async () => {
        // setAuth(null);
        const { error } = await supabase.auth.signOut();
        if (error) {
            Alert.alert('Logout', 'Error logging out. Please try again.');
        }
    }

    return (
        <ScreenWrapper>
            <View style={styles.container}>
                {/* header */}
                <View style={styles.header}>
                    <Text style={styles.title}>LinkUp</Text>
                    <View style={styles.icons}>
                        <Pressable onPress={() => router.push('chat')}>
                            <Icon name="chat" size={hp(3.2)} strokeWidth={2} color={theme.colors.text} />
                        </Pressable>
                        <Pressable onPress={() => router.push('notifications')}>
                            <Icon name="heart" size={hp(3.2)} strokeWidth={2} color={theme.colors.text} />
                        </Pressable>
                        <Pressable onPress={() => router.push('newPost')}>
                            <Icon name="plus" size={hp(3.2)} strokeWidth={2} color={theme.colors.text} />
                        </Pressable>
                        <Pressable onPress={() => router.push('profile')}>
                            <Icon name="user" size={hp(3.2)} strokeWidth={2} color={theme.colors.text} />
                        </Pressable>

                    </View>
                </View>
            </View>

            <Button title="logout" onPress={onLogout} />
        </ScreenWrapper>

    )
}

export default Home

const styles = StyleSheet.create({

    container: {
        flex: 1,
        // paddingHorizontal: wp(4),
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        marginHorizontal: wp(4),
    },

    title: {
        color: theme.colors.text,
        fontSize: hp(3.2),
        fontWeight: theme.fonts.bold,
    },

    avatarImage: {
        height: hp(4.3),
        width: hp(4.3),
        borderRadius: theme.radius.sm,
        borderCurve: 'continuous',
        borderColor: theme.colors.gray,
        borderWidth: 3,
    },

    icons: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 18,
    },


    listStyle: {
        paddingTop: 20,
        paddingHorizontal: wp(4),
    },

    noPosts: {
        fontSize: hp(2),
        textAlign: 'center',
        color: theme.colors.text,
    },

    pill: {
        position: 'absolute',
        right: -10,
        top: -4,
        height: hp(2.2),
        width: hp(2.2),
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: theme.colors.roseLight,
    },

    pillText: {
        color: 'white',
        fontSize: hp(1.2),
        fontWeight: theme.fonts.bold,
    },


})