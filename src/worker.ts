/**
 * 电车延误检查 - Cloudflare Workers 版本
 * 检查日比谷線（東京メトロ）和京葉線（JR東日本）的运行状况
 * 如果有延误则发送邮件通知
 */

export interface Env {
  RESEND_API_KEY: string;
  TO_EMAIL: string;
  FROM_EMAIL: string;
}

interface DelayInfo {
  line: string;
  operator: string;
  status: 'normal' | 'delayed' | 'suspended' | 'unknown';
  message: string;
  timestamp: string;
}

const YAHOO_URLS = {
  hibiya: 'https://transit.yahoo.co.jp/diainfo/134/0',
  keiyo: 'https://transit.yahoo.co.jp/diainfo/36/0'
};

// 使用 Yahoo! 路線情報检查延误
async function checkYahooTransit(lineKey: 'hibiya' | 'keiyo'): Promise<DelayInfo> {
  const url = YAHOO_URLS[lineKey];
  const lineName = lineKey === 'hibiya' ? '日比谷線' : '京葉線';
  const operator = lineKey === 'hibiya' ? '東京メトロ' : 'JR東日本';

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrainDelayChecker/1.0)'
      }
    });

    const html = await response.text();

    // 简单提取文本内容（不依赖 cheerio）
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

    const hasDelay = /遅延|遅れ|運転見合|運休|ダイヤ乱れ/.test(textContent);
    const isNormal = textContent.includes('平常運転') ||
                     textContent.includes('現在､事故･遅延に関する情報はありません');

    if (hasDelay && !isNormal) {
      // 提取延误相关信息
      const delayMatch = textContent.match(/(.*?(?:遅延|遅れ|運転見合|運休|ダイヤ乱れ).*?)(?:\s{2,}|$)/);
      return {
        line: lineName,
        operator: operator,
        status: 'delayed',
        message: delayMatch ? delayMatch[1].substring(0, 300) : '延误详情请查看官网',
        timestamp: new Date().toISOString()
      };
    }

    return {
      line: lineName,
      operator: operator,
      status: 'normal',
      message: '平常運転',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      line: lineName,
      operator: operator,
      status: 'unknown',
      message: `检查失败: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

// 发送邮件（使用 Resend API）
async function sendEmail(env: Env, delays: DelayInfo[]): Promise<void> {
  if (!env.RESEND_API_KEY || !env.TO_EMAIL) {
    console.error('Missing RESEND_API_KEY or TO_EMAIL');
    return;
  }

  const delayedLines = delays.filter(d => d.status === 'delayed');

  if (delayedLines.length === 0) {
    console.log('No delays detected, skipping email');
    return;
  }

  const now = new Date();
  const jstTime = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const subject = `🚃 電車遅延通知: ${delayedLines.map(d => d.line).join(', ')}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #e74c3c;">⚠️ 電車遅延情報</h2>
      <p style="color: #666;">確認時刻: ${jstTime} (JST)</p>

      ${delayedLines.map(d => `
        <div style="border-left: 4px solid #e74c3c; padding-left: 16px; margin: 16px 0;">
          <h3 style="margin: 0;">${d.operator} ${d.line}</h3>
          <p style="color: #333;">${d.message}</p>
        </div>
      `).join('')}

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

      <p style="font-size: 12px; color: #999;">
        詳細は公式サイトをご確認ください：<br>
        <a href="https://www.tokyometro.jp/unkou/">東京メトロ運行情報</a> |
        <a href="https://traininfo.jreast.co.jp/train_info/">JR東日本運行情報</a>
      </p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || 'onboarding@resend.dev',
        to: env.TO_EMAIL,
        subject: subject,
        html: html
      })
    });

    if (response.ok) {
      console.log('Email sent successfully!');
    } else {
      const error = await response.text();
      console.error('Failed to send email:', error);
    }
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// 主检查逻辑
async function checkTrainDelays(env: Env): Promise<string> {
  console.log('🚃 Checking train delays...');
  const jstTime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  console.log(`Time: ${jstTime} JST`);

  // 并行检查所有线路
  const [hibiya, keiyo] = await Promise.all([
    checkYahooTransit('hibiya'),
    checkYahooTransit('keiyo')
  ]);

  const results = [hibiya, keiyo];

  // 输出结果
  console.log('--- Results ---');
  for (const result of results) {
    const statusIcon = result.status === 'normal' ? '✅' :
      result.status === 'delayed' ? '⚠️' : '❓';
    console.log(`${statusIcon} ${result.operator} ${result.line}: ${result.message}`);
  }

  // 如果有延误，发送邮件
  const hasDelays = results.some(r => r.status === 'delayed');

  if (hasDelays) {
    console.log('📧 Sending notification email...');
    await sendEmail(env, results);
    return `Delays detected: ${results.filter(r => r.status === 'delayed').map(r => r.line).join(', ')}`;
  } else {
    console.log('✅ All lines running normally. No email sent.');
    return 'All lines running normally';
  }
}

export default {
  // 定时触发器
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkTrainDelays(env));
  },

  // HTTP 触发器（用于手动测试）
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const result = await checkTrainDelays(env);
    return new Response(result, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
