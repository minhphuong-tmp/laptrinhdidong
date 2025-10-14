import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { hp } from '../helpers/common';
import { getUserImageSrc } from '../services/imageService';

const Avatar = ({
    uri,
    size = hp(4.5),
    rounded = theme.radius.md,
    style = {}
}) => {
    const borderRadius = rounded === true ? size / 2 : rounded;

    return (
        <Image
            source={getUserImageSrc(uri)}
            transition={100}
            style={[styles.avatar, { height: size, width: size, borderRadius }, style]}
        />
    );
};

export default Avatar;

const styles = StyleSheet.create({
    avatar: {
        borderCurve: 'continuous',
    },
});
