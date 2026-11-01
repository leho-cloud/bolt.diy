import { redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { welcomeDestination } from './private-welcome';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { FirstRunOnboarding } from '~/components/onboarding/FirstRunOnboarding';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [
    { title: 'TZSVTAV AI Builder' },
    { name: 'description', content: 'TZSVTAV AI Builder – magyar nyelvű AI alkalmazásfejlesztő' },
  ];
};

export const loader = ({ request }: LoaderFunctionArgs) => {
  const destination = welcomeDestination(request.url);

  /*
   * Keep the old address and saved browser projects unchanged. The private
   * custom address starts with a small welcome page, without booting a runtime.
   */
  if (destination) {
    return redirect(destination);
  }

  return Response.json({});
};

/**
 * Landing page component for Bolt
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      <FirstRunOnboarding />
    </div>
  );
}
