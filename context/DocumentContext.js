import { createContext, useContext, useState } from 'react';

const DocumentContext = createContext();

export const DocumentProvider = ({ children }) => {
    const [newDocument, setNewDocument] = useState(null);
    const [documentUpdate, setDocumentUpdate] = useState(null); // { documentId, updates }
    
    const addNewDocument = (document) => {
        setNewDocument(document);
    };
    
    const clearNewDocument = () => {
        setNewDocument(null);
    };
    
    const updateDocument = (documentId, updates) => {
        setDocumentUpdate({ documentId, updates });
    };
    
    const clearDocumentUpdate = () => {
        setDocumentUpdate(null);
    };
    
    return (
        <DocumentContext.Provider value={{ 
            newDocument, 
            addNewDocument, 
            clearNewDocument,
            documentUpdate,
            updateDocument,
            clearDocumentUpdate
        }}>
            {children}
        </DocumentContext.Provider>
    );
};

export const useDocumentContext = () => useContext(DocumentContext);


