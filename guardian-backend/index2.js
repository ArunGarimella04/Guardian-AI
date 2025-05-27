require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const http = require('http');
const socketIo = require('socket.io');
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const User = require('./models/User');
const Emergency = require('./models/Emergency');
const placesRoutes = require('./routes/places');
const emergencyRoutes = require('./routes/emergency');

const uploadDir = path.join(__dirname, 'uploads/recordings');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
const server = http.createServer(app); // ✅ Moved here before using in socketIo

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(bodyParser.json());
app.use('/api', placesRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/guardianai', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Successfully connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Multer setup for audio file uploads
const upload = multer({ dest: 'uploads/' });

// Socket.IO setup
const activeEmergencies = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-emergency', (emergencyId) => {
    socket.join(emergencyId);
    console.log(`Socket ${socket.id} joined emergency ${emergencyId}`);
  });

  socket.on('location-update', (data) => {
    const { emergencyId, location, timestamp } = data;

    if (emergencyId && location) {
      activeEmergencies.set(emergencyId, {
        location,
        timestamp: timestamp || new Date(),
        lastUpdated: new Date()
      });

      io.to(emergencyId).emit('location-updated', {
        emergencyId,
        location,
        timestamp: timestamp || new Date()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Mock SMS service
const smsService = {
  sendMessage: async (to, body) => {
    try {
      const message = await client.messages.create({
        body: body,
        to: to,
        from: process.env.TWILIO_PHONE_NUMBER
      });
      console.log('SMS sent:', message.sid);
      return message;
    } catch (error) {
      console.error('Twilio SMS error:', error);
      throw error;
    }
  }
};

// Safe Places endpoint
app.get('/safe-places', async (req, res) => {
  try {
    const { lat, lng, radius = 1000, category } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const amenityQueries = {
      'protection': ['police', 'fire_station'],
      'medical': ['hospital', 'clinic', 'doctors', 'pharmacy'],
      'transit': ['bus_station', 'subway_station', 'train_station'],
      'shelter': ['hotel', 'community_centre', 'library']
    };

    let amenities = category ? amenityQueries[category] : ['police', 'hospital', 'pharmacy', 'fire_station'];
    let amenityFilters = amenities.map(a => `node["amenity"="${a}"](around:${radius},${lat},${lng});`).join('\n');

    const overpassQuery = `
      [out:json][timeout:25];
      (
        ${amenityFilters}
      );
      out body;
      >;
      out skel qt;
    `;

    const overpassResponse = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: overpassQuery }
    });

    const places = overpassResponse.data.elements.map(element => ({
      id: element.id.toString(),
      name: element.tags.name || `${element.tags.amenity} (No name)`,
      type: element.tags.amenity,
      category: getCategoryFromAmenity(element.tags.amenity),
      location: {
        lat: element.lat,
        lng: element.lon
      },
      distance: calculateDistance(parseFloat(lat), parseFloat(lng), element.lat, element.lon),
      phone: element.tags.phone || 'N/A',
      rating: 4.0
    }));

    res.json({
      category: category || 'all',
      total: places.length,
      places: places
    });

  } catch (error) {
    console.error('Error finding safe places:', error);
    res.status(500).json({ error: 'Failed to fetch safe places' });
  }
});

function getCategoryFromAmenity(amenity) {
  const categoryMap = {
    'police': 'protection',
    'fire_station': 'protection',
    'hospital': 'medical',
    'clinic': 'medical',
    'doctors': 'medical',
    'pharmacy': 'medical',
    'bus_station': 'transit',
    'subway_station': 'transit',
    'train_station': 'transit',
    'hotel': 'shelter',
    'community_centre': 'shelter',
    'library': 'shelter'
  };
  return categoryMap[amenity] || 'other';
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
           Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
           Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return `${distance.toFixed(1)} km`;
}

// Auth endpoints
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, emergencyContacts } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      emergencyContacts: emergencyContacts || []
    });

    await newUser.save();

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json(userResponse);
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Emergency SOS endpoint
// Modify the emergency/sos endpoint
app.post('/emergency/sos', async (req, res) => {
  try {
    const { userId, location, timestamp } = req.body;
    let user = null;
    let emergency = null;

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId).populate('emergencyContacts'); // Added populate
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      emergency = new Emergency({
        user: userId,
        location,
        timestamp,
        status: 'active'
      });
      await emergency.save();

      const trackingLink = `http://localhost:3000/track/${emergency._id}`;
      console.log('Emergency Contacts:', user.emergencyContacts); // Debug log

      // Send alerts to emergency contacts
      if (user?.emergencyContacts?.length > 0) {
        for (const contact of user.emergencyContacts) {
          try {
            // Log before sending
            console.log(`Sending alert to ${contact.name} at ${contact.phone}`);
            
            await smsService.sendMessage(
              contact.phone,
              `EMERGENCY: ${user.name} needs help! Location: https://maps.google.com/?q=${location.lat},${location.lng}. Track: ${trackingLink}`
            );
            
            // Log after sending
            console.log(`Alert sent successfully to ${contact.phone}`);
          } catch (smsError) {
            console.error(`Failed to send alert to ${contact.phone}:`, smsError);
          }
        }
      } else {
        console.log('No emergency contacts found for user:', userId);
      }
    }

    res.status(200).json({ 
      message: 'Emergency alert sent successfully', 
      emergencyId: emergency._id,
      contactsNotified: user?.emergencyContacts?.length || 0
    });
  } catch (error) {
    console.error('Error sending emergency alert:', error);
    res.status(500).json({ error: 'Failed to send emergency alert' });
  }
});

// Audio Analysis
app.post('/analyze-audio', upload.single('audio'), async (req, res) => {
  const audioFile = req.file;
  if (!audioFile) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFile.path), audioFile.originalname);

    const response = await axios.post('http://localhost:5000/analyze', formData, {
      headers: formData.getHeaders()
    });

    fs.unlinkSync(audioFile.path);
    res.json(response.data);
  } catch (error) {
    console.error('Error analyzing audio emotion:', error.message);
    res.status(500).json({ error: 'Audio emotion analysis failed' });
  }
});
// Test endpoint to check emergency status
app.get('/emergency/:emergencyId/status', async (req, res) => {
  try {
    const emergency = await Emergency.findById(req.params.emergencyId)
      .populate('user')
      .populate('recordings');
    
    if (!emergency) {
      return res.status(404).json({ error: 'Emergency not found' });
    }

    res.json({
      status: emergency.status,
      location: emergency.location,
      timestamp: emergency.timestamp,
      recordings: emergency.recordings.length,
      contactsNotified: emergency.user?.emergencyContacts?.length || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emergency status' });
  }
});

// Test endpoint to verify Twilio setup
app.post('/test-sms', async (req, res) => {
  try {
    const { phone } = req.body;
    const message = await smsService.sendMessage(
      phone,
      'Test message from Guardian AI'
    );
    res.json({ success: true, messageId: message.sid });
  } catch (error) {
    res.status(500).json({ error: 'SMS test failed' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GuardianAI backend running on port ${PORT}`);
});
