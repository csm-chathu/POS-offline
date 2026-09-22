export default function GuestLayout({ children }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1a3058 45%, #0f172a 100%)' }}
    >
      {children}
    </div>
  );
}
