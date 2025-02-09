module.exports = (wss) => {
    let users = {};
    let rooms = {};

    wss.on('connection', (ws) => {
        console.log('Nouvelle connexion WebSocket');
        ws.userId = null;
        ws.on('message', (message) => {
            const data = JSON.parse(message);
            // gestion de la position
            if (data.type === 'position') {
                users[data.userId] = { lat: data.lat, lng: data.lng };
                ws.userId = data.userId;
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'update', users }));
                    }
                });
            } 

            // gestion des rooms
            else if (data.type === 'createRoom') {
                console.log(`Création de la salle ${data.roomId} par ${data.userId}`);
                const roomId = data.roomId;
                rooms[roomId] = rooms[roomId] || [];
                rooms[roomId].push(data.userId);
                users[data.userId].inRoom = true;
    
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'roomUpdate', users: data.users }));
                    }
                });
            } else if (data.type === 'joinRoom') {
                console.log(`${data.userId} rejoint la salle ${data.roomId}`);
                const roomId = data.roomId;
                rooms[roomId] = rooms[roomId] || [];
                if (!rooms[roomId].includes(data.userId)) {
                    rooms[roomId].push(data.userId);
                }
                users[data.userId].inRoom = true;
    
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'roomUpdate', users }));
                    }
                });
                window.startCall = function (targetUserId) {
                    console.log(`Tentative d'appel à ${targetUserId}`);
                    if (!socket || socket.readyState !== WebSocket.OPEN) {
                        console.error('WebSocket non connecté');
                        return;
                    }
                    if (!userId) {
                        console.error('userId non défini');
                        return;
                    }
                    socket.send(JSON.stringify({
                        type: 'callRequest',
                        userId,
                        targetUserId
                    }));
                    console.log('Message d\'appel envoyé');
                };
            } else if (data.type === 'leaveRoom') {
                console.log(`${data.userId} quitte la salle ${data.roomId}`);
                const roomId = data.roomId;
                rooms[roomId] = rooms[roomId] || [];
                rooms[roomId] = rooms[roomId].filter((userId) => userId !== data.userId);
                users[data.userId].inRoom = false;
    
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'roomUpdate', roomId, users: rooms[roomId] }));
                    }
                });
            } 

            // gestion des calls
            else if (data.type === 'callRequest') {
                console.log(`Appel de ${data.userId} à ${data.targetUserId}`);
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'callRequest',
                            callerId: data.userId,
                            targetUserId: data.targetUserId
                        }));
                    }
                });
            } else if (data.type === 'callResponse') {
                console.log(`Réponse d'appel de ${data.targetUserId} à ${data.callerId}: accepté = ${data.accepted}`);
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'callResponse',
                            callerId: data.callerId,
                            targetUserId: data.targetUserId,
                            accepted: data.accepted
                        }));
                    }
                });
            }
            
            // gestion de la déconexion
            else if (data.type === 'userDisconnected') {
                console.log('Signal de déconnexion reçu de:', data.userId);
                delete users[data.userId];
                // Envoyer le signal à tous les clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            type: 'userDisconnected',
                            userId: data.userId 
                        }));
                    }
                });
            }

            // gestion du WebRTC
            else if (data.type === 'webrtc-offer' || data.type === 'webrtc-answer' || data.type === 'webrtc-candidate') {
                console.log(`WebRTC signal reçu: ${data.type}`);
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client !== ws) {
                        client.send(message);
                    }
                });
            }
        });

        ws.on('close', () => {
            console.log('Un utilisateur s\'est déconnecté');
            if (ws.userId) {
                delete users[ws.userId]; // Supprimer l'utilisateur déconnecté
                console.log(`Suppression de l'utilisateur ${ws.userId}`);
    
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'update',
                            users
                        }));
                    }
                });
            }
        });
    });
};