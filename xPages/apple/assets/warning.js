// Create the colorful dot ring animation
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('dotCanvas');
    const ctx = canvas.getContext('2d');
    
    const centerX = 80;
    const centerY = 80;
    const radius = 60;
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
});

// Button handlers
document.querySelector('.btn-cancel').addEventListener('click', () => {
    window.location.href = 'index.html';
});

document.querySelector('.btn-unlock').addEventListener('click', () => {
    window.location.href = 'loadingget.html';
});
