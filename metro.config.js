const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Tối ưu cho thiết bị yếu
config.server = {
    ...config.server,
    enhanceMiddleware: (middleware) => {
        return (req, res, next) => {
            // Tăng timeout cho bundle request lên 15 giây
            if (req.url && req.url.includes('.bundle')) {
                res.setTimeout(15000);
            }
            return middleware(req, res, next);
        };
    },
};

config.transformer = {
    ...config.transformer,
    // Tắt source maps khi chạy dev-client (giảm bundle size)
    getTransformOptions: async () => ({
        transform: {
            experimentalImportSupport: true,
            inlineRequires: true,
        },
    }),
    // Tối ưu minify
    minifierConfig: {
        keep_classnames: false,
        keep_fnames: false,
        mangle: {
            keep_classnames: false,
            keep_fnames: false,
        },
    },
    // Allow require context for native modules that might not be available during prebuild
    unstable_allowRequireContext: true,
};

config.resolver = {
    ...config.resolver,
    // Tối ưu resolve
    unstable_enablePackageExports: true,
};

// Giảm mức độ logging
config.reporter = {
    update: () => {
        // Giảm logging để tăng tốc độ
    },
};

module.exports = config;

