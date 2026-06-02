import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Interactive3DRobot from '../../components/Interactive3DRobot';
import ScreenWrapper from '../../components/ScreenWrapper';
import { hp } from '../../helpers/common';

export default function RobotDemo() {
    const handleLoadEnd = () => {
        // Robot animation loaded successfully
    };

    const handleError = (error) => {
        // Handle error if needed
    };

    return (
        <ScreenWrapper>
            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.content}>
                    <Interactive3DRobot
                        height={hp(60)}
                        onLoadEnd={handleLoadEnd}
                        onError={handleError}
                    />
                </View>
            </ScrollView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: hp(5),
        paddingHorizontal: 20,
        backgroundColor: '#000000',
    },
    content: {
        width: '100%',
        alignItems: 'center',
    },
});


