# TTFL 76ersFR

Appli web installable (PWA) pour l'équipe 76ersFR de la [TrashTalk Fantasy League](https://fantasy.trashtalk.co/) :
voir, pour un jour choisi, **quels joueurs chaque membre peut encore prendre** (verrou de 30 jours).

Fonctionne sur Android et iPhone : un lien à partager, rien à télécharger sur un store.

## Ce que fait l'appli aujourd'hui

- **Disponibles** : matchs du jour (ESPN), joueurs des équipes qui jouent, blessures, et pour chaque joueur
  qui, dans l'équipe, peut le prendre (ou dans combien de jours). Filtres « dispo pour tous » et « masquer les absents ».
- **Importer** : on colle le tableau `?tpl=historique` de TTFL ; le parseur reconnaît chaque pick et vérifie le score avec la formule TTFL.
- **Installer** : parcours adapté à l'appareil (bouton d'installation Android, guide en 3 étapes sur iPhone,
  aide si le lien est ouvert dans WhatsApp/Instagram), QR code et bouton Partager.

- **Équipe** : créer ou rejoindre une équipe avec un code d'invitation (lien partageable `#/join/CODE`), voir les membres,
  partager l'historique de chacun avec les téléphones de l'équipe (Supabase, voir [supabase/README.md](supabase/README.md)).
  Sans Supabase configuré, les données restent sur l'appareil (localStorage).

Le relevé automatique des picks de l'équipe (userscript) est la prochaine étape.

## Commandes

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # tests unitaires (vitest)
npm run build      # vérification TypeScript + build de production dans dist/
npm run icons      # régénère les icônes PNG à partir des SVG
```

Pour prévisualiser un parcours d'installation depuis un ordinateur : ajouter `?platform=ios`
(ou `ios-chrome`, `ios-inapp`, `android`, `android-firefox`, `android-inapp`, `desktop`, `installed`)
avant le `#` de l'adresse, par exemple `http://127.0.0.1:5173/?platform=ios#/installer`.

## Mise en ligne (installation la plus simple pour les joueurs)

L'appli doit être servie en HTTPS pour être installable. Le workflow `.github/workflows/deploy.yml`
publie le dossier `dist/` sur GitHub Pages à chaque push sur `main` :

1. Créer un dépôt GitHub et y pousser ce dossier.
2. Dépôt → Settings → Pages → Source : **GitHub Actions**.
3. Partager l'adresse `https://<compte>.github.io/<depot>/` (lien ou QR code depuis l'onglet « Installer »).

## Règles TTFL prises en compte

- Un joueur pické est indisponible pour les 30 jours suivants (`LOCK_DAYS` dans `src/lib/availability.ts`).
- Un pick préparé à l'avance bloque aussi le joueur dans la fenêtre de 30 jours qui le précède.
- Score = Pts + Reb + Ast + Stl + Blk + Lancers francs réussis + Tirs réussis + 3 pts réussis − Malus.
- Date du deck = date à Paris ; fermeture à 00:00 ou au coup d'envoi du premier match s'il a lieu avant minuit.

À faire : playoffs (un joueur ne peut être pické qu'une fois sur toute la période).

## Respect des CGU de TTFL

TTFL n'a pas d'API publique et ses CGU réservent l'usage du site à un cadre personnel et récréatif.
L'appli ne se connecte donc jamais à TTFL avec un identifiant : l'historique est collé par chaque joueur
lui-même, et aucun mot de passe TTFL n'est demandé ni stocké. Avant d'ajouter un relevé automatique
des picks, demander l'accord écrit de TrashTalk (ttfl@trashtalk.co).
