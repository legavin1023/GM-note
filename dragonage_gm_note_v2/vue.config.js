const { defineConfig } = require("@vue/cli-service");

module.exports = defineConfig({
  publicPath: process.env.NODE_ENV === "production" ? "/GM-note/" : "/",
  transpileDependencies: true,
  lintOnSave: false,

  devServer: {
    client: false,
  },
});
