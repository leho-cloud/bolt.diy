import React from 'react';

const EXAMPLE_PROMPTS = [
  {
    text: 'Bemutatkozó oldal',
    prompt:
      'Készíts modern, magyar nyelvű bemutatkozó weboldalt egy szolgáltató vállalkozásnak, valódi fotókkal, szolgáltatásokkal és kapcsolat oldallal.',
    icon: 'i-ph:storefront',
  },
  {
    text: 'Portfólió',
    prompt:
      'Készíts letisztult, magyar nyelvű kreatív portfóliót, képes munkákkal, bemutatkozással és kapcsolat oldallal.',
    icon: 'i-ph:images',
  },
  {
    text: 'Időpontfoglalás',
    prompt:
      'Készíts modern, magyar nyelvű időpontfoglaló felületet. A szolgáltatások kiválasztása után lehessen napot és időpontot választani. Ne találj ki valódi üzleti adatokat.',
    icon: 'i-ph:calendar-dots',
  },
  {
    text: 'Saját alkalmazás',
    prompt:
      'Segíts megtervezni és elkészíteni egy saját webes alkalmazást. Először kérdezd meg, mire szeretném használni.',
    icon: 'i-ph:squares-four',
  },
];

/**
 * Renders a collection of example prompt buttons that users can click to quickly start a conversation.
 *
 * @param sendMessage - Optional callback function to send a message when a prompt is clicked
 * @returns React component displaying example prompt buttons
 */
export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div id="examples" className="muhely-examples">
      <div
        className="muhely-example-list"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.prompt);
              }}
              className="border border-bolt-elements-borderColor rounded-full bg-gray-50 hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-purple-500/15 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-3 py-1 text-xs transition-theme"
            >
              <span className={examplePrompt.icon} aria-hidden="true" /> {examplePrompt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
