module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Suppress source map warnings from face-api.js
      const originalIgnoreWarnings = webpackConfig.ignoreWarnings || [];
      webpackConfig.ignoreWarnings = [
        ...originalIgnoreWarnings,
        // Ignore source map warnings
        (warning) => {
          return (
            warning.message &&
            (
              warning.message.includes('Failed to parse source map') ||
              warning.message.includes('ENOENT: no such file or directory') ||
              warning.message.includes('face-api.js')
            )
          );
        },
      ];
      
      return webpackConfig;
    },
  },
  // Proxy API during `npm start` so the browser never needs to talk to :4000
  // (avoids “API unreachable” when the process dies or localhost IPv6 fails).
  devServer: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
};
