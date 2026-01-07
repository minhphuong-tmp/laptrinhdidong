import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import {
    CHUNK_SIZE,
    getChunkMetadata,
    getFileBlob,
    MAX_PARALLEL_UPLOADS,
    uploadSingleChunk
} from './chunkService';
import { documentService } from './documentService';

const UPLOAD_STATE_KEY = 'pending_upload_state';
const MAX_RESUME_ATTEMPTS = 3;
const BUCKET_NAME = 'media'; // Documents dùng bucket 'media'

class UploadResumeService {
    constructor() {
        this.appStateListener = null;
        this.currentUploadState = null;
        this.isResuming = false;
        this.onDocumentUpdate = null; // Callback để update document trong context
    }

    /**
     * Set callback để update document trong context
     */
    setDocumentUpdateCallback(callback) {
        this.onDocumentUpdate = callback;
    }

    /**
     * Initialize: Load state và setup AppState listener
     * KHÔNG tự động resume - cần gọi startResume() sau khi app sẵn sàng
     */
    async initialize() {
        console.log('📤 [Upload Resume] ===== INITIALIZING SERVICE =====');
        
        // Load pending upload state
        await this.loadUploadState();
        
        // Setup AppState listener
        this.setupAppStateListener();
        
        console.log('📤 [Upload Resume] ===== SERVICE INITIALIZED =====');
        console.log('📤 [Upload Resume] Call startResume() after app is ready to begin resume process');
    }

    /**
     * Start resume process (gọi sau khi app đã sẵn sàng)
     */
    async startResume() {
        if (this.currentUploadState) {
            console.log('📤 [Upload Resume] Found pending upload state, starting resume...');
            this.resumeUpload().catch(error => {
                console.error('📤 [Upload Resume] ❌ Error resuming upload:', error);
            });
        } else {
            console.log('📤 [Upload Resume] No pending upload state found');
        }
    }

    /**
     * Load upload state từ AsyncStorage
     */
    async loadUploadState() {
        try {
            const stateData = await AsyncStorage.getItem(UPLOAD_STATE_KEY);
            if (stateData) {
                this.currentUploadState = JSON.parse(stateData);
            } else {
                this.currentUploadState = null;
            }
        } catch (error) {
            console.error('📤 [Upload Resume] ❌ Error loading state:', error);
            this.currentUploadState = null;
        }
    }

    /**
     * Save upload state vào AsyncStorage
     */
    async saveUploadState() {
        try {
            if (this.currentUploadState) {
                await AsyncStorage.setItem(UPLOAD_STATE_KEY, JSON.stringify(this.currentUploadState));
            } else {
                await AsyncStorage.removeItem(UPLOAD_STATE_KEY);
                console.log('[Upload Resume] Removed upload state from AsyncStorage');
            }
        } catch (error) {
            console.error('📤 [Upload Resume] ❌ Error saving state:', error);
        }
    }

    /**
     * Lưu upload state khi bắt đầu upload (chunk upload)
     */
    async saveChunkUploadState({
        fileId,
        fileUri,
        fileSize,
        fileName,
        uploaderId,
        totalChunks,
        uploadedChunks = [],
        finalPath,
        metadata = {}
    }) {
        
        this.currentUploadState = {
            type: 'chunk_upload',
            fileId,
            fileUri,
            fileSize,
            fileName,
            uploaderId,
            totalChunks,
            uploadedChunks, // Array các chunk đã upload: [{index, path}]
            finalPath,
            metadata,
            createdAt: Date.now(),
            resumeAttempts: 0
        };
        
        await this.saveUploadState();
    }

