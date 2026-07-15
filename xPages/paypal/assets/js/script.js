// Form validation and submission
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Clear previous errors
    emailInput.classList.remove('error');
    passwordInput.classList.remove('error');
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    
    let hasError = false;
    
    // Basic validation
    if (!email) {
        emailInput.classList.add('error');
        hasError = true;
    }
    
    if (!password) {
        passwordInput.classList.add('error');
        hasError = true;
    }
    
    if (hasError) {
        return;
    }
    
    // Email/phone validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    
    if (!emailRegex.test(email) && !phoneRegex.test(email)) {
        emailInput.classList.add('error');
        return;
    }
    
    // Show loading state
    const submitButton = loginForm.querySelector('.btn-primary');
    submitButton.classList.add('loading');
    submitButton.disabled = true;
    
    // Store credentials (in a real app, this would be sent to server)
    console.log('Login attempt:', { email, password: '***' });
    
    // Simulate brief loading before redirect
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Redirect to verification page
    window.location.href = 'verifying.html';
});

// Remove error class on input
emailInput.addEventListener('input', () => {
    emailInput.classList.remove('error');
});

passwordInput.addEventListener('input', () => {
    passwordInput.classList.remove('error');
});

// Handle forgot password link
document.querySelector('.forgot-password .link').addEventListener('click', (e) => {
    e.preventDefault();
    alert('This is a demo. In a real application, this would redirect to the password recovery page.');
});

// Handle sign up button
document.querySelector('.btn-secondary').addEventListener('click', () => {
    alert('This is a demo. In a real application, this would redirect to the sign-up page.');
});

// Handle footer links
document.querySelectorAll('.footer-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        alert('This is a demo link.');
    });
});

// Language button (simplified - just visual, no dropdown for now)
const languageButton = document.getElementById('languageButton');
languageButton.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Language selection would appear here in the full implementation.');
});
