# Resultats - Phase A de mise en service privee

Date : 6 aout 2026  
Perimetre : preparation locale et controles cloud en lecture seule de
`athar-dev31`. Aucune ecriture Firebase, aucun compte cree, aucun deployement,
aucun changement de facturation ou de domaine n'a ete execute.

## Runtime et Functions

- Node `22.23.2` est installe localement hors depot et utilise pour toutes les
  commandes de cette phase.
- La racine, `functions/`, `.nvmrc`, `.node-version` et les lockfiles declarent
  Node 22.
- `emulatorHealth` est supprime des exports. La preuve locale appelle a present
  `createMember` sans identite et verifie son refus `401` ou `403` :
  l'emulateur charge donc la seule Function candidate sans ajouter de surface
  HTTP de production.

## Preparation locale

- `firebase.json` declare Hosting statique `dist`, le rewrite SPA et les
  en-tetes `nosniff`, `Referrer-Policy`, anti-cadre et les caches de
  revalidation PWA. Cette configuration n'a pas ete deployee.
- `firestore.indexes.candidate.json` est volontairement distinct de
  `firebase.json`. Il ne peut pas appliquer une specification vide a des index
  cloud existants.
- `.env.production.example` ne contient que les noms de variables publiques de
  build. `scripts/build-athar-dev31.ps1` refuse un projet autre que
  `athar-dev31`, refuse les emulateurs et ne publie rien.
- Les rapports, backups rediges et plans de mutation sont ecrits uniquement
  dans `.athar-local/commissioning/`, ignore par Git. Les scripts imposent le
  projet exact et le dry-run ; ils filtrent mots de passe, jetons, cles et notes.

## Validations Node 22

| Commande | Resultat |
|---|---:|
| `npm run check:node22` | Node `v22.23.2` confirme |
| `npm run lint` | succes |
| `npm run test:run` | 17 fichiers, 56 tests passes |
| `npm run verify:build` | succes ; entree 214,73 ko minifiee, 67,37 ko gzip |
| `npm run test:emulator` | 7 fichiers, 48 tests passes ; Functions Emulator utilise Node 22 |
| `npm run test:e2e:emulator` | 3 parcours passes : deux clients, conflit, purge UID et admin |
| `npm run test:e2e` | 4 parcours passes ; PMTiles hors ligne : 272 entites, 268 couleurs significatives, 279929 pixels dominants |
| `npm run test:commissioning` | scripts gardes et manifeste pilote valides |

`npm audit --omit=dev` est sans avis de production a la racine. Le sous-projet
Functions conserve sept avis moderes transitifs, sans avis eleve ni critique ;
aucun correctif compatible sans mise a jour majeure de `firebase-admin` n'a ete
force.

## Inventaire cloud redige

Le rapport lecture seule local releve :

- projet exact `athar-dev31` ;
- Firestore Native dans `eur3` ;
- Email/Password actif ;
- trois comptes Auth, un membre dans `workspaces/main/members` ;
- aucune zone, statistique, batiment, porte ni passage pilote ;
- Web Apps, sites Hosting et index consultables ;
- lecture Functions refusee par CLI et API avec `PERMISSION_DENIED`.

Le backup logique redige, le plan de retour arriere, le plan d'import pilote et
le plan de bootstrap administrateur ont ete simules avec succes. Ils ne
contiennent ni documents bruts, ni adresses e-mail, ni identifiants, ni notes,
ni secret. Le plan pilote propose quatre statuts, une zone, une projection
`zoneStats`, aucun batiment ni porte, et aucun passage.

## Mutations proposees apres autorisation

### Sas B - configuration projet

1. Relire puis conserver ou corriger uniquement les actions utilisateur Auth
   explicitement autorisees (Email/Password, creation et suppression
   libre-service).
2. Ajouter seulement les domaines Auth effectivement requis par la premiere
   preview, s'ils ne sont pas deja autorises. Aucun domaine ne sera retire dans
   ce sas.
3. Decider explicitement si `createMember` fait partie du pilote. Si oui,
   demander au proprietaire de verifier l'acces Functions, l'activation API et
   le plan Blaze/alertes avant tout deployement. Si non, laisser Functions hors
   pilote et administrer les quelques comptes manuellement.

### Sas C - backend et donnees

Apres backup final : deployer eventuellement les regles seules, uniquement les
index prouves, le bootstrap unique de l'administrateur, les membres techniques,
les statuts, une zone, jusqu'a 25 batiments et 250 portes sans passage ni note.
`createMember` ne peut etre deployee que si le choix Functions du sas B est
trace et que l'acces est leve.

### Sas D - preview

Construire l'artefact avec les variables publiques du projet puis publier cet
artefact unique sur un canal Firebase Hosting temporaire. Tester desktop et
Android, y compris le mode avion et la reprise UUID, avant expiration du canal.

### Sas E - live

Promouvoir exactement la release preview validee, sans rebuild. Aucun ancien
domaine ou canal ne sera retire sans une autorisation distincte et un retour
arriere teste.

## Verification preview post-phase A

Le canal Hosting `private-pilot` a ete reconstruit et publie le 6 aout 2026
apres correction du cache du rewrite SPA. Il expire le 13 aout 2026. Les routes
`/`, `/login` et `/sw.js` retournent HTTP 200, sans page Firebase "Site Not
Found" ; le shell et les routes SPA sont servis avec `no-cache, no-store,
must-revalidate`. Cette publication ne modifie pas le canal live et ne deploie
aucune Function.

## Preview de controle

Un canal Hosting `private-pilot` a ete publie le 6 aout 2026 avec l'artefact
Node 22 ci-dessus, sans Function, regle, index, membre ni donnee pilote. Le
shell `/login` et `sw.js` repondent `200` ; le service worker porte bien
`Cache-Control: no-cache, no-store, must-revalidate`. Le canal expire le 13
aout 2026. Il ne constitue pas encore un pilote terrain : les donnees et les
regles cloud restent inchangees.

## Verdict

**GO pour le sas B**, exclusivement apres autorisation explicite sur les
actions Auth/domaines et le choix Functions/facturation. **NO-GO pour les sas
C, D et E.**
