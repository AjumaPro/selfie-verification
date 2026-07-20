/**
 * API Configuration
 * 
 * This file manages API URLs and configuration from environment variables.
 * 
 * IMPORTANT: All secrets must be configured in the .env file, NOT in this code file.
 * 
 * To configure:
 * 1. Create a .env file in the frontend directory
 * 2. Add the required environment variables (see .env.example)
 * 3. Restart the development server
 * 
 * Never commit sensitive API keys or URLs to version control.
 * The .env file is already in .gitignore
 */

/**
 * Helper function to get the API base URL from environment variables
 * @returns {string} The base URL for API calls from .env file
 */
const getApiBaseUrl = () => {
  // Get base URL from environment variable (from .env file)
  // This is the only source - no hardcoded values for security
  return process.env.REACT_APP_API_BASE_URL || '';
};

/**
 * Get PIN Number - always returns empty as users enter it in frontend
 * PIN Number is the Ghana card number (format: GHA-xxxxxxxxx-x)
 * @returns {string} Empty string - users must enter Ghana card number in UI
 */
const getPinNumber = () => {
  // Return empty string because users enter Ghana card number (PIN Number) in the frontend form
  return '';
};

/**
 * Get User ID from environment variables
 * @returns {string} User ID from .env file
 */
const getUserId = () => {
  // Get User ID from environment variable (from .env file)
  // This is the only source - no hardcoded values for security
  return process.env.REACT_APP_DEFAULT_USER_ID || '';
};

/**
 * Get Merchant Key from environment variables
 * @returns {string} Merchant Key from .env file
 */
const getMerchantKey = () => {
  // Get Merchant Key from environment variable (from .env file)
  // This is the only source - no hardcoded values for security
  return process.env.REACT_APP_DEFAULT_MERCHANT_KEY || '';
};

/**
 * Get Center value from environment variables or default 'BRANCHLESS'
 * @returns {string} Center value from .env file or default
 */
const getCenter = () => {
  // Get Center from environment variable (from .env file)
  // Fallback to default 'BRANCHLESS' if not set
  return process.env.REACT_APP_DEFAULT_CENTER || 'BRANCHLESS';
};

/**
 * Check if all credentials are configured (except PIN which users enter)
 * Returns true if Base URL, User ID, and Merchant Key are all configured
 * @returns {boolean} True if all required credentials are configured
 */
const isFullyConfigured = () => {
  // Check if Base URL, User ID, and Merchant Key are all configured
  // PIN Number is not checked because users enter it in the UI
  const baseUrl = getApiBaseUrl();
  const userId = getUserId();
  const merchantKey = getMerchantKey();
  // Return true only if all three are configured
  return !!(baseUrl && userId && merchantKey);
};

/**
 * List missing required env vars for third-party API calls
 * @returns {string[]} Human-readable names of missing settings
 */
const getMissingConfig = () => {
  const missing = [];
  if (!getApiBaseUrl()) missing.push('REACT_APP_API_BASE_URL');
  if (!getUserId()) missing.push('REACT_APP_DEFAULT_USER_ID');
  if (!getMerchantKey()) missing.push('REACT_APP_DEFAULT_MERCHANT_KEY');
  return missing;
};

/**
 * Main API Configuration Object
 * Contains all API-related configuration and helper functions
 */
const apiConfig = {
  // Base URL for third-party verification APIs (loaded from .env file)
  baseUrl: getApiBaseUrl(),
  
  // API Credentials - PIN is user input, others are loaded from .env file
  pinNumber: getPinNumber(),  // PIN Number (empty - users enter Ghana card number)
  userId: getUserId(),  // User ID (loaded from .env file)
  merchantKey: getMerchantKey(),  // Merchant Key (loaded from .env file)
  center: getCenter(),  // Center (loaded from .env file, default: 'BRANCHLESS')
  
  // Check if all required credentials are configured (Base URL, User ID, Merchant Key)
  isAutoVerificationEnabled: isFullyConfigured(),

  // Missing required env vars (empty when fully configured)
  missingConfig: getMissingConfig(),
  
  // API endpoint paths (relative to baseUrl)
  endpoints: {
    // KYC face verification endpoint path
    kycVerification: '/api/v1/third-party/verification/base_64/verification/kyc/face',
    // Yes/No face verification endpoint path
    yesNoVerification: '/api/v1/third-party/verification/yes_no/face',
  },
  
  /**
   * Helper function to construct full KYC verification API URL
   * Handles trailing slashes properly to avoid double slashes
   * @returns {string} Complete URL for KYC verification endpoint
   */
  getKycVerificationUrl: () => {
    // Get base URL or use empty string as fallback
    const base = apiConfig.baseUrl || '';
    // If no base URL is configured, return empty string
    if (!base) return '';
    // Remove any trailing slashes from base URL using regex (one or more slashes at end)
    const cleanBase = base.replace(/\/+$/, '');
    // Check if endpoint already starts with slash
    const endpoint = apiConfig.endpoints.kycVerification.startsWith('/') 
      ? apiConfig.endpoints.kycVerification  // Use endpoint as-is if it starts with /
      : `/${apiConfig.endpoints.kycVerification}`;  // Add leading slash if missing
    // Combine clean base URL with endpoint to create full URL
    return `${cleanBase}${endpoint}`;
  },
  
  /**
   * Helper function to construct full Yes/No verification API URL
   * Handles trailing slashes properly to avoid double slashes
   * @returns {string} Complete URL for Yes/No verification endpoint
   */
  getYesNoVerificationUrl: () => {
    // Get base URL or use empty string as fallback
    const base = apiConfig.baseUrl || '';
    // If no base URL is configured, return empty string
    if (!base) return '';
    // Remove any trailing slashes from base URL using regex (one or more slashes at end)
    const cleanBase = base.replace(/\/+$/, '');
    // Check if endpoint already starts with slash
    const endpoint = apiConfig.endpoints.yesNoVerification.startsWith('/') 
      ? apiConfig.endpoints.yesNoVerification  // Use endpoint as-is if it starts with /
      : `/${apiConfig.endpoints.yesNoVerification}`;  // Add leading slash if missing
    // Combine clean base URL with endpoint to create full URL
    return `${cleanBase}${endpoint}`;
  },
  
  /**
   * Get complete API configuration object
   * Returns all configuration values as an object
   * @returns {Object} Object containing all API configuration values
   */
  getApiConfig: () => {
    // Return object with all configuration values
    return {
      baseUrl: apiConfig.baseUrl,  // Base URL for API calls
      pinNumber: apiConfig.pinNumber,  // PIN Number (empty)
      userId: apiConfig.userId,  // User ID (empty)
      merchantKey: apiConfig.merchantKey,  // Merchant Key (empty)
      center: apiConfig.center,  // Center (default: 'BRANCHLESS')
    };
  },
};

export default apiConfig;
