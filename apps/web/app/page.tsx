"use client";

import AccessScreen from "@/components/AccessScreen";
import SystemStatus from "@/components/SystemStatus";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function Gate() {
  const { session } = useAuth();
  return session ? <SystemStatus /> : <AccessScreen />;
}

export default function Home() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
