import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from "socket.io-client";
import NearbySafePlaces from './NearbySafePlaces';

function Dashboard({ user, onLogout, recording, onStartRecording, onStopRecording, audioBlob, onAnalyzeAudio, emotion }) {
  const [sosStatus, setSosStatus] = useState('idle');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Hello! How can I help you today?' }
  ]);
  const [messageInput, setMessageInput] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [emergencyId, setEmergencyId] = useState(null);
  const [socket, setSocket] = useState(null);
  const navigate = useNavigate();
  const [isSendingSOS, setIsSendingSOS] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCycle, setRecordingCycle] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  
  // Add these refs
  const timerRef = React.useRef(null);
  const mediaRecorderRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);
  
  // Get user location when component mounts
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    } else {
      console.error('Geolocation is not supported by this browser.');
    }
  }, []);
  
  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, []);
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const startRecordingTimer = () => {
    setRecordingTime(0);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = setInterval(() => {
      setRecordingTime(prevTime => {
        if (prevTime >= 1200) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          clearInterval(timerRef.current);
          return 0;
        }
        return prevTime + 1;
      });
    }, 1000);
  };

  const saveRecording = async () => {
    if (audioChunksRef.current.length === 0) return;
    
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, `emergency_recording_${recordingCycle}.webm`);
      formData.append('cycleNumber', recordingCycle);
      formData.append('emergencyId', emergencyId);
      
      const response = await axios.post('http://localhost:3001/analyze-audio', formData);
      console.log(`Recording ${recordingCycle} saved:`, response.data);
    } catch (error) {
      console.error('Error saving recording:', error);
    }
  };

  
  // SOS functionality
  const handleSOS = async () => {
    setSosStatus('sending');
    console.log('Starting SOS with user:', user);
    
    try {
      const payload = {
        userId: user?._id || user?.id,
        initialLocation: userLocation || { lat: 0, lng: 0 },
        timestamp: new Date()
      };
      
      const response = await axios.post('http://localhost:3001/emergency/sos', payload);
      
      setEmergencyId(response.data.emergencyId);
      if (socket) {
        socket.emit('join-emergency', response.data.emergencyId);
        setTrackingActive(true);
      }
      
      setSosStatus('sent');
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch (error) {
      console.error('Error sending SOS:', error);
      setSosStatus('error');
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;
    
    const userMessage = { sender: 'user', text: messageInput };
    setChatMessages([...chatMessages, userMessage]);
    setMessageInput('');
    
    try {
      const response = await axios.post('http://localhost:3001/chatbot/message', {
        message: messageInput,
        userId: user._id || user.id || 'guest'
      });
      
      setChatMessages(prev => [
        ...prev,
        { sender: 'bot', text: response.data.response }
      ]);
    } catch (error) {
      console.error('Error getting chatbot response:', error);
      setChatMessages(prev => [
        ...prev,
        { sender: 'bot', text: 'Sorry, I encountered an error. Please try again.' }
      ]);
    }
  };

  const goToProfile = () => {
    navigate('/profile');
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>GuardianAI</h1>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <button onClick={goToProfile} className="btn-profile">Profile</button>
          <button onClick={onLogout} className="btn-logout">Logout</button>
        </div>
      </header>
      
      <div className="dashboard-content">
        <div className="main-panel">
          <div className="sos-section">
            <button 
              className={`sos-button ${sosStatus === 'sending' ? 'sending' : sosStatus === 'sent' ? 'sent' : ''}`}
              onClick={handleSOS}
              disabled={sosStatus === 'sending'}
            >
              {sosStatus === 'idle' && 'SOS EMERGENCY'}
              {sosStatus === 'sending' && 'SENDING...'}
              {sosStatus === 'sent' && 'ALERT SENT!'}
              {sosStatus === 'error' && 'ERROR - TRY AGAIN'}
            </button>
            <p>
              {sosStatus === 'idle' && 'Press in case of emergency'}
              {sosStatus === 'sending' && 'Contacting emergency services...'}
              {sosStatus === 'sent' && 'Emergency contacts notified!'}
              {sosStatus === 'error' && 'Failed to send alert. Please try again.'}
            </p>
          </div>

          <div className="features-section">
            <div className="feature-card chatbot-card">
              <h3>Guardian Assistant</h3>
              <div className="chatbot-messages">
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`${msg.sender}-message`}>
                    {msg.text}
                  </div>
                ))}
              </div>
              <div className="chatbot-input">
                <input 
                  type="text" 
                  placeholder="Type your message..." 
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button onClick={handleSendMessage}>Send</button>
              </div>
            </div>

            {/* Add NearbySafePlaces component here */}
            <div className="feature-card">
              <NearbySafePlaces />
            </div>
          </div>
        </div>
        
        <div className="side-panel">
          <div className="emergency-contacts">
            <h3>Emergency Contacts</h3>
            {user.emergencyContacts && user.emergencyContacts.length > 0 ? (
              <ul>
                {user.emergencyContacts.map((contact, index) => (
                  <li key={index}>
                    <strong>{contact.name}</strong> - {contact.phone}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No emergency contacts added yet.</p>
            )}
          </div>
          
          <div className="audio-analysis-card">
            <h3>Audio Analysis</h3>
            <button 
              onClick={recording ? onStopRecording : onStartRecording}
              className={`feature-button ${recording ? 'recording' : ''}`}
            >
              {recording ? 'Stop Recording' : 'Start Recording'}
            </button>
            
            {audioBlob && (
              <div className="audio-controls">
                <audio controls src={URL.createObjectURL(audioBlob)} />
                <button onClick={onAnalyzeAudio} className="btn-analyze">
                  Analyze Emotion
                </button>
              </div>
            )}
            
            {emotion && (
              <div className="emotion-result">
                <strong>Detected Emotion:</strong> {emotion.emotion}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;