# Synchronisation d'équipe avec Supabase

Sans Supabase, l'appli fonctionne seule : chaque téléphone ne voit que les historiques qu'on y a importés.
Avec Supabase, les picks de l'équipe sont partagés entre les téléphones des membres.

Compte gratuit suffisant. Comptez 10 minutes, une seule fois.

## 1. Créer le projet

1. Ouvrir [supabase.com/dashboard](https://supabase.com/dashboard) et se connecter (le bouton « Continue with GitHub » suffit).
2. **New project** : nom `ttfl-76ers`, région en Europe, plan **Free**.
3. Choisir un mot de passe de base de données et le ranger dans un gestionnaire de mots de passe.
   L'appli n'en a pas besoin.

> Un projet gratuit est mis en pause après 7 jours sans activité. L'usage quotidien de l'équipe l'évite ;
> sinon, un clic sur **Restore project** le réveille et aucune donnée n'est perdue.

## 2. Autoriser les connexions anonymes

**Authentication → Sign In / Providers → Allow anonymous sign-ins → activer → Save.**

Les joueurs n'ont ni compte ni mot de passe : chaque téléphone reçoit une identité locale, et le code
d'invitation de l'équipe donne accès aux picks de l'équipe.

## 3. Créer les tables et les règles de sécurité

1. **SQL Editor → New query**.
2. Coller tout le contenu du fichier [`schema.sql`](schema.sql).
3. **Run**. Le résultat attendu est « Success. No rows returned ».

**À chaque mise à jour de l'appli qui touche à la base** (par exemple la liste des membres proposée à l'arrivée par le
lien d'invitation), recopier le nouveau `schema.sql` et le relancer de la même façon : il met tout à niveau sans rien
effacer. Tant que ce n'est pas fait, l'appli reste utilisable : elle retombe sur la saisie du pseudo.

Le script peut être relancé sans risque. Il crée trois tables (`teams`, `members`, `picks`), active la sécurité par
ligne, et ajoute les fonctions utilisées par l'appli (créer ou rejoindre une équipe, changer le code…).

## 4. Récupérer l'adresse et la clé publique

**Project Settings → API Keys** (ou le bouton **Connect** en haut) :

| À copier | Ressemble à |
|---|---|
| Project URL | `https://abcdefghijkl.supabase.co` |
| Publishable key (ou clé « anon ») | `sb_publishable_…` |

La clé **publique** est faite pour être visible dans le code de l'appli ; ce sont les règles du schéma qui
protègent les données. **Ne jamais utiliser ni partager la clé « secret » ou « service_role ».**

## 5. Brancher l'appli

Créer un fichier `.env.production` à la racine du projet (modèle : `.env.example`) :

```
VITE_SUPABASE_URL=https://abcdefghijkl.supabase.co
VITE_SUPABASE_KEY=sb_publishable_…
```

Pour tester en local, le même contenu dans `.env.local`. Puis `npm run dev`, onglet **Équipe**.

## 6. Relevé automatique des picks (facultatif)

Dans l'appli : onglet **Équipe → Relevé automatique des picks → Activer** génère un **code de synchronisation** (affiché une
seule fois). Un seul membre installe ensuite le script `ttfl-releve.user.js` avec Tampermonkey (instructions dans la carte)
et y colle le code. Le script envoie chaque jour les picks de l'équipe à la fonction `sync_team_picks`.

- Le code ne donne **aucun accès en lecture** : il permet seulement d'ajouter ou de corriger des picks passés de l'équipe.
  La base n'en garde que l'empreinte ; un nouveau code invalide l'ancien (à faire si le code a fuité).
- Il faut relancer `schema.sql` (étape 3) une fois pour installer ces fonctions ; l'appli le signale tant que ce n'est pas fait.

## Ce qui est partagé, et avec qui

- Uniquement avec les membres de l'équipe qui ont le code d'invitation : date, joueur et score de chaque pick **passé**.
- Jamais le pick du soir ni les picks préparés à l'avance : TTFL les cache volontairement et l'appli ne les demande pas.
- Chaque membre accepte ce partage en rejoignant l'équipe, et peut la quitter en supprimant ses données (onglet Équipe).
- Aucun mot de passe TTFL n'est demandé ni stocké.

## Limites à connaître

- Un téléphone dont les données de navigation sont effacées perd son identité anonyme. Il suffit de rejoindre à nouveau
  avec le même code et le même pseudo : le membre existant est repris avec tous ses picks.
- Tous les membres d'une équipe peuvent modifier les picks de tous (nécessaire au relevé d'équipe) : le modèle suppose
  une équipe d'amis de confiance. Le code se change depuis l'onglet Équipe si le lien a trop circulé.
- Une équipe compte au plus 12 membres, et un appareil peut créer au plus 5 équipes.
