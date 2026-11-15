import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export function LovableHandoffItem({ draft }: { draft: string }) {
  const prompt = draft.trim();
  const canOpen = prompt.length > 0 && prompt.length <= 50_000;

  const hint = !prompt
    ? 'Előbb írd be a feladatot.'
    : canOpen
      ? 'A beírt szöveg új lapon nyílik meg. Az építést ott indíthatod.'
      : 'A Lovable legfeljebb 50 000 karaktert fogad ezen a módon.';

  const label = (
    <>
      <span className="i-ph:arrow-square-out shrink-0 text-lg" aria-hidden="true" />
      <span className="flex flex-col">
        <span>Megnyitás a Lovable-ban</span>
        <span className="text-xs text-bolt-elements-textSecondary">{hint}</span>
      </span>
    </>
  );
  const href = canOpen
    ? 'https://lovable.dev/#' + new URLSearchParams({ prompt }).toString().replaceAll('+', '%20')
    : undefined;

  return (
    <DropdownMenu.Item
      asChild={canOpen}
      disabled={!canOpen}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none data-[highlighted]:bg-bolt-elements-item-backgroundActive data-[disabled]:opacity-65"
    >
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        label
      )}
    </DropdownMenu.Item>
  );
}
