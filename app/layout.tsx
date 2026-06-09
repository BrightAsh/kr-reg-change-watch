import type { Metadata } from "next";
import CopyAttribution from "@/components/CopyAttribution";
import "./globals.css";

export const metadata: Metadata = {
  title: "한국석유공사 법령·고시·지침 모니터링",
  description: "법령, 고시, 지침, 예고 자료를 날짜별로 정리하는 한국석유공사 모니터링 웹사이트"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <footer className="site-footer">
          <p>© 한국석유공사(KNOC). 본 웹사이트 및 수집·정리 프로그램의 저작권은 한국석유공사에 있습니다.</p>
          <p>
            사용 중 문제나 의견 사항이 있으면 연락해 주세요.{" "}
            <a href="tel:0522162526">052)216-2526</a> ·{" "}
            <a href="mailto:myeongjae.song@knoc.co.kr">myeongjae.song@knoc.co.kr</a>
          </p>
        </footer>
        <CopyAttribution />
      </body>
    </html>
  );
}
