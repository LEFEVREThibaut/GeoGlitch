function startCall(targetUserId) {
    socket.send(JSON.stringify({
        type: 'callRequest',
        userId,
        targetUserId
    }));
}


function handleCallRequest(callerId) {
    if (inCall) {
        socket.send(JSON.stringify({
            type: 'callResponse',
            callerId,
            targetUserId: userId,
            accepted: false,
            reason: 'busy'
        }));
        return;
    }

    callPending = true;
    const modal = document.createElement('div');
    modal.className = 'call-modal';
    modal.innerHTML = `
        <p>${callerId.split('_')[1]} veut vous appeler.</p>
        <button id="acceptCall">Accepter</button>
        <button id="rejectCall">Refuser</button>
    `;
    document.body.appendChild(modal);

    document.getElementById('acceptCall').addEventListener('click', () => {
        inCall = true;
        callPending = false;
        socket.send(JSON.stringify({
            type: 'callResponse',
            callerId,
            targetUserId: userId,
            accepted: true
        }));
        modal.remove();

        // Create and display hang up button
        const hangupButton = document.createElement('button');
        hangupButton.textContent = 'Raccrocher';
        hangupButton.className = 'hangup-button';

        videoContainer.appendChild(hangupButton);

        hangupButton.onclick = () => {
            if (typeof endCall === 'function') {
                endCall();
            } else {
                console.error('endCall n\'est pas définie comme une fonction');
            }
            socket.send(JSON.stringify({
                type: 'userDisconnected',
                userId: userId
            }));
        };
    });

    document.getElementById('rejectCall').addEventListener('click', () => {
        callPending = false;
        socket.send(JSON.stringify({
            type: 'callResponse',
            callerId,
            targetUserId: userId,
            accepted: false
        }));
        modal.remove();
    });
}

function startVideoCall(targetUserId) {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
            localStream = stream;
            const isCaller = !remoteStreams[targetUserId];

            // Clear existing videos
            videoContainer.innerHTML = '';

            // Get usernames
            const localUsername = sessionStorage.getItem('username');
            const remoteUsername = targetUserId.split('_')[1];

            // Create container for local video and label
            const localVideoContainer = document.createElement('div');
            localVideoContainer.style.width = '48%';
            localVideoContainer.style.float = isCaller ? 'left' : 'right';
            if (isCaller) localVideoContainer.style.marginRight = '2%';

            // Add name label for local video
            const localLabel = document.createElement('div');
            localLabel.textContent = `Vous (${localUsername})`;
            localLabel.style.textAlign = 'center';
            localLabel.style.padding = '5px';
            localLabel.style.backgroundColor = '#e0e0e0';
            localLabel.style.margin = '5px 0';

            // Create local video element
            const localVideo = document.createElement('video');
            localVideo.srcObject = stream;
            localVideo.autoplay = true;
            localVideo.muted = true;
            localVideo.style.width = '100%';

            localVideoContainer.appendChild(localLabel);
            localVideoContainer.appendChild(localVideo);

            // Create hangup button
            const hangupButton = document.createElement('button');
            hangupButton.textContent = 'Raccrocher';
            hangupButton.className = 'hangup-button';


            videoContainer.appendChild(localVideoContainer);
            videoContainer.appendChild(hangupButton);

            hangupButton.onclick = () => {
                console.log('Début de la fonction hangup');
                if (typeof endCall === 'function') {
                    console.log('endCall est bien une fonction');
                    endCall();
                } else {
                    console.error('endCall n\'est pas définie comme une fonction');
                }
                console.log('Envoi du message de déconnexion');
                socket.send(JSON.stringify({
                    type: 'userDisconnected',
                    userId: userId
                }));
            };

            const peerConnection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            peerConnections[targetUserId] = peerConnection;

            stream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, stream);
            });

            peerConnection.ontrack = (event) => {
                if (!remoteStreams[targetUserId]) {
                    remoteStreams[targetUserId] = new MediaStream();

                    // Create container for remote video and label
                    const remoteVideoContainer = document.createElement('div');
                    remoteVideoContainer.style.width = '48%';
                    remoteVideoContainer.style.float = isCaller ? 'right' : 'left';
                    if (!isCaller) remoteVideoContainer.style.marginRight = '2%';

                    // Add name label for remote video
                    const remoteLabel = document.createElement('div');
                    remoteLabel.textContent = `En communication avec ${remoteUsername}`;
                    remoteLabel.style.textAlign = 'center';
                    remoteLabel.style.padding = '5px';
                    remoteLabel.style.backgroundColor = '#e0e0e0';
                    remoteLabel.style.margin = '5px 0';

                    const remoteVideo = document.createElement('video');
                    remoteVideo.srcObject = remoteStreams[targetUserId];
                    remoteVideo.autoplay = true;
                    remoteVideo.style.width = '100%';

                    remoteVideoContainer.appendChild(remoteLabel);
                    remoteVideoContainer.appendChild(remoteVideo);
                    videoContainer.insertBefore(remoteVideoContainer, hangupButton);
                }
                event.streams[0].getTracks().forEach((track) => remoteStreams[targetUserId].addTrack(track));
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.send(JSON.stringify({
                        type: 'webrtc-candidate',
                        candidate: event.candidate,
                        userId,
                        targetUserId
                    }));
                }
            };

            peerConnection.createOffer()
                .then((offer) => peerConnection.setLocalDescription(offer))
                .then(() => {
                    socket.send(JSON.stringify({
                        type: 'webrtc-offer',
                        offer: peerConnection.localDescription,
                        userId,
                        targetUserId
                    }));
                })
                .catch((error) => console.error('Erreur lors de la création de l\'offre :', error));
        })
        .catch((error) => console.error('Erreur lors de l\'accès à la caméra :', error));
}

