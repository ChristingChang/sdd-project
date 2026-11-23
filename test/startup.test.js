import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startupError } from '../src/startup.js';

const PROD = { NODE_ENV: 'production', BASE_URL: 'https://surfpool.example', SUPPORT_EMAIL: 'help@example.test' };

test('PR-SUPPORT-01 正式環境設定齊全時可以啟動', () => {
  assert.equal(startupError(PROD), null);
});

test('PR-SUPPORT-01 正式環境沒設定客服信箱時拒絕啟動', () => {
  assert.match(startupError({ ...PROD, SUPPORT_EMAIL: '' }), /SUPPORT_EMAIL/);
  assert.match(startupError({ NODE_ENV: 'production', BASE_URL: 'http://localhost:3001' }), /SUPPORT_EMAIL/);
});

test('PR-SUPPORT-01 HTTPS 網址視為正式環境，沒設定客服信箱時拒絕啟動', () => {
  assert.match(startupError({ BASE_URL: 'https://abc.ngrok.app' }), /SUPPORT_EMAIL/);
});

test('PR-SUPPORT-01 開發環境沒設定客服信箱也可以啟動', () => {
  assert.equal(startupError({ BASE_URL: 'http://localhost:3001', DEV_LOGIN: '1' }), null);
});

test('正式環境開啟假登入時拒絕啟動', () => {
  assert.match(startupError({ ...PROD, DEV_LOGIN: '1' }), /DEV_LOGIN/);
});

test('HTTPS 網址開啟假登入時拒絕啟動，即使沒設 NODE_ENV', () => {
  assert.match(startupError({ BASE_URL: 'https://abc.ngrok.app', DEV_LOGIN: '1', SUPPORT_EMAIL: 'help@example.test' }), /DEV_LOGIN/);
});
