# 🧺 Distributions

Une application web (PWA) pour gérer les distributions de colis alimentaires : fichier des bénéficiaires du secours populaire, enregistrement des personnes venues, paiement de la participation de 1 €, suivi des soldes et exports Excel.

## Fonctionnalités

- **Fichier bénéficiaires** : nom, prénom, date de naissance, téléphone, statut (célibataire, couple avec enfant(s), monoparentale avec enfant(s)), nombre de personnes dans la famille
- **Import Excel (📥)** : charge et met à jour les bénéficiaires déclarés avant chaque distribution. Les lignes sont reconnues par l'identifiant : mis à jour si déjà connues, ajoutées sinon. Formats `.xlsx` et `.csv` acceptés
- **Personnes inconnues** : si la personne n'est pas déclarée, sa fiche est créée avec un identifiant provisoire auto (`P-001`, `P-002`…), marquée « Provisoire »
- **Distribution (onglet Distributions)** : bouton « + Distribution » avec **date au choix** (par défaut : le jour même), puis « + Présence » au passage de chaque famille — recherche par nom ou identifiant, comptage des personnes présentes. La date peut être modifiée ensuite (bouton 🗓️)
- **Solde visible au passage** : à l'enregistrement d'une présence, le solde antérieur (impayé ou crédit) s'affiche immédiatement
- **Paiement de 1 €** : boutons rapides 1,00 € / 0,50 € / 0,00 € ou montant libre ; les paiements partiels et non-paiements gardent une trace et alimentent le solde des distributions suivantes
- **Compteurs en direct** : foyers, personnes, encaissé (total réellement payé) et attendu
- **Export Excel (📊)** :
  - depuis l'onglet Bénéficiaires : le fichier complet avec soldes (réimportable tel quel)
- depuis une distribution : l'état des bénéficiaires de la distribution — récapitulatif en tête (nb de foyers/réfèrents, adultes, enfants, euros récupérés, euros à venir), une ligne par famille avec solde antérieur, attendu, payé, solde restant, puis la ligne TOTAL. Adultes = 2 pour les couples, 1 sinon ; enfants = nb de personnes − adultes. Export possible sur **chaque distribution de la liste** (bouton 📊), donc pour n'importe quelle date passée
- **Hors ligne** : tout fonctionne sans connexion, données stockées sur l'appareil (localStorage)
- **Mode sombre** automatique, interface en français

## Formats attendus à l'import

La première ligne de colonnes reconnue sert d'en-tête (accents et majuscules indifférents) :

| Identifiant | Nom | Prénom | Date de naissance | Téléphone | Statut | Nb de personnes |
|---|---|---|---|---|---|---|

Seule la colonne **Nom** est indispensable ; les lignes sans identifiant reçoivent un identifiant provisoire. Les dates `jj/mm/aaaa` et les dates Excel sont acceptées. L'export « Bénéficiaires » de l'application respecte exactement ce format : vous pouvez le modifier dans Excel puis le réimporter.

## Installation sur iPhone / Android

1. Ouvrir l'URL du site (hébergée sur GitHub Pages) dans le navigateur
2. iPhone : bouton **Partager** → **Sur l'écran d'accueil** ; Android : menu → **Ajouter à l'écran d'accueil**
3. L'app s'installe avec son icône et fonctionne hors ligne

## Tester en local

```bash
cd distributions
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 (le service worker nécessite localhost ou HTTPS).

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Interface : bénéficiaires, distributions, présences, paiements |
| `styles.css` | Style (thème clair/sombre, cohérent avec Mon Frigo / Mon Stock) |
| `app.js` | Logique : stockage, import/export, présences, paiements, soldes |
| `xlsx.js` | Lecture/écriture de fichiers Excel `.xlsx` et CSV sans dépendance externe |
| `manifest.webmanifest` | Fiche d'installation PWA |
| `sw.js` | Cache hors ligne |

## Données

Les données restent sur l'appareil (localStorage). Pensez à faire un **export Excel** régulier : le fichier exporté sert à la fois d'archive et de sauvegarde réimportable sur un autre appareil.

## Rappel du fonctionnement du paiement

Chaque bénéficiaire (référent famille) doit 1 € par distribution assistée. Un paiement partiel ou un non-paiement est conservé : le solde cumulé (dus ou crédit) s'affiche automatiquement lors des distributions suivantes, jusqu'à régularisation.
