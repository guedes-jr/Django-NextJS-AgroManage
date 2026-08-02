import "./platform.css";

export default function PlatformRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="platform-theme" data-bs-theme="light">
      {children}
    </div>
  );
}
