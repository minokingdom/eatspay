const fs = require('fs');
const path = require('path');

const { createPool } = require('../db/pool');
const { createRepository } = require('../db/repository');
const { getPushRuntimeStatus } = require('../push');

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) {
      args[match[1]] = match[2] === undefined ? true : match[2];
    }
  }
  return args;
}

function check(name, ok, detail, next) {
  return {
    name,
    ok: Boolean(ok),
    detail,
    next: ok ? '' : next
  };
}

function printChecks(checks) {
  for (const item of checks) {
    const mark = item.ok ? 'OK' : 'MISSING';
    console.log(`[${mark}] ${item.name}`);
    if (item.detail) console.log(`  ${item.detail}`);
    if (item.next) console.log(`  next: ${item.next}`);
  }
}

function fileContains(filePath, pattern) {
  if (!fs.existsSync(filePath)) return false;
  return pattern.test(fs.readFileSync(filePath, 'utf8'));
}

function findFile(startDir, fileName, depth = 4) {
  if (!fs.existsSync(startDir) || depth < 0) return null;
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    if (entry.isFile() && entry.name === fileName) return fullPath;
    if (entry.isDirectory() && !['node_modules', '.git', 'build'].includes(entry.name)) {
      const found = findFile(fullPath, fileName, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetEmail = args.email || process.env.PUSH_STATUS_EMAIL;
  const targetUserId = args.userId || process.env.PUSH_STATUS_USER_ID;
  const checks = [];

  const rootDir = path.join(__dirname, '..');
  const androidGoogleServicesPath = path.join(rootDir, 'android', 'app', 'google-services.json');
  checks.push(check(
    'Android Firebase config',
    fs.existsSync(androidGoogleServicesPath),
    androidGoogleServicesPath,
    'Download google-services.json from Firebase and place it at android/app/google-services.json, then run npm run android:sync.'
  ));

  const iosDir = path.join(rootDir, 'ios');
  checks.push(check(
    'iOS Capacitor project',
    fs.existsSync(iosDir),
    iosDir,
    'On a Mac, run npx cap add ios, then add Firebase iOS app settings and APNs in Firebase.'
  ));

  const iosGooglePlistPath = findFile(iosDir, 'GoogleService-Info.plist');
  checks.push(check(
    'iOS Firebase config',
    Boolean(iosGooglePlistPath),
    iosGooglePlistPath || 'GoogleService-Info.plist was not found under ios/.',
    'Download GoogleService-Info.plist from Firebase and add it to the iOS app target in Xcode.'
  ));

  const serviceWorkerPath = path.join(rootDir, 'sw.js');
  checks.push(check(
    'PWA service worker push handler',
    fileContains(serviceWorkerPath, /addEventListener\(['"]push['"]/),
    serviceWorkerPath,
    'Keep sw.js registered on HTTPS and add web push subscription support before relying on browser/PWA push.'
  ));

  const firebaseStatus = getPushRuntimeStatus();
  checks.push(check(
    'Server Firebase Admin credentials',
    firebaseStatus.configured,
    `${firebaseStatus.mode}: ${firebaseStatus.detail}`,
    'Set GOOGLE_APPLICATION_CREDENTIALS=/etc/eatspay/firebase-service-account.json or FIREBASE_SERVICE_ACCOUNT_JSON in the server .env, then restart eatspay.'
  ));

  let pool = null;
  try {
    pool = createPool();
    const repo = createRepository(pool);
    const totals = await repo.getPushTokenSummary();
    const enabledTokens = Number(totals.enabled || 0);
    checks.push(check(
      'Registered device tokens in PostgreSQL',
      enabledTokens > 0,
      `total=${totals.total || 0}, enabled=${enabledTokens}, disabled=${totals.disabled || 0}`,
      'Install the latest app build on a phone, log in, and allow notifications so /api/push-token can register the device.'
    ));

    if (targetEmail || targetUserId) {
      const user = targetEmail
        ? await repo.findUserByEmail(targetEmail)
        : await repo.findUserById(Number(targetUserId));
      if (!user) {
        checks.push(check(
          'Target account for test push',
          false,
          targetEmail ? `email=${targetEmail}` : `userId=${targetUserId}`,
          'Check the login account exists in PostgreSQL.'
        ));
      } else {
        const tokens = await repo.listEnabledPushTokens(user.id);
        checks.push(check(
          'Target account has an enabled device token',
          tokens.length > 0,
          `${user.email} (${user.franchiseName || user.name || `user ${user.id}`}) tokens=${tokens.length}`,
          'Log in on the phone with this exact account and allow notifications.'
        ));
      }
    }
  } catch (err) {
    checks.push(check(
      'PostgreSQL connectivity',
      false,
      err.message,
      'Check DATABASE_URL and PostgreSQL service before testing push delivery.'
    ));
  } finally {
    if (pool) await pool.end();
  }

  printChecks(checks);
  const missing = checks.filter(item => !item.ok);
  console.log('');
  console.log(missing.length
    ? `Push readiness: ${checks.length - missing.length}/${checks.length} checks passed.`
    : `Push readiness: ${checks.length}/${checks.length} checks passed.`);

  if (args.strict && missing.length) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
