import * as cheerio from 'cheerio';
import nodemailer from 'nodemailer';

// ============================================
// 設定 / Configuration
// ============================================
const CONFIG = {
  // 監視する路線 / Lines to monitor
  lines: {
    keiyo: {
      name: '京葉線',
      nameEn: 'Keiyo Line',
      url: 'https://traininfo.jreast.co.jp/train_info/line.aspx?gid=1&lineid=keiyoline',
      operator: 'JR東日本'
    },
    hibiya: {
      name: '日比谷線',
      nameEn: 'Hibiya Line',
      url: 'https://www.tokyometro.jp/unkou/history/hibiya.html',
      operator: '東京メトロ'
    }
  },
  
  // メール設定（環境変数から取得）
  email: {
    to: process.env.NOTIFY_EMAIL || '',
    from: process.env.SMTP_USER || '',
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587'),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || ''
  }
};

// ============================================
// 型定義 / Types
// ============================================
interface LineStatus {
  lineName: string;
  operator: string;
  status: 'normal' | 'delayed' | 'suspended' | 'unknown';
  message: string;
  timestamp: Date;
}

interface CheckResult {
  hasDelay: boolean;
  lines: LineStatus[];
}

// ============================================
// JR東日本 京葉線 チェック
// ============================================
async function checkKeiyoLine(): Promise<LineStatus> {
  const { name, url, operator } = CONFIG.lines.keiyo;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrainDelayChecker/1.0)',
        'Accept-Language': 'ja,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // JR東日本の運行情報ページの構造を解析
    // 「平常運転」または遅延情報を探す
    const statusText = $('body').text();
    
    // 遅延・運休キーワードをチェック
    const delayKeywords = ['遅延', '遅れ', '運転見合', '運休', '運転取りやめ', '折返し運転'];
    const normalKeywords = ['平常運転', '平常どおり'];
    
    let status: LineStatus['status'] = 'unknown';
    let message = '';
    
    // 遅延キーワードがあるかチェック
    for (const keyword of delayKeywords) {
      if (statusText.includes(keyword)) {
        status = keyword.includes('運休') || keyword.includes('見合') ? 'suspended' : 'delayed';
        // メッセージを抽出（簡易的な方法）
        const infoElement = $('.info, .delay-info, .status').first();
        message = infoElement.text().trim() || `${keyword}が発生しています`;
        break;
      }
    }
    
    // 遅延がない場合、平常運転かチェック
    if (status === 'unknown') {
      for (const keyword of normalKeywords) {
        if (statusText.includes(keyword)) {
          status = 'normal';
          message = '平常運転';
          break;
        }
      }
    }
    
    // それでも不明な場合
    if (status === 'unknown') {
      message = 'ステータス不明（ページ構造が変更された可能性）';
    }
    
    return {
      lineName: name,
      operator,
      status,
      message,
      timestamp: new Date()
    };
    
  } catch (error) {
    return {
      lineName: name,
      operator,
      status: 'unknown',
      message: `チェック失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date()
    };
  }
}

// ============================================
// 東京メトロ 日比谷線 チェック
// ============================================
async function checkHibiyaLine(): Promise<LineStatus> {
  const { name, url, operator } = CONFIG.lines.hibiya;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrainDelayChecker/1.0)',
        'Accept-Language': 'ja,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const statusText = $('body').text();
    
    // 遅延キーワードをチェック
    const delayKeywords = ['遅延', '遅れ', '運転見合', '運休', '折返し運転', '直通運転中止'];
    const normalKeywords = ['平常運転', '平常どおり', '通常運行'];
    
    let status: LineStatus['status'] = 'unknown';
    let message = '';
    
    for (const keyword of delayKeywords) {
      if (statusText.includes(keyword)) {
        status = keyword.includes('運休') || keyword.includes('見合') ? 'suspended' : 'delayed';
        message = `${keyword}が発生しています`;
        break;
      }
    }
    
    if (status === 'unknown') {
      for (const keyword of normalKeywords) {
        if (statusText.includes(keyword)) {
          status = 'normal';
          message = '平常運転';
          break;
        }
      }
    }
    
    // 東京メトロは「情報なし」=「平常運転」の場合が多い
    if (status === 'unknown') {
      // 15分以上の遅延がない場合は情報が表示されない
      status = 'normal';
      message = '運行情報なし（15分以上の遅延なし）';
    }
    
    return {
      lineName: name,
      operator,
      status,
      message,
      timestamp: new Date()
    };
    
  } catch (error) {
    return {
      lineName: name,
      operator,
      status: 'unknown',
      message: `チェック失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date()
    };
  }
}

