import typescript from "rollup-plugin-typescript2";

export default {
  input: "./app.ts",

  plugins: [typescript(/*{ plugin options }*/)],

  output: {
    file: "./app.js",
    format: "esm"
  }
};
