import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from "socket.io-client";
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Rectangle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import RecordingsList from './RecordingsList';

function Dashboard({ 
  user, 
  onLogout,
}) {
  const [safeLocations, setSafeLocations] = useState([]);
  const [sosStatus, setSosStatus] = useState('idle'); // 'idle', 'sending', 'sent', 'error'
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Hello! How can I help you today?' }
  ]);
  const [messageInput, setMessageInput] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [emergencyId, setEmergencyId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [safetyCategory, setSafetyCategory] = useState('all');
  const [chatLoading, setChatLoading] = useState(false); // Added for better UX
  const [countdown, setCountdown] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [recordingError, setRecordingError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  const navigate = useNavigate();
  
  // Voice recording functions
  const startRecording = async () => {
    try {
      setRecordingError(null);
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setRecordingBlob(blob);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      
      // Start timer
      const timer = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
      setRecordingTimer(timer);
      
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setRecordingError("Could not access microphone. Please check permissions and try again.");
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      // Clear timer
      if (recordingTimer) {
        clearInterval(recordingTimer);
        setRecordingTimer(null);
      }
      
      setIsRecording(false);
      setRecordingTime(0);
    }
  };
  
  // Update your handleUploadRecording function to include a reference to the RecordingsList component

  // Add a new ref to get access to the RecordingsList component
  const recordingsListRef = useRef();

  // Update the handleUploadRecording function
  const handleUploadRecording = async (blob) => {
    if (!blob) {
      console.error("No recording to upload");
      setRecordingError("No recording available to upload");
      return;
    }
    
    try {
      setUploadingRecording(true);
      console.log(`Preparing to upload recording: ${blob.size} bytes, type: ${blob.type}`);
      
      // Create a new blob with explicit WAV type if needed
      let uploadBlob = blob;
      if (blob.type !== 'audio/wav' && blob.type !== 'audio/x-wav') {
        console.log(`Converting from ${blob.type} to audio/wav`);
        uploadBlob = new Blob([blob], { type: 'audio/wav' });
      }
      
      const formData = new FormData();
      formData.append('audio', uploadBlob, 'recording.wav');
      formData.append('userId', user._id);
      
      console.log("Sending recording to server...");
      const response = await axios.post(
        'http://localhost:3001/analyze-audio', 
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data' 
          },
          timeout: 30000 
        }
      );
      
      console.log("Upload response:", response.data);
      
      if (response.data && response.data.success) {
        alert("Recording saved successfully!");
        setRecordingBlob(null);
        
        // Refresh recordings list if the ref exists
        if (recordingsListRef.current && typeof recordingsListRef.current.fetchRecordings === 'function') {
          recordingsListRef.current.fetchRecordings();
        }
      } else {
        throw new Error(response.data?.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error uploading recording:", error);
      setRecordingError(
        `Upload failed: ${error.response?.data?.error || error.message || "Unknown error"}`
      );
      alert("Failed to upload recording. Please try again.");
    } finally {
      setUploadingRecording(false);
    }
  };
  
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
  
  // SOS functionality
  const handleSOS = () => {
    // If already in sending state, don't do anything
    if (sosStatus === 'sending') return;
    
    // If already in counting state, immediately send SOS (double-tap)
    if (sosStatus === 'counting') {
      // Clear any existing countdown timer
      if (window.sosCountdownTimer) {
        clearInterval(window.sosCountdownTimer);
        window.sosCountdownTimer = null;
      }
      sendSOSAlert();
      return;
    }
    
    // Otherwise start countdown
    setSosStatus('counting');
    setCountdown(5);
    
    // Set up the countdown timer
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          sendSOSAlert();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Save the timer ID so we can clear it if user cancels
    window.sosCountdownTimer = timer;
  };
  
  // Add a new function to handle the actual SOS sending
  const sendSOSAlert = async () => {
    // Clear any existing countdown timer
    if (window.sosCountdownTimer) {
      clearInterval(window.sosCountdownTimer);
      window.sosCountdownTimer = null;
    }
    
    setSosStatus('sending');
    
    try {
      // Send SOS alert
      const response = await axios.post('http://localhost:3001/emergency/sos', {
        userId: user._id,
        location: userLocation,
        timestamp: new Date()
      });
      
      setSosStatus('sent');
      
      // Start emergency tracking
      const emergencyId = response.data.emergencyId;
      setEmergencyId(emergencyId);
      setTrackingActive(true);
      
      // Start location tracking
      startLocationTracking(emergencyId);
      
      alert('Emergency alert sent to your contacts!');
    } catch (error) {
      console.error('Error sending SOS:', error);
      setSosStatus('idle');
      alert('Failed to send emergency alert. Please try again.');
    }
  };
  
  // Update the cancelEmergency function to also handle countdown cancellation
  const cancelEmergency = async () => {
    // If we're in countdown mode, just cancel the countdown
    if (sosStatus === 'counting') {
      if (window.sosCountdownTimer) {
        clearInterval(window.sosCountdownTimer);
        window.sosCountdownTimer = null;
      }
      setSosStatus('idle');
      setCountdown(null);
      return;
    }
    
    // Otherwise, proceed with cancelling the actual emergency
    if (!emergencyId) return;
    
    try {
      await axios.post(`http://localhost:3001/emergency/${emergencyId}/cancel`, {
        userId: user._id
      });
      
      setTrackingActive(false);
      setEmergencyId(null);
      setSosStatus('idle');
      
    } catch (error) {
      console.error('Error cancelling emergency:', error);
    }
  };
  
  // Function to handle continuous location tracking
  const startLocationTracking = React.useCallback((trackingEmergencyId) => {
    // First send the initial location
    if (socket && userLocation) {
      socket.emit('location-update', {
        emergencyId: trackingEmergencyId,
        location: userLocation,
        timestamp: new Date()
      });
    }
    
    // Set up continuous tracking
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const updatedLocation = { lat: latitude, lng: longitude };
          
          // Update local state
          setUserLocation(updatedLocation);
          
          // Send to server via socket if emergency is active
          if (socket && trackingActive && trackingEmergencyId) {
            socket.emit('location-update', {
              emergencyId: trackingEmergencyId,
              location: updatedLocation,
              timestamp: new Date()
            });
          }
        },
        (error) => {
          console.error('Error watching position:', error);
        },
        { 
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      );
      
      // Store the watch ID to clear on component unmount
      return watchId;
    }
    
    return null;
  }, [socket, userLocation, trackingActive]);
  
  // Add cleanup for tracking
  useEffect(() => {
    let watchId = null;
    
    if (trackingActive && emergencyId) {
      watchId = startLocationTracking(emergencyId);
    }
    
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [trackingActive, emergencyId, startLocationTracking]);
  
  // Update the findSafePlaces function to properly handle the response
  const findSafePlaces = async (selectedCategory = safetyCategory) => {
    if (!userLocation) {
      alert("Location access is required to find safe places.");
      return;
    }
    
    try {
      setSafeLocations([]); // Clear existing locations while loading
      
      const response = await axios.get(`http://localhost:3001/safe-places`, {
        params: {
          lat: userLocation.lat,
          lng: userLocation.lng,
          type: selectedCategory === 'all' ? undefined : selectedCategory
        }
      });
      
      // Make sure we handle the response correctly - it comes directly as an array
      // instead of response.data.places
      if (Array.isArray(response.data)) {
        setSafeLocations(response.data);
      } else if (response.data && Array.isArray(response.data.places)) {
        setSafeLocations(response.data.places);
      } else {
        // If neither format works, set an empty array
        console.error('Unexpected response format:', response.data);
        setSafeLocations([]);
      }
    } catch (error) {
      console.error('Error finding safe places:', error);
      alert('Failed to find safe places nearby.');
      setSafeLocations([]); // Ensure we set empty array on error
    }
  };
  
  // Updated handleSendMessage to use OpenAI API
  const handleSendMessage = async () => {
    if (!messageInput.trim() || chatLoading) return;
    
    // Add user message to chat
    const userMessage = { sender: 'user', text: messageInput };
    setChatMessages(prevMessages => [...prevMessages, userMessage]);
    
    const messageToSend = messageInput;
    setMessageInput(''); // Clear input field immediately for better UX
    setChatLoading(true); // Set loading state
    
    try {
      // Send message to OpenAI backend
      const response = await axios.post('http://localhost:3001/chatbot/openai', {
        message: messageToSend,
        userId: user._id || user.id || 'guest' // Provide a fallback
      });
      
      // Add bot response to chat
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
    } finally {
      setChatLoading(false); // End loading state
    }
  };

  const goToProfile = () => {
    navigate('/profile');
  };

  // Helper function for place type icons (can use actual icons later)
  const getCategoryIcon = (type) => {
    const icons = {
      'police': '👮',
      'fire_station': '🚒',
      'hospital': '🏥',
      'pharmacy': '💊',
      'subway_station': '🚇',
      'bus_station': '🚍',
      'lodging': '🏨',
      'shopping_mall': '🛍️'
    };
    
    return icons[type] || '📍';
  };

  // Helper function to format place types for display
  const formatPlaceType = (type) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
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
          {/* New layout: SOS and Emergency Contacts side-by-side */}
          <div className="emergency-row">
            <div className="sos-section">
              <div className="sos-button-container">
                {sosStatus === 'sent' || trackingActive ? (
                  <button 
                    onClick={cancelEmergency} 
                    className="sos-cancel-button"
                  >
                    Cancel Emergency Mode
                  </button>
                ) : (
                  <button 
                    onClick={handleSOS} 
                    className={`sos-button ${sosStatus === 'sending' ? 'sending' : ''} ${sosStatus === 'counting' ? 'counting' : ''}`}
                    disabled={sosStatus === 'sending'}
                  >
                    {sosStatus === 'sending' ? 'Sending...' : 
                     sosStatus === 'counting' ? `${countdown}` : 'SOS'}
                  </button>
                )}
              </div>
              <p>
                {sosStatus === 'idle' && 'Press in case of emergency.'}
                {sosStatus === 'counting' && 'Tap again to send immediately, or wait for countdown.'}
                {sosStatus === 'sending' && 'Contacting emergency services...'}
                {sosStatus === 'sent' && 'Emergency contacts notified!'}
                {sosStatus === 'error' && 'Failed to send alert. Please try again.'}
              </p>
              {emergencyId && (
                <div className="test-link" style={{marginTop: '10px'}}>
                  <a 
                    href={`/track/${emergencyId}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{fontSize: '12px', color: '#666'}}
                  >
                    Test Tracking Page (Development Only)
                  </a>
                </div>
              )}
            </div>
            
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
          </div>
          
          <div className="features-section">
            {/* Chatbot with OpenAI integration */}
            <div className="feature-card chatbot-card">
              <h3>Guardian Assistant</h3>
              <div className="chatbot-messages">
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`${msg.sender}-message`}>
                    {msg.text}
                  </div>
                ))}
                {chatLoading && (
                  <div className="bot-message typing">
                    <span className="typing-indicator">
                      <span className="dot"></span>
                      <span className="dot"></span>
                      <span className="dot"></span>
                    </span>
                  </div>
                )}
              </div>
              <div className="chatbot-input">
                <input 
                  type="text" 
                  placeholder="Type your message..." 
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  disabled={chatLoading}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={chatLoading || !messageInput.trim()}
                >
                  {chatLoading ? '...' : 'Send'}
                </button>
              </div>
            </div>
            
            <div className="feature-card">
              <h3>Nearby Safe Places</h3>
              <div className="category-buttons">
                <button 
                  className={`category-btn ${safetyCategory === 'all' ? 'active' : ''}`} 
                  onClick={() => {setSafetyCategory('all'); findSafePlaces('all')}}
                >
                  All
                </button>
                <button 
                  className={`category-btn ${safetyCategory === 'protection' ? 'active' : ''}`} 
                  onClick={() => {setSafetyCategory('protection'); findSafePlaces('protection')}}
                >
                  Police & Protection
                </button>
                <button 
                  className={`category-btn ${safetyCategory === 'medical' ? 'active' : ''}`} 
                  onClick={() => {setSafetyCategory('medical'); findSafePlaces('medical')}}
                >
                  Medical
                </button>
                <button 
                  className={`category-btn ${safetyCategory === 'transit' ? 'active' : ''}`} 
                  onClick={() => {setSafetyCategory('transit'); findSafePlaces('transit')}}
                >
                  Public Transport
                </button>
                <button 
                  className={`category-btn ${safetyCategory === 'shelter' ? 'active' : ''}`} 
                  onClick={() => {setSafetyCategory('shelter'); findSafePlaces('shelter')}}
                >
                  Safe Shelter
                </button>
              </div>

              <button 
                className="feature-button"
                onClick={() => findSafePlaces()}
                disabled={!userLocation}
              >
                Find Safe Places
              </button>
              
              {Array.isArray(safeLocations) && safeLocations.length > 0 ? (
                <div className="safe-places-list">
                  <h4>Safe Places Nearby:</h4>
                  <ul>
                    {safeLocations.map(place => (
                      <li key={place.id || Math.random().toString()} className={`safe-place-item ${place.type || ''}`}>
                        <div className="place-type-icon">{getCategoryIcon(place.type || 'unknown')}</div>
                        <div className="place-details">
                          <strong>{place.name || 'Unknown Location'}</strong> 
                          <span className="place-type">{place.type ? formatPlaceType(place.type) : ''}</span>
                          <div className="place-distance">{place.distance || 'Unknown distance'}</div>
                          {place.phone && <div className="place-phone">{place.phone}</div>}
                        </div>
                        {place.coordinates && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${place.coordinates.lat},${place.coordinates.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="directions-link"
                          >
                            Get Directions
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="map-placeholder">
                  {safeLocations === null ? 'Loading safe places...' : 'Press the button above to find safe places nearby'}
                </div>
              )}
            </div>

            <div className="feature-card">
              <h3>Voice Recording</h3>
              <div className="recording-section">
                {recordingError && (
                  <div className="recording-error">
                    {recordingError}
                  </div>
                )}
                
                <div className="recording-controls">
                  {!isRecording ? (
                    <button 
                      className="recording-button"
                      onClick={startRecording}
                      disabled={uploadingRecording}
                    >
                      {uploadingRecording ? 'Uploading...' : 'Start Recording'}
                    </button>
                  ) : (
                    <button 
                      className="recording-button recording"
                      onClick={stopRecording}
                    >
                      Stop Recording ({recordingTime}s)
                    </button>
                  )}
                </div>
                
                {recordingBlob && !uploadingRecording && (
                  <div className="recording-preview">
                    <audio 
                      controls
                      src={URL.createObjectURL(recordingBlob)}
                    />
                    <button 
                      className="recording-upload-button"
                      onClick={() => handleUploadRecording(recordingBlob)}
                    >
                      Save Recording
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Add the recordings list component with ref */}
            <div className="feature-card recordings-card">
              <RecordingsList 
                user={user} 
                ref={recordingsListRef}
              />
            </div>
          </div>

          {userLocation && (
            <div className="map-container">
              <h3>Your Location</h3>
              <div className="map-wrapper">
                <MapContainer 
                  center={[userLocation.lat, userLocation.lng]} 
                  zoom={15} 
                  style={{ height: "100%", width: "100%" }}
                  maxBounds={[
                    [userLocation.lat - 0.05, userLocation.lng - 0.05], 
                    [userLocation.lat + 0.05, userLocation.lng + 0.05]
                  ]}
                  maxBoundsViscosity={1.0}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[userLocation.lat, userLocation.lng]}>
                    <Popup>
                      Your current location<br />
                      {new Date().toLocaleString()}
                    </Popup>
                  </Marker>
                  
                  {/* Inner boundary - safety radius (approx 1km) */}
                  <Rectangle 
                    bounds={[
                      [userLocation.lat - 0.009, userLocation.lng - 0.012],
                      [userLocation.lat + 0.009, userLocation.lng + 0.012]
                    ]}
                    pathOptions={{ 
                      color: '#2575fc', 
                      weight: 2, 
                      fillColor: '#2575fc', 
                      fillOpacity: 0.1 
                    }}
                  />
                  
                  {/* Outer boundary - limits map panning area */}
                  <Rectangle 
                    bounds={[
                      [userLocation.lat - 0.05, userLocation.lng - 0.05],
                      [userLocation.lat + 0.05, userLocation.lng + 0.05]
                    ]}
                    pathOptions={{ 
                      color: '#ff4757', 
                      weight: 1, 
                      fillOpacity: 0, 
                      dashArray: '5, 5',
                      opacity: 0.7
                    }}
                  />
                </MapContainer>
              </div>
              <div className="map-info">
                <p>Safe radius: ~1km (blue) | Map boundary: ~5km (red dashed)</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;