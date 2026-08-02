# Resultats de l'etape 2B-B

Date : 29 juillet 2026  
Statut : **valide localement - NO-GO global maintenu**

## Outbox persistante

`IndexedDbOutbox` remplace `MemoryOutbox` dans le laboratoire navigateur. Les
intentions sont stockees dans la base IndexedDB `athar-prototype-outbox`, avec
une cle composee de l'UID et de l'UUID de commande. Chaque instance est liee a
un UID : elle ne lit, ne modifie et ne supprime que les entrees de cet UID, et
refuse une intention dont `authorId` est different.

La revision de depart, l'UUID, l'auteur et l'horodatage restent inchanges dans
le document. `SyncLab` conserve la chaine de revisions pour une porte. Apres un
conflit ou un rejet de securite, il ne tente plus les intentions dependantes de
cette porte.

## Adaptateur Firestore reel

`FirestoreDoorGateway` ecrit toujours un lot atomique `visit` + `door`. Apres
un refus Firestore, il relit la fiche membre puis la porte depuis le serveur :

- revision serveur differente : `RevisionConflictError` ;
- membre devenu inactif : `inactive-member` ;
- UID de session different de l'auteur : `author-mismatch`, sans envoi ;
- note trop longue rejetee par les regles : `invalid-intent` ;
- tout autre refus : `security`.

La regle de lecture du document `members/{uid}` autorise un utilisateur
authentifie a relire sa propre fiche meme devenu inactif. Cela ne lui redonne
aucun acces metier ; cela permet uniquement de classer honnetement le rejet.

## Validations executees

```powershell
npm run test:run
npm run test:emulator
npm run test:e2e
npm run build
```

Resultats obtenus :

- `npm run test:run` : 11 tests passent, dont la persistance, le rechargement
  logique, la partition UID et la chaine de revisions ;
- `npm run test:emulator` : 12 tests passent dans 3 fichiers ; les quatre
  classifications sont executees contre les regles Firestore locales ;
- `npm run test:e2e` : 1 parcours Pixel 5 passe. Il cree une intention hors
  ligne, confirme sa presence dans IndexedDB, recharge, puis la synchronise ;
- `npm run build` : passe.

## Limites conservees

Le laboratoire navigateur conserve une passerelle memoire pour visualiser la
reprise sans exiger une session Firebase locale dans la page. La passerelle
Firestore elle-meme est executee contre l'emulateur dans les tests
d'integration. Le branchement de l'application V1 a Firebase Auth et Firestore
reste hors du present prototype.

La fermeture des actions Auth libre-service reste non prouvee, comme documente
dans `resultats-2b-a.md`. Le lot 2B-C, la source cartographique offline et le
test geohash ne sont pas commences.

## Fichiers de ce lot

- `src/prototypes/indexeddb-outbox.ts` ;
- `src/prototypes/firestore-gateway.ts`, `src/prototypes/sync-lab.ts` et
  `src/prototypes/contracts.ts` ;
- `src/prototype-lab.tsx` ;
- `src/prototypes/indexeddb-outbox.test.ts` et `src/prototypes/sync-lab.test.ts` ;
- `tests/emulator/firestore-gateway.integration.test.ts` ;
- `tests/pwa-offline.spec.ts`, `playwright.config.ts`, `firestore.rules` ;
- `package.json`, `package-lock.json`.
