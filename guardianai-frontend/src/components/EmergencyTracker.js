import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "leaflet-routing-machine";

// Fix Leaflet's default icon issue
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Component to update map view when center changes
function MapCenterUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

// Create a component for routing
function RoutingMachine({ responderLocation, emergencyLocation }) {
  const map = useMap();
  
  useEffect(() => {
    if (!map || !responderLocation || !emergencyLocation) return;
    
    // Create routing control - using a safer approach to avoid race conditions
    let routingControl = null;
    
    try {
      routingControl = L.Routing.control({
        waypoints: [
          L.latLng(responderLocation.lat, responderLocation.lng),
          L.latLng(emergencyLocation.lat, emergencyLocation.lng)
        ],
        routeWhileDragging: false,
        showAlternatives: false, // Disable alternatives to reduce errors
        altLineOptions: {
          styles: [
            { color: 'black', opacity: 0.15, weight: 9 },
            { color: 'white', opacity: 0.8, weight: 6 },
            { color: 'blue', opacity: 0.5, weight: 2 }
          ]
        },
        lineOptions: {
          styles: [
            { color: 'black', opacity: 0.15, weight: 9 },
            { color: 'white', opacity: 0.8, weight: 6 },
            { color: 'red', opacity: 0.5, weight: 2 }
          ]
        },
        router: L.Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1',
          timeout: 30 * 1000
        }),
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        useZoomParameter: true,
        show: true, // Show the instruction panel
        collapsible: true, // Make it collapsible but initially expanded
        containerClassName: 'custom-routing-container',
        language: 'en' // Ensure English language
      });
      
      routingControl.addTo(map);
      
      // Ensure the route is visible when it's calculated
      routingControl.on('routesfound', function(e) {
        console.log('Routes found:', e.routes);
        
        // Fit the map to show the entire route
        if (e.routes && e.routes.length > 0) {
          // Delay the fitting slightly to ensure proper rendering
          setTimeout(() => {
            try {
              map.fitBounds(L.latLngBounds(e.routes[0].coordinates));
            } catch (error) {
              console.error("Error fitting to route bounds:", error);
            }
          }, 500);
          
          // Make sure the directions container is properly styled
          try {
            const containers = document.querySelectorAll('.leaflet-routing-container');
            containers.forEach(container => {
              if (container) {
                container.classList.add('active');
                container.style.width = '300px';
                container.style.maxHeight = '300px';
              }
            });
          } catch (err) {
            console.error("Error styling containers:", err);
          }
        }
      });
      
      // Explicitly handle route calculation errors
      routingControl.on('routingerror', function(e) {
        console.error('Routing error:', e);
        // Don't show error UI
      });
      
    } catch (error) {
      console.error("Error initializing routing:", error);
    }
    
    // Clean up on unmount - with improved error handling
    return () => {
      try {
        if (map && routingControl) {
          // First clear waypoints to avoid the removeLayer error
          try {
            routingControl.getPlan().setWaypoints([]);
          } catch (e) {
            console.log("Error clearing waypoints", e);
          }
          
          // Force clear any routes
          try {
            if (routingControl._router && routingControl._routes) {
              routingControl._routes = [];
            }
            
            // Try removing the control from the map
            map.removeControl(routingControl);
          } catch (e) {
            console.log("Error removing control", e);
            
            // Fallback cleanup - manually remove DOM elements if control removal fails
            try {
              const containers = document.querySelectorAll('.leaflet-routing-container');
              containers.forEach(container => {
                if (container && container.parentNode) {
                  container.parentNode.removeChild(container);
                }
              });
            } catch (err) {
              console.log("Error removing containers", err);
            }
          }
        }
      } catch (error) {
        console.error("Final error in cleanup:", error);
      }
    };
  }, [map, responderLocation, emergencyLocation]);
  
  return null;
}

