# Guardian AI

Guardian AI is a personal safety application designed to provide assistance during emergencies and enhance personal security through various features including SOS alerts, location tracking, audio recording with emotion analysis, and safe places finder.

![Guardian AI Logo](./pics/logo.png)

## Overview

The Guardian AI system consists of two main components:
1. A backend server built with Node.js, Express, and Python for audio analysis
2. A React-based frontend application with Tailwind CSS and Framer Motion

The system integrates real-time location tracking, emergency alerts, audio recording and emotion analysis, safe places finder, and a safety-focused chatbot to provide comprehensive personal safety tools.

## Features

### Emergency SOS System
- Send immediate SOS alerts to emergency contacts
- Real-time location tracking during emergencies with Socket.IO
- Share tracking links with emergency contacts via SMS
- Visual emergency tracking interface

### Audio Recording & Emotion Analysis
- Record audio for documentation or emergency situations
- Analyze emotional content in recordings using AI
- Identify stress, fear, or other emotional indicators
- Securely store recordings for future reference

### Location-Based Safety
- Find nearby safe places including police stations, hospitals, and shelters
- Categorized safety resources based on emergency type
- Get directions and details about safety resources
- Track user location during emergencies

### AI Safety Assistant
- Interact with an AI chatbot trained for safety scenarios
- Receive guidance during potentially dangerous situations
- Access mental health support and emergency resources
- Context-aware responses based on situation

### User Management
- Secure user authentication and authorization
- Profile customization and emergency contact management
- Personalized safety settings and preferences
- Emergency contact management

## Technical Architecture

### Backend (Node.js/Express/Python)
- RESTful API endpoints for all features
- MongoDB database for user data, emergency records, and audio storage
- Socket.IO for real-time location updates
- Authentication using bcrypt for secure user accounts
- Python for audio analysis and emotion detection

### Frontend (React/Tailwind CSS/Framer Motion)
- Modern, responsive user interface with dark theme support
- Tailwind CSS for utility-first styling
- Framer Motion for smooth animations and transitions
- Real-time location tracking with maps integration
- Audio recording and playback capabilities
- Responsive design for mobile and desktop

## Project Structure

### Backend Structure
```
guardian-backend/
├── index.js           # Main server entry point
├── analyze_emotion.py # Python script for audio emotion analysis
├── models/            # Database models
│   ├── User.js        # User model
│   ├── Emergency.js   # Emergency tracking model
│   └── Recording.js   # Audio recording model
└── requirements.txt   # Python dependencies
```

### Frontend Structure
```
guardianai-frontend/
├── public/            # Static assets
└── src/
    ├── components/    # React components
    │   ├── Dashboard.js
    │   ├── EmergencyTracker.js
    │   ├── Login.js
    │   ├── NearbySafePlaces.js
    │   ├── ProfileSettings.js
    │   ├── RecordingsList.js
    │   └── Register.js
    ├── styles/        # Custom CSS and Tailwind configurations
    ├── App.js         # Main application component
    └── index.js       # Application entry point
```

## Installation & Setup

### Prerequisites
- Node.js (v14+)
- Python (v3.8+)
- MongoDB
- npm or yarn

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd guardian-backend
   ```
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure MongoDB connection in index.js
5. Set up your AssemblyAI API key (for emotion analysis):
   ```bash
   export ASSEMBLY_AI_KEY=your_api_key_here
   ```
6. Start the server:
   ```bash
   npm start
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd guardianai-frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure the backend API endpoint in the environment variables:
   Create a `.env` file with:
   ```
   REACT_APP_API_URL=http://localhost:5000/api
   ```
4. Start the development server:
   ```bash
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and receive JWT token

### Emergency
- `POST /api/emergency/start` - Start emergency tracking
- `PUT /api/emergency/update` - Update emergency location
- `POST /api/emergency/end` - End emergency tracking
- `GET /api/emergency/active` - Get active emergencies

### Recordings
- `POST /api/recordings/create` - Upload a new audio recording
- `GET /api/recordings` - Get all recordings for a user
- `GET /api/recordings/:id` - Get a specific recording
- `POST /api/recordings/analyze` - Analyze emotion in an audio recording

### Safe Places
- `GET /api/places/nearby` - Find nearby safe places
- `GET /api/places/category/:type` - Find places by category (police, medical, shelter)

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `POST /api/users/contacts` - Add emergency contact
- `DELETE /api/users/contacts/:id` - Remove emergency contact

## Future Enhancements

- Integration with emergency services API
- Advanced voice stress analysis with machine learning
- Enhanced location accuracy using multiple data points
- Expanded safe place database with community-sourced locations
- Offline emergency mode for limited connectivity
- Wearable device integration for hands-free activation
- Augmented reality (AR) for safer navigation in unfamiliar areas
- Pattern recognition to identify potential threats

## Deployment

The application can be deployed using:

1. **Backend**: 
   - Heroku, AWS, or Google Cloud Platform
   - Docker container for easy deployment

2. **Frontend**:
   - Netlify, Vercel, or GitHub Pages
   - AWS S3 with CloudFront for CDN capabilities

## Contributors

- Garimella Arun - Project Lead & Developer

## License

This project is licensed under the MIT License - see the LICENSE file for details.