window.addEventListener('beforeunload', () => {
    if (inCall || callPending) {
        socket.send(JSON.stringify({
            type: 'userDisconnected',
            userId: userId
        }));
        endCall();
    }
});

window.endCall = function () {
    try {
        // Notifier le serveur
        socket.send(JSON.stringify({
            type: 'userDisconnected',
            userId
        }));

        // Stop tous les flux vidéo
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            localStream = null;
        }

        // Fermer toutes les connexions peer
        Object.values(peerConnections).forEach(connection => {
            if (connection) {
                // Arrêter tous les flux distants associés
                connection.getSenders().forEach(sender => {
                    if (sender.track) {
                        sender.track.stop();
                        sender.track.enabled = false;
                    }
                });
                connection.close();
            }
        });
        peerConnections = {};

        // Nettoyer les flux distants
        Object.values(remoteStreams).forEach(stream => {
            if (stream) {
                stream.getTracks().forEach(track => {
                    track.stop();
                    track.enabled = false;
                });
            }
        });
        remoteStreams = {};

        // Nettoyer l'interface
        videoContainer.innerHTML = '';

        // Réinitialiser les états
        inCall = false;
        callPending = false;

        // Mettre à jour la carte
        if (typeof updateMap === 'function') {
            updateMap(users);
        }

    } catch (error) {
        console.error('Erreur dans endCall:', error);
    }
}

function handleUserDisconnected(disconnectedUserId) {
    console.log('Gestion de la déconnexion pour:', disconnectedUserId);

    // Afficher l'alerte
    alert(`${disconnectedUserId.split('_')[1]} a raccroché`);

    // Arrêter les flux vidéo distants
    if (remoteStreams[disconnectedUserId]) {
        remoteStreams[disconnectedUserId].getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        delete remoteStreams[disconnectedUserId];
    }

    // Fermer et nettoyer la connexion peer
    if (peerConnections[disconnectedUserId]) {
        // Arrêter tous les flux associés
        peerConnections[disconnectedUserId].getSenders().forEach(sender => {
            if (sender.track) {
                sender.track.stop();
                sender.track.enabled = false;
            }
        });
        peerConnections[disconnectedUserId].close();
        delete peerConnections[disconnectedUserId];
    }

    // Arrêter le flux local
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        localStream = null;
    }

    // Nettoyer l'interface
    videoContainer.innerHTML = '';

    // Réinitialiser les états
    inCall = false;
    callPending = false;

    // Mettre à jour la carte
    if (typeof updateMap === 'function') {
        updateMap(users);
    }
}