import { useTheme } from '../contexts/ThemeContext';

export default function GuestLayout({ children }) {
  const { theme } = useTheme();
  return (
    <div
      className="min-h-screen"
      style={{ background: theme === 'dark' ? '#000' : 'linear-gradient(135deg, #0f172a 0%, #1a3058 45%, #0f172a 100%)' }}
    >
      {children}
    </div>
  );
}
