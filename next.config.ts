import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // クライアント側 Router Cache の保持時間（秒）。
    // 既定は dynamic=0（キャッシュ無し）で毎遷移サーバ往復になるため、
    // 動的ページを 30 秒キャッシュして再訪・戻る/進むを即時化する。
    // 変更は router.refresh()（各画面で保存後に実行済み）で即時反映される。
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // セキュリティヘッダ（クリックジャッキング・MIMEスニッフィング等の基本対策）
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
