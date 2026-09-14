import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { takePushDiagnostics } from '$features/settings/notifications/UnifiedPushNotifications';
import { isMobileTauri } from '$utils/platform';

const report = async (): Promise<void> => {
  const diagnostics = await takePushDiagnostics();
  if (!diagnostics) return;

  const entries = Object.entries(diagnostics.counts);
  if (entries.length === 0) return;

  entries.forEach(([outcome, occurrences]) => {
    Sentry.metrics.count('sable.push.cold_outcome', occurrences, { attributes: { outcome } });
    Sentry.logger.info('Native push diagnostic', {
      outcome,
      occurrences,
      lastOutcome: diagnostics.lastOutcome ?? '',
      lastAt: diagnostics.lastAt,
    });
  });

  Sentry.addBreadcrumb({
    category: 'notification',
    message: 'Cold push outcomes since last report',
    level: 'info',
    data: { ...diagnostics.counts, lastOutcome: diagnostics.lastOutcome },
  });
};

export const usePushDiagnosticsReport = (): void => {
  useEffect(() => {
    if (!isMobileTauri()) return undefined;

    const drain = () => {
      if (document.visibilityState === 'hidden') return;
      void report();
    };

    const interval = window.setInterval(drain, 30_000);
    document.addEventListener('visibilitychange', drain);
    drain();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', drain);
    };
  }, []);
};
