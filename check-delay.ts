/**
 * 电车延误检查脚本
 * 检查日比谷線（東京メトロ）和京葉線（JR東日本）的运行状况
 * 如果有延误则发送邮件通知
 */

import * as cheerio from 'cheerio';

// 配置
const CONFIG = {
  // 你关心的线路
  lines: [
    {
      name: '日比谷線',
      nameEn: 'Hibiya Line',
      operator: '東京メトロ',
      url: 'https://www.tokyometro.jp/unkou/history/hibiya.html',
      type: 'metro'
    },
    {
      name: '京葉線', 
      nameEn: 'Keiyo Line',
      operator: 'JR東日本',
      url: 'https://traininfo.jreast.co.jp/train_info/line.aspx?gid=1&lineid=keiyoline',
      type: 'jr'
    }
  ],
  
  // 备用：Yahoo! 路線情報
  yahooUrls: {
    hibiya: 'https://transit.yahoo.co.jp/diainfo/134/0',
    keiyo: 'https://transit.yahoo.co.jp/diainfo/36/0'
  }
};

interface DelayInfo {
  line: string;
  operator: string;
  status: 'normal' | 'delayed' | 'suspended' | 'unknown';
  message: string;
  timestamp: string;
}

// 检查东京メトロ日比谷線
async function checkMetroHibiya(): Promise<DelayInfo> {
  const line = CONFIG.lines[0];
  
  try {
    const response = await fetch(line.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrainDelayChecker/1.0)'
      }
    });
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // 东京メトロ的页面结构：如果有延误会显示具体信息
    const statusText = $('body').text();
    
    // 检查是否有延误关键词
    const hasDelay = /遅延|遅れ|運転見合|折返し運転|運休/.test(statusText);
    const isNormal = /平常運転|通常運転|平常どおり/.test(statusText) || 
                     statusText.includes('15分以上の遅れが発生') && !hasDelay;
    
    if (hasDelay) {
      // 尝试提取具体延误信息
      const delayMatch = statusText.match(/(\d+時\d+分頃.*?(?:遅延|運転見合|折返し|運休).*?)(?:\n|。)/);
      return {
        line: line.name,
        operator: line.operator,
        status: 'delayed',
        message: delayMatch ? delayMatch[1] : '延误详情请查看官网',
        timestamp: new Date().toISOString()
      };
    }
    
    return {
      line: line.name,
      operator: line.operator,
      status: 'normal',
      message: '平常運転',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Error checking ${line.name}:`, error);
    return {
      line: line.name,
      operator: line.operator,
      status: 'unknown',
      message: `检查失败: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

// 检查JR京葉線
async function checkJRKeiyo(): Promise<DelayInfo> {
  const line = CONFIG.lines[1];
  
  try {
    const response = await fetch(line.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrainDelayChecker/1.0)'
      }
    });
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // JR东日本的运行信息页面
    const statusText = $('body').text();
    
    // 检查延误关键词
    const hasDelay = /遅延|遅れ|運転見合|運休|ダイヤ乱れ/.test(statusText);
    const isNormal = /平常運転|平常通り|通常どおり/.test(statusText);
    
    if (hasDelay && !isNormal) {
      const delayMatch = statusText.match(/(.*?(?:遅延|遅れ|運転見合|運休|ダイヤ乱れ).*?)(?:\n|。)/);
      return {
        line: line.name,
        operator: line.operator,
        status: 'delayed',
        message: delayMatch ? delayMatch[1].substring(0, 200) : '延误详情请查看官网',
        timestamp: new Date().toISOString()
      };
    }
    
    return {
      line: line.name,
      operator: line.operator,
      status: 'normal',
      message: '平常運転',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Error checking ${line.name}:`, error);
    return {
      line: line.name,
      operator: line.operator,
      status: 'unknown',
      message: `检查失败: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

// 使用 Yahoo! 路線情報作为备用数据源（更稳定）
async function checkYahooTransit(lineKey: 'hibiya' | 'keiyo'): Promise<DelayInfo> {
  const url = CONFIG.yahooUrls[lineKey];
  const lineName = lineKey === 'hibiya' ? '日比谷線' : '京葉線';
  const operator = lineKey === 'hibiya' ? '東京メトロ' : 'JR東日本';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrainDelayChecker/1.0)'
      }
    });
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Yahoo! 页面会显示 "平常運転" 或具体延误信息
    const statusArea = $('.trouble').text() || $('body').text();
    
    const hasDelay = /遅延|遅れ|運転見合|運休|ダイヤ乱れ/.test(statusArea);
    const isNormal = statusArea.includes('平常運転') || statusArea.includes('現在､事故･遅延に関する情報はありません');
    
    if (hasDelay && !isNormal) {
      return {
        line: lineName,
        operator: operator,
        status: 'delayed',
        message: statusArea.substring(0, 300),
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

// 发送邮件（使用 Resend API - 免费额度足够）
async function sendEmail(delays: DelayInfo[]): Promise<void> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const TO_EMAIL = process.env.TO_EMAIL;
  const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  
  if (!RESEND_API_KEY || !TO_EMAIL) {
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
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: TO_EMAIL,
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

// 主函数
async function main() {
  console.log('🚃 Checking train delays...');
  console.log(`Time: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST`);
  
  // 并行检查所有线路（使用 Yahoo 作为主数据源，更稳定）
  const [hibiya, keiyo] = await Promise.all([
    checkYahooTransit('hibiya'),
    checkYahooTransit('keiyo')
  ]);
  
  const results = [hibiya, keiyo];
  
  // 输出结果
  console.log('\n--- Results ---');
  for (const result of results) {
    const statusIcon = result.status === 'normal' ? '✅' : 
                       result.status === 'delayed' ? '⚠️' : '❓';
    console.log(`${statusIcon} ${result.operator} ${result.line}: ${result.message}`);
  }
  
  // 如果有延误，发送邮件
  const hasDelays = results.some(r => r.status === 'delayed');

  if (hasDelays) {
    console.log('\n📧 Sending notification email...');
    await sendEmail(results);
  } else {
    console.log('\n✅ All lines running normally. No email sent.');
  }
}

main().catch(console.error);
