import { StyleSheet, TextInput, View } from 'react-native';
import { theme } from '../constants/theme';

// Web-compatible RichTextEditor
const WebRichTextEditor = ({ editorRef, onChange }) => {
    return (
        <View style={{ minHeight: 285 }}>
            <TextInput
                ref={editorRef}
                style={styles.webTextInput}
                placeholder="Bạn đang nghĩ gì"
                multiline
                onChangeText={onChange}
            />
        </View>
    );
};

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

