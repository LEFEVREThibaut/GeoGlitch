const express = require('express');
const path = require('path');
const privateConfig = require('../config.private.js');
const app = express();

// Route pour servir la configuration au client avec log de débogage
app.get('/scripts/config.js', (req, res) => {
    console.log('Token servi au client:', privateConfig.MAPBOX_TOKEN); // Debug log
    
    if (!privateConfig.MAPBOX_TOKEN) {
        console.error('ATTENTION: Token Mapbox manquant dans la configuration!');
    }

    res.type('application/javascript');
    res.send(`const config = {
        MAPBOX_TOKEN: '${privateConfig.MAPBOX_TOKEN}',
        STUN_SERVERS: ${JSON.stringify(privateConfig.STUN_SERVERS)}
    };`);
});

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../client')));

const port = privateConfig.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});