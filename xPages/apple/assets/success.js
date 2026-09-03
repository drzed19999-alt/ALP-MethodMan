// Countdown and redirect functionality
let countdown = 7;
const countdownElement = document.getElementById('countdown');

function updateCountdown() {
    countdown--;
    countdownElement.textContent = countdown;
    
    if (countdown <= 0) {
        window.location.href = 'https://www.apple.com';
    }
}

// Start countdown
const countdownInterval = setInterval(updateCountdown, 1000);

// Allow manual redirect via button
document.querySelector('.btn-continue').addEventListener('click', function(e) {
    e.preventDefault();
    clearInterval(countdownInterval);
    window.location.href = 'https://www.apple.com';
});
