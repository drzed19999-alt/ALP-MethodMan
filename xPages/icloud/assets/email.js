// Form handling
const form = document.getElementById('emailForm');
const emailBtn = document.getElementById('emailBtn');
const codeInput = document.getElementById('verification-code');
const countdownElement = document.getElementById('countdown');
const resendLink = document.getElementById('resendLink');

let timeLeft = 120; // 2 minutes in seconds
let countdownInterval;

// Format code input (numbers only)
codeInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 6) value = value.slice(0, 6);
    e.target.value = value;
});

// Countdown timer
function startCountdown() {
    countdownInterval = setInterval(() => {
        timeLeft--;
        
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            countdownElement.textContent = '0:00';
            countdownElement.parentElement.innerHTML = '<p class="countdown-text expired">Code has expired. Please request a new one.</p>';
            emailBtn.disabled = true;
            codeInput.disabled = true;
        }
    }, 1000);
}

// Start countdown on page load
startCountdown();

// Resend code
resendLink.addEventListener('click', (e) => {
    e.preventDefault();
    clearInterval(countdownInterval);
    timeLeft = 120;
    emailBtn.disabled = false;
    codeInput.disabled = false;
    codeInput.value = '';
    countdownElement.parentElement.innerHTML = '<p class="countdown-text">Code expires in: <span id="countdown">2:00</span></p>';
    const newCountdown = document.getElementById('countdown');
    
    // Restart countdown with new element
    countdownInterval = setInterval(() => {
        timeLeft--;
        
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        newCountdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            newCountdown.textContent = '0:00';
            newCountdown.parentElement.innerHTML = '<p class="countdown-text expired">Code has expired. Please request a new one.</p>';
            emailBtn.disabled = true;
            codeInput.disabled = true;
        }
    }, 1000);
    
    alert('A new verification code has been sent.');
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const code = codeInput.value;
    
    if (code.length === 6) {
        // Show loading
        emailBtn.classList.add('loading');
        
        // Log the code
        console.log('Verification Code:', code);
        
        // Simulate verification
        setTimeout(() => {
            // Redirect to loading page
            window.location.href = 'loading.html';
        }, 1000);
    }
});
