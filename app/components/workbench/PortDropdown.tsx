import { memo, useEffect, useRef } from 'react';
import type { PreviewInfo } from '~/lib/stores/previews';

interface PortDropdownProps {
  activePreviewIndex: number;
  setActivePreviewIndex: (index: number) => void;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (value: boolean) => void;
  previews: PreviewInfo[];
}

export const PortDropdown = memo(
  ({ activePreviewIndex, setActivePreviewIndex, isDropdownOpen, setIsDropdownOpen, previews }: PortDropdownProps) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

    // sort previews, preserving original index
    const sortedPreviews = previews
      .map((previewInfo, index) => ({ ...previewInfo, index }))
      .sort((a, b) => a.port - b.port);

    // close dropdown if user clicks outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsDropdownOpen(false);
        }
      };

      if (isDropdownOpen) {
        window.addEventListener('mousedown', handleClickOutside);
      } else {
        window.removeEventListener('mousedown', handleClickOutside);
      }

      return () => {
        window.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isDropdownOpen]);

    return (
      <div className="relative z-port-dropdown" ref={dropdownRef}>
        {/* Display the active port if available, otherwise show the plug icon */}
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-1 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4 focus-visible:outline focus-visible:outline-2 disabled:opacity-60"
          type="button"
          aria-label="Előnézeti port kiválasztása"
          aria-expanded={isDropdownOpen}
          disabled={!previews.length}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <span className="i-ph:plug text-base"></span>
          {previews.length > 0 && activePreviewIndex >= 0 && activePreviewIndex < previews.length ? (
            <span className="text-xs font-medium">{previews[activePreviewIndex].port}</span>
          ) : null}
        </button>
        {isDropdownOpen && (
          <div className="absolute left-0 mt-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded shadow-sm min-w-[140px] dropdown-animation">
            <div className="px-4 py-2 border-b border-bolt-elements-borderColor text-sm font-semibold text-bolt-elements-textPrimary">
              Előnézeti portok
            </div>
            {sortedPreviews.map((preview) => (
              <button
                type="button"
                key={preview.port}
                className="flex w-full items-center px-4 py-2 text-left hover:bg-bolt-elements-item-backgroundActive"
                onClick={() => {
                  setActivePreviewIndex(preview.index);
                  setIsDropdownOpen(false);
                }}
              >
                <span
                  className={
                    activePreviewIndex === preview.index
                      ? 'text-bolt-elements-item-contentAccent'
                      : 'text-bolt-elements-item-contentDefault group-hover:text-bolt-elements-item-contentActive'
                  }
                >
                  {preview.port}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
