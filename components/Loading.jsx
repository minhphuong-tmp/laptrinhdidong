import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { theme } from '../constants/theme'


const Loading = ({ size = "60", color = theme.colors.primary }) => {
    return (
        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size={size} color={color} />
        </View>
    )
}

export default Loading

const styles = StyleSheet.create({})