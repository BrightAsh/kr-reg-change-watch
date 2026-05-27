import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한국 법령·행정규칙 변경 모니터",
  description: "법령, 고시, 지침, 예고 자료를 날짜별로 정리하는 규제 변경 모니터링 앱"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
