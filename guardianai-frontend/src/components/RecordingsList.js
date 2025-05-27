import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import axios from 'axios';
import '../styles/recordings.css';

const RecordingsList = forwardRef(({ user }, ref) => {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  // Expose the fetchRecordings method to parent components via ref
  useImperativeHandle(ref, () => ({
    fetchRecordings
  }));

  // Fetch recordings on component mount
  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    if (!user || !user._id) {
      setError("User information not available");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      console.log(`Fetching recordings for user: ${user._id}`);
      const response = await axios.get(`http://localhost:3001/user/${user._id}/recordings`);
      
      if (response.data) {
        console.log(`Retrieved ${response.data.length} recordings`);
        setRecordings(response.data);
        setError(null);
      } else {
        setRecordings([]);
        setError("No recordings data returned");
      }
    } catch (err) {
      console.error('Error fetching recordings:', err);
      
      // More detailed error message
      let errorMessage = 'Failed to load recordings. ';
      
      if (err.response) {
        // The request was made and the server responded with a status code
        errorMessage += `Server error: ${err.response.status} - ${err.response.data?.error || 'Unknown error'}`;
      } else if (err.request) {
        // The request was made but no response was received
        errorMessage += 'No response from server. Please check your connection.';
      } else {
        // Something happened in setting up the request
        errorMessage += err.message;
      }
      
      setError(errorMessage);
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayRecording = (recordingId) => {
    setCurrentlyPlaying(recordingId);
  };

  const handleDeleteRecording = async (recordingId) => {
    if (deleteInProgress) return;
    
    if (!window.confirm('Are you sure you want to delete this recording? This action cannot be undone.')) {
      return;
    }
    
    setDeleteInProgress(true);
    try {
      await axios.delete(`http://localhost:3001/recordings/${recordingId}`, {
        params: { userId: user._id }
      });
      
      // Update recordings list after deletion
      setRecordings(recordings.filter(rec => rec._id !== recordingId));
      
      if (currentlyPlaying === recordingId) {
        setCurrentlyPlaying(null);
      }
    } catch (err) {
      console.error('Error deleting recording:', err);
      alert('Failed to delete recording. Please try again.');
    } finally {
      setDeleteInProgress(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="recordings-loading">Loading your recordings...</div>;
  }

  if (error) {
    return <div className="recordings-error">{error}</div>;
  }

  if (recordings.length === 0) {
    return <div className="recordings-empty">You don't have any recordings yet.</div>;
  }

  return (
    <div className="recordings-list">
      <h3>Your Recordings</h3>
      <div className="recordings-grid">
        {recordings.map(recording => (
          <div key={recording._id} className="recording-card">
            <div className="recording-info">
              <span className="recording-date">{formatDate(recording.createdAt)}</span>
              {recording.isEmergencyRecording && 
                <span className="recording-emergency-badge">Emergency</span>
              }
              {recording.emotion && recording.emotion.dominant && 
                <span className="recording-emotion">
                  Emotion: {recording.emotion.dominant}
                </span>
              }
              {recording.transcript && 
                <div className="recording-transcript">{recording.transcript}</div>
              }
            </div>
            
            <div className="recording-controls">
              <audio 
                src={`http://localhost:3001/recordings/${recording._id}`}
                controls
                onPlay={() => setCurrentlyPlaying(recording._id)}
                onEnded={() => setCurrentlyPlaying(null)}
              />
              
              <button 
                className="recording-delete-btn"
                onClick={() => handleDeleteRecording(recording._id)}
                disabled={deleteInProgress}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default RecordingsList;