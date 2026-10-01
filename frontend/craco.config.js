const fs = require('fs');
const path = require('path');

/** SELFIE_* in .env is the source of truth; copy onto REACT_APP_* for CRA. */
function applySelfieEnvAliases() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const parsed = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq < 1) continue;
    parsed[text.slice(0, eq).trim()] = text.slice(eq + 1).trim();
  }
  const aliases = [
    ['SELFIE_API_BASE_URL', 'REACT_APP_API_BASE_URL'],
    ['SELFIE_MERCHANT_KEY', 'REACT_APP_DEFAULT_MERCHANT_KEY'],
    ['SELFIE_USER_ID', 'REACT_APP_DEFAULT_USER_ID'],
    ['SELFIE_CENTER', 'REACT_APP_DEFAULT_CENTER'],
  ];
  for (const [from, to] of aliases) {
    const alias = String(process.env[from] || parsed[from] || '').trim();
    if (alias) process.env[to] = alias;
  }
}

applySelfieEnvAliases();

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
