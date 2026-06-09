import type { Metadata } from "next";
import CopyAttribution from "@/components/CopyAttribution";
import "./globals.css";

export const metadata: Metadata = {
  title: "한국석유공사 법령·고시·지침 모니터링",
  description: "법령, 고시, 지침, 예고 자료를 날짜별로 정리하는 한국석유공사 모니터링 앱"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <footer className="site-footer">
          © 한국석유공사(KNOC). 본 웹사이트 및 수집·정리 프로그램의 저작권은 한국석유공사에 있습니다.
        </footer>
        <CopyAttribution />
      </body>
    </html>
  );
}
