const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');
const redis = require('redis');
require('dotenv').config();
const app = express();
const port = 4000;


// Initialize Redis client
const redisClient = redis.createClient(6379,'127.0.0.1');
(async () => {
  await redisClient.connect();
})();

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis server');
});


// Initialize MQTT client
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com'); // Replace 'mqtt-broker' with your MQTT broker's address
mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
 });

// MQTT message handler
mqttClient.on('message', (topic, message) => {
  if (topic === 'speed') {
    const data = JSON.parse(message);
    redisClient.set('latestSpeed', data.speed);
  }
});

// Subscribe to MQTT topic
mqttClient.subscribe('speed');

// Close MQTT
mqttClient.on('close', () => {
  console.log('Connection to MQTT broker closed');
 });

 
// Middleware to parse JSON in request body
app.use(bodyParser.json());

// Middleware to validate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token is missing' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden: Invalid token' });
    req.user = user;
    next();
  });
};


//Routes  
// Express route to get a token
app.post('/', (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Bad Request: Invalid email format' });
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '5m' });
  res.status(200).json({ token });
});


// Express route to get the latest speed from Redis
app.get('/', authenticateToken, async (req, res) => {
  try {
    const speed = await redisClient.get('latestSpeed')
    if (!speed) {
      return res.status(404).json({ error: 'Not Found: No data in Redis' });
    }

    res.status(200).json({ speed: parseInt(speed) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// route to add new speed
app.post('/publish-speed', authenticateToken, (req, res) => {
  const { speed } = req.body;
  if (!speed || isNaN(speed) || speed < 0 || speed > 100) {
    return res.status(400).json({ error: 'Bad Request: Invalid speed value' });
  }

  // Publish speed data to MQTT 'speed' topic
  mqttClient.publish('speed', JSON.stringify({ speed }));

  res.status(200).json({ message: 'Speed data published to MQTT' });
});

// Start Express server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

