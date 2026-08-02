# Resultats de l'etape 2B-A

Date : 29 juillet 2026  
Statut : **partiellement valide - pas de passage a 2B-B**

## Perimetre realise

Firebase Emulator Suite est configuree localement, sans projet Firebase cloud ni
deploiement :

- Authentication : `127.0.0.1:9199` ;
- Firestore : `127.0.0.1:8180` ;
- Functions : `127.0.0.1:5101` ;
- UI Emulator Suite : `127.0.0.1:4100` ;
- hub : `127.0.0.1:4410`.

`scripts/run-emulator-tests.ps1` fournit un JDK 21 local ignore par Git et
lance les trois emulateurs uniquement pour la duree des tests. Aucun appel de
deploiement ou de configuration cloud ne fait partie de ce lot.

## Regles et preuves

`firestore.rules` impose :

- lecture et ecriture seulement aux membres actifs du workspace ;
- administration reservee au role `admin` ;
- auteur d'un passage egal a `request.auth.uid` ;
- passage cree une seule fois, avec champs autorises et note bornee ;
- statut d'une porte modifiable seulement avec une revision incrementee de un ;
- lot atomique obligatoire : le passage cree dans le lot doit correspondre a
  `doorId`, `statusId`, `doorRevision` et `lastVisitId` de la porte ;
- suppression des donnees metier reservee a l'administrateur ou interdite pour
  les passages.

La fonction callable `createMember` exige a la fois un claim Auth `admin` et un
document `members/{uid}` actif avec role `admin` dans le workspace. Elle cree
le compte via Admin SDK puis son document membre. Le test appelle cette fonction
avec un jeton Auth de l'emulateur et verifie les deux creations.

## Commande de validation

```powershell
npm run test:emulator
```

Resultat obtenu le 29 juillet 2026 : **8 tests passes dans 2 fichiers**.

- 5 groupes de tests de regles : membre inactif, roles, lot porte + passage,
  auteur different, revision obsolete, passage immuable ;
- 3 tests d'integration : endpoint Functions, creation Admin SDK directe,
  provisionnement par fonction privilegiee.

`npm audit --omit=dev` retourne egalement `found 0 vulnerabilities`.

Le CLI affiche deux avertissements attendus en local : la fonction utilise
Node 24 sur cette machine alors que son runtime cible est Node 22, et aucun
projet cloud n'est disponible pour recuperer la configuration Admin SDK. Les
tests ne contactent aucun service de production.

## Limite bloquante : actions Auth utilisateur final

La preuve demandee de desactivation de la creation et de la suppression par un
utilisateur final n'est **pas obtenue** dans ce lot local. Firebase impose cette
politique dans les reglages Authentication du projet, mais l'Auth Emulator ne
reproduit pas la configuration correspondante : sa logique locale autorise les
flux mot de passe. Il serait donc faux de faire passer un test d'emulateur pour
une preuve de `auth/admin-restricted-operation`.

La fonction Admin SDK est bien prouvee localement. En revanche, l'interdiction
des actions libre-service devra etre verifiee contre un projet Firebase de
developpement explicitement autorise, apres activation de ces reglages, sans
deploiement de Functions. Cette preuve reste une condition de levee du NO-GO.

## Fichiers de ce lot

- `.firebaserc`, `firebase.json`, `firestore.rules` ;
- `functions/index.js`, `functions/package.json`, `functions/package-lock.json` ;
- `scripts/run-emulator-tests.ps1`, `vitest.emulator.config.ts` ;
- `tests/emulator/firestore.rules.test.ts` ;
- `tests/emulator/auth-functions.integration.test.ts` ;
- `package.json`, `package-lock.json`, `.gitignore`.
