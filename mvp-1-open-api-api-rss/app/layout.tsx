import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한국 법령·행정규칙 변경 모니터",
  description: "공식 API, 관보, 부처 게시판, RSS, 뉴스 보조 수집 기반 변경사항 MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
