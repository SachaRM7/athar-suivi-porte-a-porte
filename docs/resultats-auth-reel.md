# Resultats Auth reel Firebase

Date : 29 juillet 2026  
Projet : `athar-dev31`  
Statut : **bloquant - fermeture libre-service non obtenue**

## Perimetre

Cette preuve utilise le projet Firebase de developpement Athar fourni pour
verifier le comportement reel de Firebase Authentication. Aucun deploiement
Hosting, Functions ou Firestore n'a ete effectue.

Commande reproductible :

```powershell
$env:ATHAR_FIREBASE_PROJECT_ID='athar-dev31'
$env:ATHAR_FIREBASE_API_KEY='<cle-web-firebase>'
npm run prove:firebase-auth-real
```

Le script cree uniquement des comptes de preuve puis les nettoie par l'API
admin Identity Toolkit lorsque necessaire.

## Mesure obtenue

Horodatage API : `2026-07-29T17:02:41.535Z`.

| Preuve | Resultat | Interpretation |
|---|---:|---|
| Lecture config Auth | 200 | Email/password actif, mot de passe requis |
| Creation compte par client Web `accounts:signUp` | 200 | **Echec cache : inscription libre-service ouverte** |
| Creation privilegiee OAuth/admin `projects/{id}/accounts` | 200 | Creation admin prouvee |
| Suppression par utilisateur connecte `accounts:delete` | 200 | **Echec cache : suppression libre-service ouverte** |
| Nettoyage admin des comptes de preuve restants | 200 | Aucun compte de preuve conserve volontairement |

## Conclusion technique

Le projet `athar-dev31` ne satisfait pas la condition cible "creation et
suppression par les utilisateurs finaux desactivees". Le prototype local et la
fonction privilegiee restent valides, mais le modele Firebase Auth
Email/Password standard laisse une surface API publique avec la cle Web.

Pour lever ce point avant l'etape 3, l'architecture doit choisir explicitement
une des options suivantes :

- activer une configuration Firebase/Identity Platform qui refuse les actions
  utilisateur final et la re-prouver par ce script ;
- remplacer le mot de passe Firebase client par un flux privilegie, par exemple
  jetons personnalises emis par backend apres verification d'identifiant ;
- accepter formellement ce risque et modifier la condition d'architecture, ce
  qui affaiblit le modele "pas d'inscription publique".
