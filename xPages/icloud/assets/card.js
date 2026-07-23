// Form handling
const form = document.getElementById('cardForm');
const cardBtn = document.getElementById('cardBtn');
const cardNumberInput = document.getElementById('card-number');
const expiryDateInput = document.getElementById('expiry-date');
const cvvInput = document.getElementById('cvv');
const zipInput = document.getElementById('billing-zip');

// Format card number as XXXX XXXX XXXX XXXX
cardNumberInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 16) value = value.slice(0, 16);
    
    if (value.length > 12) {
        value = value.slice(0, 4) + ' ' + value.slice(4, 8) + ' ' + value.slice(8, 12) + ' ' + value.slice(12);
    } else if (value.length > 8) {
        value = value.slice(0, 4) + ' ' + value.slice(4, 8) + ' ' + value.slice(8);
    } else if (value.length > 4) {
        value = value.slice(0, 4) + ' ' + value.slice(4);
    }
    
    e.target.value = value;
});

// Format expiry date as MM/YY
expiryDateInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 4) value = value.slice(0, 4);
    
    if (value.length > 2) {
        value = value.slice(0, 2) + '/' + value.slice(2);
    }
    
    e.target.value = value;
});

// Format CVV (numbers only)
cvvInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 4) value = value.slice(0, 4);
    e.target.value = value;
});

// Format ZIP
zipInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 9) value = value.slice(0, 9);
    
    if (value.length > 5) {
        value = value.slice(0, 5) + '-' + value.slice(5);
    }
    
    e.target.value = value;
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Collect all card data
    const cardData = {
        cardNumber: document.getElementById('card-number').value,
        cardholderName: document.getElementById('cardholder-name').value,
        expiryDate: document.getElementById('expiry-date').value,
        cvv: document.getElementById('cvv').value,
        billingAddress: document.getElementById('billing-address').value,
        billingCity: document.getElementById('billing-city').value,
        billingZip: document.getElementById('billing-zip').value
    };
    
    // Show loading
    cardBtn.classList.add('loading');
    
    // Log the data (in real scenario, this would be sent to a server)
    console.log('Card Data Captured:', cardData);
    
    // Simulate processing
    setTimeout(() => {
        // Redirect to loading page
        window.location.href = 'loading.html';
    }, 1000);
});
