import { Pressable, StyleSheet } from 'react-native';
import Icon from '../assets/icons';
import { theme } from '../constants/theme';

const BackButton = ({ size = 26, router }) => {
    const handleBack = () => {
        try {
            if (router?.canGoBack && router.canGoBack()) {
                router.back();
            } else {
                router.replace('/(main)/home');
            }
        } catch (error) {
            router.replace('/(main)/home');
        }
    };

    return (
        <Pressable onPress={handleBack} style={styles.button}>
            <Icon name="arrowLeft" strokeWidth={2.5} size={size} color={theme.colors.text}></Icon>
        </Pressable>
    )
}

export default BackButton

const styles = StyleSheet.create({
    button: {
        alignSelf: 'flex-start',
        padding: 5,
        borderRadius: theme.radius.sm,
        backgroundColor: 'rgba(0, 0, 0, 0.07)'
    },
})
