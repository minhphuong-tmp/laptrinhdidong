import React from 'react';
import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../assets/icons';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';

const DownloadSuccessModal = ({
    visible,
    title,
    message,
    onOpenFile,
    onClose
}) => {
    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    {/* Icon Success */}
                    <View style={styles.iconContainer}>
                        <Icon name="check-circle" size={hp(5)} color="#4CAF50" />
                    </View>

                    {/* Title */}
                    <Text style={styles.title}>{title || 'Tải thành công'}</Text>

                    {/* Message */}
                    <Text style={styles.message}>{message}</Text>

                    {/* Buttons */}
                    <View style={styles.buttonContainer}>
                        {onOpenFile && (
                            <TouchableOpacity
                                style={[styles.button, styles.primaryButton]}
                                onPress={onOpenFile}
                            >
                                <Icon name="file-text" size={hp(2)} color="white" />
                                <Text style={styles.primaryButtonText}>Mở file</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.button, styles.secondaryButton]}
                            onPress={onClose}
                        >
                            <Text style={styles.secondaryButtonText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(5),
    },
    modalContainer: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.xl,
        padding: wp(6),
        width: '100%',
        maxWidth: wp(85),
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    iconContainer: {
        marginBottom: hp(2),
    },
    title: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(1),
        textAlign: 'center',
    },
    message: {
        fontSize: hp(1.6),
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: hp(3),
        lineHeight: hp(2.2),
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: wp(3),
        width: '100%',
    },
    button: {
        flex: 1,
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(4),
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: wp(2),
    },
    primaryButton: {
        backgroundColor: theme.colors.primary,
    },
    primaryButtonText: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: 'white',
    },
    secondaryButton: {
        backgroundColor: theme.colors.backgroundSecondary,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    secondaryButtonText: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
    },
});

export default DownloadSuccessModal;

