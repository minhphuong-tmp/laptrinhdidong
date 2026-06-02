import React, { useState } from 'react';
import { View, Text, Image, ImageBackground, Pressable, ScrollView, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';

const Finance = () => {
    const router = useRouter();
    const [activeFilter, setActiveFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Event data
    const events = [
        {
            id: 1,
            title: 'Workshop: Intro to React Native',
            date: '14:00 - 20/10/2023',
            location: 'Hội trường B, Tòa nhà CNTT',
            status: 'upcoming',
            statusText: 'Sắp diễn ra',
            statusColor: 'primary',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAUBeGzTzmSZGFp69U3ZJKc9mdQGPTadKuKNZM6seYH0VFv39yh7bxDvzyOTjbtloaXz6kINAHUiaG6sFKaxqj7RUt9puw_vkxiYFM3Yls4EWgQMTDlC63ajIpRjlbFGmkrKDQWovSrQ528eNBU8xrwthQOAOZ4f35Yt5aoz_P-SmuyEx4hN1ocSUl1AG2VMSLa1-UpBx-zPu0Yg11A-AN9HcfYxVlcZtDBCSvYNQVlV6zeVMtod-qZuA_BOx36r7hIUBUlgkgGHG5F',
            participants: 45,
            actionButton: { text: 'Đăng ký ngay', type: 'primary' }
        },
        {
            id: 2,
            title: 'AI Challenge Hackathon 2023',
            date: '08:00 - 05/11/2023',
            location: 'Innovation Hub, Tầng 3',
            status: 'registered',
            statusText: 'Đã đăng ký',
            statusColor: 'emerald',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC2kR5vIOfO9apWLfdMMIXAsfZY9NYhcNtsMHFyaDYMO5-w7fHTaMdMKfBlmxYR_wg5SaBZIglqqjFy4eqK9c_JICXn4YNnP9QgxPAQBCdu1Gz8qDXVN4UT5S1hxbchpPPeZ-Q-igrBbr62zVIkO7ed6IgwSXT5zP6FVPvsPMswHg5rlwunvlRDz6uSiFoYjJBDHjAXb9dEFvZs19wItzBfRHRjC8vpVmST-paGJvomYixrJ-RdAyLQj-cWnlu6ZXnQFBuFKTIPMpQF',
            hasTicket: true,
            actionButton: { text: 'Chi tiết', type: 'secondary' }
        },
        {
            id: 3,
            title: 'Teambuilding: Kết nối thành viên',
            date: '15/09/2023 • CV Thống Nhất',
            status: 'ended',
            statusText: 'Đã kết thúc',
            statusColor: 'gray',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAz7OZxwoyrmAT0MlKQylqqxiECmZ8_gcLop_3WxIFuLsklFRdz2_HgJczNFIgIIKz8IgsFOzN99HHXsZyJiTQQqFC0LdLDke4CTSA_i9YYUKA-HraYsaNJ73hslbA9S4DwRI4VIe3ydOGNpni0PFry9vt7s4upS-GUEYpDnV5kZytWU8IFmcOz1tOT9oyyS6Igjbgjk2d4rizpAjNUpdiJQmFdfcV012iKG952ztyyPnQz-lkPjG8y6GiLGFvInUYAOMyxImBYHibn',
            isAdmin: true,
            isCompact: true
        },
        {
            id: 4,
            title: 'Seminar: Tech Trends 2024',
            date: '09:00 - 12/11/2023',
            location: 'Hội trường A',
            slotsRemaining: 15,
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDtPZsBldz5zS-kvprjdJOZNothxYIqLhmRYUX9l3gWWEOFdnUG9Nluj-J2hLVpxgCVXQgI2QysM5RMy13sF37tEanWVFigToNtVBEk_qowV8KbxaTvCB-prX8OqpT7M7l4r3dpuZwcH_WLZuWSepWNFnL_vqIwes47OmPE_k7kHHPpq5vp9NCNLt7IMatHsct_08ijanf_EC69zuq1y7MPGiVsHJEYFRnkTxpa4_BcEmp_wtjNalefzXqfFF6hcAw-nOE7rhNOSSf0',
            actionButton: { text: 'Đăng ký ngay', type: 'primary' }
        }
    ];

    const filters = [
        { id: 'all', label: 'Tất cả', icon: 'tune' },
        { id: 'upcoming', label: 'Sắp tới', icon: 'schedule' },
        { id: 'registered', label: 'Đã đăng ký', icon: 'check-circle' },
        { id: 'workshop', label: 'Workshop', icon: 'build' },
        { id: 'hackathon', label: 'Hackathon', icon: 'code' }
    ];

    const avatarUrls = [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCM2zmMqd8u6K9r2YfgrXCxuCuzzxV5_eBFoqL9mNyl6NTzD7GbiibtcLU_sWKUWnFs83gUdARebvvqF18OZXdNlEuqVIAH-mqWMkb5rITf7O16pGs6F6X-g_GJpe9DBoS6qVwY9FfmclAwnHYaGat4TSaZblXBG5F1zNf-GBBeAJ4KrYGVXjfQtOYfhBPXAwqUXZydZaiNCdq4DpqU0iH1CYDJNjwnRBW-k3-5ZJeQNQB9s2HOJFKjCmUi0-3N_lpeJSHGAL2Odrr8',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCtSLfTpDWOqligCvKs6Uv21r9qjrDdqF2xw5tHN3mC39_DGZ6Nwi4oOR-54MIKD_5DeMp3uHAFb0gEqdESrlMoyHKbuu1Hg9wdFMoPSN4eI2yC3Wwryey9t1sf_g5c3r94PGXnlmxZc2Pdwj-LaUr9VOBcUN6LGwZEVUEAMJiw3fU3WeaYsg3SQNKpFZZOx_FzMF5jCz6ErXBhugy-EcbyVJJGiN9hBDV5sIkct7-jjrYARk-70KBb3hslomsbu8KZKU2-xU-Wuey3'
    ];

    // Top Bar Component
    const TopBar = () => (
        <BlurView intensity={30} className="sticky top-0 z-50 bg-[#101f22]/90 border-b border-white/5">
            <View className="flex-row items-center justify-between px-4 py-3">
                <Pressable
                    className="w-10 h-10 items-center justify-center rounded-full"
                    onPress={() => router.back()}
                >
                    <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
                </Pressable>
                <Text className="text-lg font-bold tracking-tight text-white">
                    Sự kiện CLB
                </Text>
                <Pressable className="w-10 h-10 items-center justify-center rounded-full relative">
                    <MaterialIcons name="notifications" size={24} color="#ffffff" />
                    <View className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 border-2 border-[#101f22]" />
                </Pressable>
            </View>
        </BlurView>
    );

    // Search Bar Component
    const SearchBar = () => (
        <View className="px-4 py-3 bg-[#101f22]">
            <View className="flex-row w-full items-center rounded-xl bg-[#224249] h-12">
                <View className="pl-4">
                    <MaterialIcons name="search" size={24} color="#90c1cb" />
                </View>
                <TextInput
                    className="flex-1 bg-transparent text-base font-medium px-3 h-full text-white"
                    placeholder="Tìm kiếm sự kiện, workshop..."
                    placeholderTextColor="#90c1cb70"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                <Pressable className="pr-4">
                    <MaterialIcons name="mic" size={24} color="#90c1cb" />
                </Pressable>
            </View>
        </View>
    );

    // Filter Chips Component
    const FilterChips = () => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-row gap-3 px-4 py-2 mb-2"
            contentContainerStyle={{ paddingRight: 16 }}
        >
            {filters.map((filter) => {
                const isActive = activeFilter === filter.id;
                return (
                    <Pressable
                        key={filter.id}
                        className={`flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full px-3 pr-4 ${
                            isActive
                                ? 'bg-[#0dccf2]'
                                : 'bg-[#224249] border border-white/5'
                        }`}
                        onPress={() => setActiveFilter(filter.id)}
                        style={
                            isActive
                                ? {
                                      shadowColor: '#0dccf2',
                                      shadowOffset: { width: 0, height: 0 },
                                      shadowOpacity: 0.3,
                                      shadowRadius: 15,
                                      elevation: 5
                                  }
                                : {}
                        }
                    >
                        <MaterialIcons
                            name={filter.icon}
                            size={20}
                            color={isActive ? '#101f22' : '#ffffff'}
                        />
                        <Text className={`text-sm ${
                            isActive
                                ? 'text-[#101f22] font-bold'
                                : 'text-white font-medium'
                        }`}>
                            {filter.label}
                        </Text>
                    </Pressable>
                );
            })}
        </ScrollView>
    );

    // Status Badge Component
    const StatusBadge = ({ statusColor, statusText }) => {
        const badgeStyles = {
            primary: {
                bg: 'bg-white/90',
                border: 'border-[#0dccf2]/20',
                text: 'text-[#0dccf2]'
            },
            emerald: {
                bg: 'bg-emerald-500/20',
                border: 'border-emerald-500/20',
                text: 'text-emerald-400'
            },
            gray: {
                bg: 'bg-gray-500/20',
                border: 'border-gray-500/20',
                text: 'text-gray-400'
            }
        };

        const style = badgeStyles[statusColor] || badgeStyles.primary;

        return (
            <View className={`absolute top-3 right-3 z-10`}>
                <BlurView intensity={15} className={`inline-flex items-center rounded-full px-2.5 py-1 border ${style.bg} ${style.border}`}>
                    <Text className={`text-xs font-bold ${style.text}`}>
                        {statusText}
                    </Text>
                </BlurView>
            </View>
        );
    };

    // Avatar Stack Component
    const AvatarStack = ({ participants }) => (
        <View className="flex-row" style={{ marginLeft: -8 }}>
            {avatarUrls.map((url, idx) => (
                <Image
                    key={idx}
                    source={{ uri: url }}
                    className="w-8 h-8 rounded-full border-2 border-[#182f34]"
                    style={{ marginLeft: idx > 0 ? -8 : 0 }}
                />
            ))}
            <View className="w-8 h-8 rounded-full bg-gray-700 items-center justify-center border-2 border-[#182f34]" style={{ marginLeft: -8 }}>
                <Text className="text-xs font-medium text-gray-300">
                    +{participants - 2}
                </Text>
            </View>
        </View>
    );

    // Full Event Card Component
    const FullEventCard = ({ event }) => (
        <View className="relative overflow-hidden rounded-xl bg-[#182f34]" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 4 }}>
            <StatusBadge statusColor={event.statusColor} statusText={event.statusText} />

            <ImageBackground
                source={{ uri: event.image }}
                className="h-40 w-full"
                imageStyle={{ resizeMode: 'cover' }}
            >
                {/* Gradient overlay layers */}
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%', backgroundColor: 'rgba(0,0,0,0.2)' }} />
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', backgroundColor: 'rgba(0,0,0,0.4)' }} />
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '25%', backgroundColor: 'rgba(0,0,0,0.8)' }} />
            </ImageBackground>

            <View className="flex-col p-4 gap-3">
                <Text className="text-xl font-bold leading-tight text-white">
                    {event.title}
                </Text>

                <View className="flex-col gap-2">
                    <View className="flex-row items-center gap-2">
                        <MaterialIcons name="calendar-month" size={18} color="#90c1cb" />
                        <Text className="text-sm font-medium text-[#90c1cb]">
                            {event.date}
                        </Text>
                    </View>
                    {event.location && (
                        <View className="flex-row items-center gap-2">
                            <MaterialIcons name="location-on" size={18} color="#90c1cb" />
                            <Text className="text-sm font-medium text-[#90c1cb]">
                                {event.location}
                            </Text>
                    </View>
                    )}
                </View>

                <View className="mt-2 flex-row items-center justify-between border-t border-white/10 pt-4">
                    {event.hasTicket ? (
                        <View className="flex-row items-center gap-1">
                            <MaterialIcons name="check-circle" size={18} color="#10b981" />
                            <Text className="text-sm font-medium text-emerald-400">
                                Bạn đã có vé
                    </Text>
                </View>
                    ) : event.slotsRemaining ? (
                        <Text className="text-sm text-gray-400">
                            Còn {event.slotsRemaining} slot
                        </Text>
                    ) : event.participants ? (
                        <AvatarStack participants={event.participants} />
                    ) : null}

                    {event.actionButton && (
                        <Pressable
                            className={`rounded-full font-bold text-sm px-5 py-2.5 ${
                                event.actionButton.type === 'primary'
                                    ? 'bg-[#0dccf2]'
                                    : 'bg-white/10'
                            }`}
                            style={
                                event.actionButton.type === 'primary'
                                    ? {
                                          shadowColor: '#0dccf2',
                                          shadowOffset: { width: 0, height: 0 },
                                          shadowOpacity: 0.4,
                                          shadowRadius: 10,
                                          elevation: 8
                                      }
                                    : {}
                            }
                        >
                            <Text className={`text-sm font-bold ${
                                event.actionButton.type === 'primary'
                                    ? 'text-[#101f22]'
                                    : 'text-white'
                            }`}>
                                {event.actionButton.text}
                            </Text>
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
    );

    // Compact Event Card Component (for admin events)
    const CompactEventCard = ({ event }) => (
        <View className="relative overflow-hidden rounded-xl bg-[#182f34]" style={{ opacity: 0.8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 4 }}>
            <StatusBadge statusColor={event.statusColor} statusText={event.statusText} />

            <View className="flex-row h-32">
                <ImageBackground
                    source={{ uri: event.image }}
                    className="w-32 shrink-0"
                    imageStyle={{ resizeMode: 'cover' }}
                />
                <View className="flex-1 justify-center p-4 gap-1">
                    <Text className="text-lg font-bold leading-tight text-white truncate">
                        {event.title}
                    </Text>
                    <Text className="text-xs text-gray-400">
                        {event.date}
                    </Text>
                    <View className="flex-row gap-2 mt-3">
                        <Pressable className="flex-1 flex-row items-center justify-center gap-1 bg-white/5 py-2 rounded-lg">
                            <MaterialIcons name="edit" size={16} color="#d1d5db" />
                            <Text className="text-gray-300 font-semibold text-xs">
                                Sửa
                            </Text>
                        </Pressable>
                        <Pressable className="flex-1 flex-row items-center justify-center gap-1 bg-white/5 py-2 rounded-lg">
                            <MaterialIcons name="delete" size={16} color="#f87171" />
                            <Text className="text-red-400 font-semibold text-xs">
                                Xóa
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
                </View>
    );

    // Event Card Renderer
    const EventCard = ({ event }) => {
        if (event.isCompact) {
            return <CompactEventCard event={event} />;
        }
        return <FullEventCard event={event} />;
    };

    // Floating Action Button
    const FAB = () => (
        <Pressable
            className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-[#0dccf2] items-center justify-center"
            style={{
                shadowColor: '#0dccf2',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
                elevation: 10
            }}
        >
            <MaterialIcons name="add" size={32} color="#101f22" />
        </Pressable>
    );

    // Bottom Gradient Fade
    const BottomFade = () => (
        <>
            <View
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: 48,
                    backgroundColor: '#101f22',
                    opacity: 0.95
                }}
                pointerEvents="none"
            />
            <View
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: 24,
                    backgroundColor: '#101f22',
                    opacity: 0.5
                }}
                pointerEvents="none"
            />
        </>
    );

    return (
        <View className="flex-1 bg-[#101f22]">
            <TopBar />
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                <SearchBar />
                <FilterChips />
                <View className="flex-col gap-5 p-4 pb-24">
                    {events.map((event) => (
                        <EventCard key={event.id} event={event} />
                    ))}
                </View>
            </ScrollView>
            <FAB />
            <BottomFade />
        </View>
    );
};

export default Finance;
