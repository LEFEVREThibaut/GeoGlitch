# Déploiement sur un VPS Debian

Ce document décrit les étapes nécessaires pour installer et configurer votre application GeoGlitch sur un serveur Debian. Nous allons couvrir la mise à jour du système, l’installation de Git, Nginx, nvm, Node.js (et npm), ainsi que pm2 pour exécuter l’application en mode production.

---

## 1. Conditions préalables

- **Connexion SSH** : Assurez-vous de pouvoir vous connecter en SSH sur votre VPS avec un utilisateur ayant les privilèges `sudo`.
- **Nom de domaine** : Un domaine doit être configuré pour pointer vers l’adresse IP de votre serveur.
- **Droits administrateurs** : Bien penser à avoir les droits administrateurs car certaines commandes nécessitent d’être exécutées avec des privilèges root ou sudo.

---

## 2. Mise à jour du système

Avant d’installer quoi que ce soit, il est recommandé de mettre votre système à jour :

```bash
sudo apt update
sudo apt upgrade -y
```

## 3. Installation de Git

Il vous faudra installer git pour pouvoir cloner le repository. Pour l’installer, utilisez la commande suivante :

```bash
sudo apt install git -y
```

Vérifiez que l’installation a bien été effectuée :
```bash
git --version
```

## 4. Installation de Nginx

Nginx servira de reverse proxy pour diriger le trafic vers votre application Node.js.

```bash
sudo apt install nginx -y
```

Assurez-vous que le service fonctionne :
```bash
sudo systemctl status nginx
```

## 5. Installation de nvm, Node.js et npm

L’installation de Node.js sera gérée via nvm (Node Version Manager), qui facilite la gestion des différentes versions de Node.js.

### Installation de nvm :
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
```

Rechargez votre environnement pour prendre en compte l’installation :
```bash
source ~/.bashrc
```

### Installation de Node.js :
```bash
nvm install --lts
```

Vérifiez la version installée :
```bash
node -v
npm -v
```

## 6. Installation de pm2

pm2 est un utilitaire permettant d’exécuter des applications Node.js en tâche de fond et de les redémarrer automatiquement si besoin.

```bash
npm install -g pm2
```

Configurez pm2 pour qu’il se lance automatiquement au démarrage du serveur :
```bash
pm2 startup
```

Une commande personnalisée en sudo sera affichée ; exécutez-la pour finaliser la configuration.

## 7. Déploiement de l’application

### a. Clonage du dépôt Git

Récupérez votre code source dans un répertoire de votre choix, par exemple `/var/www/geoglitch` :

```bash
sudo git clone https://github.com/LEFEVREThibaut/GeoGlitch.git /var/www/geoglitch
cd /var/www/geoglitch
```

### b. Installation des dépendances

Installez les modules Node.js requis par votre projet :

```bash
npm install
```

### c. Configuration de l’application

Créez puis ajustez les paramètres nécessaires dans `server/config.private.js` et `client/scripts/config.private.js` à partir des modèles associés dans le dossier `server` et `client/scripts` :

### d. Lancement de l’application avec pm2

Démarrez votre serveur Node.js en arrière-plan :

```bash
pm2 start server.js --name geoglitch
pm2 save
```

Consultez les journaux de l’application si nécessaire :

```bash
pm2 logs geoglitch
```

## 8. Configuration de Nginx comme Reverse Proxy

Pour permettre l’accès à votre application via un domaine ou une adresse IP publique, configurez Nginx afin qu’il redirige les requêtes HTTP/HTTPS vers le port de votre application (dans cet exemple, 3000).

### Création du fichier de configuration Nginx

Créez un fichier `/etc/nginx/sites-available/geoglitch` avec le contenu suivant :

```nginx
server {
    listen 80;
    server_name votredomaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Activation de la configuration

Ajoutez un lien symbolique vers le dossier `sites-enabled` :

```bash
sudo ln -s /etc/nginx/sites-available/geoglitch /etc/nginx/sites-enabled/
```

### Test et rechargement de Nginx

Vérifiez que la configuration est valide :

```bash
sudo nginx -t
```

Appliquez les changements en rechargeant Nginx :

```bash
sudo systemctl reload nginx
```

## 9. Installation d’un certificat SSL

Pour sécuriser les échanges de données, notamment pour les fonctionnalités nécessitant HTTPS comme la géolocalisation ou WebRTC, il est conseillé d’installer un certificat SSL via Certbot.

### Installation de Certbot

Ajoutez le support de Let’s Encrypt pour Nginx :

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### Génération et installation du certificat SSL

Exécutez la commande suivante pour obtenir un certificat SSL :

```bash
sudo certbot --nginx -d votredomaine.com
```

Suivez les instructions affichées à l’écran pour finaliser la mise en place et activer le renouvellement automatique du certificat.

