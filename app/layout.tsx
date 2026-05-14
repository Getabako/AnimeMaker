import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AnimeMaker",
  description: "キャラクター画像からポーズ違い・コマ送りアニメ素材を生成するローカルツール",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
