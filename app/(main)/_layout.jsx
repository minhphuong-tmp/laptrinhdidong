import { Stack } from 'expo-router';
import { NavigationTracker } from '../../components/NavigationTracker';

const _layout = () => {
    return (
        <NavigationTracker>
            <Stack
                screenOptions={{
                    headerShown: false,
                }}
            >
                <Stack.Screen
                    name="home"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="members"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="activities"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="documents"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="events"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="leaderboard"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="finance"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="contact"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="test"
                    options={{
                        headerShown: false
                    }}
                />
                <Stack.Screen
                    name="notifications"
                    options={{
                        headerShown: false,
                        presentation: 'card',
                        animation: 'slide_from_right'
                    }}
                />
                <Stack.Screen
                    name="personalNotifications"
                    options={{
                        headerShown: false,
                        presentation: 'card',
                        animation: 'slide_from_right'
                    }}
                />
            </Stack>
        </NavigationTracker>
    )
}

export default _layout


