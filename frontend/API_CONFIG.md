# API Configuration Guide

This application requires you to configure API credentials in a `.env` file. Users will only need to enter their **Ghana card number** to verify their identity.

## ⚠️ Important Security Note

**All secrets must be stored in the `.env` file, NOT in the code.** This ensures:
- Secrets are not committed to version control
- Different environments can use different credentials
- Security best practices are followed

---

## Quick Setup

### 1. Create .env File

Create a `.env` file in the `frontend` directory:

```bash
cd frontend
cp ENV_TEMPLATE.txt .env
```

### 2. Configure API Credentials

Edit the `.env` file and add your actual API credentials:

```env
# Required: Base URL for the third-party verification API
REACT_APP_API_BASE_URL=https://selfie.imsgh.org:2035/skyface

# Required: User ID for API authentication
REACT_APP_DEFAULT_USER_ID=your-actual-user-id

# Required: Merchant Key for API authentication
REACT_APP_DEFAULT_MERCHANT_KEY=your-actual-merchant-key

# Optional: Center (defaults to 'BRANCHLESS' if not set)
REACT_APP_DEFAULT_CENTER=BRANCHLESS
```

### 3. Restart Development Server

After creating or modifying the `.env` file, restart your development server:

```bash
npm start
```

**That's it!** Users will now only need to enter their Ghana card number and upload/take a photo.

---

## Required Environment Variables

### Base URL (Required)

```env
REACT_APP_API_BASE_URL=https://selfie.imsgh.org:2035/skyface
```

The base URL for the third-party verification API. This is the root URL where all API endpoints are located.

### User ID (Required)

```env
REACT_APP_DEFAULT_USER_ID=your-user-id
```

Your API user ID for authentication. Users won't see or need to enter this - it's loaded automatically from the `.env` file.

### Merchant Key (Required)

```env
REACT_APP_DEFAULT_MERCHANT_KEY=xxx-xxxx-xxxx-xxx
```

Your API merchant key for authentication. Users won't see or need to enter this - it's loaded automatically from the `.env` file.

### Center (Optional)

```env
REACT_APP_DEFAULT_CENTER=BRANCHLESS
```

The center value for API requests. Defaults to `'BRANCHLESS'` if not set.

---

## How It Works

### Configuration Loading

1. The application reads configuration from environment variables in the `.env` file
2. **No hardcoded secrets** - all credentials come from `.env` only
3. Environment variables are embedded at build time (not runtime)
4. The `.env` file is automatically ignored by git (already in `.gitignore`)

### User Experience

Once configured, users will see a simplified interface:

1. **Enter Ghana Card Number**: Users enter their Ghana card number in format: `GHA-xxxxxxxxx-x`
2. **Upload Image or Take Selfie**: Users can either:
   - Upload a photo from their device
   - Take a live selfie using their camera
3. **Click Verify**: The app automatically uses your pre-configured credentials (User ID, Merchant Key, Center) from the `.env` file along with the user's Ghana card number to verify

### What Users See

- ✅ Simple form with only "Ghana Card Number" input field
- ✅ Image upload area with "Take Live Selfie" button
- ✅ Verify button
- ❌ No User ID, Merchant Key, or Center fields (these are hidden and loaded from `.env`)

---

## Security Best Practices

### ✅ DO:

- Store all secrets in the `.env` file
- Keep the `.env` file in `.gitignore` (already configured)
- Use different `.env` files for different environments (development, staging, production)
- Share `.env.example` or `ENV_TEMPLATE.txt` as a template (without actual secrets)
- Restart the development server after changing `.env` file

### ❌ DON'T:

- Commit the `.env` file to version control
- Hardcode secrets in `config/api.js` or any other code files
- Share your actual `.env` file with others
- Expose `.env` files publicly

---

## Production Deployment

For production builds, set environment variables in your hosting platform:

### Vercel

1. Go to Project Settings → Environment Variables
2. Add each variable:
   - `REACT_APP_API_BASE_URL`
   - `REACT_APP_DEFAULT_USER_ID`
   - `REACT_APP_DEFAULT_MERCHANT_KEY`
   - `REACT_APP_DEFAULT_CENTER` (optional)

### Netlify

1. Go to Site Settings → Build & Deploy → Environment
2. Add each variable with the same names as above

### Heroku

```bash
heroku config:set REACT_APP_API_BASE_URL=https://selfie.imsgh.org:2035/skyface
heroku config:set REACT_APP_DEFAULT_USER_ID=your-user-id
heroku config:set REACT_APP_DEFAULT_MERCHANT_KEY=your-merchant-key
heroku config:set REACT_APP_DEFAULT_CENTER=BRANCHLESS
```

### Docker

In `docker-compose.yml`:

```yaml
services:
  frontend:
    environment:
      - REACT_APP_API_BASE_URL=https://selfie.imsgh.org:2035/skyface
      - REACT_APP_DEFAULT_USER_ID=your-user-id
      - REACT_APP_DEFAULT_MERCHANT_KEY=your-merchant-key
      - REACT_APP_DEFAULT_CENTER=BRANCHLESS
```

Or pass via `-e` flag:

```bash
docker run -e REACT_APP_API_BASE_URL=... -e REACT_APP_DEFAULT_USER_ID=... ...
```

---

## Example .env File

```env
# API Configuration
# Copy this file to .env and fill in your actual values
# Never commit the .env file to version control

# Required: Base URL for the third-party verification API
REACT_APP_API_BASE_URL=https://selfie.imsgh.org:2035/skyface

# Required: User ID for API authentication
REACT_APP_DEFAULT_USER_ID=your-user-id-here

# Required: Merchant Key for API authentication
REACT_APP_DEFAULT_MERCHANT_KEY=your-merchant-key-here

# Optional: Center (defaults to 'BRANCHLESS' if not set)
REACT_APP_DEFAULT_CENTER=BRANCHLESS

# Note: Users will only need to enter their Ghana card number (PIN Number)
# in the frontend UI. All other credentials are loaded from this .env file.
```

---

## Troubleshooting

### "Base URL is not configured" Error

- Check that `REACT_APP_API_BASE_URL` is set in your `.env` file
- Make sure the `.env` file is in the `frontend` directory (not the root)
- Restart the development server after creating/modifying `.env`
- Check browser console for configuration loading messages

### "User ID is not configured" Error

- Check that `REACT_APP_DEFAULT_USER_ID` is set in your `.env` file
- Restart the development server after modifying `.env`

### "Merchant Key is not configured" Error

- Check that `REACT_APP_DEFAULT_MERCHANT_KEY` is set in your `.env` file
- Restart the development server after modifying `.env`

### Changes Not Taking Effect

- **Always restart the development server** after modifying the `.env` file
- Environment variables are embedded at build time, so changes require a restart
- Clear browser cache if issues persist
- Check browser console for configuration loading messages

### Environment Variables Not Loading

- Make sure variable names start with `REACT_APP_` (required for Create React App)
- Check for typos in variable names
- Ensure there are no spaces around the `=` sign in `.env` file
- Don't use quotes around values in `.env` file (unless the value itself contains spaces)

---

## File Structure

```
frontend/
├── .env                    # Your actual secrets (NOT in git)
├── .env.example            # Template file (can be in git)
├── ENV_TEMPLATE.txt        # Template file (can be in git)
├── src/
│   └── config/
│       └── api.js          # Reads from .env (no hardcoded secrets)
└── ...
```

---

## Summary

1. ✅ Create `.env` file in `frontend` directory
2. ✅ Add all required environment variables
3. ✅ Restart development server
4. ✅ Users only enter Ghana card number
5. ✅ All secrets stay in `.env` (never in code)
