const express = require('express');
const redis = require('redis');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const redisClient = redis.createClient({ 
  url: 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.log('Redis indisponible - continuation sans cache');
        return new Error('Redis indisponible');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

redisClient.on('error', (err) => {
  if (err.code !== 'ECONNREFUSED') {
    console.error('Erreur Redis:', err.message);
  }
});
redisClient.connect().catch(() => {
  console.log('Redis non disponible au démarrage - l\'API fonctionnera sans cache');
});

const dbPrimary = new Pool({
  host: 'localhost',
  port: 5439,
  user: 'app',
  password: 'app_pwd',
  database: 'appdb'
});

const dbReplica = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'app',
  password: 'app_pwd',
  database: 'appdb'
});

app.get('/products/:id', async (req, res) => {
  const { id } = req.params;
  const cacheKey = `product:${id}`;

  try {
    let cached;
    try {
      cached = await redisClient.get(cacheKey);
    } catch (redisError) {
      console.warn('Échec du GET Redis, poursuite sans cache:', redisError.message);
      cached = null;
    }
    
    if (cached) {
      console.log('RÉPONSE DE CACHE');
      return res.json({ source: 'cache', data: JSON.parse(cached) });
    }

    console.log('PAS DE CACHE - Lecture depuis la base de données');

    let result;
    try {
      result = await dbReplica.query(
        'SELECT * FROM products WHERE id = $1',
        [id]
      );
    } catch (replicaError) {
      console.warn('⚠️  Requête réplica échouée, bascule sur primaire:', replicaError.message);
      result = await dbPrimary.query(
        'SELECT * FROM products WHERE id = $1',
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    const product = result.rows[0];

    try {
      await redisClient.setEx(cacheKey, 60, JSON.stringify(product));
    } catch (redisError) {
      console.warn('Échec du SET Redis, données non mises en cache:', redisError.message);
    }

    return res.json({ source: 'database', data: product });

  } catch (error) {
    console.error('Erreur:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/products', async (req, res) => {
  const { name, price_cents } = req.body;

  try {
    const result = await dbPrimary.query(
      'INSERT INTO products(name, price_cents) VALUES($1, $2) RETURNING *',
      [name, price_cents]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur:', error);
    return res.status(500).json({ error: error.message });
  }
});


app.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price_cents } = req.body;
  const cacheKey = `product:${id}`;

  try {
    const result = await dbPrimary.query(
      'UPDATE products SET name=$1, price_cents=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [name, price_cents, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    try {
      await redisClient.del(cacheKey);
      console.log('Cache invalidé pour :', cacheKey);
    } catch (redisError) {
      console.warn('Échec du delete Redis, cache non invalidé:', redisError.message);
    }

    return res.json(result.rows[0]);

  } catch (error) {
    console.error('Erreur:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API en cours d'exécution sur http://localhost:${PORT}`);
});