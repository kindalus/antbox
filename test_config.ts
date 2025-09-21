import { parse } from "https://deno.land/std@0.208.0/toml/mod.ts";
import type { ServerConfiguration } from "./src/api/http_server_configuration.ts";

interface TomlConfiguration {
  engine: string;
  port?: number;
  tenants: Array<{
    name: string;
    rootPasswd?: string;
    key?: string;
    jwk?: string;
    storage?: [string, ...string[]];
    repository?: [string, ...string[]];
  }>;
}

async function testConfigurationLoading() {
  console.log("🧪 Testing configuration loading...\n");

  const configs = [
    "./.config/antbox.toml",
    "./.config/demo.toml",
    "./.config/sandbox.toml",
  ];

  for (const configPath of configs) {
    try {
      console.log(`📄 Loading: ${configPath}`);

      const configText = await Deno.readTextFile(configPath);
      const tomlConfig = parse(configText) as TomlConfiguration;

      const config: ServerConfiguration = {
        port: tomlConfig.port || 7180,
        engine: tomlConfig.engine,
        tenants: tomlConfig.tenants.map((tenant) => ({
          name: tenant.name,
          rootPasswd: tenant.rootPasswd,
          symmetricKey: tenant.key,
          jwkPath: tenant.jwk,
          storage: tenant.storage,
          repository: tenant.repository,
        })),
      };

      console.log(`✅ Engine: ${config.engine}`);
      console.log(`✅ Port: ${config.port}`);
      console.log(`✅ Tenants: ${config.tenants.length}`);

      config.tenants.forEach((tenant, index) => {
        console.log(`   ${index + 1}. ${tenant.name}`);
        console.log(`      - Root password: ${tenant.rootPasswd ? "✓" : "✗"}`);
        console.log(
          `      - Symmetric key: ${tenant.symmetricKey ? "✓" : "✗"}`,
        );
        console.log(`      - JWK path: ${tenant.jwkPath || "default"}`);
        console.log(
          `      - Storage: ${tenant.storage ? tenant.storage[0] : "default"}`,
        );
        console.log(
          `      - Repository: ${
            tenant.repository ? tenant.repository[0] : "default"
          }`,
        );
      });

      console.log("");
    } catch (error) {
      console.error(`❌ Failed to load ${configPath}:`);
      console.error(`   ${error.message}\n`);
    }
  }

  console.log("🔑 Testing key files...");

  const keyFiles = [
    "./.config/antbox.key",
    "./.config/antbox.jwk",
  ];

  for (const keyFile of keyFiles) {
    try {
      const content = await Deno.readTextFile(keyFile);
      console.log(`✅ ${keyFile}: ${content.length} characters`);

      if (keyFile.endsWith(".jwk")) {
        const jwk = JSON.parse(content);
        console.log(`   JWK type: ${jwk.kty}, curve: ${jwk.crv || "N/A"}`);
      }
    } catch (error) {
      console.error(`❌ Failed to read ${keyFile}: ${error.message}`);
    }
  }

  console.log("\n🎯 Configuration test completed!");
}

if (import.meta.main) {
  testConfigurationLoading();
}
