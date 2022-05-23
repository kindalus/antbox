import { build } from "https://deno.land/x/dnt@0.23.0/mod.ts";

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {
    // see JS docs for overview and more options
    deno: true,
  },
  package: {
    // package.json properties
    name: "antbox",
    version: Deno.args[0],
    description: "antbox ecm",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/kindalus/antbox.git",
    },
  },
});

// post build steps
//Deno.copyFileSync("LICENSE", "npm/LICENSE");
//Deno.copyFileSync("README.md", "npm/README.md");
