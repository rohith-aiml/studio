import type {Metadata} from 'next';
import './globals.css';

const favicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='hsl(210 75% 50%)' /%3E%3Cpath d='M9 23 L23 9' stroke='white' stroke-width='3' stroke-linecap='round' /%3E%3Cpath d='M9 9 L23 23' stroke='white' stroke-width='3' stroke-linecap='round' /%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: 'Doodle Duel',
  description: 'A real-time multiplayer drawing and guessing game.',
  icons: {
    icon: favicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
