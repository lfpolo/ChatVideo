# ChatVideo
Chat video multi participants

Cette plate-forme web fournit à n personnes travaillant ensembles les services suivants :
- Chat audio / vidéo / texte en 1-1 ou en N-N, sorte de Skype mais au lieu d'être une application native ou un plugin, la solution est codées en technos web (JS/HTML/CSS) et tourne dans un navigateur, sans aucune installation préalable,
- Carte permettant de situer la position géographique des participants (utilisation de l'API de géo-localisation de HTML5),
- Transfert de fichier direct en p2p,
- Support de "salles vituelles, c'est-à-dire que la plateforme permet à plusieurs groupes de personnes de participer à des réunions en parallèle, à la manière de appear.in, talky.io, jipsy etc.

The code that does the video chat p2p is at js/mains.js

How to test

1. create a mongodb database named "testRooms" : use testRooms
2. create a collection named "rooms" : db.createCollection("rooms")
3. open a terminal and enter into the folder of the project
4. node server.js
5. open google chrome and enter localhost:2013
6. if you want to test with several computers, get the server ip address, and enter [ip]:2013

