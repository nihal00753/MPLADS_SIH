import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MPLADS AI Platform — National Fund Transparency & Integrity System',
  description: 'AI-driven audit, anomaly detection, photo geotag verification, and collusion network detection for the MPLADS scheme.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Public+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-[#fafafa] text-zinc-900 font-sans selection:bg-zinc-200 selection:text-black">
        {children}
      </body>
    </html>
  );
}
