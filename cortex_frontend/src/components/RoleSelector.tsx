"use client";
import React, { useState } from 'react';
import { UserRole, UserInfo } from '@/lib/state';

interface RoleSelectorProps {
  onRoleSelect: (userInfo: UserInfo) => void;
}

export default function RoleSelector({ onRoleSelect }: RoleSelectorProps) {
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const roles = [
    {
      id: 'oem' as UserRole,
      title: 'OEM',
      description: 'Operación OEM - Gestión de fabricantes',
      icon: '🏭',
      href: '/panel/oem'
    },
    {
      id: 'operation-group' as UserRole,
      title: 'Grupo de Operación',
      description: 'Gestión de grupos de concesionarios',
      icon: '🏢',
      href: '/panel/dealer'
    },
    {
      id: 'self-service' as UserRole,
      title: 'Self-Service',
      description: 'Acceso directo para usuarios finales',
      icon: '🛠️',
      href: '/panel/self-service'
    }
  ];

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Por favor ingresa tu email');
      return;
    }

    if (!validateEmail(email)) {
      setError('Por favor ingresa un email válido');
      return;
    }

    if (!selectedRole) {
      setError('Por favor selecciona un tipo de acceso');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Simulate API call - in real app, this would call your backend
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const userInfo: UserInfo = {
        email: email.trim(),
        role: selectedRole,
        name: email.split('@')[0] // Use email prefix as name
      };

      onRoleSelect(userInfo);
    } catch (error) {
      setError('Error al registrar usuario. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="role-selector">
      <div className="role-selector-header">
        <h1>Bienvenido a Cortex Automotriz</h1>
        <p>Regístrate con tu email y selecciona tu tipo de acceso</p>
      </div>
      
      <form onSubmit={handleSubmit} className="registration-form">
        <div className="email-input-group">
          <label htmlFor="email" className="email-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="email-input"
            disabled={isSubmitting}
          />
        </div>

        <div className="role-selection">
          <h3 className="role-selection-title">Tipo de Acceso</h3>
          <div className="role-grid">
            {roles.map((role) => (
              <div 
                key={role.id}
                className={`role-card ${selectedRole === role.id ? 'selected' : ''}`}
                onClick={() => handleRoleSelect(role.id)}
              >
                <div className="role-icon">{role.icon}</div>
                <h3 className="role-title">{role.title}</h3>
                <p className="role-description">{role.description}</p>
                <div className="role-arrow">→</div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <button 
          type="submit" 
          className="submit-button"
          disabled={isSubmitting || !email.trim() || !selectedRole}
        >
          {isSubmitting ? 'Registrando...' : 'Continuar'}
        </button>
      </form>
      
      <style jsx>{`
        .role-selector {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        
        .role-selector-header {
          text-align: center;
          margin-bottom: 3rem;
        }
        
        .role-selector-header h1 {
          font-size: 2.5rem;
          margin-bottom: 1rem;
          font-weight: 700;
        }
        
        .role-selector-header p {
          font-size: 1.2rem;
          opacity: 0.9;
        }
        
        .registration-form {
          width: 100%;
          max-width: 800px;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        
        .email-input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .email-label {
          font-size: 1rem;
          font-weight: 600;
          color: white;
        }
        
        .email-input {
          padding: 1rem;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 1rem;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }
        
        .email-input::placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        
        .email-input:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.6);
          background: rgba(255, 255, 255, 0.2);
        }
        
        .email-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .role-selection {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .role-selection-title {
          font-size: 1.3rem;
          font-weight: 600;
          color: white;
          text-align: center;
          margin: 0;
        }
        
        .role-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }
        
        .role-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          padding: 2rem;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        
        .role-card:hover {
          transform: translateY(-5px);
          background: rgba(255, 255, 255, 0.2);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }
        
        .role-card:active {
          transform: translateY(-2px);
        }
        
        .role-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          text-align: center;
        }
        
        .role-title {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          text-align: center;
        }
        
        .role-description {
          font-size: 1rem;
          opacity: 0.9;
          text-align: center;
          margin-bottom: 1rem;
          line-height: 1.5;
        }
        
        .role-arrow {
          position: absolute;
          top: 1rem;
          right: 1rem;
          font-size: 1.5rem;
          opacity: 0.7;
          transition: all 0.3s ease;
        }
        
        .role-card:hover .role-arrow {
          opacity: 1;
          transform: translateX(5px);
        }
        
        .role-card.selected {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
          transform: translateY(-2px);
        }
        
        .role-card.selected .role-arrow {
          opacity: 1;
          transform: translateX(5px);
        }
        
        .error-message {
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #fecaca;
          padding: 1rem;
          border-radius: 8px;
          text-align: center;
          font-weight: 500;
        }
        
        .submit-button {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          align-self: center;
          min-width: 200px;
        }
        
        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(79, 70, 229, 0.3);
        }
        
        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        
        @media (max-width: 768px) {
          .role-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
          
          .role-selector-header h1 {
            font-size: 2rem;
          }
          
          .role-card {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
