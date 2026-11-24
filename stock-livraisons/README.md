# 📦 Mon Stock

Gestion du stock des produits livrés — application web (PWA) jumelle de « Mon Frigo », installable sur iPhone depuis Safari.

## Fonctionnalités

- **Scanner de codes-barres** (📷) : EAN-13 / EAN-8 décodé dans le navigateur → produit reconnu ⇒ ouverture directe de l'entrée de livraison ; produit inconnu ⇒ création pré-remplie via Open Food Facts (le nom est saisi une seule fois puis mémorisé)
- **Produits par type** : Conserves, Surgelés, Épiceries sèches (regroupés par sections)
- **Stock = nombre de produits** (3 briques de lait = 3), unités de conditionnement uniquement (pièces, boîtes, paquets, bocaux, bidons, cartons)
- **Stock initial** renseignable à la création du produit (enregistré comme une entrée « Stock initial »)
- **Entrées de livraison** : quantité + **numéro de bordereau** + **date de livraison** + **numéro de lot** + **date limite de consommation (DLC)** — champs obligatoires, conservés dans l'historique
- **Fiche produit** : dernière livraison (bordereau, lot, date) et **DLC la plus proche** à venir
- **Sorties de stock** : quantité + **date de la sortie** + motif (consommation, casse…), avec garde-fou si la quantité dépasse le stock
- **Inventaire** : stock théorique vs stock réel saisi, **écarts calculés en direct** ; la validation enregistre automatiquement les ajustements comme mouvements
- **Export Excel (.xlsx)** : 3 feuilles — *Stock actuel*, *Mouvements* (chaque entrée/sortie : date, bordereau, livraison, lot, DLC ou motif), *Inventaires* (théorique / réel / écart). Génération de fichier Open XML native, sans dépendance
- **Hors ligne**, données stockées sur l'appareil (localStorage), mode sombre automatique

## Installation sur iPhone

1. Ouvrir l'URL du site dans **Safari**
2. **Partager → Sur l'écran d'accueil → Ajouter**

URL : `https://68js45696r-source.github.io/Mon-frigo/stock-livraisons/`

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Interface (3 onglets : Stock, Mouvements, Inventaire) et formulaires |
| `styles.css` | Style (thème clair/sombre) |
| `app.js` | Logique : stock, mouvements, inventaires, générateur .xlsx |
| `manifest.webmanifest` | Fiche d'installation PWA |
| `sw.js` | Cache hors ligne |

## Format des données

- **Produits** : nom, type, unité, seuil d'alerte
- **Mouvements** : date, sens (Entrée / Sortie / Inventaire), quantité, bordereau + date de livraison + lot + DLC (pour les entrées), date + motif (pour les sorties)
- **Inventaires** : date + pour chaque produit compté : stock théorique, stock réel, écart

## Test de l'export

Ouvrir le fichier `.xlsx` téléchargé avec Excel, Numbers ou LibreOffice. Le fichier est un ZIP Open XML généré en JavaScript pur (compression « stored »), validé par des tests automatiques.
