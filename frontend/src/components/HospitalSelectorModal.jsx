import React, { useState, useEffect } from 'react';
import { 
  Building2, MapPin, Navigation, Phone, 
  Check, X, Search, Clock, ExternalLink, ShieldCheck
} from 'lucide-react';
import api from '../services/api';

/**
 * ============================================================================
 * GOOGLE MAPS GOVERNMENT HOSPITALS DISCOVERY & CONSULTATION SELECTOR
 * ============================================================================
 * - Uses Google Maps search query: "government hospitals near me" around user's GPS
 * - Displays all nearby civil hospitals directly in Google Maps (Jayanagar, Banashankari, etc.)
 * - Lets patient select their active Sushrutha Digital Grid Consultation Facility
 */
export default function HospitalSelectorModal({ 
  isOpen, 
  onClose, 
  selectedHospital, 
  onSelectHospital,
  initialUserLocation = null
}) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(initialUserLocation);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialUserLocation) {
        setUserLocation(initialUserLocation);
        fetchCoreHospitals(initialUserLocation.lat, initialUserLocation.lon);
      } else {
        handleDetectLocation();
      }
    }
  }, [isOpen, initialUserLocation]);

  const fetchCoreHospitals = async (lat = null, lon = null) => {
    setLoading(true);
    try {
      let endpoint = '/hospitals';
      if (lat !== null && lon !== null) {
        endpoint = `/hospitals/nearby?lat=${lat}&lon=${lon}&radius_km=25.0`;
      }
      const res = await api.get(endpoint);
      // Filter to core pilot hospitals for digital consultation
      const pilotOnly = res.data.filter(h => h.is_grid_pilot);
      setHospitals(pilotOnly.length > 0 ? pilotOnly : res.data.slice(0, 5));
    } catch (err) {
      console.error('Failed to load consultation hospitals:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      fetchCoreHospitals(12.9353, 77.5357);
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lon: longitude });
        setGeoLoading(false);
        fetchCoreHospitals(latitude, longitude);
      },
      (err) => {
        setGeoLoading(false);
        console.warn('GPS location fallback:', err.message);
        fetchCoreHospitals(12.9353, 77.5357);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  if (!isOpen) return null;

  const filteredHospitals = hospitals.filter((h) => {
    return (
      h.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (h.locality && h.locality.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const centerLat = userLocation?.lat || 12.9353;
  const centerLon = userLocation?.lon || 77.5357;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '860px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 style={{ color: '#0284c7' }} size={22} />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                Government Hospitals Near You (Google Maps)
              </h2>
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                Query: "government hospitals near me" around your live GPS coordinates
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#f1f5f9',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: '#64748b'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Google Maps Results View (Prompt: government hospitals near me) */}
        <div style={{ position: 'relative', width: '100%', height: '240px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          <iframe
            title="Google Maps Nearby Government Hospitals"
            width="100%"
            height="100%"
            frameBorder="0"
            style={{ border: 0 }}
            src={`https://maps.google.com/maps?q=government+hospitals+near+me&ll=${centerLat},${centerLon}&z=13&output=embed`}
            allowFullScreen
          />
          <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '12px',
            display: 'flex',
            gap: '8px'
          }}>
            <a
              href={`https://www.google.com/maps/search/government+hospitals+near+me/@${centerLat},${centerLon},13z`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                textDecoration: 'none',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}
            >
              <ExternalLink size={12} />
              Open Full Results in Google Maps App
            </a>
          </div>
        </div>

        {/* Control & Selection Bar */}
        <div style={{ padding: '10px 20px', background: '#ffffff', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleDetectLocation}
              disabled={geoLoading}
              style={{
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: geoLoading ? 'wait' : 'pointer'
              }}
            >
              <Navigation size={13} />
              {geoLoading ? 'Detecting...' : 'Refresh Location'}
            </button>

            {userLocation ? (
              <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 700 }}>
                ✓ GPS: ({userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)})
              </span>
            ) : null}
          </div>

          <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
            Choose Digital OPD Consultation Facility:
          </span>
        </div>

        {/* Core Consultation Facilities */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '0.88rem' }}>
              Loading consultation facilities...
            </div>
          ) : (
            filteredHospitals.map((h) => {
              const isSelected = selectedHospital?.hospital_id === h.hospital_id;

              return (
                <div
                  key={h.hospital_id}
                  style={{
                    border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                        {h.name}
                      </h3>
                      {isSelected && (
                        <span style={{ 
                          backgroundColor: '#0284c7', 
                          color: '#ffffff', 
                          fontSize: '0.64rem', 
                          fontWeight: 800, 
                          padding: '2px 6px', 
                          borderRadius: '4px' 
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                      📍 {h.locality}, {h.city} • ⭐ {h.rating || 4.2} ({h.total_reviews || 300}+ reviews)
                      {h.distance_label ? ` • ${h.distance_label}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <a
                      href={userLocation
                        ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lon}&destination=${h.latitude},${h.longitude}`
                        : `https://www.google.com/maps/dir/?api=1&destination=${h.latitude},${h.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        backgroundColor: '#f8fafc',
                        color: '#0369a1',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                        border: '1px solid #cbd5e1'
                      }}
                    >
                      <Navigation size={12} />
                      Directions
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectHospital(h);
                        onClose();
                      }}
                      style={{
                        backgroundColor: isSelected ? '#10b981' : '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 14px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      {isSelected ? (
                        <>
                          <Check size={13} /> Selected
                        </>
                      ) : (
                        'Select Hospital'
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
