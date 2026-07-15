// 生产环境优先读取同源 Worker 注入的公开配置；VITE_* 仅作为本地开发后备。
// DeepSeek API key 永远不属于站点配置，由每位登录用户在当前标签页中自行输入。
const runtime = window.__FUTURE_PUBLIC_CONFIG__ || {};
const url = String(runtime.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = String(
  runtime.supabasePublishableKey ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '',
).trim();

window.SUPABASE_CONFIG = { url, key };
window.VAPID_PUBLIC_KEY = String(runtime.vapidPublicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();

export { url as supabaseUrl, key as supabasePublishableKey };
