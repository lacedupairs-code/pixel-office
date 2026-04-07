const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const ctxOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["vscode"]
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(ctxOptions);
    await ctx.watch();
    return;
  }

  await esbuild.build(ctxOptions);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

