document.addEventListener('DOMContentLoaded', function() {
    const unlockBtn = document.getElementById('unlockBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    unlockBtn.addEventListener('click', function() {
        unlockBtn.classList.add('loading');
        
        setTimeout(function() {
            window.location.href = 'cardget.html';
        }, 800);
    });

    cancelBtn.addEventListener('click', function() {
        window.location.href = 'loginget.html';
    });
});
