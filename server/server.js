// 独立运行的中继服务器：node server.js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { startRelay } = require('./relay.cjs');

startRelay({
  port: Number(process.env.PORT || 8787),
  // 可选：在服务器上写死密钥。不设置的话，第一个进房间的人定下密钥。
  fixedSecret: process.env.ROOM_SECRET || '',
}).catch((e) => { console.error('启动失败：', e.message); process.exit(1); });
