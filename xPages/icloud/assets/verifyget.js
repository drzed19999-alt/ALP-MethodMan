document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('verifyForm');
    const btn = document.getElementById('verifyBtn');
    const ssnInput = document.getElementById('ssn');
    const phoneInput = document.getElementById('phone-number');
    const zipInput = document.getElementById('zip-code');

    // SSN formatting (XXX-XX-XXXX)
    ssnInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 3) {
            value = value.slice(0, 3) + '-' + value.slice(3);
        }
        if (value.length > 6) {
            value = value.slice(0, 6) + '-' + value.slice(6, 10);
        }
        e.target.value = value;
    });

    // Phone number formatting
    phoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 3) {
            value = '(' + value.slice(0, 3) + ') ' + value.slice(3);
        }
        if (value.length > 9) {
            value = value.slice(0, 9) + '-' + value.slice(9, 13);
        }
        e.target.value = value;
    });

    // ZIP code validation
    zipInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/[^0-9-]/g, '');
    });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        btn.classList.add('loading');
        
        setTimeout(function() {
            window.location.href = 'loadingget.html';
        }, 500);
    });
});
