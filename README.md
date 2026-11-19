# TTFL 76ersFR

Appli web installable (PWA) pour l'équipe 76ersFR de la [TrashTalk Fantasy League](https://fantasy.trashtalk.co/) :
voir, pour un jour choisi, **quels joueurs chaque membre peut encore prendre** (verrou de 30 jours).

Fonctionne sur Android et iPhone : un lien à partager, rien à télécharger sur un store.

## Ce que fait l'appli aujourd'hui

- **Disponibles** : matchs du jour (ESPN), joueurs des équipes qui jouent, blessures, et pour chaque joueur
  qui, dans l'équipe, peut le prendre (ou dans combien de jours). Filtres « dispo pour tous » et « masquer les absents ».
  Les joueurs sont regroupés par équipe (ordre alphabétique, une liste déroulante par équipe avec logo et nom complet),
  classés par **moyenne TTFL de la saison** décroissante puis par nom. La moyenne est calculée à partir des totaux de
  saison d'ESPN avec la formule TTFL ; elle a été comparée à celle de TTFL Advisor : identique au centième pour 84 %
  des joueurs, écart moyen de 0,02 point (quelques stats corrigées d'un point d'un côté ou de l'autre).
  Un joueur sans match de saison régulière n'a pas de moyenne (« – »).
  **Favoris** : une étoile ☆ sur chaque joueur l'ajoute à la liste déroulante « Favoris », en haut de la page, classée
  comme les équipes (moyenne TTFL décroissante puis nom). Les favoris qui ne jouent pas ce jour-là sont rappelés dessous
  (pastille ✕ pour les retirer). Ils sont enregistrés sur l'appareil (localStorage), pas partagés avec l'équipe.
  Dans « Favoris », les joueurs sont séparés en **disponibles** et **indisponibles** pour les membres comptés.
  **Profil** : dans une équipe, seul ton propre membre est compté par défaut (tu vois tes disponibilités, pas celles de
  tout le monde) ; les pastilles de membres, « Moi seul » et « Toute l'équipe » changent ce choix, qui est mémorisé sur
  l'appareil.
- **Importer** : on colle le tableau `?tpl=historique` de TTFL ; le parseur reconnaît chaque pick et vérifie le score avec la formule TTFL.
- **Installer** : parcours adapté à l'appareil (bouton d'installation Android, guide en 3 étapes sur iPhone,
  aide si le lien est ouvert dans WhatsApp/Instagram), QR code et bouton Partager.

- **Équipe** : créer ou rejoindre une équipe avec un code d'invitation (lien partageable `#/join/CODE` : on choisit son
  nom dans la liste des membres, ou on saisit son pseudo si on n'y figure pas), voir les membres,
  partager l'historique de chacun avec les téléphones de l'équipe (Supabase, voir [supabase/README.md](supabase/README.md)).
  Sans Supabase configuré, les données restent sur l'appareil (localStorage).

- **Relevé automatique des picks** (onglet Équipe) : un script ([`public/ttfl-releve.user.js`](public/ttfl-releve.user.js)),
  installé avec Tampermonkey dans le navigateur d'**un seul** membre, relève chaque jour les picks de toute l'équipe et les
  envoie à l'appli avec un **code de synchronisation** d'équipe (généré dans l'onglet Équipe). L'import à la main reste
  possible. Fonctionnement :
  - au premier passage de la journée sur TTFL, le script lit, avec la session déjà ouverte du membre, la page « Mon équipe »,
    le profil de chaque coéquipier (ses 5 derniers picks), le profil du membre et son historique complet : une douzaine
    de pages, espacées de 0,6 s ;
  - il envoie les picks **passés** (ceux du soir sont cachés par TTFL) à la fonction `sync_team_picks` de Supabase ;
  - le code de synchronisation ne permet que d'écrire des picks ; la base n'en garde que l'empreinte (sha256) ;
    en générer un nouveau invalide l'ancien ;
  - les fonctions de lecture du script sont testées (`tests/releve.test.ts`), la base aussi (`tests/schema.test.ts`).

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

- Un joueur pické redevient disponible 30 jours après son pick, donc bloqué les 29 jours suivants (`LOCK_DAYS` dans
  `src/lib/availability.ts`). TTFL affiche « bloqué N jours » avec N = 30 − jours écoulés ; vérifié sur le deck de TTFL
  le 19/11/2026 pour 7 joueurs bloqués et pour Wembanyama (pické le 20/10, disponible le 19/11).
- Un pick préparé à l'avance bloque aussi le joueur dans la fenêtre de 30 jours qui le précède.
- Score = Pts + Reb + Ast + Stl + Blk + Lancers francs réussis + Tirs réussis + 3 pts réussis − Malus.
- Date du deck = date à Paris ; fermeture à 00:00 ou au coup d'envoi du premier match s'il a lieu avant minuit.

À faire : playoffs (un joueur ne peut être pické qu'une fois sur toute la période).

## Respect des CGU de TTFL

TTFL n'a pas d'API publique et ses CGU réservent l'usage du site à un cadre personnel et récréatif.
L'appli ne se connecte donc jamais à TTFL avec un identifiant, et aucun mot de passe TTFL n'est demandé ni stocké :
l'historique peut être collé par chaque joueur lui-même.

Le relevé automatique est un cas à part : le script tourne dans le navigateur d'un membre, avec sa session, et ne lit que
des pages qu'il peut déjà consulter (une douzaine, une fois par jour), sans contourner la connexion ni la protection
anti-robot. C'est tout de même un accès automatisé, que les CGU de TTFL encadrent : **prévenir TrashTalk
(ttfl@trashtalk.co) et obtenir son accord est conseillé** avant de l'utiliser.
