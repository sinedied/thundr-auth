const express = require('express');
const restAzure = require("ms-rest-azure");
const adal = require('adal-node');
const crypto = require("crypto");
const { DeviceCodeCredential, DefaultAzureCredential, InteractiveBrowserCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

const azureConstants = require('ms-rest-azure/lib/constants');
const { AzureEnvironment } = restAzure;

const port = process.env.PORT || 3000;
const redirectUrl = (process.env.SERVER_URL || 'http://localhost:3000');// + '/oauth/callback';
const deviceLoginUrl = 'https://microsoft.com/devicelogin';

const getLoginUrl = (state) => `https://login.microsoftonline.com/common/oauth2/authorize?response_type=code&client_id=04b07795-8ddb-461a-bbee-02f9e1bf7b46&redirect_uri=${redirectUrl}&state=${state}&resource=https://management.core.windows.net/&prompt=select_account`;
const getState = () => crypto.randomBytes(10).toString('hex');
const getDeviceCode = (str) => /enter the code (.*?) to authenticate/.exec(str)[1];

// Active auth requests
const activeAuthRequests = {};

// Device code <> auth credentials
const savedCredentials = {};

const app = express();
app.use(express.json());
// app.use('/html', express.static('public'));

// Intercept specific console.log calls to extract device code
const oldConsoleLog = console.log;
const interceptDeviceCode = (cb) => {
  console.log = (...args) => {
    if (args[0].startsWith('To sign in')) {
      cb(getDeviceCode(args[0]));
      console.log = oldConsoleLog;
      return;
    }
    oldConsoleLog(...args);
  };
};

app.get('/login/devicecode2', async (req, res) => {
  console.log('trying to get device code...');
  let authorityUrl = AzureEnvironment.Azure.activeDirectoryEndpointUrl + azureConstants.AAD_COMMON_TENANT;
  let credential = new DeviceCodeCredential({
    tenantId:'common',
    clientId: azureConstants.DEFAULT_ADAL_CLIENT_ID,
    // In this scenario you may also omit this parameter since the default behavior is to log the message to the console
    userPromptCallback: (deviceCodeInfo) => {
      console.log({ deviceCodeInfo });
    },
  });
  // // console.log({ credential });
  // // await credential.getToken([], { authority: authorityUrl });
  // const client = new SecretClient(`https://key-vault-name.vault.azure.net`, credential);
  // await client.getSecret('secret-name');
  // const credential = new DefaultAzureCredential();
  const token = await credential.getToken(AzureEnvironment.Azure.activeDirectoryResourceId + '/.default');
  // console.log({ token });
});

// Login with device code
app.get('/login/devicecode', (req, res) => {
  let deviceCode = null;
  interceptDeviceCode(code => {
    deviceCode = code;
    res.json({
      loginUrl: deviceLoginUrl,
      deviceCode: deviceCode
    });
  });
  restAzure.interactiveLogin((err, credentials) => {
    const creds = {};
    if (err) {
      throw err;
    }

    creds.clientId = credentials.tokenCache._entries[0]._clientId;
    creds.tenantId = credentials.tokenCache._entries[0].tenantId;
    creds.environment = credentials.environment.name;
    creds.managementEndpointUrl = credentials.environment.managementEndpointUrl;
    creds.resourceManagerEndpointUrl = credentials.environment.resourceManagerEndpointUrl;
    creds.token = credentials.tokenCache._entries[0].accessToken;
    creds.expiresOn = credentials.tokenCache._entries[0].expiresOn;
    //creds.raw = credentials;

    console.log(`Received credentials!`);

    if (!deviceCode) {
      throw new Error('No device code');
    }
    savedCredentials[deviceCode] = creds;

    console.log(`Got credentials for device code ${deviceCode}`);
    // res.json(creds);
  });
});

app.get('/login/devicecode/:code', (req, res) => {
  const code = req.params.code.trim();
  console.log(`Requesting creds for ${code}`);

  if (!savedCredentials[code]) {
    return res.sendStatus(404);
  }
  res.json(savedCredentials[code]);
});

app.get('/login/oauth', (req, res) => {
  const state = getState();
  const loginUrl = getLoginUrl(state);
  activeAuthRequests[state] = true;
  res.redirect(loginUrl);
});

// OAuth callback, exchange code for token
// Works only be on root path with localhost as redirectUrl
app.get('/', (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!activeAuthRequests[state]) {
    return res.status(404).send('Not found');
  }
  delete activeAuthRequests[state];

  const replyUrl = redirectUrl;;
  let authorityUrl = AzureEnvironment.Azure.activeDirectoryEndpointUrl + azureConstants.AAD_COMMON_TENANT;
  const context = new adal.AuthenticationContext(authorityUrl, AzureEnvironment.Azure.validateAuthority, new adal.MemoryCache());
  context.acquireTokenWithAuthorizationCode(code, replyUrl, AzureEnvironment.Azure.activeDirectoryResourceId, azureConstants.DEFAULT_ADAL_CLIENT_ID, undefined, (err, creds) => {
    if (err) {
      console.error(err);
      return res.status(400).send(err);
    }

    // Do something with the token
    console.log(creds);

    res.json('Auth success');
  });
});

// Attempt to bypass login page iframe limitations
// app.use('/ms', proxy('login.microsoftonline.com', {
//   https: true,
//   // preserveHostHdr: true,
//   userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
//     delete headers['x-frame-options'] 
//     headers['access-control-allow-origin'] = '*';
//     return headers;
//   }
// }));

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
