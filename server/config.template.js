// Ce fichier sert d'exemple et doit être copié en config.js
const config = {
    PORT: 3000,
    MAPBOX_TOKEN: 'your_mapbox_token_here', // Remplacer par votre token Mapbox
    STUN_SERVERS: {
        iceServers: [
            {
                urls: ['stun:stun.l.google.com:19302']
            }
        ]
    }
};

// Permet l'utilisation dans Node.js et le navigateur
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
} else {
    window.config = config;
}