'use client';

export default function FooterBar() {
  return (
    <footer
      className="app-footer modal-chrome fixed bottom-0 left-0 right-0 z-[90]"
      role="contentinfo"
      aria-label="Site footer"
    >
      <div className="h-full w-full flex items-center justify-between px-3 sm:px-4">
        <span className="text-[11px] sm:text-xs opacity-80 select-none">
          © 2025 Dataventure — All Rights Reserved
        </span>

        <span className="text-[11px] sm:text-xs opacity-80 flex items-center whitespace-nowrap select-none">
          Crafted with
          <img
            src="/love1.png"        
            alt=""                      /* decorativo */
            aria-hidden="true"
            width={14}
            height={14}
            className="inline-block h-3 w-3 mx-1 align-[-2px]"
          />
          by David
          <span className="sr-only">with love</span>
        </span>
      </div>
    </footer>
  );
}