    /**
     * Update uploaded chunks (khi upload thêm chunks)
     */
    async updateUploadedChunks(newUploadedChunks) {
        if (!this.currentUploadState) {
            console.log('📤 [Upload Resume] ⚠️ No upload state to update');
            return;
        }
        
        // Merge với chunks đã upload trước đó
        const existingChunks = this.currentUploadState.uploadedChunks || [];
        
        const allChunks = [...existingChunks, ...newUploadedChunks];
        
        // Remove duplicates (theo index)
        const uniqueChunks = allChunks.reduce((acc, chunk) => {
            if (!acc.find(c => c.index === chunk.index)) {
                acc.push(chunk);
            }
            return acc;
        }, []);
        
        this.currentUploadState.uploadedChunks = uniqueChunks;
        await this.saveUploadState();
    }

    /**
     * Clear upload state (khi upload xong hoặc fail)
     */
    async clearUploadState() {
        this.currentUploadState = null;
        await this.saveUploadState();
    }

    /**
     * List chunks trong storage để check chunks đã upload
     */
    async listChunksInStorage(fileId) {
        try {
            const chunksPath = `temp/chunks/${fileId}`;
            
            // List tất cả files trong folder chunks
            const { data: files, error } = await supabase.storage
                .from(BUCKET_NAME)
                .list(chunksPath);
            
            if (error) {
                console.log('📤 [Upload Resume] Storage list error details:', {
                    message: error.message,
                    statusCode: error.statusCode,
                    error: JSON.stringify(error, null, 2)
                });
                
                // Nếu folder không tồn tại → không có chunks nào
                if (error.message?.includes('not found') || 
                    error.message?.includes('NotFound') ||
                    error.statusCode === '404' ||
                    error.statusCode === 404) {
                    console.log('📤 [Upload Resume] ✅ No chunks folder found (no chunks uploaded yet)');
                    return [];
                }
                throw error;
            }
            
            if (!files || files.length === 0) {
                console.log('📤 [Upload Resume] ✅ No chunks found in storage (folder exists but empty)');
                return [];
            }
            
            // Filter chỉ lấy files có pattern chunk_{number}
            const chunkFiles = files.filter(file => {
                const match = file.name.match(/^chunk_(\d+)$/);
                return match !== null;
            });
            
            // Parse và sort theo index
            const chunks = chunkFiles.map(file => {
                const match = file.name.match(/^chunk_(\d+)$/);
                const index = parseInt(match[1], 10);
                return {
                    index: index,
                    path: `${chunksPath}/${file.name}`,
                    name: file.name,
                    size: file.metadata?.size || 0
                };
            }).sort((a, b) => a.index - b.index);
            
            return chunks;
            
        } catch (error) {
            console.error('📤 [Upload Resume] ❌ Error listing chunks:', error);
            return [];
        }
    }

    /**
     * Setup AppState listener
     */
    setupAppStateListener() {
        console.log('📤 [Upload Resume] Setting up AppState listener...');
        
        this.appStateListener = AppState.addEventListener('change', async (nextAppState) => {
            if (nextAppState === 'active') {
                // Load lại state (có thể đã thay đổi)
                await this.loadUploadState();
                
                // Resume upload nếu có
                if (this.currentUploadState && !this.isResuming) {
                    this.resumeUpload();
                }
            }
        });
        
        console.log('📤 [Upload Resume] ✅ AppState listener setup complete');
    }

