import type { Metadata } from "next";
import "./travel.css";
import "./responsive.css";

export const metadata: Metadata = {
  title: "去海的另一边 · 海参崴旅行手册",
  description: "崔天琴与张渝琳的冬日旅行地图、每日路线与共同清单。2026.12.05–12.09",
  robots: { index: false, follow: false },
  referrer: "strict-origin-when-cross-origin",
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/favicon.svg`,
    shortcut: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
