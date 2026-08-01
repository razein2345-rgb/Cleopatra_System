import { useEffect, useState } from 'react';
import type { ApiResponse, HealthCheck } from '@cleopatra/shared';
import { Button } from '@/components/ui/button';
import { SettingsPage } from '@/pages/settings/SettingsPage';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function App() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const fetchHealth = () => {
    fetch(`${apiUrl}/health`)
      .then((res) => res.json() as Promise<ApiResponse<HealthCheck>>)
      .then((body) => {
        if (body.success) {
          setHealth(body.data);
        } else {
          setError(body.error.message);
        }
      })
      .catch(() => setError('Could not reach the API.'));
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleRecheck = () => {
    setError(null);
    fetchHealth();
  };

  return (
    <main className="flex min-h-svh flex-col items-center gap-6 p-8">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Cleopatra System</h1>
        <p className="text-muted-foreground">Printing ERP — project scaffold</p>
        <div className="text-sm">
          {health && <span className="text-green-600">API status: {health.status}</span>}
          {error && <span className="text-destructive">{error}</span>}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRecheck}>Recheck API health</Button>
          <Button variant="secondary" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? 'Hide Settings' : 'View Settings (Phase 1)'}
          </Button>
        </div>
      </div>
      {showSettings && (
        <div className="w-full max-w-3xl" dir="rtl">
          <SettingsPage />
        </div>
      )}
    </main>
  );
}

export default App;
