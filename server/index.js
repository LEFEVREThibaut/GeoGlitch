const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const config = require('./config.private');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

require('./websocket')(wss);

app.use(express.static(path.join(__dirname, '../client'), { extensions: ['html', 'js'] }));

server.listen(config.PORT, () => {
    console.log(`Serveur démarré sur le port ${config.PORT}`);
});

// API RESTful pour récupérer les positions des utilisateurs
app.get('/api/positions', (req, res) => {
    console.log('Requête GET /api/positions');
    res.json(users);
});

app.get('/api/reset', (req, res) => {
    console.log('Réinitialisation des données');
    users = {};
    rooms = {};
    res.json({ message: 'Données réinitialisées' });
});

