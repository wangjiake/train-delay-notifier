# 🚃 電車遅延通知システム

日比谷線（東京メトロ）と京葉線（JR東日本）の運行情報を毎日チェックし、遅延があればメールで通知します。

## 🎯 機能

- 毎日18:20（JST）に自動実行
- 日比谷線・京葉線の遅延情報をチェック
- 遅延がある場合のみメール通知
- GitHub Actions で完全無料運用

## 📦 セットアップ

### 1. リポジトリを作成

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/train-delay-notifier.git
git push -u origin main
```

### 2. Resend でメール送信設定

1. [Resend](https://resend.com) でアカウント作成（無料）
2. API Key を発行
3. ドメイン認証（または `onboarding@resend.dev` から送信）

### 3. GitHub Secrets を設定

リポジトリの Settings → Secrets and variables → Actions で以下を追加：

| Secret Name | 説明 |
|-------------|------|
| `RESEND_API_KEY` | Resend の API キー |
| `TO_EMAIL` | 通知先メールアドレス（あなたのメール） |
| `FROM_EMAIL` | 送信元アドレス（Resend で認証したドメイン、または `onboarding@resend.dev`） |

### 4. 動作確認

1. リポジトリの Actions タブを開く
2. "Train Delay Check" ワークフローを選択
3. "Run workflow" で手動実行してテスト

## ⏰ スケジュール変更

`.github/workflows/check-delay.yml` の cron 式を変更：

```yaml
schedule:
  # 18:20 JST = 09:20 UTC
  - cron: '20 9 * * *'
  
  # 他の例：
  # 朝8:00 JST = 23:00 UTC (前日)
  # - cron: '0 23 * * *'
  
  # 平日のみ
  # - cron: '20 9 * * 1-5'
```

## 📧 メール例

遅延がある場合、以下のようなメールが届きます：

```
件名: 🚃 電車遅延通知: 京葉線

⚠️ 電車遅延情報
確認時刻: 2024/1/15 18:20:00 (JST)

JR東日本 京葉線
強風の影響で、一部列車に遅れが出ています。
```

## 🔧 カスタマイズ

### 他の路線を追加

`check-delay.ts` の `CONFIG.yahooUrls` を編集。Yahoo! 路線情報で路線ページの URL を取得：

```typescript
yahooUrls: {
  hibiya: 'https://transit.yahoo.co.jp/diainfo/134/0',
  keiyo: 'https://transit.yahoo.co.jp/diainfo/36/0',
  // 追加例：
  // sobu_rapid: 'https://transit.yahoo.co.jp/diainfo/37/0'  // 総武線快速
}
```

### 通知条件のカスタマイズ

常に結果を通知したい場合は、`sendEmail` 関数の条件を変更。

## 📊 路線情報ソース

- [Yahoo! 路線情報](https://transit.yahoo.co.jp/diainfo/) - メインデータソース
- [東京メトロ運行情報](https://www.tokyometro.jp/unkou/)
- [JR東日本運行情報](https://traininfo.jreast.co.jp/train_info/)

## 💰 コスト

**完全無料**で運用可能：

- GitHub Actions: 無料（月2,000分まで）
- Resend: 無料（月3,000通まで）

## ⚠️ 注意事項

- 運行情報は参考値です。実際の運行状況は公式サイトをご確認ください
- GitHub Actions のスケジュール実行は数分の遅延が発生する場合があります

## 📝 ライセンス

MIT