// ============================================
// 全路線チェック
// ============================================
async function checkAllLines(): Promise<CheckResult> {
  console.log('🚃 運行情報をチェック中...');
  
  const [keiyo, hibiya] = await Promise.all([
    checkKeiyoLine(),
    checkHibiyaLine()
  ]);
  
  const lines = [keiyo, hibiya];
  const hasDelay = lines.some(line => 
    line.status === 'delayed' || line.status === 'suspended'
  );
  
  return { hasDelay, lines };
}

// ============================================
// メール送信
// ============================================
async function sendEmail(result: CheckResult): Promise<void> {
  const { email } = CONFIG;
  
  if (!email.to || !email.smtpUser || !email.smtpPass) {
    console.log('⚠️ メール設定が不完全です。環境変数を確認してください。');
    return;
  }
  
  const transporter = nodemailer.createTransport({
    host: email.smtpHost,
    port: email.smtpPort,
    secure: email.smtpPort === 465,
    auth: {
      user: email.smtpUser,
      pass: email.smtpPass
    }
  });
  
  const delayedLines = result.lines.filter(l => 
    l.status === 'delayed' || l.status === 'suspended'
  );
  
  const statusEmoji = (status: LineStatus['status']) => {
    switch (status) {
      case 'normal': return '✅';
      case 'delayed': return '⚠️';
      case 'suspended': return '🚫';
      default: return '❓';
    }
  };
  
  const subject = `🚃 電車遅延アラート: ${delayedLines.map(l => l.lineName).join(', ')}`;
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #e74c3c; color: white; padding: 15px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
    .line-status { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #e74c3c; }
    .line-status.normal { border-left-color: #27ae60; }
    .line-name { font-size: 18px; font-weight: bold; margin-bottom: 8px; }
    .line-message { color: #666; }
    .timestamp { color: #999; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h2 style="margin: 0;">🚃 電車遅延アラート</h2>
    <p style="margin: 5px 0 0 0;">帰宅ルートに遅延が発生しています</p>
  </div>
  <div class="content">
    ${result.lines.map(line => `
      <div class="line-status ${line.status === 'normal' ? 'normal' : ''}">
        <div class="line-name">${statusEmoji(line.status)} ${line.lineName}（${line.operator}）</div>
        <div class="line-message">${line.message}</div>
      </div>
    `).join('')}
    <p class="timestamp">
      チェック時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
    </p>
  </div>
</body>
</html>
  `.trim();
  
  const textBody = result.lines
    .map(line => `${statusEmoji(line.status)} ${line.lineName}（${line.operator}）: ${line.message}`)
    .join('\n');
  
  await transporter.sendMail({
    from: email.from,
    to: email.to,
    subject,
    text: textBody,
    html: htmlBody
  });
  
  console.log(`📧 メール送信完了: ${email.to}`);
}

// ============================================
// メイン処理
// ============================================
async function main(): Promise<void> {
  console.log('========================================');
  console.log('🚃 電車遅延チェッカー');
  console.log(`📅 ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  console.log('========================================\n');
  
  const result = await checkAllLines();
  
  // 結果を表示
  for (const line of result.lines) {
    const emoji = line.status === 'normal' ? '✅' : 
                  line.status === 'delayed' ? '⚠️' : 
                  line.status === 'suspended' ? '🚫' : '❓';
    console.log(`${emoji} ${line.lineName}（${line.operator}）`);
    console.log(`   ${line.message}\n`);
  }
  
  // 遅延がある場合のみメール送信
  if (result.hasDelay) {
    console.log('🔔 遅延を検出！メールを送信します...');
    await sendEmail(result);
  } else {
    console.log('✨ 遅延なし。メールは送信しません。');
  }
  
  console.log('\n========================================');
  console.log('完了');
  console.log('========================================');
}

main().catch(console.error);
