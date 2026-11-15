import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronUp } from 'lucide-react';
import PartnerAuthModal from './PartnerAuthModal';

export default function SiteFooter() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [authRole, setAuthRole] = useState('volunteer');
  const [authView, setAuthView] = useState('login');
  const [openCol, setOpenCol] = useState(null);

  if (
    location.pathname.startsWith('/lobby-display') ||
    location.pathname.startsWith('/reception-display') ||
    location.pathname.startsWith('/prescription/')
  ) {
    return null;
  }

  const openPartnerAuth = (role, view) => {
    setAuthRole(role);
    setAuthView(view);
    setAuthOpen(true);
  };

  const toggleCol = (id) => {
    setOpenCol((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <footer className="site-footer site-footer-interactive">
        <div className="container site-footer-inner">
          <div className="site-footer-col brand-col">
            <Link to="/" className="site-footer-brand">
              <span className="footer-cross">+</span>
              <span>Sushrutha Grid</span>
            </Link>
            <p>A calmer path through government hospital OPD — for patients, doctors, and staff.</p>
          </div>

          <div className={`site-footer-col footer-col-fold ${openCol === 'ngo' ? 'open' : ''}`}>
            <button type="button" className="footer-col-toggle" onClick={() => toggleCol('ngo')} aria-expanded={openCol === 'ngo'}>
              <h4>NGO organizations</h4>
              <ChevronUp size={14} className="footer-fold-chevron" />
            </button>
            <div className="footer-col-body">
              <button type="button" className="footer-link-btn" onClick={() => openPartnerAuth('volunteer', 'login')}>NGO sign in</button>
              <button type="button" className="footer-link-btn" onClick={() => openPartnerAuth('volunteer', 'register')}>Register NGO</button>
            </div>
          </div>

          <div className={`site-footer-col footer-col-fold ${openCol === 'csr' ? 'open' : ''}`}>
            <button type="button" className="footer-col-toggle" onClick={() => toggleCol('csr')} aria-expanded={openCol === 'csr'}>
              <h4>CSR companies</h4>
              <ChevronUp size={14} className="footer-fold-chevron" />
            </button>
            <div className="footer-col-body">
              <button type="button" className="footer-link-btn" onClick={() => openPartnerAuth('csr', 'login')}>Sign in</button>
              <button type="button" className="footer-link-btn" onClick={() => openPartnerAuth('csr', 'register')}>Register</button>
            </div>
          </div>

          <div className={`site-footer-col footer-col-fold ${openCol === 'help' ? 'open' : ''}`}>
            <button type="button" className="footer-col-toggle" onClick={() => toggleCol('help')} aria-expanded={openCol === 'help'}>
              <h4>Help</h4>
              <ChevronUp size={14} className="footer-fold-chevron" />
            </button>
            <div className="footer-col-body">
              <a href="tel:108">Emergency 108</a>
              <a href="tel:104">Blood bank 104</a>
              <Link to="/how-to-use">How to use it</Link>
              <Link to="/knowledge-base">Knowledge base</Link>
            </div>
          </div>
        </div>
        <div className="site-footer-bottom">
          <div className="container">
            © {new Date().getFullYear()} Sushrutha Grid · Built for government hospital care
          </div>
        </div>
      </footer>

      <PartnerAuthModal
        isOpen={authOpen}
        initialRole={authRole}
        initialView={authView}
        onClose={() => setAuthOpen(false)}
        onSuccess={(role) => {
          if (role === 'csr') navigate('/csr', { replace: true });
          else navigate('/volunteer', { replace: true });
        }}
      />
    </>
  );
}
