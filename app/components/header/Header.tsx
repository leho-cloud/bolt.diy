import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';

export function Header() {
  const chat = useStore(chatStore);

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
          aria-label="Projektek megnyitása"
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
      <a href="/fiokom" className="ml-auto px-3 text-xs text-bolt-elements-textSecondary">
        Belépésem
      </a>
      {!chat.started && (
        <nav className="muhely-header-nav" aria-label="Fő navigáció">
          <a href="#sajat-projektek">Projektjeim</a>
          <a href="#kesz-alapok">Kész alapok</a>
          <ClientOnly>{() => <ThemeSwitch />}</ClientOnly>
        </nav>
      )}
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
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
    </header>
  );
}
