'use client';
import { lazy, Suspense, useEffect, useState } from 'react';
import { PublicOrder } from '@/features/swag/public-order';
const AdminWorkspace = lazy(() => import('@/features/swag/admin-workspace'));
export default function Home() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('admin') === '1')
      void Promise.resolve().then(() => setAdmin(true));
  }, []);
  function exitAdmin() {
    window.history.replaceState({}, '', window.location.pathname);
    setAdmin(false);
  }
  return admin ? (
    <Suspense
      fallback={
        <output className="empty-state">
          Loading administrator workspace…
        </output>
      }
    >
      <AdminWorkspace onExit={exitAdmin} />
    </Suspense>
  ) : (
    <PublicOrder onAdmin={() => setAdmin(true)} />
  );
}
