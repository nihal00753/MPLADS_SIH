'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (userStr && token) {
      try {
        const user = JSON.parse(userStr);
        const map: Record<string, string> = {
          MP: '/dashboard/mp',
          DISTRICT: '/dashboard/district',
          STATE: '/dashboard/state',
          MINISTRY: '/dashboard/ministry',
        };
        router.push(map[user.role] || '/dashboard/district');
        return;
      } catch (e) {
        // fallback
      }
    }
    router.push('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#219EBC] border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
