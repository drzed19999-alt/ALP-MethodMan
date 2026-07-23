document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('cardForm');
    const btn = document.getElementById('cardBtn');
    const cardNumber = document.getElementById('card-number');
    const expiryDate = document.getElementById('expiry-date');
    const cvv = document.getElementById('cvv');
    const zipCode = document.getElementById('billing-zip');

    // Card number formatting
    cardNumber.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
    });

    // Expiry date formatting
    expiryDate.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
    });

    // CVV validation
    cvv.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    // ZIP code validation
    zipCode.addEventListener('input', function(e) {
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
