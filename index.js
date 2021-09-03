const express = require('express');
const restAzure = require("ms-rest-azure");
const crypto = require("crypto");

const port = process.env.PORT || 3000;
const apiPrefix = '/api';
const redirectUrl = process.env.SERVER_URL || 'http://localhost:3000/oauth/callback'
const deviceLoginUrl = 'https://microsoft.com/devicelogin';

const getLoginUrl = (state) => `https://login.microsoftonline.com/common/oauth2/authorize?response_type=code&client_id=04b07795-8ddb-461a-bbee-02f9e1bf7b46&redirect_uri=${redirectUrl}&state=${state}=https://management.core.windows.net/&prompt=select_account`;
const getState = () => crypto.randomBytes(10).toString('hex');
const getDeviceCode = (str) => /enter the code (.*?) to authenticate/.exec(str)[1];

// Device code <> auth credentials
const savedCredentials = {};

const app = express();
app.use(express.json());

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

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
