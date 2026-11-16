import { useEffect, useState } from 'react';
import { uiLanguage, uiText } from '~/lib/common/localization/ui';

export function CreditBalance() {
  const [units, setUnits] = useState<number>();

  useEffect(() => {
    let controller = new AbortController();

    function update() {
      if (document.hidden) return;
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void fetch('/api/credits', { signal })
        .then(async (response) => {
          if (!response.ok) return;
          const { balance } = (await response.json()) as { balance?: unknown };

          if (!signal.aborted && typeof balance === 'number' && Number.isSafeInteger(balance) && balance >= 0) {
            setUnits(balance);
          }
        })
        .catch(() => {});
    }

    update();
    const interval = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('muhely-credits-changed', update);

    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('muhely-credits-changed', update);
    };
  }, []);

  const label = uiText('Kreditegyenleg', 'Credit balance');
  const amount = units === undefined ? '…' : new Intl.NumberFormat(uiLanguage(), { maximumFractionDigits: 3 }).format(units / 1000);
  return (
    <a
      href="/fiokom#kreditek"
      aria-label={`${label} · ${amount}`}
      title={label}
      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 text-xs tabular-nums text-bolt-elements-textPrimary"
    >
      <span className="i-ph:lightning text-accent" aria-hidden="true" />
      {amount}
      <span className="hidden sm:inline">{uiText('kredit', 'credits')}</span>
    </a>
  );
}