    /**
     * Resume upload từ chunks còn lại (BƯỚC 3)
     */
    async resumeUpload() {
        if (!this.currentUploadState || this.isResuming) {
            if (!this.currentUploadState) {
                console.log('📤 [Upload Resume] ⚠️ No upload state to resume');
            }
            if (this.isResuming) {
                console.log('📤 [Upload Resume] ⚠️ Resume already in progress');
            }
            return;
        }

        if (this.currentUploadState.resumeAttempts >= MAX_RESUME_ATTEMPTS) {
            console.error('📤 [Upload Resume] ❌ Max resume attempts reached, giving up');
            await this.clearUploadState();
            return;
        }

        this.isResuming = true;
        this.currentUploadState.resumeAttempts++;
        

        try {
            const state = this.currentUploadState;
            
            // BƯỚC 1: List chunks trong storage
            const chunksInStorage = await this.listChunksInStorage(state.fileId);
            
            // BƯỚC 2: So sánh chunks
            const uploadedIndices = new Set(chunksInStorage.map(c => c.index));
            const stateUploadedIndices = new Set(state.uploadedChunks.map(c => c.index));
            
            // Tính chunks còn thiếu
            const totalChunksNeeded = state.totalChunks;
            const remainingIndices = [];
            for (let i = 0; i < totalChunksNeeded; i++) {
                if (!uploadedIndices.has(i)) {
                    remainingIndices.push(i);
                }
            }
            
            // BƯỚC 3: Kiểm tra xem đã upload hết chưa
            if (remainingIndices.length === 0) {
                // Tất cả chunks đã upload → chỉ cần merge
                await this.resumeMerge(state);
            } else {
                // Upload chunks còn lại
                await this.resumeChunkUpload(state, remainingIndices);
            }
            
        } catch (error) {
            console.error('📤 [Upload Resume] ❌ Resume error:', error);
            // Giữ lại state để retry lần sau
            await this.saveUploadState();
        } finally {
            this.isResuming = false;
        }
    }

    /**
     * Upload các chunks còn thiếu (BƯỚC 4)
     */
    async resumeChunkUpload(state, remainingIndices) {
        console.log('📤 [Upload Resume] ===== RESUMING CHUNK UPLOAD =====');
        console.log('📤 [Upload Resume] Remaining chunks to upload:', remainingIndices.join(', '));
        console.log('📤 [Upload Resume] Total remaining:', remainingIndices.length);
        
        try {
            // 1. Kiểm tra file URI còn hợp lệ không
            console.log('📤 [Upload Resume] Checking file URI:', state.fileUri);
            // Note: Không thể check file tồn tại trong React Native, chỉ có thể thử đọc
            
            // 2. Load file thành Blob
            console.log('📤 [Upload Resume] Loading file into Blob...');
            const fileBlob = await getFileBlob(state.fileUri);
            console.log('📤 [Upload Resume] ✅ File loaded, size:', `${(fileBlob.size / (1024 * 1024)).toFixed(2)} MB`);
            
            // 3. Tính chunk metadata cho các indices còn lại
            const allChunksMetadata = getChunkMetadata(state.fileSize, CHUNK_SIZE);
            const remainingChunksMetadata = allChunksMetadata.filter(chunk => 
                remainingIndices.includes(chunk.index)
            );
            
            console.log('📤 [Upload Resume] Chunks metadata to upload:', remainingChunksMetadata.map(c => ({
                index: c.index,
                start: c.start,
                end: c.end,
                size: `${(c.size / (1024 * 1024)).toFixed(2)} MB`
            })));
            
            // 4. Tạo upload tasks cho các chunks còn lại
            const uploadTasks = remainingChunksMetadata.map((chunkMeta) => {
                return async () => {
                    const result = await uploadSingleChunk({
                        blob: fileBlob,
                        start: chunkMeta.start,
                        end: chunkMeta.end,
                        fileId: state.fileId,
                        chunkIndex: chunkMeta.index,
                        totalChunks: state.totalChunks,
                        mimeType: 'application/octet-stream'
                    });
                    
                    return {
                        chunkIndex: chunkMeta.index,
                        result: result
                    };
                };
            });
            
            // 5. Upload song song với Promise Pool (tối đa 4 chunks)
            const uploadedChunks = [];
            let completedCount = 0;
            let hasError = false;
            let firstError = null;
            
            // Promise Pool để giới hạn concurrent uploads
            const promisePool = async (items, fn, limit) => {
                const results = [];
                const executing = [];
                
                for (const item of items) {
                    const promise = Promise.resolve().then(() => fn(item));
                    results.push(promise);
                    
                    const e = promise.then(() => {
                        const index = executing.indexOf(e);
                        if (index > -1) {
                            executing.splice(index, 1);
                        }
                    });
                    executing.push(e);
                    
                    if (executing.length >= limit) {
                        await Promise.race(executing);
                    }
                }
                
                return Promise.all(results);
            };
            
            console.log('📤 [Upload Resume] Starting parallel upload (max 4 chunks at once)...');
            const results = await promisePool(
                uploadTasks,
                async (task) => {
                    const taskResult = await task();
                    
                    completedCount++;
                    const progress = Math.floor((completedCount / remainingIndices.length) * 100);
                    if (taskResult.result.success) {
                        const uploadedChunk = {
                            index: taskResult.chunkIndex,
                            path: taskResult.result.path
                        };
                        uploadedChunks.push(uploadedChunk);
                        
                        // Update state ngay khi chunk upload xong
                        await this.updateUploadedChunks([uploadedChunk]);
                    } else {
                        hasError = true;
                        if (!firstError) {
                            firstError = taskResult.result.error;
                        }
                        console.log(`📤 [Upload Resume] ❌ Chunk ${taskResult.chunkIndex + 1}/${state.totalChunks} upload fail: ${taskResult.result.error}`);
                    }
                    
                    return taskResult;
                },
                MAX_PARALLEL_UPLOADS
            );
            
            // 6. Kiểm tra kết quả
            if (hasError) {
                console.error('📤 [Upload Resume] ❌ Some chunks upload failed');
                throw new Error(firstError || 'Một số chunks upload không thành công');
            }
            
            // 7. Kiểm tra xem đã upload đủ chưa
            const updatedState = this.currentUploadState;
            if (updatedState.uploadedChunks.length >= updatedState.totalChunks) {
                await this.resumeMerge(updatedState);
            } else {
                // Giữ lại state để retry sau
                await this.saveUploadState();
            }
            
        } catch (error) {
            console.error('📤 [Upload Resume] ❌ Resume chunk upload error:', error);
            // Giữ lại state để retry sau
            await this.saveUploadState();
            throw error;
        }
    }

