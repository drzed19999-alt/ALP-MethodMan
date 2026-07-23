// Create the colorful dot ring animation
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('dotCanvas');
    const ctx = canvas.getContext('2d');
    
    const centerX = 100;
    const centerY = 100;
    const radius = 70;
    const dotCount = 48;
    const dotRadius = 3.5;
    
    // More accurate color gradient matching the screenshot
    const colors = [
        { h: 15, s: 85, l: 68 },     // Orange/Peach
        { h: 30, s: 90, l: 65 },     // Orange
        { h: 48, s: 95, l: 60 },     // Yellow-Orange
        { h: 180, s: 45, l: 70 },    // Cyan
        { h: 200, s: 60, l: 65 },    // Light Blue
        { h: 220, s: 65, l: 60 },    // Blue
        { h: 270, s: 70, l: 65 },    // Purple
        { h: 320, s: 75, l: 68 }     // Magenta/Pink
    ];
    
    function drawDots() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < dotCount; i++) {
            const angle = (i / dotCount) * Math.PI * 2 - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            // Calculate color based on position
            const colorIndex = (i / dotCount) * colors.length;
            const colorFloor = Math.floor(colorIndex) % colors.length;
            const colorCeil = Math.ceil(colorIndex) % colors.length;
            const colorMix = colorIndex % 1;
            
            const color1 = colors[colorFloor];
            const color2 = colors[colorCeil];
            
            const h = color1.h + (color2.h - color1.h) * colorMix;
            const s = color1.s + (color2.s - color1.s) * colorMix;
            const l = color1.l + (color2.l - color1.l) * colorMix;
            
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
            ctx.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
            ctx.fill();
        }
    }
    
    drawDots();
    
    // Add subtle animation on hover
    const logoContainer = document.querySelector('.logo-container');
    let animationId = null;
    let rotation = 0;
    
    function animate() {
        rotation += 0.005;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < dotCount; i++) {
            const angle = (i / dotCount) * Math.PI * 2 - Math.PI / 2 + rotation;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            const colorIndex = (i / dotCount) * colors.length;
            const colorFloor = Math.floor(colorIndex) % colors.length;
            const colorCeil = Math.ceil(colorIndex) % colors.length;
            const colorMix = colorIndex % 1;
            
            const color1 = colors[colorFloor];
            const color2 = colors[colorCeil];
            
            const h = color1.h + (color2.h - color1.h) * colorMix;
            const s = color1.s + (color2.s - color1.s) * colorMix;
            const l = color1.l + (color2.l - color1.l) * colorMix;
            
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
            ctx.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
            ctx.fill();
        }
        
        animationId = requestAnimationFrame(animate);
    }
    
    logoContainer.addEventListener('mouseenter', () => {
        if (!animationId) {
            animate();
        }
    });
    
    logoContainer.addEventListener('mouseleave', () => {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
            rotation = 0;
            drawDots();
        }
    });
});

// Form handling - Enable/disable Continue button
const form = document.querySelector('.signin-form');
const emailInput = document.getElementById('apple-id-email');
const passwordInput = document.getElementById('apple-id-password');
const passwordGroup = document.getElementById('passwordGroup');
const continueBtn = document.getElementById('continueBtn');
const signinBtn = document.getElementById('signinBtn');
const buttonGroup = document.getElementById('buttonGroup');
const createLink = document.getElementById('createLink');
const checkboxContainer = document.getElementById('checkboxContainer');
const iphoneBtn = document.getElementById('iphoneBtn');
const infoSection = document.querySelector('.info-section');
const requirements = document.querySelector('.requirements');
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
                infoSection.style.display = 'none';
                requirements.style.display = 'none';
                
                // Hide create link and show checkbox container
                createLink.style.display = 'none';
                checkboxContainer.style.display = 'flex';
                
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
