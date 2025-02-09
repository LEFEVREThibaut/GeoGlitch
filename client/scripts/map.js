// Attendre que le DOM et les scripts soient chargés
document.addEventListener('DOMContentLoaded', () => {
    if (typeof config === 'undefined') {
        console.error('La configuration n\'est pas chargée !');
        return;
    }

    console.log('Token Mapbox:', config.MAPBOX_TOKEN); // Debug log

    // Vérifier que le token n'est pas vide ou undefined
    if (!config.MAPBOX_TOKEN) {
        console.error('Token Mapbox manquant !');
        return;
    }

    mapboxgl.accessToken = config.MAPBOX_TOKEN;
    let map;
    let markers = {};

    // Create info panel once
    const infoPanel = document.createElement('div');
    infoPanel.id = 'infoPanel';
    document.body.appendChild(infoPanel);   

    function initMap() {
        try {
            map = new mapboxgl.Map({
                container: 'map',
                style: 'mapbox://styles/mapbox/streets-v11',
                center: [0, 0],
                zoom: 2,
            });
        } catch (error) {
            console.error('Erreur lors de l\'initialisation de la carte:', error);
        }
        
        map.on('idle', () => {
            map.resize();
        });
    }

    window.updateMap = function(users) {
        for (const [uid, position] of Object.entries(users)) {
            if (!markers[uid] && uid !== userId) {
                const marker = new mapboxgl.Marker()
                    .setLngLat([position.lng, position.lat])
                    .setPopup(new mapboxgl.Popup().setHTML(generatePopupHTML(uid)))
                    .addTo(map);
                markers[uid] = marker;
            }
        }

        Object.keys(markers).forEach((markerId) => {
            if (!users[markerId]) {
                markers[markerId].remove();
                delete markers[markerId];
            }
        });
    }

    function generatePopupHTML(uid) {
        if (inCall || callPending) {
            return `
                <p><strong>Utilisateur :</strong> ${uid.split('_')[1]}</p>
                <p>Appel en cours ou en attente</p>
            `;
        } else {
            return `
                <p><strong>Utilisateur :</strong> ${uid.split('_')[1]}</p>
                <button data-user-id="${uid}" onclick="startCall('${uid}')">Appeler</button>
            `;
        }
    }

    function updateAllPopups() {
        Object.entries(markers).forEach(([uid, marker]) => {
            marker.getPopup().setHTML(generatePopupHTML(uid));
        });
    }


    function updatePositionInfo(position) {
        // Update user data
        dataUser.updateData(position);

        // Update info panel
        infoPanel.innerHTML = `
            <p><strong>Position:</strong> ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}</p>
            <p><strong>Altitude:</strong> ${position.coords.altitude ? position.coords.altitude.toFixed(2) + 'm' : 'Non-Disponible'}</p>
            <p><strong>Vitesse:</strong> ${position.coords.speed ? (position.coords.speed * 3.6).toFixed(2) + 'km/h' : 'Non-Disponible'}</p>
        `;

        // Update marker position if it exists
        if (currentMarker) {
            currentMarker.setLngLat([position.coords.longitude, position.coords.latitude]);
        }
        else {
            currentMarker = new mapboxgl.Marker()
                .setLngLat([position.coords.longitude, position.coords.latitude])
                .addTo(map);
        }

        // Send position update to server
        if (userId) {
            socket.send(JSON.stringify({
                type: 'position',
                userId,
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                inRoom: inCall
            }));
        }
    }

    appContainer.style.display = 'none';

    window.addEventListener('load', () => {
        initMap();
        
        // Vérifier si une session existe
        const savedUserId = sessionStorage.getItem('userId');
        const savedPosition = JSON.parse(sessionStorage.getItem('userPosition'));
        
        if (savedUserId) {
            // Session existante - initialiser l'interface
            userId = savedUserId;
            appContainer.style.display = 'block';
            loginButton.style.display = 'none';

            // Si on a une position sauvegardée, l'utiliser
            if (savedPosition) {
                currentMarker = new mapboxgl.Marker()
                    .setLngLat([savedPosition.lng, savedPosition.lat])
                    .addTo(map);

                map.flyTo({
                    center: [savedPosition.lng, savedPosition.lat],
                    zoom: 14
                });

                socket.send(JSON.stringify({
                    type: 'position',
                    userId,
                    lat: savedPosition.lat,
                    lng: savedPosition.lng,
                    inRoom: false
                }));
            }

            // Démarrer le suivi de position
            if (navigator.geolocation) {
                navigator.geolocation.watchPosition((position) => {
                    updatePositionInfo(position);
                }, (error) => {
                    // console.error('Error watching position:', error);
                }, {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                });
            }
        } else {
            // Pas de session - afficher le bouton de login
            appContainer.style.display = 'none';
            loginButton.style.display = 'block';
        }
    });

    // Ajouter la gestion de la fermeture de la fenêtre/onglet
    window.addEventListener('beforeunload', (event) => {
        // Si ce n'est pas un refresh
        const navigationEntry = performance.getEntriesByType('navigation')[0];
        console.log('navigationEntry', navigationEntry);
        if (navigationEntry.type !== 'reload') {        
            if (userId) {
                // Envoyer le signal de déconnexion
                socket.send(JSON.stringify({
                    type: 'userDisconnected',
                    userId: userId
                }));

                // Si en appel, terminer l'appel
                if (inCall || callPending) {
                    endCall();
                }

                // Nettoyer la session uniquement si ce n'est pas un refresh
                // sessionStorage.clear();
            }
        }
    });

    loginButton.addEventListener('click', () => {
        const username = prompt('Veuillez entrer votre nom d\'utilisateur :');
        if (username) {
            userId = `utilisateur_${username}_${Date.now()}`;
            sessionStorage.setItem('userId', userId);
            sessionStorage.setItem('username', username);

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((position) => {
                    updatePositionInfo(position);
                }, (error) => {
                    console.error('Error getting initial position:', error);
                }, {
                    enableHighAccuracy: true
                });
            
                // Then start watching position
                navigator.geolocation.watchPosition((position) => {
                    updatePositionInfo(position);
                }, (error) => {
                    // console.error('Error watching position:', error);
                }, {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                });
            }
            appContainer.style.display = 'block';
            loginButton.style.display = 'none';

            // Get initial position
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        if (currentMarker) {
                            currentMarker.remove();
                        }
                        const lngLat = {
                            lng: position.coords.longitude,
                            lat: position.coords.latitude
                        };
                        currentMarker = new mapboxgl.Marker()
                            .setLngLat(lngLat)
                            .addTo(map);

                        map.flyTo({
                            center: lngLat,
                            zoom: 14
                        });

                        sessionStorage.setItem('userPosition', JSON.stringify(lngLat));

                        socket.send(JSON.stringify({
                            type: 'position',
                            userId,
                            lat: lngLat.lat,
                            lng: lngLat.lng,
                            inRoom: false
                        }));
                    },
                    (error) => console.error('Error getting position:', error),
                    { enableHighAccuracy: true }
                );
            }
        }
    });

    window.startCall = function (targetUserId) {
        if (inCall || callPending) {
            alert('Vous avez déjà un appel en cours ou une demande en attente.');
            return;
        }
        callPending = true;

        updateAllPopups();
        socket.send(JSON.stringify({
            type: 'callRequest',
            userId,
            targetUserId
        }));
    };
});

