let socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`);
const videoContainer = document.getElementById('videoContainer');
const appContainer = document.getElementById('appContainer');
const loginButton = document.getElementById('loginButton');
let localStream;
let remoteStreams = {};
let peerConnections = {};
let userId = null;
let currentMarker = null;
let callPending = false;
let inCall = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

let dataUser = {
    name: '',
    position: null,
    speed: null,
    altitude: null,
    timestamp: null,
    async init() {
        try {
            if (navigator.geolocation) {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true
                    });
                });
                this.updateData(pos);
            }
        } catch (err) {
            // console.error('Error getting location:', err);
        }
        return this;
    },
    updateData(position) {
        this.position = position.coords;
        this.speed = position.coords.speed || null;
        this.altitude = position.coords.altitude;
        this.timestamp = position.timestamp;
    }
};

dataUser.init();

function initWebSocket() {
    socket.onclose = (event) => {
        console.log('WebSocket déconnecté');
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            console.log('Tentative de reconnexion...');
            reconnectAttempts++;
            setTimeout(() => {
                initWebSocket();
            }, 1000 * reconnectAttempts);
        }
    };

    socket.onopen = () => {
        console.log('WebSocket connecté');
        reconnectAttempts = 0;
        
        // Si on a un userId stocké, on réinitialise la connexion
        const savedUserId = sessionStorage.getItem('userId');
        if (savedUserId) {
            userId = savedUserId;
            const savedPosition = JSON.parse(sessionStorage.getItem('userPosition'));
            if (savedPosition) {
                socket.send(JSON.stringify({
                    type: 'position',
                    userId,
                    lat: savedPosition.lat,
                    lng: savedPosition.lng,
                    inRoom: false
                }));
            }
        }
    };
    
    socket.onmessage = async (event) => {
        try {
            const data = event.data instanceof Blob ?
                JSON.parse(await event.data.text()) :
                JSON.parse(event.data);
            console.log("data.type", data.type);
            if (data.type === 'update') {
                updateMap(data.users);
            } else if (data.type === 'callRequest' && data.targetUserId === userId) {
                handleCallRequest(data.callerId);
            } else if (data.type === 'callResponse' && data.callerId === userId) {
                if (data.accepted) {
                    startVideoCall(data.targetUserId);
                } else {
                    alert('L\'utilisateur a refusé l\'appel.');
                }
            } else if (data.type === 'webrtc-offer' && data.targetUserId === userId) {
                const peerConnection = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                peerConnections[data.userId] = peerConnection;

                const isCaller = false;
                const localUsername = sessionStorage.getItem('username');
                const remoteUsername = data.userId.split('_')[1];

                peerConnection.ontrack = (event) => {
                    if (!remoteStreams[data.userId]) {
                        remoteStreams[data.userId] = new MediaStream();

                        // Create container for remote video and label
                        const remoteVideoContainer = document.createElement('div');
                        remoteVideoContainer.style.width = '48%';
                        remoteVideoContainer.style.float = 'right';

                        // Add name label for remote video
                        const remoteLabel = document.createElement('div');
                        remoteLabel.textContent = `En communication avec ${remoteUsername}`;
                        remoteLabel.style.textAlign = 'center';
                        remoteLabel.style.padding = '5px';
                        remoteLabel.style.backgroundColor = '#e0e0e0';
                        remoteLabel.style.margin = '5px 0';

                        const remoteVideo = document.createElement('video');
                        remoteVideo.srcObject = remoteStreams[data.userId];
                        remoteVideo.autoplay = true;
                        remoteVideo.style.width = '100%';

                        remoteVideoContainer.appendChild(remoteLabel);
                        remoteVideoContainer.appendChild(remoteVideo);
                        videoContainer.appendChild(remoteVideoContainer);
                    }
                    event.streams[0].getTracks().forEach((track) => remoteStreams[data.userId].addTrack(track));
                };

                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.send(JSON.stringify({
                            type: 'webrtc-candidate',
                            candidate: event.candidate,
                            userId,
                            targetUserId: data.userId
                        }));
                    }
                };

                peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
                    .then(() => navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
                    .then((stream) => {
                        localStream = stream;

                        // Create container for local video and label
                        const localVideoContainer = document.createElement('div');
                        localVideoContainer.style.width = '48%';
                        localVideoContainer.style.float = 'left';

                        // Add name label for local video
                        const localLabel = document.createElement('div');
                        localLabel.textContent = `Vous (${localUsername})`;
                        localLabel.style.textAlign = 'center';
                        localLabel.style.padding = '5px';
                        localLabel.style.backgroundColor = '#e0e0e0';
                        localLabel.style.margin = '5px 0';

                        const localVideo = document.createElement('video');
                        localVideo.srcObject = stream;
                        localVideo.autoplay = true;
                        localVideo.muted = true;
                        localVideo.style.width = '100%';

                        localVideoContainer.appendChild(localLabel);
                        localVideoContainer.appendChild(localVideo);
                        videoContainer.appendChild(localVideoContainer);

                        stream.getTracks().forEach((track) => {
                            peerConnection.addTrack(track, stream);
                        });

                        return peerConnection.createAnswer();
                    })
                    .then((answer) => peerConnection.setLocalDescription(answer))
                    .then(() => {
                        socket.send(JSON.stringify({
                            type: 'webrtc-answer',
                            answer: peerConnection.localDescription,
                            userId,
                            targetUserId: data.userId
                        }));
                    });
            } else if (data.type === 'webrtc-answer' && data.targetUserId === userId) {
                peerConnections[data.userId].setRemoteDescription(new RTCSessionDescription(data.answer));
            } else if (data.type === 'webrtc-candidate' && data.targetUserId === userId) {
                peerConnections[data.userId].addIceCandidate(new RTCIceCandidate(data.candidate));
            } else if (data.type === 'userDisconnected') {
                console.log('Réception du signal de déconnexion pour:', data.userId);
                if (peerConnections[data.userId]) {
                    handleUserDisconnected(data.userId);
                }
            }
        } catch (error) {
            console.error('Erreur de traitement du message :', event.data, error);
        }
    };
}

window.endCall = function() {
    // Envoyer d'abord le signal de déconnexion
    socket.send(JSON.stringify({
        type: 'userDisconnected',
        userId
    }));

    // Arrêter les flux vidéo
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Fermer toutes les connexions peer
    Object.values(peerConnections).forEach(connection => {
        if (connection) {
            connection.close();
        }
    });
    peerConnections = {};

    // Nettoyer les flux distants
    remoteStreams = {};

    // Nettoyer le conteneur vidéo
    videoContainer.innerHTML = '';

    // Réinitialiser les états
    inCall = false;
    callPending = false;
};

function handleUserDisconnected(disconnectedUserId) {
    console.log('Gestion de la déconnexion pour:', disconnectedUserId);
    
    // Afficher l'alerte
    alert(`${disconnectedUserId.split('_')[1]} a raccroché`);

    // Arrêter les flux vidéo distants
    if (remoteStreams[disconnectedUserId]) {
        delete remoteStreams[disconnectedUserId];
    }

    // Fermer la connexion peer
    if (peerConnections[disconnectedUserId]) {
        peerConnections[disconnectedUserId].close();
        delete peerConnections[disconnectedUserId];
    }

    // Nettoyer l'interface
    videoContainer.innerHTML = '';
    
    // Réinitialiser les états
    inCall = false;
    callPending = false;

    // Arrêter le flux local
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
}

function sendPosition(userId, lat, lng) {
    socket.send(JSON.stringify({ type: 'position', userId, lat, lng }));
}