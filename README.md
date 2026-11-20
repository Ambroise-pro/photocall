# 📸 Photocall Soirée Santé

Application web de photocall pour les soirées **Pass Sport Santé / École promotrice de santé**.

1. Le parent choisit le **nombre de badges validés** pendant la soirée.
2. Il prend la photo (compte à rebours 3-2-1). Le cadre et le nombre de badges
   sont ajoutés automatiquement à l'emplacement prévu.
3. Il valide la photo et peut :
   - **autoriser ou non la publication sur les réseaux sociaux** (case décochée par défaut) ;
   - **recevoir la photo par e-mail**.

## 🔒 Où sont les photos ?

**Uniquement sur l'iPad**, dans le stockage local du navigateur (IndexedDB).
Rien n'est stocké en ligne. Seule exception : quand un parent demande l'envoi par
e-mail, la photo passe par une fonction Vercel le temps de l'envoi. Elle n'y est
**pas enregistrée**, et l'adresse e-mail n'est pas conservée.

Si le Wi-Fi coupe pendant la soirée, la photo est quand même enregistrée sur l'iPad
et l'e-mail part automatiquement dès que la connexion revient. L'adresse reste sur
l'iPad le temps de l'envoi, puis elle est effacée.

## 🗂 Gestion des photos (après la soirée)

Touchez l'icône **⚙** (discrète, en haut à gauche de l'accueil) et saisissez le code `ADMIN_PIN`.

- Statistiques : nombre de photos, photos publiables, total et moyenne de badges.
- **Sélectionner les publiables**, puis **Partager / Enregistrer dans Photos**
  (feuille de partage de l'iPad : enregistrer les images, AirDrop…) ou **Télécharger en .zip**.
- Supprimer des photos.
- Le nom de chaque fichier indique la date, le nombre de badges et `publiable` / `prive`.

> ⚠️ **Important sur iPad** : Safari peut effacer les données d'un site non utilisé
> pendant plusieurs jours. **Ajoutez le photocall à l'écran d'accueil**
> (Partager, puis « Sur l'écran d'accueil ») et **exportez les photos après chaque soirée**.
> Supprimer l'historique de Safari efface aussi les photos.

## 🚀 Déploiement sur Vercel

1. Importez ce dépôt GitHub dans Vercel (framework : *Other*, aucune commande de build).
2. Dans *Settings, Environment Variables*, ajoutez les variables listées dans
   [`.env.example`](.env.example) : `ADMIN_PIN`, et `SMTP_*` / `MAIL_FROM` pour l'e-mail.
3. Déployez, puis ouvrez l'URL sur l'iPad dans **Safari** et ajoutez-la à l'écran d'accueil.
4. Autorisez l'accès à la caméra au premier lancement.

Sans configuration SMTP, le champ e-mail est simplement masqué.

### Conseils pour la soirée

- iPad en **mode paysage**, sur pied, branché sur secteur.
- Utilisez l'**accès guidé** (Réglages, Accessibilité, Accès guidé) pour bloquer l'iPad sur l'application.
- La barre d'espace ou Entrée déclenche la photo (pratique avec un déclencheur Bluetooth).
- Après 2 minutes d'inactivité, l'application revient à l'accueil.

## 🛠 Développement local

```bash
npm install
npx vercel dev
```

## Structure

```
public/            Application (fichiers statiques)
  index.html       Écran photocall
  app.js           Caméra, composition de l'image, validation
  db.js            Stockage local (IndexedDB) et envoi des e-mails
  admin/           Écran de gestion des photos
  assets/cadre.webp  Le cadre (fenêtre transparente)
api/               Fonctions serverless Vercel
  config.js        Paramètres publics (nb de badges, e-mail activé…)
  send-mail.js     Envoi de la photo par e-mail (sans stockage)
  admin-check.js   Vérification du code de gestion
```

Pour changer de cadre : remplacez `public/assets/cadre.webp` (1536 × 1024, fenêtre
photo transparente) et ajustez si besoin `FRAME` en haut de `public/app.js`
(zone de la photo et position du nombre de badges).
