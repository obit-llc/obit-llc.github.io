const http = require('http');
const fs = require('fs');
const path = require('path');

// .envファイルを読み込む
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    });
}

// Slack Webhook URL（環境変数から取得）
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

const PORT = process.env.PORT || 3000;

// MIMEタイプの定義
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    // CORSヘッダー
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONSリクエスト（プリフライト）への対応
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Slack通知API
    if (req.method === 'POST' && req.url === '/api/contact') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { name, email, service, message } = data;

                // バリデーション
                if (!name || !email || !service || !message) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '全ての項目を入力してください' }));
                    return;
                }

                // Webhook URLが設定されていない場合
                if (!SLACK_WEBHOOK_URL) {
                    console.log('Slack Webhook URL が設定されていません');
                    console.log('受信したお問い合わせ:', { name, email, service, message });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'お問い合わせを受け付けました（Slack未連携）' }));
                    return;
                }

                // Slackに送信するメッセージ
                const slackMessage = {
                    blocks: [
                        {
                            type: 'header',
                            text: {
                                type: 'plain_text',
                                text: '📩 新しいお問い合わせ',
                                emoji: true
                            }
                        },
                        {
                            type: 'section',
                            fields: [
                                {
                                    type: 'mrkdwn',
                                    text: `*お名前:*\n${name}`
                                },
                                {
                                    type: 'mrkdwn',
                                    text: `*メールアドレス:*\n${email}`
                                }
                            ]
                        },
                        {
                            type: 'section',
                            fields: [
                                {
                                    type: 'mrkdwn',
                                    text: `*ご相談内容:*\n${service}`
                                }
                            ]
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `*メッセージ:*\n${message}`
                            }
                        },
                        {
                            type: 'context',
                            elements: [
                                {
                                    type: 'mrkdwn',
                                    text: `送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`
                                }
                            ]
                        }
                    ]
                };

                // Slack Webhookに送信
                const webhookUrl = new URL(SLACK_WEBHOOK_URL);
                const postData = JSON.stringify(slackMessage);

                const options = {
                    hostname: webhookUrl.hostname,
                    port: 443,
                    path: webhookUrl.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const https = require('https');
                const slackReq = https.request(options, (slackRes) => {
                    if (slackRes.statusCode === 200) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'お問い合わせを送信しました' }));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Slack通知の送信に失敗しました' }));
                    }
                });

                slackReq.on('error', (error) => {
                    console.error('Slack送信エラー:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'サーバーエラーが発生しました' }));
                });

                slackReq.write(postData);
                slackReq.end();

            } catch (error) {
                console.error('エラー:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'サーバーエラーが発生しました' }));
            }
        });
        return;
    }

    // 静的ファイルの配信
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    if (!SLACK_WEBHOOK_URL) {
        console.log('⚠️  SLACK_WEBHOOK_URL が設定されていません');
        console.log('   設定方法: SLACK_WEBHOOK_URL=https://hooks.slack.com/... node server.js');
    }
});
