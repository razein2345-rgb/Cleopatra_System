import { useEffect, useState } from 'react';
import type { ApiResponse, HealthCheck } from '@cleopatra/shared';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function DashboardPage() {
  const { authContext } = useAuth();
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = () => {
    fetch(`${apiUrl}/health`)
      .then((res) => res.json() as Promise<ApiResponse<HealthCheck>>)
      .then((body) => {
        if (body.success) setHealth(body.data);
        else setError(body.error.message);
      })
      .catch(() => setError('Could not reach the API.'));
  };

  useEffect(fetchHealth, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Welcome, {authContext?.user.name}</h1>
      <p className="text-muted-foreground">
        Roles: {authContext?.user.roles.map((role) => role.label).join(', ') || '—'}
      </p>

      <div className="border-border bg-card flex items-center gap-3 rounded-2xl border p-4 text-sm">
        {health && <span className="text-green-600">API status: {health.status}</span>}
        {error && <span className="text-destructive">{error}</span>}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setError(null);
            fetchHealth();
          }}
        >
          Recheck API health
        </Button>
      </div>

      <div className="border-border bg-card text-muted-foreground rounded-2xl border p-5 text-sm">
        This is a placeholder dashboard. Business modules (orders, treasury, reports, …) arrive in
        their own migration phases — see MIGRATION_PLAN.md.
      </div>
    </div>
  );
}
