// Form Submission Handler
document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signupForm');
    const emailInput = document.getElementById('email');
    const submitBtn = signupForm.querySelector('.continue-btn');
    
    // Check if email field is filled
    function checkFormValidity() {
        const emailFilled = emailInput.value.trim() !== '';
        
        if (emailFilled) {
            submitBtn.classList.add('active');
        } else {
            submitBtn.classList.remove('active');
        }
    }
    
    // Listen to input changes
    emailInput.addEventListener('input', checkFormValidity);
    
    // Initial check
    checkFormValidity();
    
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Redirect to verifying page
            window.location.href = 'verifying.html';
        });
    }
});
