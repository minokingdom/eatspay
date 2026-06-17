const assert = require('node:assert/strict');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = 'mocked_admin_token';

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function expectOk(label, path, options, expectedStatus = 200) {
  const result = await request(path, options);
  assert.equal(result.response.status, expectedStatus, `${label}: HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
  assert.equal(result.body?.success, true, `${label}: success !== true`);
  return result.body;
}

function uniqueDigits(length = 10) {
  const suffix = String(Date.now()).slice(-8);
  return (`92${suffix}${Math.floor(Math.random() * 90 + 10)}`).slice(0, length);
}

async function run() {
  const stamp = Date.now();
  const email = `e2e_${stamp}@eatspay.local`;
  const password = 'Password123!';
  const storeName = `E2E테스트가맹점_${stamp}`;
  const ceoName = `E2E대표_${stamp}`;
  const businessDigits = uniqueDigits(10);
  const businessNumber = `${businessDigits.slice(0, 3)}-${businessDigits.slice(3, 5)}-${businessDigits.slice(5)}`;

  console.log('[1] 회원가입');
  await expectOk('register', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      phone: '010-5555-1212',
      storeName,
      ceoName,
      address: '서울시 테스트구 테스트로 1',
      tel: '02-555-1212',
      businessNumber
    })
  }, 201);

  console.log('[2] 관리자 bootstrap에 가입 완료 가맹점 반영');
  let admin = await expectOk('admin bootstrap after register', '/api/admin/bootstrap', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  let adminFranchise = admin.data.franchises.find(item => item.email === email);
  assert.ok(adminFranchise, 'registered franchise not found in admin bootstrap');
  assert.equal(adminFranchise.name, storeName);
  assert.equal(adminFranchise.status, '정상 승인');

  console.log('[3] 가입 직후 로그인 및 세션 이름 확인');
  const login = await expectOk('login', '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  const token = login.data.accessToken;
  assert.ok(token, 'access token missing');
  assert.equal(login.data.user.franchiseName, storeName);
  assert.equal(login.data.user.name, ceoName);
  assert.equal(login.data.user.role, 'OWNER');

  const authHeaders = { Authorization: `Bearer ${token}` };
  const me = await expectOk('auth me', '/api/auth/me', { headers: authHeaders });
  assert.equal(me.data.user.franchiseName, storeName);

  console.log('[5] 카드 등록 -> 카드관리 DB 목록 반영');
  const card = await expectOk('card register', '/api/card/register', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      cardNumber: '4111111111111111',
      cardPw: '12',
      expiryMonth: '12',
      expiryYear: '30',
      identity: '900101',
      alias: 'E2E 운영카드',
      cardCompany: '신한카드'
    })
  });
  assert.equal(card.data.cardCompany, '신한카드');
  const cards = await expectOk('card list', '/api/card/list', { headers: authHeaders });
  assert.ok(cards.data.some(item => item.id === card.data.id), 'registered card not found in card list');

  console.log('[6] 가상계좌 등록 -> 앱 목록과 관리자 승인대기 반영');
  const form = new FormData();
  const accountNo = `9876543210${String(stamp).slice(-4)}`;
  form.append('franchiseName', storeName);
  form.append('businessNumber', businessNumber);
  form.append('bankCode', '011');
  form.append('bankName', '농협은행');
  form.append('deliveryAgencyName', '딜버');
  form.append('accountNo', accountNo);
  form.append('representativeName', ceoName);
  form.append('documentFile', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'account-proof.png');
  const accountRequest = await expectOk('franchise account register', '/api/franchise/accounts', {
    method: 'POST',
    headers: authHeaders,
    body: form
  }, 202);
  assert.equal(accountRequest.data.deliveryAgencyName, '딜버');
  assert.equal(accountRequest.data.accountNo, accountNo);

  const appAccounts = await expectOk('franchise account list', '/api/franchise/accounts', { headers: authHeaders });
  assert.ok(appAccounts.data.some(item => item.id === accountRequest.data.requestId && item.accountNo === accountNo), 'registered account not found in app account list');

  admin = await expectOk('admin bootstrap after account request', '/api/admin/bootstrap', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  const adminAccount = admin.data.franchises
    .flatMap(franchise => franchise.deliveryAgencies.map(account => ({ franchise, account })))
    .find(row => row.account.requestId === accountRequest.data.requestId);
  assert.ok(adminAccount, 'account request not found in admin bootstrap');
  assert.equal(adminAccount.franchise.name, storeName);
  assert.equal(adminAccount.account.agency, '딜버');
  assert.equal(adminAccount.account.accountNo, accountNo);
  assert.equal(adminAccount.account.accountStatus, '승인대기');

  console.log('[7] 관리자 계좌 승인 -> 관리자 상태 반영');
  await expectOk('approve account request', '/api/admin/accounts/approve', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      requestId: accountRequest.data.requestId,
      action: 'APPROVED',
      assignedVirtualAccount: {
        bankCode: '011',
        bankName: '농협은행',
        accountNumber: accountNo,
        accountHolder: ceoName
      }
    })
  });
  admin = await expectOk('admin bootstrap after account approve', '/api/admin/bootstrap', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  const approvedAccount = admin.data.franchises
    .flatMap(franchise => franchise.deliveryAgencies)
    .find(account => account.requestId === accountRequest.data.requestId);
  assert.equal(approvedAccount.accountStatus, '승인완료');

  console.log('[8] 결제 충전 -> 결제내역과 관리자 최근 결제 반영');
  const amount = 50000;
  const calculatedFee = Math.floor(amount * 0.04602);
  const totalAmount = amount + calculatedFee;
  const charge = await expectOk('payment charge', '/api/payment/charge', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      amount,
      calculatedFee,
      totalAmount,
      cardId: card.data.id,
      installment: 0
    })
  });
  assert.equal(charge.data.amount, amount);
  assert.equal(charge.data.fee, calculatedFee);

  const history = await expectOk('payment history', '/api/payment/history?startDate=2000-01-01&endDate=2100-12-31&type=ALL', {
    headers: authHeaders
  });
  assert.ok(history.data.items.some(item => item.transactionId === charge.data.transactionId), 'charge not found in payment history');

  admin = await expectOk('admin bootstrap after charge', '/api/admin/bootstrap', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.ok(admin.data.payments.some(item => item.approvalNo === charge.data.transactionId), 'charge not found in admin payments');

  console.log('[9] delete card and virtual account -> DB lists are updated');
  await expectOk('delete card', `/api/card/${encodeURIComponent(card.data.id)}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  const cardsAfterDelete = await expectOk('card list after delete', '/api/card/list', { headers: authHeaders });
  assert.ok(!cardsAfterDelete.data.some(item => item.id === card.data.id), 'deleted card still found in card list');

  await expectOk('delete account request', `/api/franchise/accounts/${encodeURIComponent(accountRequest.data.requestId)}?source=account_request`, {
    method: 'DELETE',
    headers: authHeaders
  });
  const accountsAfterDelete = await expectOk('franchise account list after delete', '/api/franchise/accounts', { headers: authHeaders });
  assert.ok(!accountsAfterDelete.data.some(item => item.id === accountRequest.data.requestId), 'deleted account still found in app account list');

  admin = await expectOk('admin bootstrap after account delete', '/api/admin/bootstrap', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.ok(!admin.data.franchises
    .flatMap(franchise => franchise.deliveryAgencies)
    .some(account => account.requestId === accountRequest.data.requestId), 'deleted account still found in admin bootstrap');

  console.log('\nFULL_FLOW_E2E_PASS');
}

run().catch(error => {
  console.error('\nFULL_FLOW_E2E_FAIL');
  console.error(error);
  process.exit(1);
});
