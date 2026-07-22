/**
 * API Configuration — KYC / third-party selfie API.
 * REACT_APP_* from .env (local) or DigitalOcean Build Time.
 * Fallbacks match production so a stale PWA cache / missed env cannot blank the UI.
 */

const FALLBACK = {
  baseUrl: 'https://selfie.imsgh.org:2035/skyface',
  userId: 'string',
  merchantKey: '52053cd0-7d6c-4147-9e08-ef80bf3b2696',
  center: 'BRANCHLESS',
};

const getApiBaseUrl = () =>
  String(process.env.REACT_APP_API_BASE_URL || '').trim() || FALLBACK.baseUrl;

const getPinNumber = () => '';

const getUserId = () =>
  String(process.env.REACT_APP_DEFAULT_USER_ID || '').trim() || FALLBACK.userId;

const getMerchantKey = () =>
  String(process.env.REACT_APP_DEFAULT_MERCHANT_KEY || '').trim() ||
  FALLBACK.merchantKey;

const getCenter = () =>
  String(process.env.REACT_APP_DEFAULT_CENTER || '').trim() || FALLBACK.center;

const isFullyConfigured = () =>
  !!(getApiBaseUrl() && getUserId() && getMerchantKey());

const getMissingConfig = () => {
  const missing = [];
  // Only report missing when even fallbacks would fail (should never happen)
  if (!getApiBaseUrl()) missing.push('REACT_APP_API_BASE_URL');
  if (!getUserId()) missing.push('REACT_APP_DEFAULT_USER_ID');
  if (!getMerchantKey()) missing.push('REACT_APP_DEFAULT_MERCHANT_KEY');
  return missing;
};

const apiConfig = {
  baseUrl: getApiBaseUrl(),
  pinNumber: getPinNumber(),
  userId: getUserId(),
  merchantKey: getMerchantKey(),
  center: getCenter(),
  isAutoVerificationEnabled: isFullyConfigured(),
  missingConfig: getMissingConfig(),

  endpoints: {
    kycVerification: '/api/v1/third-party/verification/base_64/verification/kyc/face',
    yesNoVerification: '/api/v1/third-party/verification/yes_no/face',
  },

  getKycVerificationUrl: () => {
    const base = apiConfig.baseUrl || '';
    if (!base) return '';
    const cleanBase = base.replace(/\/+$/, '');
    const endpoint = apiConfig.endpoints.kycVerification.startsWith('/')
      ? apiConfig.endpoints.kycVerification
      : `/${apiConfig.endpoints.kycVerification}`;
    return `${cleanBase}${endpoint}`;
  },

  getYesNoVerificationUrl: () => {
    const base = apiConfig.baseUrl || '';
    if (!base) return '';
    const cleanBase = base.replace(/\/+$/, '');
    const endpoint = apiConfig.endpoints.yesNoVerification.startsWith('/')
      ? apiConfig.endpoints.yesNoVerification
      : `/${apiConfig.endpoints.yesNoVerification}`;
    return `${cleanBase}${endpoint}`;
  },

  getApiConfig: () => ({
    baseUrl: apiConfig.baseUrl,
    pinNumber: apiConfig.pinNumber,
    userId: apiConfig.userId,
    merchantKey: apiConfig.merchantKey,
    center: apiConfig.center,
  }),
};

export default apiConfig;
