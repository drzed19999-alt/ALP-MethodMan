// SMS Code verification
const smsForm = document.getElementById('smsForm');
const smsCodeInput = document.getElementById('smsCode');
const resendBtn = document.getElementById('resendBtn');

// Auto-format input to numbers only
smsCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    smsCodeInput.classList.remove('error');
});

// Form submission
smsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const code = smsCodeInput.value.trim();
    
    if (code.length !== 6) {
        smsCodeInput.classList.add('error');
        return;
    }
    
    const submitButton = smsForm.querySelector('.btn-primary');
    submitButton.classList.add('loading');
    submitButton.disabled = true;
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('SMS Code entered:', code);
    window.location.href = 'verifying.html';
});

// Resend code
resendBtn.addEventListener('click', () => {
    alert('A new code has been sent to your phone.');
    resendBtn.disabled = true;
    resendBtn.textContent = 'Code Sent';
    
    setTimeout(() => {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend Code';
    }, 30000);
});

// Handle links
document.querySelectorAll('.footer-link, .help-links .link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
    });
});
