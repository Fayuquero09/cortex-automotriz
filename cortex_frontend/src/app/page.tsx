"use client";
import { useAppState, UserInfo } from '@/lib/state';
import RoleSelector from '@/components/RoleSelector';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const { userInfo, setUserInfo } = useAppState();
  const router = useRouter();

  const handleRoleSelect = (userInfo: UserInfo) => {
    setUserInfo(userInfo);
    
    // Navigate to the appropriate panel based on role
    switch (userInfo.role) {
      case 'oem':
        router.push('/panel/oem');
        break;
      case 'operation-group':
        router.push('/panel/dealer');
        break;
      case 'self-service':
        router.push('/panel/self-service');
        break;
    }
  };

  // If user already has a role selected, redirect to their panel
  useEffect(() => {
    if (userInfo) {
      switch (userInfo.role) {
        case 'oem':
          router.push('/panel/oem');
          break;
        case 'operation-group':
          router.push('/panel/dealer');
          break;
        case 'self-service':
          router.push('/panel/self-service');
          break;
      }
    }
  }, [userInfo, router]);

  // Show role selector if no user info is available
  if (!userInfo) {
    return <RoleSelector onRoleSelect={handleRoleSelect} />;
  }

  // This should not render as we redirect above, but just in case
  return null;
}
