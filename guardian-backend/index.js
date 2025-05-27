const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const http = require('http');
const socketIo = require('socket.io');

// Import models
const User = require('./models/User');
const Emergency = require('./models/Emergency');
const Recording = require('./models/Recording');

// Setup express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/guardianAI')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Failed to connect to MongoDB:', err));

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// Create HTTP server for Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Active emergencies tracking
const activeEmergencies = new Map();

// Socket.IO setup
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  socket.on('join-emergency', (emergencyId) => {
    socket.join(emergencyId);
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
});

// Mock SMS service
const smsService = {
  sendMessage: async (to, body) => {
    console.log(`[SMS NOTIFICATION] To: ${to} | Message: ${body}`);
    return { success: true, id: 'mock-' + Date.now() };
  }
};

// AUTHENTICATION ENDPOINTS
// Register new user
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
      name, email, password: hashedPassword, phone,
      emergencyContacts: emergencyContacts || []
    });
    
    await newUser.save();
    
    const userResponse = newUser.toObject();
    delete userResponse.password;
    
    res.status(201).json(userResponse);
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
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
    res.status(500).json({ error: 'Login failed' });
  }
});

// Update user
app.put('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, phone, emergencyContacts } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, phone, emergencyContacts },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userResponse = updatedUser.toObject();
    delete userResponse.password;
    
    res.json(userResponse);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// EMERGENCY ENDPOINTS
// Send SOS alert
app.post('/emergency/sos', async (req, res) => {
  try {
    const { userId, location, timestamp } = req.body;
    let user = null;
    let emergency = null;
    
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      
      emergency = new Emergency({
        user: userId,
        location,
        timestamp,
        status: 'active'
      });
      await emergency.save();
      
      const trackingLink = `http://localhost:3000/track/${emergency._id}`;
      
      if (user?.emergencyContacts?.length > 0) {
        for (const contact of user.emergencyContacts) {
          try {
            await smsService.sendMessage(
              contact.phone,
              `EMERGENCY: ${user.name} has sent an SOS! Track their location: ${trackingLink}`
            );
          } catch (error) {
            console.error(`Failed to send alert to ${contact.phone}:`, error);
          }
        }
      }
    } else {
      emergency = new Emergency({
        location,
        timestamp,
        status: 'active',
        notes: 'Anonymous emergency alert'
      });
      await emergency.save();
    }
    
    res.status(200).json({ 
      message: 'Emergency alert sent successfully', 
      emergencyId: emergency._id 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send emergency alert' });
  }
});

// Get emergency location
app.get('/emergency/:id/location', async (req, res) => {
  try {
    const emergencyId = req.params.id;
    
    const emergencyData = activeEmergencies.get(emergencyId);
    
    if (emergencyData) {
      res.json({
        location: emergencyData.location,
        timestamp: emergencyData.timestamp,
        lastUpdated: emergencyData.lastUpdated
      });
    } else {
      const emergency = await Emergency.findById(emergencyId);
      
      if (!emergency) {
        return res.status(404).json({ error: 'Emergency not found' });
      }
      
      let userData = null;
      if (emergency.user) {
        const user = await User.findById(emergency.user);
        if (user) {
          userData = {
            name: user.name,
            phone: user.phone
          };
        }
      }
      
      res.json({
        location: emergency.location,
        timestamp: emergency.timestamp,
        lastUpdated: emergency.timestamp,
        userData: userData
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emergency location' });
  }
});

// Cancel emergency
app.post('/emergency/:id/cancel', async (req, res) => {
  try {
    const emergencyId = req.params.id;
    const { userId } = req.body;
    
    await Emergency.findByIdAndUpdate(emergencyId, {
      status: 'resolved',
      resolvedAt: new Date()
    });
    
    activeEmergencies.delete(emergencyId);
    
    io.to(emergencyId).emit('emergency-cancelled', {
      emergencyId,
      timestamp: new Date()
    });
    
    if (userId) {
      const user = await User.findById(userId);
      
      if (user?.emergencyContacts?.length > 0) {
        for (const contact of user.emergencyContacts) {
          try {
            await smsService.sendMessage(
              contact.phone,
              `EMERGENCY CANCELLED: ${user.name}'s emergency alert has been cancelled.`
            );
          } catch (error) {
            console.error(`Failed to send cancellation alert:`, error);
          }
        }
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel emergency' });
  }
});

// RECORDING ENDPOINTS
// Analyze audio
app.post('/analyze-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      console.error("No file received");
      return res.status(400).json({ error: 'No audio file received' });
    }
    
    const audioFile = req.file;
    const userId = req.body.userId;
    
    console.log(`Received audio: ${audioFile.originalname}, size: ${audioFile.size} bytes, type: ${audioFile.mimetype}`);
    
    // Check if the user ID is provided and valid
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error("Invalid or missing user ID:", userId);
      return res.status(400).json({ error: 'Valid user ID is required' });
    }
    
    // Check file size (MongoDB has a 16MB limit)
    if (audioFile.size > 15 * 1024 * 1024) {
      console.error("File too large:", audioFile.size);
      return res.status(400).json({ error: 'Audio file too large (max 15MB)' });
    }
    
    // Read the file data
    const fileData = fs.readFileSync(audioFile.path);
    console.log(`Read ${fileData.length} bytes from file`);
    
    // Create recording document
    try {
      const newRecording = new Recording({
        user: userId,
        audioFile: {
          filename: audioFile.originalname || 'recording.wav',
          contentType: audioFile.mimetype || 'audio/wav',
          data: fileData
        },
        createdAt: new Date()
      });
      
      // Save the recording
      const savedRecording = await newRecording.save();
      console.log(`Recording saved with ID: ${savedRecording._id}`);
      
      // Clean up uploaded file
      fs.unlinkSync(audioFile.path);
      
      return res.json({
        success: true,
        recordingId: savedRecording._id,
        message: 'Recording saved successfully'
      });
    } catch (dbError) {
      console.error("Database error:", dbError);
      return res.status(500).json({ 
        error: 'Failed to save recording to database',
        details: dbError.message
      });
    }
  } catch (error) {
    console.error("Server error in analyze-audio:", error);
    return res.status(500).json({ 
      error: 'Server error processing audio',
      details: error.message
    });
  }
});

// Emergency recording
app.post('/emergency-recording', upload.single('audio'), async (req, res) => {
  const audioFile = req.file;
  const { userId, emergencyId, isEmergencyRecording } = req.body;
  
  if (!audioFile) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }
  
  try {
    const fileData = fs.readFileSync(audioFile.path);
    
    const recording = new Recording({
      user: userId,
      emergency: emergencyId,
      audioFile: {
        filename: audioFile.originalname || 'emergency-recording.wav',
        contentType: audioFile.mimetype || 'audio/wav',
        data: fileData
      },
      isEmergencyRecording: isEmergencyRecording === 'true'
    });
    
    await recording.save();
    
    if (emergencyId && mongoose.Types.ObjectId.isValid(emergencyId)) {
      await Emergency.findByIdAndUpdate(emergencyId, {
        $push: { recordings: recording._id }
      });
    }
    
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
      
      if (user?.emergencyContacts?.length > 0) {
        const recordingLink = `http://localhost:3000/recording/${recording._id}`;
        
        for (const contact of user.emergencyContacts) {
          try {
            await smsService.sendMessage(
              contact.phone,
              `EMERGENCY UPDATE: New audio recording from ${user.name} is available: ${recordingLink}`
            );
          } catch (error) {
            console.error(`Failed to send recording alert:`, error);
          }
        }
      }
    }
    
    fs.unlinkSync(audioFile.path);
    
    if (emergencyId) {
      io.to(emergencyId).emit('new-recording', {
        emergencyId,
        recordingId: recording._id,
        timestamp: new Date()
      });
    }
    
    res.json({ success: true, recordingId: recording._id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save emergency recording' });
  }
});

// Get all recordings for a specific user
app.get('/user/:userId/recordings', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Find all recordings for this user, sorted by newest first
    const recordings = await Recording.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50) // Limit to avoid performance issues with too many recordings
      .select('-audioFile.data'); // Exclude audio data to reduce payload size
    
    res.json(recordings);
  } catch (error) {
    console.error('Error fetching user recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

// Get a single recording's audio file
app.get('/recordings/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(recordingId)) {
      return res.status(400).json({ error: 'Invalid recording ID' });
    }
    
    const recording = await Recording.findById(recordingId);
    
    if (!recording || !recording.audioFile || !recording.audioFile.data) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    // Set the appropriate content type
    res.set('Content-Type', recording.audioFile.contentType || 'audio/wav');
    
    // Send the audio data
    res.send(recording.audioFile.data);
  } catch (error) {
    console.error('Error fetching recording audio:', error);
    res.status(500).json({ error: 'Failed to fetch recording audio' });
  }
});

// CHATBOT ENDPOINTS
// Process chatbot messages
app.post('/chatbot', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }
    
    // Simple response logic based on keywords
    let response = '';
    
    if (message.toLowerCase().includes('help') || message.toLowerCase().includes('emergency')) {
      response = "If you're in immediate danger, please use the SOS button to alert your emergency contacts. I can help guide you through safety steps.";
    } else if (message.toLowerCase().includes('safe') || message.toLowerCase().includes('place')) {
      response = "I can help you find safe places nearby. Use the 'Find Safe Places' feature from the dashboard to locate shelters, police stations, or hospitals near you.";
    } else if (message.toLowerCase().includes('record') || message.toLowerCase().includes('audio')) {
      response = "The voice recording feature lets you document situations or analyze emotions in speech. Your recordings are securely stored and can be accessed later.";
    } else if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
      response = "Hello! I'm your Guardian AI assistant. How can I help you today?";
    } else if (message.toLowerCase().includes('thank')) {
      response = "You're welcome! I'm here to help you stay safe.";
    } else {
      response = "I'm here to help keep you safe. You can ask me about emergency resources, using the SOS feature, finding safe places, or recording audio for documentation.";
    }
    
    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Alternative implementation using axios directly
