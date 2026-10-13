/* eslint-disable @next/next/no-img-element */
/**
 * FGE logo. Two artworks:
 *  - black lettering, for light surfaces
 *  - white lettering on transparent, for dark surfaces
 * `onDark` always uses the white-lettered one (header / console bar). Otherwise both are rendered and CSS shows the
 * right one for the current theme.
 */
export function Logo({ height = 32, onDark = false, className = '' }: { height?: number; onDark?: boolean; className?: string }) {
  const size = { width: Math.round(height * 1.616), height, style: { height, width: 'auto' as const } };
  return (
    <span className={className}>
      {onDark ? (
        <img src="/logo-on-dark.png" alt="FGE" {...size} className="block" />
      ) : (
        <>
          <img src="/logo.png" alt="FGE" {...size} className="block dark:hidden" />
          <img src="/logo-on-dark.png" alt="" aria-hidden {...size} className="hidden dark:block" />
        </>
      )}
    </span>
  );
}