    /**
     * Resume merge chunks (khi đã có đủ chunks)
     */
    async resumeMerge(state) {
        
        try {
            const mergeResult = await documentService.mergeDocumentChunksOnServer({
                fileId: state.fileId,
                totalChunks: state.totalChunks,
                finalPath: state.finalPath,
                onProgress: null
            });
            
            if (!mergeResult.success) {
                throw new Error(mergeResult.error || 'Merge failed');
            }
            
            console.log('📤 [Upload Resume] ✅ Merge completed successfully');
            
            // Update database nếu có documentId
            if (state.metadata.documentId) {
                await documentService.updateDocumentFilePath(
                    state.metadata.documentId,
                    mergeResult.fileUrl
                );
                console.log('📤 [Upload Resume] ✅ Updated document file_path in database');
                
                // Update document trong context nếu có callback
                if (this.onDocumentUpdate) {
                    try {
                        this.onDocumentUpdate(state.metadata.documentId, {
                            filePath: mergeResult.fileUrl,
                            processingStatus: 'completed'
                        });
                        console.log('📤 [Upload Resume] ✅ Updated document in context');
                    } catch (updateError) {
                        console.log('📤 [Upload Resume] ⚠️ Error updating document in context:', updateError.message);
                    }
                }
            }
            
            // Clear state
            await this.clearUploadState();
            
        } catch (error) {
            console.error('📤 [Upload Resume] ❌ Merge error:', error);
            throw error;
        }
    }

    /**
     * Cleanup: Remove listeners
     */
    cleanup() {
        console.log('📤 [Upload Resume] Cleaning up...');
        if (this.appStateListener) {
            this.appStateListener.remove();
            this.appStateListener = null;
        }
        console.log('📤 [Upload Resume] ✅ Cleanup complete');
    }
}

export default new UploadResumeService();

