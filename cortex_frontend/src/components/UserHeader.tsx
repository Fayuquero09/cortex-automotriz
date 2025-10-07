"use client";
import React from 'react';
import { useAppState } from '@/lib/state';

export default function UserHeader() {
  const { userInfo, logout } = useAppState();

  if (!userInfo) {
    return null;
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'oem':
        return 'OEM';
      case 'operation-group':
        return 'Grupo de Operación';
      case 'self-service':
        return 'Self-Service';
      default:
        return role;
    }
  };

  return (
    <div className="user-header">
      <div className="user-info">
        <div className="user-details">
          <span className="user-email">{userInfo.email}</span>
          <span className="user-role">{getRoleDisplayName(userInfo.role)}</span>
        </div>
        <button 
          className="logout-button"
          onClick={logout}
          title="Cerrar sesión"
        >
          🚪 Cerrar Sesión
        </button>
      </div>
      
      <style jsx>{`
        .user-header {
          background: rgba(0, 0, 0, 0.1);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.75rem 1rem;
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }
        
        .user-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .user-details {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }
        
        .user-email {
          font-size: 0.9rem;
          color: #666;
          font-weight: 500;
        }
        
        .user-role {
          font-size: 0.8rem;
          color: #888;
          background: rgba(0, 0, 0, 0.1);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }
        
        .logout-button {
          background: #ef4444;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .logout-button:hover {
          background: #dc2626;
          transform: translateY(-1px);
        }
        
        .logout-button:active {
          transform: translateY(0);
        }
        
        @media (max-width: 768px) {
          .user-header {
            padding: 0.5rem;
          }
          
          .user-info {
            gap: 0.75rem;
          }
          
          .user-details {
            align-items: flex-start;
          }
          
          .user-email {
            font-size: 0.8rem;
          }
          
          .user-role {
            font-size: 0.75rem;
          }
          
          .logout-button {
            padding: 0.4rem 0.8rem;
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  );
}