app.post('/chatbot/openai', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }
    
    // Ensure the OpenAI API key is set in your environment variables
    // const apiKey = process.env.OPENAI_API_KEY;
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are an AI safety assistant for the Guardian AI personal safety app. 
                      Your goal is to help users in potentially dangerous situations by providing clear, 
                      actionable advice. Focus on personal safety, emergency response, and mental well-being. 
                      Keep responses concise, supportive, and calm. If the user appears to be in immediate danger,
                      remind them to use the SOS button or call emergency services.`
          },
          { role: "user", content: message }
        ],
        max_tokens: 150,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const botResponse = response.data.choices[0]?.message?.content || 
      "I'm sorry, I couldn't generate a response. Please try again.";
    
    res.json({ response: botResponse });
  } catch (error) {
    console.error('Error with OpenAI:', error);
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});

// SAFE PLACES ENDPOINTS
// Find nearby safe places
app.get('/safe-places', async (req, res) => {
  try {
    const { lat, lng, type } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }
    
    // Mock data for safe places - in a real app, this would call an external API
    const mockSafePlaces = [
      {
        id: 'place1',
        name: 'Central Police Station',
        type: 'police',
        address: '123 Safety Street',
        distance: '0.8 mi',
        phone: '100',
        coordinates: {
          lat: parseFloat(lat) + 0.01,
          lng: parseFloat(lng) - 0.005
        },
        open24Hours: true
      },
      {
        id: 'place2',
        name: 'City Hospital',
        type: 'hospital',
        address: '456 Health Avenue',
        distance: '1.2 mi',
        phone: '108',
        coordinates: {
          lat: parseFloat(lat) - 0.008,
          lng: parseFloat(lng) + 0.003
        },
        open24Hours: true
      },
      {
        id: 'place3',
        name: 'Community Shelter',
        type: 'shelter',
        address: '789 Haven Road',
        distance: '1.5 mi',
        phone: '+91-7568429241',
        coordinates: {
          lat: parseFloat(lat) + 0.005,
          lng: parseFloat(lng) + 0.009
        },
        open24Hours: false,
        hours: '8am-10pm'
      },
      {
        id: 'place4',
        name: 'Downtown Fire Station',
        type: 'fire_station',
        address: '101 Response Blvd',
        distance: '0.6 mi',
        phone: '040-277486452',
        coordinates: {
          lat: parseFloat(lat) - 0.002,
          lng: parseFloat(lng) - 0.007
        },
        open24Hours: true
      },
      {
        id: 'place5',
        name: 'Westside Women\'s Center',
        type: 'shelter',
        address: '202 Support Street',
        distance: '1.7 mi',
        phone: '9587642315',
        coordinates: {
          lat: parseFloat(lat) + 0.012,
          lng: parseFloat(lng) - 0.001
        },
        open24Hours: true,
        servicesFor: 'women and children'
      }
    ];
    
    // Filter by type if specified
    let results = mockSafePlaces;
    if (type && type !== 'all') {
      results = mockSafePlaces.filter(place => place.type === type);
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch safe places' });
  }
});

// Get safe place details
app.get('/safe-places/:id', async (req, res) => {
  try {
    const placeId = req.params.id;
    
    // Mock detailed information - in a real app, this would fetch from a database or API
    const mockDetails = {
      id: placeId,
      name: placeId === 'place1' ? 'Central Police Station' : 'City Hospital',
      type: placeId === 'place1' ? 'police' : 'hospital',
      address: placeId === 'place1' ? '123 Safety Street' : '456 Health Avenue',
      phone: placeId === 'place1' ? '555-1234' : '555-5678',
      website: placeId === 'place1' ? 'www.centralpolice.example.org' : 'www.cityhospital.example.org',
      hours: placeId === 'place1' ? '24 hours' : '24 hours',
      services: placeId === 'place1' 
        ? ['Emergency response', 'Filing reports', 'Safety escorts'] 
        : ['Emergency room', 'Urgent care', 'Crisis counseling'],
      notes: placeId === 'place1' 
        ? 'Enter through the main entrance and speak with the desk officer' 
        : 'Emergency services are available through the ER entrance on the east side of the building'
    };
    
    res.json(mockDetails);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GuardianAI backend running on port ${PORT}`);
});