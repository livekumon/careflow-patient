/** Pammi brand mark — served from /public/logo.png */
export default function BrandLogo({ className = '', alt = 'Pammi', ...props }) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      className={`brand-logo ${className}`.trim()}
      draggable={false}
      {...props}
    />
  );
}
