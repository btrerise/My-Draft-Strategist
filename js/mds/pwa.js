// Moved from js/mds.js in refactor chunk 2A:
// PWA & SERVICE WORKER.
import { State } from './state.js';

    // --- PWA & SERVICE WORKER ---
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        State.deferredPrompt = e;
        const installCard = document.getElementById('installCard');
        if (installCard) installCard.style.display = 'block';
    });

    const installAppBtn = document.getElementById('installAppBtn');
    if (installAppBtn) {
        installAppBtn.addEventListener('click', async () => {
            if (State.deferredPrompt) {
                State.deferredPrompt.prompt();
                const { outcome } = await State.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    const installCard = document.getElementById('installCard');
                    if (installCard) installCard.style.display = 'none';
                }
                State.deferredPrompt = null;
            }
        });
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker registration failed: ', err));
        });
    }
