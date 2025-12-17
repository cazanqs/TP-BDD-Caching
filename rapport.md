# 📋 RAPPORT

### 1. Différence entre réplication et haute disponibilité

Réplication PostgreSQL: 

Assure la duplication des données en temps preque réel entre un serveur primary et un serveur standby. Cependant, la replica reste en mode standby et ne peut pas traiter les demandes en cas de panne du primary. Il n'y a donc pas de basculement automatique du service.

La haute disponibilité:

Ajoute une couche au-dessus : elle permet de détecter la panne du primary et de promouvoir automatiquement (ou manuellement) la replica en nouveau primary. Dans ce TP, nous avons simulé ce processus en promouvant manuellement la replica et en reconfigurer HAProxy pour maintenir la continuité de service.

### 2. Éléments manuels et automatiques

Étapes manuelles:
- Arrêt du primary pour simuler la panne
- Promotion de la replica avec pg_ctl promote
- Modification de la configuration HAProxy pour pointer vers le nouveau primary
- Redémarrage de HAProxy

Étapes automatiques:
- Synchronisation des données entre primary et replica
- Lancement et gestion des conteneurs Docker
- Vérification de la santé des connexions (tcp-check dans HAProxy)

### 3. Risques de cohérence (cache + réplication)

Le risque principal est une incohérence des données. Quand on écrit sur le primary, la modification met plusieurs millisecondes à se propager jusqu'à la replica. Si Redis cache les données de la replica et qu'on lit juste après une modification, on peut récupérer une ancienne valeur du cache.

De plus, si Redis tombe en panne, le cache est perdu mais l'application continue de fonctionner (elle relit simplement depuis la DB, mais plus lentement).

### 4. Améliorations pour la production

- Monitoring et alertes: implémenter des logs et alertes pour surveiller l'état des bases et du cache
- Réplication multiple: plutôt qu'une seule replica, avoir plusieurs serveurs standby
- Sauvegarde régulière: mettre en place des backups pour la récupération en cas de problemes