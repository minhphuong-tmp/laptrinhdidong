/**
 * Script để build offline bundle cho Android
 * Chạy: node scripts/build-offline-bundle.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building offline bundle for Android...');

try {
    // Build bundle cho Android
    console.log('Step 1: Building Android bundle...');
    execSync('npx expo export --platform android --output-dir dist-offline', {
        stdio: 'inherit',
        cwd: process.cwd(),
    });

    // Tìm file bundle
    const bundlePath = path.join(process.cwd(), 'dist-offline', '_expo', 'static', 'js', 'android', 'index.bundle');
    
    if (fs.existsSync(bundlePath)) {
        // Copy bundle vào assets hoặc document directory
        const targetPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'index.android.bundle');
        
        // Tạo thư mục assets nếu chưa có
        const assetsDir = path.dirname(targetPath);
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }

        // Copy bundle
        fs.copyFileSync(bundlePath, targetPath);
        console.log(`✓ Offline bundle đã được copy vào: ${targetPath}`);
    } else {
        console.warn('⚠ Không tìm thấy bundle file. Có thể cần build lại.');
    }

    console.log('✓ Build offline bundle hoàn tất!');
} catch (error) {
    console.error('✗ Lỗi khi build offline bundle:', error.message);
    process.exit(1);
}




