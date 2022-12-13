const { DefaultAzureCredential, DeviceCodeCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

// Azure CLI client ID
const azureDefaultClientId = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';

// Example 1 - Use best option available (recommended)
// ----------------------------------------------------------------
async function loginWithDefaut() {
  let credential = new DefaultAzureCredential();

  // Create client to any Azure lib
  const client = new SecretClient(`https://key-vault-name.vault.azure.net`, credential);
  // Do something with the client...
}

// Example 2 - Use device code
// ----------------------------------------------------------------

function loginWithDeviceCode() {
  let credential = new DeviceCodeCredential({
    tenantId:'common',
    clientId: azureDefaultClientId,
    // In this scenario you may also omit this parameter since the default behavior is to log the message to the console
    userPromptCallback: (deviceCodeInfo) => {
      // Get the device code
      console.log({ deviceCodeInfo });
    },
  });

  // Create client to any Azure lib
  const client = new SecretClient(`https://key-vault-name.vault.azure.net`, credential);
  // Do something with the client...
}

loginWithDefaut();

