import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function ProfileSettings({ user, onUserUpdate }) {
  const [formData, setFormData] = useState({
    name: user.name || '',
    phone: user.phone || '',
    emergencyContacts: user.emergencyContacts || []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({ ...prevData, [name]: value }));
  };
  
  const handleContactChange = (index, field, value) => {
    const updatedContacts = [...formData.emergencyContacts];
    updatedContacts[index][field] = value;
    setFormData(prevData => ({ ...prevData, emergencyContacts: updatedContacts }));
  };
  
  const addContact = () => {
    setFormData(prevData => ({
      ...prevData,
      emergencyContacts: [...prevData.emergencyContacts, { name: '', phone: '' }]
    }));
  };
  
  const removeContact = (index) => {
    const updatedContacts = [...formData.emergencyContacts];
    updatedContacts.splice(index, 1);
    setFormData(prevData => ({ ...prevData, emergencyContacts: updatedContacts }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    
    try {
      const response = await axios.put(
        `http://localhost:3001/users/${user._id}`, 
        formData
      );
      
      onUserUpdate(response.data);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to update profile' 
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const goBackToDashboard = () => {
    navigate('/dashboard');
  };
  
  return (
    <div className="profile-settings">
      <h2>Profile Settings</h2>
      
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Full Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="phone">Phone Number</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
          />
        </div>
        
        <h3>Emergency Contacts</h3>
        {formData.emergencyContacts.map((contact, index) => (
          <div key={index} className="emergency-contact">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={contact.name}
                onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                value={contact.phone}
                onChange={(e) => handleContactChange(index, 'phone', e.target.value)}
                required
              />
            </div>
            
            <button 
              type="button" 
              className="btn-remove"
              onClick={() => removeContact(index)}
            >
              Remove
            </button>
          </div>
        ))}
        
        <button 
          type="button"
          className="btn-secondary"
          onClick={addContact}
        >
          Add Contact
        </button>
        
        <div className="buttons-row">
          <button 
            type="button" 
            className="btn-back" 
            onClick={goBackToDashboard}
          >
            ← Back to Dashboard
          </button>
          
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ProfileSettings;