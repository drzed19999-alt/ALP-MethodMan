// Form handling
const form = document.getElementById('loginForm');
const emailInput = document.getElementById('apple-email');
const passwordInput = document.getElementById('apple-password');
const passwordGroup = document.getElementById('passwordGroup');
const continueBtn = document.getElementById('continueBtn');
const signinBtn = document.getElementById('signinBtn');
const buttonGroup = document.getElementById('buttonGroup');
const iphoneBtn = document.getElementById('iphoneBtn');
const infoBox = document.getElementById('infoBox');
const requirements = document.getElementById('requirements');
const combinedInput = document.getElementById('combinedInput');

let currentStep = 'email'; // 'email' or 'password'

// Handle focus state for combined input
emailInput.addEventListener('focus', () => {
    combinedInput.classList.add('focused');
});

emailInput.addEventListener('blur', () => {
    if (currentStep === 'email') {
        combinedInput.classList.remove('focused');
    }
});

passwordInput.addEventListener('focus', () => {
    combinedInput.classList.add('focused');
});

passwordInput.addEventListener('blur', () => {
    combinedInput.classList.remove('focused');
});

emailInput.addEventListener('input', () => {
    if (emailInput.value.trim()) {
        continueBtn.disabled = false;
    } else {
        continueBtn.disabled = true;
    }
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (currentStep === 'email') {
        if (emailInput.value.trim()) {
            // Show loading state
            continueBtn.classList.add('loading');
            
            // Simulate API call
            setTimeout(() => {
                // Transform to password step
                currentStep = 'password';
                
                // Show password field
                passwordGroup.style.display = 'block';
                
                // Hide Continue button and iPhone button
                buttonGroup.style.display = 'none';
                
                // Hide info section and requirements
                infoBox.style.display = 'none';
                requirements.style.display = 'none';
                
                // Show Sign In button
                signinBtn.style.display = 'block';
                
                // Focus password field
                setTimeout(() => passwordInput.focus(), 100);
            }, 800);
        }
    } else if (currentStep === 'password') {
        if (passwordInput.value.trim()) {
            // Show loading on Sign In button
            signinBtn.classList.add('loading');
            
            setTimeout(() => {
                // Redirect to loading page
                window.location.href = 'loading.html';
            }, 800);
        }
    }
});

// Sign in with iPhone button
iphoneBtn.addEventListener('click', () => {
    alert('This feature requires an iPhone with iOS 17 or later nearby.');
});
