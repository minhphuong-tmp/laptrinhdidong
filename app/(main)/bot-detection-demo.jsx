import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import BotDetection from '../../components/BotDetection';
import ScreenWrapper from '../../components/ScreenWrapper';
import { hp } from '../../helpers/common';

export default function BotDetectionDemo() {
    return (
        <ScreenWrapper>
            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.content}>
                    <BotDetection
                        cardTitle="Bot Detection"
                        cardDescription="Experience fewer fraudulent sign-ups with our sophisticated, AI-driven bot detection that constantly adapts."
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
    },
    content: {
        width: '100%',
        alignItems: 'center',
    },
});


