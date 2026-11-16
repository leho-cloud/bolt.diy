import { useLocation } from 'react-router';
import { languageSwitchUrl } from '~/lib/common/localization/language.mjs';
import { uiLanguage, uiText } from '~/lib/common/localization/ui';
import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { CreditBalance } from './CreditBalance';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';

export function Header() {
  const chat = useStore(chatStore);
  const { pathname, search, hash } = useLocation();

  return (
    <header
      className={classNames('muhely-header flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer">
        <button
          type="button"
          aria-label={uiText('Projektek megnyitása', 'Open projects')}
          className="muhely-header-icon"
          onClick={() => document.dispatchEvent(new Event('open-muhely-menu'))}
        >
          <span className="i-ph:sidebar-simple text-lg" />
        </button>
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* <span className="i-bolt:logo-text?mask w-[46px] inline-block" /> */}
          <span className="inline-flex items-center gap-2" aria-label="TZSVTAV AI Builder">
            <span className="muhely-brand-mark">T</span>
            <span className="muhely-brand-name">
              Műhely <small>by TZSVTAV</small>
            </span>
          </span>
        </a>
      </div>
      {!chat.started && (
        <nav className="muhely-header-nav max-[400px]:hidden" aria-label={uiText('Fő navigáció', 'Main navigation')}>
          <a href="#sajat-projektek">{uiText('Projektjeim', 'My projects')}</a>
          <a href="#kesz-alapok">{uiText('Kész alapok', 'Templates')}</a>
          <ClientOnly>{() => <ThemeSwitch />}</ClientOnly>
        </nav>
      )}
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="min-w-0 flex-1 truncate text-center text-bolt-elements-textPrimary sm:px-4">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
      <nav className="ml-auto flex shrink-0 items-center gap-1" aria-label={uiText('Fiók', 'Account')}>
        <CreditBalance />
        <a
          className="px-2 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          href={languageSwitchUrl(uiLanguage(), pathname + search + hash)}
          lang={uiText('en', 'hu')}
        >
          {uiText('English', 'Magyar')}
        </a>
        <a href="/fiokom" className="muhely-header-icon" aria-label={uiText('Fiókom', 'My account')} title={uiText('Fiókom', 'My account')}>
          <span className="i-ph:user-circle text-lg" aria-hidden="true" />
        </a>
        <a
          href="/kijelentkezes"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          title={uiText('Kijelentkezés', 'Sign out')}
        >
          <span className="i-ph:sign-out text-base" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{uiText('Kijelentkezés', 'Sign out')}</span>
        </a>
      </nav>
    </header>
  );
}
