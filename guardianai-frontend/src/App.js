import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from './components/Login.js';
import Register from './components/Register.js';
import Dashboard from './components/Dashboard.js';
import EmergencyTracker from './components/EmergencyTracker.js';
import ProfileSettings from './components/ProfileSettings.js'; // Import ProfileSettings
import './styles/global.css';
import './styles/EmergencyTracker.css';

function App() {
  const [audioBlob, setAudioBlob] = useState(null);
  const [emotion, setEmotion] = useState(null);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login'); // 'login', 'register', or 'dashboard'

  // Add these new state variables at the top of your component
  const [emergencyRecording, setEmergencyRecording] = useState(false);
  const [emergencyMediaRecorder, setEmergencyMediaRecorder] = useState(null);
  const [emergencyId, setEmergencyId] = useState(null);

  const startRecording = async () => {
    setEmotion(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const audioChunks = [];

    recorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: 'audio/wav' });
      setAudioBlob(blob);
      
      // Automatically save recording when stopped (if user is logged in)
      if (user && user._id) {
        saveRecording(blob);
      }
    };

    recorder.start();
    setMediaRecorder(recorder);
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorder.stop();
    setRecording(false);
    
    // We'll let the mediaRecorder's onstop event handler finish creating the blob
    // before attempting to save it
  };

  // Add a new function to save recordings
  const saveRecording = async (blob) => {
    if (!blob || !user) return;

    const formData = new FormData();
    formData.append('audio', blob, 'recording.wav');
    formData.append('userId', user._id);

    try {
      const response = await axios.post('http://localhost:3001/analyze-audio', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setEmotion(response.data);
      
      // Refresh recordings list in Dashboard by re-fetching them
      // This will happen automatically if you've set up a useEffect with user dependency in Dashboard
    } catch (error) {
      console.error('Error saving audio recording:', error);
    }
  };

  const handleLogin = async (email, password) => {
    try {
      const response = await axios.post('http://localhost:3001/login', { email, password });
      setUser(response.data);
      setView('dashboard');
    } catch (error) {
      console.error('Login failed:', error.response?.data?.error || error.message);
      alert('Login failed: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleRegister = async (userData) => {
    try {
      const response = await axios.post('http://localhost:3001/register', userData);
      setUser(response.data);
      setView('dashboard');
    } catch (error) {
      console.error('Registration failed:', error.response?.data?.error || error.message);
      alert('Registration failed: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleUserUpdate = (updatedUser) => {
    setUser(updatedUser);
  };

  const handleLogout = () => {
    setUser(null);
    setView('login');
  };

  const analyzeAudio = () => {
    if (audioBlob && user) {
      saveRecording(audioBlob);
    }
  };

  // Add this function to start emergency recording
  const startEmergencyRecording = async (currentEmergencyId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Function to create and start a new recording session
      const startNewRecordingSession = async () => {
        const recorder = new MediaRecorder(stream);
        const audioChunks = [];
        
        recorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };
        
        recorder.onstop = async () => {
          if (audioChunks.length === 0) return;
          
          const blob = new Blob(audioChunks, { type: 'audio/wav' });
          
          // Upload the emergency audio recording
          await uploadEmergencyRecording(blob, currentEmergencyId);
        };
        
        recorder.start();
        
        // Store the recorder in state so we can stop it later
        setEmergencyMediaRecorder(recorder);
        
        // After 10 minutes, stop this recording and start a new one
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
            
            // If we're still in emergency mode, start another recording
            if (emergencyRecording) {
              startNewRecordingSession();
            }
          }
        }, 10 * 60 * 1000); // 10 minutes in milliseconds
      };
      
      // Start the first recording session
      setEmergencyRecording(true);
      setEmergencyId(currentEmergencyId);
      startNewRecordingSession();
      
    } catch (error) {
      console.error("Failed to start emergency recording:", error);
    }
  };

  // Function to stop emergency recording
  const stopEmergencyRecording = () => {
    if (emergencyMediaRecorder && emergencyMediaRecorder.state === 'recording') {
      emergencyMediaRecorder.stop();
    }
    
    setEmergencyRecording(false);
    setEmergencyId(null);
  };

  // Function to upload emergency recordings
  const uploadEmergencyRecording = async (blob, currentEmergencyId) => {
    if (!blob || !user || !emergencyId) return;
    
    try {
      const formData = new FormData();
      formData.append('audio', blob, `emergency-${Date.now()}.wav`);
      formData.append('userId', user._id);
      formData.append('emergencyId', emergencyId);
      formData.append('isEmergencyRecording', 'true');
      
      // Send to server
      await axios.post('http://localhost:3001/emergency-recording', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });
      
      console.log('Emergency recording uploaded successfully');
    } catch (error) {
      console.error('Error uploading emergency recording:', error);
    }
  };

  return (
    <Router>
      <Routes>
        <Route path="/track/:emergencyId" element={<EmergencyTracker />} />
        <Route path="/profile" element={
          user ? 
            <ProfileSettings user={user} onUserUpdate={handleUserUpdate} /> : 
            <Navigate to="/" />
        } />
        <Route path="/" element={
          user ? (
            <Dashboard 
              user={user} 
              onLogout={handleLogout} 
              recording={recording}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              audioBlob={audioBlob}
              onAnalyzeAudio={analyzeAudio}
              emotion={emotion}
              onStartEmergencyRecording={startEmergencyRecording}
              onStopEmergencyRecording={stopEmergencyRecording}
            />
          ) : (
            view === 'login' ? (
              <Login onLogin={handleLogin} onSwitchToRegister={() => setView('register')} />
            ) : (
              <Register onRegister={handleRegister} onSwitchToLogin={() => setView('login')} />
            )
          )
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;