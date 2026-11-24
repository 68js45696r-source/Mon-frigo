# 🧊 Mon Frigo

Une application web (PWA) pour lister le contenu de votre réfrigérateur, suivre les stocks et être alerté sur les dates de consommation.

## Fonctionnalités

- **Ajout de produits** : nom, quantité, unité, catégorie, date de consommation, seuil d'alerte stock bas
- **Alertes par dates** : produits périmés (rouge), périssant sous 2 jours (orange), à consommer aujourd'hui
- **Alertes de stock** : badge « Stock bas » quand la quantité passe sous votre seuil
- **Panneau de synthèse** : compteurs Périmés / Bientôt / Stock bas / Total, cliquables pour filtrer
- **Recherche et filtre par catégorie**
- **Bouton ➕** pour incrémenter rapidement le stock d'un produit
- **Hors ligne** : tout fonctionne sans connexion, données stockées sur votre téléphone (localStorage)
- **Mode sombre** automatique, interface en français

## Installation sur iPhone

L'app doit d'abord être hébergée en ligne (HTTPS obligatoire pour l'installation). Le plus simple : **GitHub Pages** (gratuit).

1. Mettre les fichiers dans un dépôt GitHub
2. Activer *Settings → Pages → Deploy from branch* sur la branche principale
3. Sur l'iPhone, ouvrir l'URL du site dans **Safari**
4. Toucher le bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**
5. L'app apparaît avec son icône flocon ❄️ et s'ouvre en plein écran comme une vraie app

## Tester en local (sur ordinateur)

```bash
cd mon-frigo
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 (le service worker nécessite localhost ou HTTPS).

## Limites connues sur iOS

- Les **notifications push** natives nécessitent d'installer l'app (étape 4) et iOS 16.4 minimum ; sinon les alertes s'affichent sous forme de bannière dans l'app à chaque ouverture
- Les dates sont vérifiées à l'ouverture de l'app — un coup d'œil le matin suffit pour voir ce qui expire

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Interface et formulaire d'ajout |
| `styles.css` | Style (thème clair/sombre, boutons type iOS) |
| `app.js` | Logique : stockage, tri, alertes, filtres |
| `manifest.webmanifest` | Fiche d'installation PWA |
| `sw.js` | Cache hors ligne |
| `icon-*.png` | Icônes de l'app |
