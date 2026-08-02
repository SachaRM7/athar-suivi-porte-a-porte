# Resultats de l'etape 2B-C

Date : 29 juillet 2026  
Statut : **preuve locale levee ; essai Android physique restant**

Le micro-paquet PNG initial a ete remplace pendant le lot de levee par
`public/fixtures/toulouse.pmtiles`. L'extrait couvre Toulouse sur l'emprise
`1.35,43.52,1.52,43.68`, pese 20 607 579 octets et contient 517 tuiles MVT gzip
pour les zooms 0 a 15. Il provient du build quotidien Protomaps du 28 juillet
2026, derive d'OpenStreetMap sous ODbL, sans souscription ni service payant.

Le parcours Playwright prepare le paquet dans Cache Storage, coupe le reseau,
recharge la PWA et verifie une reponse partielle HTTP 206. MapLibre decompresse
145 580 octets pour la tuile centrale et rend 272 entites. La capture contient
256 couleurs significatives ; la couleur dominante represente 278 962 pixels
sur 892 707, soit 31,25 %. Aucune requete de tuile, glyphe ou sprite tiers n'est
necessaire.

Le test geohash execute 30 requetes reelles contre Firestore Emulator sur
10 000 portes distinctes. Il mesure 812 documents candidats, 504 portes dans le
viewport, 308 faux positifs, aucun doublon et aucun faux negatif. Cette preuve
remplace la simulation precedente de 5 390 candidats.

Voir `docs/resultats-levee-2b.md` pour les commandes, le hash du paquet et la
revue des limites restantes.

