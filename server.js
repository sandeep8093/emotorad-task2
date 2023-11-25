const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');
const redis = require('redis');

const app = express();
const port = 4000;

// Initialize Redis client
const redisClient = redis.createClient();

// Initialize MQTT client
const mqttClient = mqtt.connect('mqtt://mqtt-broker'); // Replace 'mqtt-broker' with your MQTT broker's address
mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
 });
// Middleware to parse JSON in request body
app.use(bodyParser.json());

// Middleware to validate JWT token
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ error: 'Unauthorized: Token is missing' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden: Invalid token' });
    req.user = user;
    next();
  });
};

// MQTT message handler
mqttClient.on('message', (topic, message) => {
  if (topic === 'speed') {
    const data = JSON.parse(message);
    redisClient.set('latestSpeed', data.speed);
  }
});

// Express route to get a token
app.post('/', (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Bad Request: Invalid email format' });
  }

  const token = jwt.sign({ email }, 'your_secret_key', { expiresIn: '5m' });
  res.json({ token });
});

// Express route to get the latest speed from Redis
app.get('/', authenticateToken, (req, res) => {
  redisClient.get('latestSpeed', (err, speed) => {
    if (err) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (!speed) {
      return res.status(404).json({ error: 'Not Found: No data in Redis' });
    }

    res.json({ speed: parseInt(speed) });
  });
});

// Start Express server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// Subscribe to MQTT topic
mqttClient.subscribe('speed');
