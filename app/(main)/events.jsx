import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Header from '../../components/Header';
import { theme } from '../../constants/theme';
import { hp, wp } from '../../helpers/common';
import { activityService } from '../../services/activityService';

const Events = () => {
    // State cho sự kiện từ database
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    // Load events từ database
    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = async () => {
        try {
            setLoading(true);
            const result = await activityService.getAllActivities();
            if (result.success) {
                // Transform data từ activities sang events format
                const transformedEvents = result.data.map(activity => {
                    const startDate = new Date(activity.start_date);
                    const endDate = new Date(activity.end_date);
                    const now = new Date();

                    // Xác định status dựa trên thời gian
                    const isUpcoming = startDate > now;
                    const isCompleted = endDate < now;
                    const status = isCompleted ? 'completed' : (isUpcoming ? 'upcoming' : 'ongoing');

                    return {
                        id: activity.id,
                        title: activity.title,
                        date: startDate.toISOString().split('T')[0],
                        time: `${startDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
                        location: activity.location,
                        description: activity.description,
                        participants: activity.participants?.length || 0,
                        maxParticipants: activity.max_participants,
                        status: status,
                        type: activity.activity_type
                    };
                });

                setEvents(transformedEvents);
                console.log('Loaded events:', transformedEvents);
            } else {
                console.log('Error loading events:', result.msg);
            }
        } catch (error) {
            console.log('Error in loadEvents:', error);
        } finally {
            setLoading(false);
        }
    };

    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showCalendar, setShowCalendar] = useState(true);

    // Tạo lịch tháng hiện tại
    const generateCalendar = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const calendar = [];

        // Thêm ngày từ tháng trước
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const prevDate = new Date(year, month, -i);
            calendar.push({
                date: prevDate.getDate(),
                fullDate: prevDate,
                isCurrentMonth: false,
                isToday: false,
                hasEvent: false
            });
        }

        // Thêm ngày trong tháng
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const today = new Date();
            const hasEvent = events.some(event => {
                const eventDate = new Date(event.date);
                return eventDate.toDateString() === currentDate.toDateString();
            });

            calendar.push({
                date: day,
                fullDate: currentDate,
                isCurrentMonth: true,
                isToday: currentDate.toDateString() === today.toDateString(),
                hasEvent: hasEvent
            });
        }

        // Thêm ngày từ tháng sau để đủ 6 tuần
        const remainingDays = 42 - calendar.length;
        for (let day = 1; day <= remainingDays; day++) {
            const nextDate = new Date(year, month + 1, day);
            calendar.push({
                date: day,
                fullDate: nextDate,
                isCurrentMonth: false,
                isToday: false,
                hasEvent: false
            });
        }

        return calendar;
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'upcoming': return '#FF9800';
            case 'completed': return '#4CAF50';
            case 'cancelled': return '#F44336';
            default: return theme.colors.textSecondary;
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'upcoming': return 'Sắp diễn ra';
            case 'completed': return 'Đã hoàn thành';
            case 'cancelled': return 'Đã hủy';
            default: return 'Không xác định';
        }
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'Competition': return '#F44336';
            case 'Workshop': return '#2196F3';
            case 'Seminar': return '#4CAF50';
            case 'Meeting': return '#FF9800';
            case 'Social': return '#9C27B0';
            default: return theme.colors.textSecondary;
        }
    };

    const renderEvent = ({ item }) => (
        <View style={styles.eventCard}>
            <View style={styles.eventHeader}>
                <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{item.title}</Text>
                    <View style={styles.eventMeta}>
                        <View style={styles.metaItem}>
                            <Icon name="location" size={hp(1.5)} color={theme.colors.textSecondary} />
                            <Text style={styles.metaText}>{item.location}</Text>
                        </View>
                        <View style={styles.metaItem}>
                            <Icon name="user" size={hp(1.5)} color={theme.colors.textSecondary} />
                            <Text style={styles.metaText}>{item.participants}/{item.maxParticipants}</Text>
                        </View>
                    </View>
                </View>
                <View style={styles.eventStatus}>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                        <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: getTypeColor(item.type) }]}>
                        <Text style={styles.typeText}>{item.type}</Text>
                    </View>
                </View>
            </View>
            <Text style={styles.eventDescription}>{item.description}</Text>
            <View style={styles.eventFooter}>
                <View style={styles.eventDateTime}>
                    <Text style={styles.eventDate}>{item.date}</Text>
                    <Text style={styles.eventTime}>{item.time}</Text>
                </View>
                <TouchableOpacity style={styles.joinButton}>
                    <Text style={styles.joinButtonText}>Tham gia</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderCalendar = () => {
        const calendar = generateCalendar();
        const monthNames = [
            'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
            'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
        ];
        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

        return (
            <View style={styles.calendarContainer}>
                {/* Header với nút + */}
                <View style={styles.calendarTopHeader}>
                    <Text style={styles.calendarAppTitle}>Lịch sự kiện CLB</Text>
                    <TouchableOpacity style={styles.addEventButton}>
                        <Icon name="plus" size={hp(2.5)} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Tháng/Năm */}
                <View style={styles.monthYearContainer}>
                    <Text style={styles.monthYearText}>
                        {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                    </Text>
                </View>

                {/* Navigation arrows */}
                <View style={styles.calendarHeader}>
                    <TouchableOpacity
                        style={styles.calendarNavButton}
                        onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
                    >
                        <Icon name="arrowLeft" size={hp(2)} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={styles.spacer} />
                    <TouchableOpacity
                        style={styles.calendarNavButton}
                        onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
                    >
                        <Icon name="arrowLeft" size={hp(2)} color={theme.colors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                    </TouchableOpacity>
                </View>

                {/* Day headers */}
                <View style={styles.calendarDaysHeader}>
                    {dayNames.map((day, index) => (
                        <Text key={index} style={styles.dayHeaderText}>{day}</Text>
                    ))}
                </View>

                {/* Calendar grid */}
                <View style={styles.calendarGrid}>
                    {calendar.map((day, index) => {
                        // Lấy sự kiện cho ngày này
                        const dayEvents = events.filter(event => {
                            const eventDate = new Date(event.date);
                            return eventDate.toDateString() === day.fullDate.toDateString();
                        });

                        return (
                            <TouchableOpacity
                                key={`day-${day.fullDate.toISOString()}-${index}`}
                                style={[
                                    styles.calendarDay,
                                    !day.isCurrentMonth && styles.calendarDayOtherMonth,
                                    day.isToday && styles.calendarDayToday,
                                ]}
                            >
                                <Text style={[
                                    styles.calendarDayText,
                                    !day.isCurrentMonth && styles.calendarDayTextOtherMonth,
                                    day.isToday && styles.calendarDayTextToday
                                ]}>
                                    {day.date}
                                </Text>

                                {/* Hiển thị sự kiện trong ô ngày */}
                                {dayEvents.length > 0 && (
                                    <View style={styles.dayEventsContainer}>
                                        {dayEvents.slice(0, 2).map((event, eventIndex) => (
                                            <View key={`event-${event.id}-${eventIndex}`} style={styles.dayEventItem}>
                                                <View style={[styles.dayEventColorBar, { backgroundColor: getStatusColor(event.status) }]} />
                                                <Text style={styles.dayEventTime} numberOfLines={1}>
                                                    {event.time.split(' - ')[0]}
                                                </Text>
                                                <Text style={styles.dayEventTitle} numberOfLines={2}>
                                                    {event.title}
                                                </Text>
                                            </View>
                                        ))}
                                        {dayEvents.length > 2 && (
                                            <Text style={styles.moreEventsText}>
                                                +{dayEvents.length - 2} sự kiện
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Events list for selected day */}
                <View style={styles.eventsListContainer}>
                    <Text style={styles.eventsListTitle}>Sự kiện hôm nay</Text>
                    {loading ? (
                        <Text style={styles.loadingText}>Đang tải...</Text>
                    ) : (
                        events.filter(event => {
                            const eventDate = new Date(event.date);
                            const today = new Date();
                            return eventDate.toDateString() === today.toDateString();
                        }).map((event, index) => (
                            <View key={index} style={styles.eventItem}>
                                <View style={[styles.eventColorBar, { backgroundColor: getStatusColor(event.status) }]} />
                                <View style={styles.eventDetails}>
                                    <Text style={styles.eventTime}>{event.time}</Text>
                                    <Text style={styles.eventTitle}>{event.title}</Text>
                                    <Text style={styles.eventLocation}>{event.location}</Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            <Header title="Lịch sự kiện" showBackButton />

            <ScrollView
                style={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Calendar - Always visible */}
                {renderCalendar()}

                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{events.filter(e => e.status === 'upcoming').length}</Text>
                        <Text style={styles.statLabel}>Sắp diễn ra</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{events.filter(e => e.status === 'completed').length}</Text>
                        <Text style={styles.statLabel}>Đã hoàn thành</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{events.reduce((sum, e) => sum + e.participants, 0)}</Text>
                        <Text style={styles.statLabel}>Tổng tham gia</Text>
                    </View>
                </View>

                <View style={styles.filterContainer}>
                    <TouchableOpacity style={styles.filterButton}>
                        <Text style={styles.filterText}>Tất cả</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.filterButton}>
                        <Text style={styles.filterText}>Sắp diễn ra</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.filterButton}>
                        <Text style={styles.filterText}>Đã hoàn thành</Text>
                    </TouchableOpacity>
                </View>

                {/* Events List */}
                <View style={styles.eventsListContainer}>
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <Text style={styles.loadingText}>Đang tải sự kiện...</Text>
                        </View>
                    ) : (
                        events.map((event) => (
                            <View key={event.id}>
                                {renderEvent({ item: event })}
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.backgroundSecondary,
        paddingTop: 35, // Consistent padding top
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: hp(10),
    },
    calendarToggleContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },
    toggleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(4),
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.primary,
        ...theme.shadows.small,
    },
    toggleButtonActive: {
        backgroundColor: theme.colors.primary,
    },
    toggleButtonText: {
        fontSize: hp(1.5),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.primary,
        marginLeft: wp(2),
    },
    toggleButtonTextActive: {
        color: 'white',
    },
    calendarContainer: {
        backgroundColor: theme.colors.background,
        marginHorizontal: wp(2),
        marginVertical: hp(1),
        borderRadius: theme.radius.lg,
        ...theme.shadows.medium,
    },
    calendarTopHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingTop: hp(2),
        paddingBottom: hp(1),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    calendarAppTitle: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
    },
    addEventButton: {
        width: hp(4.5),
        height: hp(4.5),
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        ...theme.shadows.small,
    },
    monthYearContainer: {
        paddingHorizontal: wp(4),
        paddingBottom: hp(1),
    },
    monthYearText: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingBottom: hp(1),
    },
    spacer: {
        flex: 1,
    },
    calendarNavButton: {
        width: hp(4),
        height: hp(4),
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: theme.radius.full,
    },
    calendarDaysHeader: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: wp(2),
        paddingBottom: hp(1),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    dayHeaderText: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        width: wp(12),
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: wp(2),
        paddingTop: hp(1),
    },
    calendarDay: {
        width: wp(12),
        height: hp(8),
        justifyContent: 'flex-start',
        alignItems: 'center',
        margin: wp(0.5),
        borderRadius: theme.radius.sm,
        position: 'relative',
        paddingTop: hp(0.5),
    },
    calendarDayOtherMonth: {
        opacity: 0.3,
    },
    calendarDayToday: {
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.full,
    },
    calendarDayText: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
    },
    calendarDayTextOtherMonth: {
        color: theme.colors.textSecondary,
    },
    calendarDayTextToday: {
        color: 'white',
        fontWeight: theme.fonts.bold,
    },
    eventIndicator: {
        position: 'absolute',
        bottom: hp(0.8),
        left: '50%',
        marginLeft: -wp(1.5),
        width: wp(3),
        height: wp(3),
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.primary,
    },
    eventsListContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    eventsListTitle: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(1.5),
    },
    eventItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(1),
        paddingVertical: hp(0.5),
    },
    eventColorBar: {
        width: wp(1),
        height: hp(4),
        borderRadius: theme.radius.sm,
        marginRight: wp(3),
    },
    eventDetails: {
        flex: 1,
    },
    eventTime: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
    },
    eventTitle: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        fontWeight: theme.fonts.semiBold,
        marginTop: hp(0.2),
    },
    eventLocation: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
        marginTop: hp(0.2),
    },
    dayEventsContainer: {
        position: 'absolute',
        top: hp(2.5),
        left: wp(0.3),
        right: wp(0.3),
        bottom: wp(0.3),
    },
    dayEventItem: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginBottom: hp(0.3),
        paddingHorizontal: wp(0.5),
        paddingVertical: hp(0.3),
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: theme.radius.xs,
        ...theme.shadows.small,
        width: '100%',
    },
    dayEventColorBar: {
        width: '100%',
        height: hp(0.4),
        borderRadius: theme.radius.xs,
        marginBottom: hp(0.2),
    },
    dayEventTime: {
        fontSize: hp(0.8),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
        marginBottom: hp(0.1),
    },
    dayEventTitle: {
        fontSize: hp(0.9),
        color: theme.colors.text,
        fontWeight: theme.fonts.medium,
        lineHeight: hp(1.1),
    },
    moreEventsText: {
        fontSize: hp(0.7),
        color: theme.colors.primary,
        fontWeight: theme.fonts.semiBold,
        textAlign: 'center',
        marginTop: hp(0.1),
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: theme.colors.background,
        paddingVertical: hp(2),
        marginHorizontal: wp(4),
        marginVertical: hp(1),
        borderRadius: theme.radius.md,
        ...theme.shadows.small,
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
    },
    statLabel: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        marginTop: hp(0.5),
    },
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: wp(4),
        marginBottom: hp(1),
    },
    filterButton: {
        paddingHorizontal: wp(3),
        paddingVertical: hp(1),
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.full,
        marginRight: wp(2),
        ...theme.shadows.small,
    },
    filterText: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        fontWeight: theme.fonts.medium,
    },
    listContainer: {
        paddingHorizontal: wp(4),
        paddingBottom: hp(10),
    },
    eventsListContainer: {
        paddingHorizontal: wp(4),
        paddingTop: hp(2),
    },
    eventCard: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        padding: wp(4),
        marginBottom: hp(2),
        ...theme.shadows.small,
    },
    eventHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: hp(1.5),
    },
    eventInfo: {
        flex: 1,
        marginRight: wp(2),
    },
    eventTitle: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: hp(0.5),
    },
    eventMeta: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: wp(3),
    },
    metaText: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
        marginLeft: wp(1),
    },
    eventStatus: {
        alignItems: 'flex-end',
    },
    statusBadge: {
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.5),
        borderRadius: theme.radius.sm,
        marginBottom: hp(0.5),
    },
    statusText: {
        fontSize: hp(1.2),
        color: 'white',
        fontWeight: theme.fonts.medium,
    },
    typeBadge: {
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.3),
        borderRadius: theme.radius.sm,
    },
    typeText: {
        fontSize: hp(1.1),
        color: 'white',
        fontWeight: theme.fonts.medium,
    },
    eventDescription: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        marginBottom: hp(1.5),
        lineHeight: hp(2),
    },
    eventFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    eventDateTime: {
        alignItems: 'flex-start',
    },
    eventDate: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
    },
    eventTime: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
    },
    joinButton: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        borderRadius: theme.radius.sm,
    },
    joinButtonText: {
        fontSize: hp(1.4),
        color: 'white',
        fontWeight: theme.fonts.medium,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: hp(10),
    },
    loadingText: {
        fontSize: hp(1.8),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
    },
});

export default Events;
