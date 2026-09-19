// Loaded only by the test server process. No real credentials or network calls.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const packageRequire = createRequire(process.env.GSC_TEST_ENTRY);
const { GoogleAuth } = packageRequire('google-auth-library');
const { Gaxios } = packageRequire('gaxios');

// Substitute the ADC file location, leaving Google's credential parsing,
// environment-variable precedence, and token handling in place.
GoogleAuth.prototype._tryGetApplicationCredentialsFromWellKnownFile = function (options) {
  return this._getApplicationCredentialsFromFilePath(process.env.GSC_TEST_ADC_FILE, options);
};

Gaxios.prototype.request = async function (options) {
  const url = String(options.url);
  let data;
  if (url === 'https://oauth2.googleapis.com/token' || url === 'https://www.googleapis.com/oauth2/v4/token') {
    const body = new URLSearchParams(options.data);
    if (process.env.GSC_TEST_AUTH === 'adc') {
      assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('refresh_token'), 'fake-refresh-token');
    } else {
      assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const payload = JSON.parse(Buffer.from(body.get('assertion').split('.')[1], 'base64url'));
      assert.equal(payload.iss, 'test@example.iam.gserviceaccount.com');
      assert.equal(payload.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
    }
    data = { access_token: 'fake-access-token', token_type: 'Bearer', expires_in: 3600 };
  } else if (url === 'https://searchconsole.googleapis.com/webmasters/v3/sites') {
    const headers = Object.fromEntries(Object.entries(options.headers).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(headers.authorization, 'Bearer fake-access-token');
    if (process.env.GSC_TEST_AUTH === 'adc') {
      assert.equal(headers['x-goog-user-project'], 'test-quota-project');
    }
    data = { siteEntry: [{ siteUrl: 'sc-domain:example.com', permissionLevel: 'siteRestrictedUser' }] };
  } else {
    throw new Error(`Unexpected network request in offline test: ${url}`);
  }
  return { data, status: 200, statusText: 'OK', headers: {}, config: options };
};
