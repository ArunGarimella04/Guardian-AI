import React, { useState } from 'react';

function Register({ onRegister, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    emergencyContacts: [{ name: '', phone: '' }]
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg("Passwords don't match");
      return;
    }
    
    setIsLoading(true);
    setErrorMsg('');
    
    try {
      // Remove confirmPassword before sending to backend
      const { confirmPassword, ...dataToSubmit } = formData;
      await onRegister(dataToSubmit);
    } catch (error) {
      setErrorMsg(error.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card register-card">
        <h2>Guardian AI</h2>
        <h3>Create Your Account</h3>
        {errorMsg && <div className="error-message">{errorMsg}</div>}
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
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
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
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>
          
          <h4>Emergency Contacts</h4>
          {formData.emergencyContacts.map((contact, index) => (
            <div key={index} className="emergency-contact">
              <div className="form-group">
                <label>Contact Name</label>
                <input
                  type="text"
                  value={contact.name}
                  onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Contact Phone</label>
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => handleContactChange(index, 'phone', e.target.value)}
                  required
                />
              </div>
              {index > 0 && (
                <button 
                  type="button" 
                  className="btn-remove" 
                  onClick={() => removeContact(index)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={addContact}
          >
            Add Another Contact
          </button>
          
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isLoading}
          >
            {isLoading ? 'Registering...' : 'Register'}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <button onClick={onSwitchToLogin}>Login</button>
        </p>
      </div>
    </div>
  );
}

export default Register;