function EmergencyTracker() {
  const { emergencyId } = useParams();
  const [location, setLocation] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [responderLocation, setResponderLocation] = useState(null);
  const [showDirections, setShowDirections] = useState(false);

  // Default center (will be updated with actual location)
  const [center, setCenter] = useState([40.7128, -74.0060]); // Default to NYC

  // Fetch emergency location data
  useEffect(() => {
    const fetchEmergencyData = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`http://localhost:3001/emergency/${emergencyId}/location`);
        
        setLocation(response.data.location);
        setLastUpdated(response.data.lastUpdated);
        setUserData(response.data.userData || null);
        
        // Update map center if we have a location
        if (response.data.location) {
          setCenter([response.data.location.lat, response.data.location.lng]);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching emergency data:', err);
        setError('Failed to load emergency tracking data');
        setLoading(false);
      }
    };

    // Set up Socket.IO for real-time updates
    const socket = io('http://localhost:3001');
    
    const handleLocationUpdate = (data) => {
      if (data.emergencyId === emergencyId) {
        setLocation(data.location);
        setLastUpdated(data.timestamp);
        
        // Update map center
        setCenter([data.location.lat, data.location.lng]);
      }
    };
    
    // Join emergency room and listen for updates
    socket.emit('join-emergency', emergencyId);
    socket.on('location-updated', handleLocationUpdate);
    socket.on('emergency-cancelled', () => {
      setError('This emergency has been cancelled.');
    });

    fetchEmergencyData();
    
    // Fetch recordings
    const fetchRecordings = async () => {
      try {
        const response = await axios.get(`http://localhost:3001/emergency/${emergencyId}/recordings`);
        setRecordings(response.data);
      } catch (error) {
        console.error('Error fetching recordings:', error);
      }
    };
    
    fetchRecordings();
    
    // Listen for new recordings
    socket.on('new-recording', () => {
      fetchRecordings();
    });

    return () => {
      socket.off('location-updated', handleLocationUpdate);
      socket.off('new-recording');
      socket.disconnect();
    };
  }, [emergencyId]);

  // Get the responder's (emergency contact's) current location 
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setResponderLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);
  
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };
  
  return (
    <div className="emergency-tracker-container">
      <div className="tracker-header">
        <h1>Emergency Tracker</h1>
        <div className="emergency-id">ID: {emergencyId}</div>
      </div>

      {loading ? (
        <div className="loading">Loading emergency data...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <div className="tracker-content">
          {userData && (
            <div className="user-details">
              <h2>{userData.name}'s Emergency</h2>
              <p>Contact: {userData.phone}</p>
            </div>
          )}

          <div className="tracker-map-container">
            <h3>Current Location</h3>
            <p className="last-updated">
              Last updated: {formatTimestamp(lastUpdated)}
            </p>
            
            {/* OpenStreetMap with Leaflet */}
            <div style={{ height: "400px", borderRadius: "12px", overflow: "hidden" }}>
              <MapContainer 
                center={center}
                zoom={15} 
                style={{ height: "100%", width: "100%" }}
              >
                <MapCenterUpdater center={center} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {location && (
                  <Marker position={[location.lat, location.lng]}>
                    <Popup>
                      {userData ? userData.name : "Emergency Location"}<br />
                      Last updated: {formatTimestamp(lastUpdated)}
                    </Popup>
                  </Marker>
                )}
                {responderLocation && (
                  <Marker 
                    position={[responderLocation.lat, responderLocation.lng]}
                    icon={L.divIcon({
                      className: 'responder-marker',
                      html: '👤',
                      iconSize: [25, 25],
                      iconAnchor: [12, 12]
                    })}
                  >
                    <Popup>You are here</Popup>
                  </Marker>
                )}
                
                {/* Use a key to force proper remounting when directions are toggled */}
                {showDirections && responderLocation && location && (
                  <React.Suspense fallback={null} key={`route-${showDirections}`}>
                    <RoutingMachine 
                      responderLocation={responderLocation} 
                      emergencyLocation={location} 
                    />
                  </React.Suspense>
                )}
              </MapContainer>
            </div>
            
            {location && (
              <div className="coordinates">
                <p>Latitude: {location.lat.toFixed(6)}</p>
                <p>Longitude: {location.lng.toFixed(6)}</p>
                <a
                  href={responderLocation ? 
                    `https://www.google.com/maps/dir/${responderLocation.lat},${responderLocation.lng}/${location.lat},${location.lng}` :
                    `https://www.google.com/maps/dir//${location.lat},${location.lng}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="directions-button"
                  onClick={(e) => {
                    // If we don't have responder location yet, try to get it
                    if (!responderLocation && navigator.geolocation) {
                      e.preventDefault();
                      navigator.geolocation.getCurrentPosition(
                        (position) => {
                          const newLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                          };
                          setResponderLocation(newLocation);
                          // Open Google Maps directions in new tab
                          window.open(
                            `https://www.google.com/maps/dir/${newLocation.lat},${newLocation.lng}/${location.lat},${location.lng}`,
                            '_blank'
                          );
                        },
                        (error) => {
                          console.error("Error getting location:", error);
                          // Fall back to just the destination
                          window.open(
                            `https://www.google.com/maps/dir//${location.lat},${location.lng}`,
                            '_blank'
                          );
                        }
                      );
                    }
                  }}
                >
                  Get Directions
                </a>
              </div>
            )}
          </div>

          {recordings.length > 0 && (
            <div className="emergency-recordings">
              <h3>Audio Recordings</h3>
              <div className="recordings-list">
                {recordings.map(recording => (
                  <div key={recording._id} className="recording-item">
                    <div className="recording-info">
                      <span className="recording-date">
                        {formatTimestamp(recording.createdAt)}
                      </span>
                    </div>
                    <audio 
                      controls 
                      src={`http://localhost:3001/recordings/${recording._id}`}
                      className="recording-audio"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="map-controls">
  <button 
    className={`map-control-button ${showDirections ? 'active' : ''}`}
    onClick={() => {
      if (!responderLocation && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setResponderLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
            setShowDirections(true);
          },
          (error) => {
            console.error("Error getting location:", error);
            alert("Couldn't access your location. Please allow location access to see directions.");
          }
        );
      } else {
        setShowDirections(!showDirections);
      }
    }}
  >
    {showDirections ? 'Hide Directions' : 'Show Directions on Map'}
  </button>
</div>
    </div>
  );
}

export default EmergencyTracker;