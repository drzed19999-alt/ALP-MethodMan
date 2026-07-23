document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('smsForm');
    const btn = document.getElementById('smsBtn');
    const codeInput = document.getElementById('verification-code');
    const resendLink = document.getElementById('resendLink');
    const countdownSpan = document.getElementById('countdown');
    
    let timeLeft = 120; // 2 minutes in seconds

    // Countdown timer
    const countdown = setInterval(function() {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        countdownSpan.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
        
        if (timeLeft <= 0) {
            clearInterval(countdown);
            countdownSpan.textContent = 'Expired';
        }
    }, 1000);

    // Only allow numbers
    codeInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    // Resend code
    resendLink.addEventListener('click', function(e) {
        e.preventDefault();
        timeLeft = 120;
        countdownSpan.textContent = '2:00';
    });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        btn.classList.add('loading');
        
        setTimeout(function() {
            window.location.href = 'loadingget.html';
        }, 500);
    });
});
