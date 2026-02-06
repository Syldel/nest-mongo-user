const crypto = require('crypto');

// CONFIGURATION
const MASTER_KEY = '---------'; // Must be 64 hex characters
const AGENT_PRIVATE_KEY = '---------';

function encrypt(text, masterKey) {
    const iv = crypto.randomBytes(12);
    const key = Buffer.from(masterKey, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        tag: tag
    };
}

console.log("--- VALUES TO SET IN MONGODB ---");
console.log(
  JSON.stringify(
    {
      $set: {
        agentKey: encrypt(AGENT_PRIVATE_KEY, MASTER_KEY)
      },
    },
    null,
    2
  )
);