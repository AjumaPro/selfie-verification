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
};
