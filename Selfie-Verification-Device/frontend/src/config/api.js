/**
 * KYC / Skyface API — values come only from frontend/.env
 * (REACT_APP_* inlined by CRA, SELFIE_* aliased in craco).
 */

const env = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
};

const getApiBaseUrl = () =>
  env('REACT_APP_API_BASE_URL', 'SELFIE_API_BASE_URL');

const getPinNumber = () => '';

const getUserId = () =>
  env('REACT_APP_DEFAULT_USER_ID', 'SELFIE_USER_ID');

const getMerchantKey = () =>
  env('REACT_APP_DEFAULT_MERCHANT_KEY', 'SELFIE_MERCHANT_KEY');

const getCenter = () =>
  env('REACT_APP_DEFAULT_CENTER', 'SELFIE_CENTER');

const isFullyConfigured = () =>
  !!(getApiBaseUrl() && getUserId() && getMerchantKey());

const getMissingConfig = () => {
  const missing = [];
  if (!getApiBaseUrl()) missing.push('SELFIE_API_BASE_URL');
  if (!getUserId()) missing.push('SELFIE_USER_ID');
  if (!getMerchantKey()) missing.push('SELFIE_MERCHANT_KEY');
  return missing;
};

const apiConfig = {
  baseUrl: getApiBaseUrl(),
  pinNumber: getPinNumber(),
  userId: getUserId(),
  merchantKey: getMerchantKey(),
  center: getCenter() || 'BRANCHLESS',
  verifySsl: env('SELFIE_VERIFY_SSL', 'REACT_APP_SELFIE_VERIFY_SSL') !== 'false',
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
