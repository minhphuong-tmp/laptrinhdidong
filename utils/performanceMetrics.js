/**
 * Utility để đo các metrics hiệu năng
 * Bao gồm: Memory, Network, Render Performance
 */

class PerformanceMetrics {
    constructor() {
        this.metrics = {
            network: {
                totalBytes: 0,
                requests: 0,
                uploadBytes: 0,
                downloadBytes: 0
            },
            render: {
                renderCount: 0,
                lastRenderTime: null,
                renderTimes: []
            },
            memory: {
                // Sẽ được populate khi có thể đo được
                heapUsed: null,
                heapTotal: null
            }
        };
        this.startTime = Date.now();
    }

    // === NETWORK METRICS ===
    trackNetworkRequest(size, type = 'download') {
        this.metrics.network.requests++;
        if (type === 'upload') {
            this.metrics.network.uploadBytes += size;
        } else {
            this.metrics.network.downloadBytes += size;
        }
        this.metrics.network.totalBytes += size;
    }

    getNetworkMetrics() {
        return {
            ...this.metrics.network,
            uploadMB: (this.metrics.network.uploadBytes / 1024 / 1024).toFixed(2),
            downloadMB: (this.metrics.network.downloadBytes / 1024 / 1024).toFixed(2),
            totalMB: (this.metrics.network.totalBytes / 1024 / 1024).toFixed(2)
        };
    }

    // === RENDER METRICS ===
    trackRender(componentName = 'unknown') {
        const now = Date.now();
        this.metrics.render.renderCount++;

        if (this.metrics.render.lastRenderTime) {
            const timeSinceLastRender = now - this.metrics.render.lastRenderTime;
            this.metrics.render.renderTimes.push(timeSinceLastRender);

            // Chỉ giữ 100 lần render gần nhất
            if (this.metrics.render.renderTimes.length > 100) {
                this.metrics.render.renderTimes.shift();
            }
        }

        this.metrics.render.lastRenderTime = now;
        this.metrics.render.lastComponent = componentName;
    }

    getRenderMetrics() {
        const renderTimes = this.metrics.render.renderTimes;
        const avgRenderTime = renderTimes.length > 0
            ? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length
            : 0;

        return {
            renderCount: this.metrics.render.renderCount,
            avgTimeBetweenRenders: Math.round(avgRenderTime),
            lastComponent: this.metrics.render.lastComponent
        };
    }

    // === MEMORY METRICS ===
    async getMemoryMetrics() {
        try {
            // Thử đo memory nếu có thể (React Native có thể không support đầy đủ)
            if (typeof performance !== 'undefined' && performance.memory) {
                // Browser/Web
                this.metrics.memory = {
                    heapUsed: performance.memory.usedJSHeapSize,
                    heapTotal: performance.memory.totalJSHeapSize,
                    heapLimit: performance.memory.jsHeapSizeLimit,
                    heapUsedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
                    heapTotalMB: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2),
                    heapLimitMB: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)
                };
            } else if (typeof global !== 'undefined' && global.performance && global.performance.memory) {
                // React Native với polyfill
                const mem = global.performance.memory;
                this.metrics.memory = {
                    heapUsed: mem.usedJSHeapSize,
                    heapTotal: mem.totalJSHeapSize,
                    heapLimit: mem.jsHeapSizeLimit,
                    heapUsedMB: (mem.usedJSHeapSize / 1024 / 1024).toFixed(2),
                    heapTotalMB: (mem.totalJSHeapSize / 1024 / 1024).toFixed(2),
                    heapLimitMB: (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(2)
                };
            } else {
                // Fallback: Estimate từ các metrics khác
                this.metrics.memory = {
                    heapUsed: null,
                    heapTotal: null,
                    note: 'Memory metrics not available on this platform. Use React Native DevTools or Flipper for detailed memory info.'
                };
            }
        } catch (error) {
            console.log('⚠️ Cannot measure memory:', error);
            this.metrics.memory = {
                error: error.message,
                note: 'Memory measurement failed'
            };
        }

        return this.metrics.memory;
    }

    // === TỔNG HỢP TẤT CẢ METRICS ===
    async getAllMetrics() {
        const memory = await this.getMemoryMetrics();
        const network = this.getNetworkMetrics();
        const render = this.getRenderMetrics();
        const uptime = Date.now() - this.startTime;

        return {
            uptime: Math.round(uptime / 1000), // seconds
            memory,
            network,
            render,
            timestamp: new Date().toISOString()
        };
    }

    // Reset tất cả metrics
    reset() {
        this.metrics = {
            network: {
                totalBytes: 0,
                requests: 0,
                uploadBytes: 0,
                downloadBytes: 0
            },
            render: {
                renderCount: 0,
                lastRenderTime: null,
                renderTimes: []
            },
            memory: {
                heapUsed: null,
                heapTotal: null
            }
        };
        this.startTime = Date.now();
    }

    // Export metrics ra JSON để phân tích
    async exportMetrics() {
        const allMetrics = await this.getAllMetrics();
        return JSON.stringify(allMetrics, null, 2);
    }
}

// Singleton instance
const performanceMetrics = new PerformanceMetrics();

export default performanceMetrics;


