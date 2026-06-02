import { forwardRef } from 'react';
import WebRichTextEditor from './WebRichTextEditor';

const RichTextEditor = forwardRef(({ onChange }, ref) => {
    // Tạm thời chỉ sử dụng WebRichTextEditor cho cả web và mobile
    return <WebRichTextEditor ref={ref} onChange={onChange} />;
});

export default RichTextEditor;