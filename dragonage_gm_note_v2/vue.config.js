const { defineConfig } = require("@vue/cli-service");

module.exports = defineConfig({
  // GitHub Pages uses a repository subpath; Vercel serves this app at root.
  publicPath:
    process.env.NODE_ENV === "production" && process.env.VERCEL !== "1"
      ? "/GM-note/"
      : "/",
  transpileDependencies: true,
  lintOnSave: false,

  devServer: {
    client: false,
  },
});
