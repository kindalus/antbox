const source = new URL("./antbox.d.ts", import.meta.url);
const target = new URL("../antbox.d.ts", import.meta.url);

await Deno.copyFile(source, target);
console.log(`Generated ${target.pathname}`);
