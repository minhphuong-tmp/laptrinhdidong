import WebRichTextEditor from './WebRichTextEditor';

const RichTextEditor = ({ editorRef, onChange }) => {
    // Tạm thời chỉ sử dụng WebRichTextEditor cho cả web và mobile
    return <WebRichTextEditor editorRef={editorRef} onChange={onChange} />;
};

export default RichTextEditor;