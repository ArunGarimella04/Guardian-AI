import axios from 'axios';
import React, { useEffect, useState } from 'react';
import '../styles/NearbySafePlaces.css';

const NearbySafePlaces = () => {
  const [places, setPlaces] = useState({
    protection: [],
    medical: [],
    shelter: [],
    transit: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          fetchPlaces(latitude, longitude);
        },
        (error) => {
          console.error('Error getting location:', error);
          setError('Please enable location services.');
          setLoading(false);
        }
      );
    } else {
      setError('Geolocation not supported');
      setLoading(false);
    }
  }, []);

  const fetchPlaces = async (lat, lng) => {
    try {
      const response = await axios.get(`http://localhost:3001/safe-places`, {
        params: {
          lat,
          lng,
          radius: 5000
        }
      });

      const categorizedPlaces = {
        protection: [],
        medical: [],
        shelter: [],
        transit: []
      };

      response.data.places.forEach(place => {
        if (categorizedPlaces[place.category]) {
          categorizedPlaces[place.category].push(place);
        }
      });

      // Sort all categories by distance
      Object.keys(categorizedPlaces).forEach(category => {
        categorizedPlaces[category].sort((a, b) => {
          const distA = parseFloat(a.distance);
          const distB = parseFloat(b.distance);
          return distA - distB;
        });
      });

      setPlaces(categorizedPlaces);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching places:', error);
      setError('Failed to fetch places');
      setLoading(false);
    }
  };

  const openDirections = (place) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}`;
    window.open(url, '_blank');
  };

  const getAllPlacesSorted = () => {
    const allPlaces = [
      ...places.protection,
      ...places.medical,
      ...places.shelter,
      ...places.transit
    ];
    return allPlaces.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
  };

  const getDisplayedPlaces = () => {
    switch (selectedCategory) {
      case 'all':
        return getAllPlacesSorted();
      case 'protection':
        return places.protection;
      case 'medical':
        return places.medical;
      case 'shelter':
        return places.shelter;
      case 'transit':
        return places.transit;
      default:
        return [];
    }
  };

  if (loading) return <div className="safe-places-loading">Loading nearby places...</div>;
  if (error) return <div className="safe-places-error">{error}</div>;

  return (
    <div className="safe-places-container">
      <h2 className="safe-places-title">Nearby Safe Places</h2>
      
      <div className="category-buttons">
        <button 
          className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          All Safe Places
        </button>
        <button 
          className={`category-btn ${selectedCategory === 'protection' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('protection')}
        >
          Police Stations
        </button>
        <button 
          className={`category-btn ${selectedCategory === 'medical' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('medical')}
        >
          Hospitals
        </button>
        <button 
          className={`category-btn ${selectedCategory === 'shelter' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('shelter')}
        >
          Safe Shelters
        </button>
        <button 
          className={`category-btn ${selectedCategory === 'transit' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('transit')}
        >
          Public Transport
        </button>
      </div>

      <div className="places-list">
        {getDisplayedPlaces().length === 0 ? (
          <p className="no-places">No places found in this category</p>
        ) : (
          getDisplayedPlaces().map(place => (
            <div key={place.id} className="place-card">
              <h4>{place.name}</h4>
              <p className="place-type">{place.type}</p>
              <p className="distance">{place.distance}</p>
              {place.phone !== 'N/A' && (
                <p className="phone">Phone: {place.phone}</p>
              )}
              <button onClick={() => openDirections(place)}>Get Directions</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NearbySafePlaces;