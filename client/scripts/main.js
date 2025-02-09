document.addEventListener('DOMContentLoaded', () => {
    try {
        initWebSocket();
    } catch (error) {
        console.error('Erreur lors de l\'initialisation du WebSocket:', error);
    }
});