import { EncryptionService } from "../src/services/encryption";

// Get encrypted token from command line
const encryptedToken = process.argv[2];

if (!encryptedToken) {
  console.error("Usage: bun run scripts/decrypt-token.ts <encrypted_token>");
  process.exit(1);
}

if (!process.env.EMAIL_ENCRYPTION_KEY) {
  console.error("Error: EMAIL_ENCRYPTION_KEY environment variable is required");
  process.exit(1);
}

async function decryptToken() {
  try {
    const encryptionService = new EncryptionService(
      process.env.EMAIL_ENCRYPTION_KEY!
    );

    console.log("Decrypting token...\n");

    const decryptedToken = await encryptionService.decrypt(encryptedToken);
    console.log("the decryptedToken", decryptedToken);
    if (!decryptedToken) {
      console.error("Failed to decrypt token");
      process.exit(1);
    }

    console.log("✅ Decrypted Token:");
    console.log("─".repeat(80));
    console.log(decryptedToken);
    console.log("─".repeat(80));
    console.log();

    // Generate curl commands
    console.log("📋 Test Commands:");
    console.log("─".repeat(80));

    console.log("\n1️⃣  Test Gmail API (list messages):");
    console.log(
      `curl -H "Authorization: Bearer ${decryptedToken}" \\\n  "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1"`
    );

    console.log("\n2️⃣  Check token info (scopes):");
    console.log(
      `curl "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${decryptedToken}"`
    );

    console.log("\n3️⃣  Get user profile:");
    console.log(
      `curl -H "Authorization: Bearer ${decryptedToken}" \\\n  "https://www.googleapis.com/oauth2/v2/userinfo"`
    );

    console.log("\n" + "─".repeat(80));
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

decryptToken();
