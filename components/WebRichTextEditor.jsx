import { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { theme } from '../constants/theme';

// Web-compatible RichTextEditor
const WebRichTextEditor = forwardRef(({ onChange }, ref) => {
    const [content, setContent] = useState('');

    useImperativeHandle(ref, () => ({
        // Method for mobile compatibility
        setContentHTML: (html) => {
            setContent(html);
        },
        // Method for web compatibility  
        setValue: (value) => {
            setContent(value);
        },
        // Method for mobile compatibility
        blurContentEditor: () => {
            // TextInput will be blurred automatically when losing focus
        },
        // Method for web compatibility
        blur: () => {
            // TextInput will be blurred automatically when losing focus
        }
    }));

    const handleChangeText = (text) => {
        setContent(text);
        onChange?.(text);
    };

    return (
        <View style={{ minHeight: 285 }}>
            <TextInput
                style={styles.webTextInput}
                placeholder="Bạn đang nghĩ gì"
                multiline
                value={content}
                onChangeText={handleChangeText}
            />
        </View>
    );
});

export default WebRichTextEditor;

const styles = StyleSheet.create({
    webTextInput: {
        minHeight: 240,
        flex: 1,
        borderWidth: 1.5,
        borderRadius: theme.radius.xl,
        borderColor: theme.colors.gray,
        padding: 15,
        backgroundColor: 'white',
        color: theme.colors.textDark,
        fontSize: 16,
        textAlignVertical: 'top',
    },
});

