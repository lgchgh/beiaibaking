/**
 * POST /api/auto-generate-receiver — 兼容旧 URL，与 /api/ingest 相同。
 * 请优先将 BEIAI_API_URL 设为 https://…/api/ingest
 */
module.exports = require('./ingest');
