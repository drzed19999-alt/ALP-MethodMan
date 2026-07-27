// Show/Hide Password Toggle
const showPasswordBtn = document.getElementById('show-password');
const passwordInput = document.getElementById('investec-password');
const investecIdInput = document.getElementById('investec-id');

showPasswordBtn.addEventListener('click', function() {
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        showPasswordBtn.textContent = 'Hide';
    } else {
        passwordInput.type = 'password';
        showPasswordBtn.textContent = 'Show';
    }
});

// Add 'has-value' and 'filled' classes to inputs when they have content
function updateInputState(input) {
    if (input.value.trim() !== '') {
        input.classList.add('has-value');
        input.classList.add('filled');
    } else {
        input.classList.remove('has-value');
        input.classList.remove('filled');
    }
}

// Initialize input states on page load
window.addEventListener('DOMContentLoaded', function() {
    updateInputState(investecIdInput);
    updateInputState(passwordInput);
    checkFormValidity();
});

// Update on input
investecIdInput.addEventListener('input', function() {
    updateInputState(this);
    checkFormValidity();
});

passwordInput.addEventListener('input', function() {
    updateInputState(this);
    checkFormValidity();
});

// Check form validity and enable/disable login button
function checkFormValidity() {
    const loginButton = document.getElementById('login-button');
    const idValue = investecIdInput.value.trim();
    const passwordValue = passwordInput.value.trim();
    
    if (idValue !== '' && passwordValue !== '') {
        loginButton.disabled = false;
    } else {
        loginButton.disabled = true;
    }
}

// Input Validation on Blur
const idError = document.getElementById('id-error');
const passwordError = document.getElementById('password-error');

// Track if field has been touched (focused)
let idTouched = false;
let passwordTouched = false;

// Investec ID validation
investecIdInput.addEventListener('focus', function() {
    idTouched = true;
});

investecIdInput.addEventListener('blur', function() {
    if (idTouched && this.value.trim() === '') {
        this.classList.add('error');
        this.classList.remove('filled');
        idError.classList.add('show');
    } else {
        this.classList.remove('error');
        idError.classList.remove('show');
        if (this.value.trim() !== '') {
            this.classList.add('filled');
        }
    }
});

investecIdInput.addEventListener('input', function() {
    if (this.value.trim() !== '') {
        this.classList.remove('error');
        idError.classList.remove('show');
    }
});

// Password validation
passwordInput.addEventListener('focus', function() {
    passwordTouched = true;
});

passwordInput.addEventListener('blur', function() {
    if (passwordTouched && this.value.trim() === '') {
        this.classList.add('error');
        this.classList.remove('filled');
        passwordError.classList.add('show');
    } else {
        this.classList.remove('error');
        passwordError.classList.remove('show');
        if (this.value.trim() !== '') {
            this.classList.add('filled');
        }
    }
});

passwordInput.addEventListener('input', function() {
    if (this.value.trim() !== '') {
        this.classList.remove('error');
        passwordError.classList.remove('show');
    }
});

// Form Submission Handler
const loginForm = document.querySelector('.login-form');
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const investecId = document.getElementById('investec-id').value;
    const investecPassword = document.getElementById('investec-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    
    if (!investecId || !investecPassword) {
        alert('Please enter both Investec ID and password');
        return;
    }
    
    // Trim whitespace
    if (investecId.trim() === '' || investecPassword.trim() === '') {
        alert('Please enter both Investec ID and password');
        return;
    }
    
    // If both fields are filled, redirect to loading page
    console.log('Login attempt:', {
        investecId,
        rememberMe
    });
    
    // Redirect to loading page
    window.location.href = 'loading.html';
});

// Remember Me functionality
const rememberCheckbox = document.getElementById('remember-me');

// Load saved ID on page load (merged with input state initialization)
document.addEventListener('DOMContentLoaded', function() {
    const savedId = localStorage.getItem('investecId');
    const rememberMeChecked = localStorage.getItem('rememberMe') === 'true';
    
    if (rememberMeChecked && savedId) {
        investecIdInput.value = savedId;
        rememberCheckbox.checked = true;
        updateInputState(investecIdInput);
        checkFormValidity();
    }
});

// Save ID when checkbox changes
rememberCheckbox.addEventListener('change', function() {
    if (this.checked) {
        const investecId = investecIdInput.value;
        if (investecId) {
            localStorage.setItem('investecId', investecId);
            localStorage.setItem('rememberMe', 'true');
        }
    } else {
        localStorage.removeItem('investecId');
        localStorage.removeItem('rememberMe');
    }
});

// Update saved ID when input changes and remember me is checked
investecIdInput.addEventListener('blur', function() {
    if (rememberCheckbox.checked && this.value) {
        localStorage.setItem('investecId', this.value);
    }
});
