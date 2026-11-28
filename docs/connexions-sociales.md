# Activer les connexions sociales de ONE

ONE utilise **Firebase Authentication** pour les comptes : e-mail + mot de passe, Google, Apple, Microsoft, GitHub et Facebook. Les documents traités ne passent jamais par Firebase ; seul le compte (nom, e-mail, photo) y est géré.

Sans configuration, l'application fonctionne comme avant (comptes locaux au navigateur, sans boutons sociaux). Dès que les variables ci-dessous sont renseignées, les vrais comptes et les boutons « Continuer avec… » s'activent.

Tout au long de ce guide, remplacez `VOTRE-PROJET` par l'identifiant de votre projet Firebase. L'**URL de retour** demandée par chaque fournisseur est toujours :

```
https://VOTRE-PROJET.firebaseapp.com/__/auth/handler
```

---

## 1. Créer le projet Firebase (10 min, gratuit)

1. Ouvrez https://console.firebase.google.com → **Ajouter un projet** (Google Analytics : inutile, vous pouvez le désactiver).
2. Dans le projet : icône **`</>` (Web)** → donnez un nom (ex. « ONE web ») → **Enregistrer l'application**. Ne cochez pas Firebase Hosting (le site reste sur Vercel).
3. Firebase affiche un objet `firebaseConfig`. Reportez ces valeurs :

   | `firebaseConfig` | Variable |
   |---|---|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

4. En local : copiez `.env.example` en `.env.local`, collez les valeurs, relancez `npm run dev`.
5. Sur Vercel : **Project → Settings → Environment Variables**, ajoutez les mêmes 5 variables (dont `VITE_AUTH_PROVIDERS`) pour *Production* et *Preview*, puis **redéployez** (les variables `VITE_*` sont intégrées au moment du build).

## 2. Autoriser vos domaines

Console Firebase → **Authentication → Settings → Authorized domains** :
- `localhost` (présent par défaut) ;
- `one-sable-ten.vercel.app` ;
- votre futur domaine personnalisé, le cas échéant.

Sans cela, la connexion échoue avec le message « Ce site n'est pas autorisé pour la connexion ».

## 3. Activer chaque fournisseur

Console Firebase → **Authentication → Sign-in method → Add new provider**.

### E-mail / mot de passe
Activez **Email/Password**. (Facultatif : *Templates* pour traduire les e-mails de vérification et de réinitialisation.)

### Google — 2 min
Activez **Google**, choisissez l'e-mail d'assistance, enregistrez. Rien d'autre à faire.

### GitHub — 5 min
1. https://github.com/settings/developers → **OAuth Apps → New OAuth App**.
2. *Homepage URL* : `https://one-sable-ten.vercel.app` ; *Authorization callback URL* : l'URL de retour ci-dessus.
3. **Generate a new client secret**, puis copiez *Client ID* et *Client secret* dans le fournisseur **GitHub** de Firebase.

### Microsoft — 10 min
1. https://portal.azure.com → **Microsoft Entra ID → App registrations → New registration**.
2. *Supported account types* : **Accounts in any organizational directory and personal Microsoft accounts**.
3. *Redirect URI* : plateforme **Web**, l'URL de retour ci-dessus.
4. **Certificates & secrets → New client secret** : copiez la *Value* (affichée une seule fois).
5. Dans le fournisseur **Microsoft** de Firebase : *Application ID* = *Application (client) ID* de la page **Overview**, *Application secret* = la valeur copiée.
6. Notez la date d'expiration du secret (24 mois maximum) : il faudra le renouveler.

### Facebook — 15 min (+ vérification Meta pour la production)
1. https://developers.facebook.com/apps → **Create app** → cas d'usage **Authenticate and request data from users with Facebook Login**.
2. **App settings → Basic** : copiez *App ID* et *App secret* dans le fournisseur **Facebook** de Firebase.
3. **Facebook Login → Settings → Valid OAuth Redirect URIs** : l'URL de retour ci-dessus.
4. Toujours dans *Basic* : *Privacy Policy URL* = `https://one-sable-ten.vercel.app/privacy-policy` ; *User data deletion* = `https://one-sable-ten.vercel.app/account` (bouton « Supprimer mon compte »).
5. Tant que l'application est en mode **Development**, seuls les comptes ajoutés dans *App roles* peuvent se connecter. Pour l'ouvrir au public : passez-la en **Live** (Meta peut demander la vérification de l'entreprise).

### Apple — 20 min, compte Apple Developer requis (99 $/an)
1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles → Identifiers** :
   - un **App ID** avec la capacité *Sign in with Apple* ;
   - un **Services ID** (ex. `com.votredomaine.one.web`) → *Configure* *Sign in with Apple* : *Domains* = `VOTRE-PROJET.firebaseapp.com`, *Return URLs* = l'URL de retour ci-dessus.
2. **Keys → +** : clé avec *Sign in with Apple*, téléchargez le fichier `.p8` (une seule fois), notez le *Key ID*.
3. Dans le fournisseur **Apple** de Firebase : *Services ID*, *Apple team ID* (en haut à droite du portail), *Key ID* et le contenu du `.p8`.
4. Apple ne transmet le nom de l'utilisateur qu'à la toute première connexion : c'est normal.

## 4. Choisir les boutons affichés

`VITE_AUTH_PROVIDERS` liste les boutons, dans l'ordre : les deux premiers s'affichent en grand (« Continuer avec… »), les suivants en ligne. N'y mettez que des fournisseurs **activés** à l'étape 3 ; un bouton non activé renverrait « La connexion avec X n'est pas encore activée ».

Exemple pour démarrer avec Google et GitHub seulement :

```
VITE_AUTH_PROVIDERS=google,github
```

## 5. Vérifier

1. `npm run dev`, puis **Mon compte** : les boutons apparaissent.
2. Connectez-vous avec chaque fournisseur ; la page profil affiche la photo et le logo du fournisseur.
3. Créez un compte par e-mail : un e-mail de vérification est envoyé ; testez « Mot de passe oublié ? ».
4. Console Firebase → **Authentication → Users** : les comptes y apparaissent.

## Bon à savoir

- **Une adresse e-mail = un compte.** Si quelqu'un s'est inscrit avec Google puis essaie GitHub avec la même adresse, ONE lui demande de se connecter avec Google (comportement par défaut et le plus sûr de Firebase).
- **Fenêtre bloquée** (fréquent sur mobile ou dans les navigateurs intégrés aux applications) : ONE bascule automatiquement sur une connexion par redirection.
- **Comptes locaux existants** : les comptes créés avant l'activation de Firebase restaient dans le navigateur ; ils ne sont pas migrés, il suffit de recréer un compte.
- **Coût** : Firebase Authentication est gratuit jusqu'à 50 000 utilisateurs actifs par mois (hors connexion par SMS, non utilisée ici).
