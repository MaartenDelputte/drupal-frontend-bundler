import esbuild from "esbuild";
import { sassPlugin } from "esbuild-sass-plugin";
import fs from "fs-extra";
import chokidar from "chokidar";
import stylelint from "stylelint";
import stylelintFormatter from "stylelint-formatter-pretty";
import chalk from "chalk";
import { replaceInFile } from "replace-in-file";
import { glob } from "glob";
import YAML from "yaml";

// Set defaults
const watch = process.argv.includes("--watch");
const outdir = "dist";
const srcDir = "src";
const componentsDir = "components";
const watchDirectories = [
  srcDir,
  componentsDir
];

// Move generated CSS ans JS files from dist back to component directory
const SDCmoveFilesPlugin = {
  name: 'SDCmoveFilesPlugin',
  setup(build) {
    build.onEnd(async result => {
      // Get all output files
      const outputFiles = Object.entries(result.metafile.outputs);

      // Loop through all output files and catch all the promises
      await Promise.all(outputFiles.map(async ([fileItem, fileObject]) => {
        // Get the file path
        const filePath = fileObject.entryPoint;

        // Check if there is a file path and if it is in the components directory
        if (filePath && filePath.startsWith(`${componentsDir}/`)) {
          // Check if the file is a SASS or JS file
          const isSass = filePath.includes(".scss");
          const isJS = filePath.includes(".js") || filePath.includes(".ts");

          // If it is a SASS or JS file
          if (isSass || isJS) {
            // Get the destination path to move the file to
            const destinationPath = filePath.replace(".scss", ".css").replace(".ts", ".js").replace(`/${srcDir}`, "");

            // If it is a JS file, replace the import paths
            if (isJS) {
              const options = {
                files: fileItem,
                from: [/\.\/chunk/g, /import\(".\//g],
                to: [`./../../dist/js/chunk`, `import("./../../dist/js/`],
              };
              await replaceInFile(options);
            }

            // Move the file to the destination path
            await fs.move(fileItem, destinationPath, { overwrite: true });
            // If watching, also move the .map file
            if (watch) {
              await fs.move(`${fileItem}.map`, `${destinationPath}.map`, { overwrite: true });
            }
          }
        }
      }));
    });
  },
};

// https://esbuild.github.io/getting-started/#build-scripts
// Set esbuild options
const esbuildOptions = {
  entryPoints: [
    `./${srcDir}/scss/style.scss`,
    `./${srcDir}/scss/wysiwyg.scss`,
    `./${srcDir}/js/main.js`,
    `./${srcDir}/js/messages.js`,
    `./${srcDir}/scss/mail.scss`,
    `./${componentsDir}/**/${srcDir}/c-*.scss`,
    `./${componentsDir}/**/${srcDir}/c-*.js`
  ],
  logLevel: "info",
  outdir: outdir,
  outbase: outdir,
  entryNames: "[ext]/[name]",
  chunkNames: "[ext]/[name]-[hash]",
  minify: !watch,
  sourcemap: watch,
  target: "esnext",
  bundle: true,
  format: "esm",
  splitting: true,
  metafile: true,
  external: [
    "*.svg",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.png",
    "*.json",
    "*.eot",
    "*.ttf",
    "*.woff",
    "*.woff2",
    "./fonts/*"
  ],
  plugins: [
    sassPlugin(),
    SDCmoveFilesPlugin
  ]
}

// Clean output directory
const cleanUp = async () => {
  try {
    // Remove all files in the output directory
    await fs.emptyDir(outdir);

    // Remove generated CSS and JS files from the components directory
    const files = await glob([`${componentsDir}/*/c-*.css`, `${componentsDir}/*/c-*.js`, `${componentsDir}/*/c-*.css.map`, `${componentsDir}/*/c-*.js.map`]);
    // If there are files
    if (files.length === 0) return;
    // Loop through all files and remove them
    await Promise.all(files.map(async (file) => {
      await fs.remove(file);
    }));
  } catch (error) {
    // Log error
    console.error(chalk.red(`Error cleaning up directory: ${error.message}`));
  }
};

// Stylelint
const lintCss = async () => {
  try {
    // Lint the CSS
    const { report } = await stylelint.lint({
      files: [`${srcDir}/scss/**/*.scss`, `${componentsDir}/**/${srcDir}/*.scss`],
      formatter: stylelintFormatter
    });
    // Log the report
    if(report !== "") console.log(report);
  } catch (error) {
    // Log error
    console.error(chalk.red(`Error linting CSS: ${error.message}`));
  }
};

// Copy any vendor css from the components to the shared dist map, cleaner instead of using node_modules directly
const copyVendorCss = async () => {
  try {
    // Get all yml files in the components directory
    const ymlFiles = await glob(`${componentsDir}/**/*.yml`);

    // Loop through all yml files and catch all the promises
    await Promise.all(ymlFiles.map(async (ymlFile) => {
      // Read the yml file
      const file = await fs.readFile(ymlFile, 'utf8');
      // Parse the yml file
      const ymlData = YAML.parse(file);

      // If there is vendor CSS
      if (ymlData.vendorCss) {
        // Copy the vendor CSS files
        await Promise.all(Object.keys(ymlData.vendorCss).map(async (vendorFile) => {
          await fs.copy(vendorFile, `${outdir}/css/vendor/${vendorFile.split('/').pop()}`);
        }));
      }
    }));
  } catch (error) {
    // Log error
    console.error(chalk.red(`Error copying vendor CSS: ${error.message}`));
  }
};

(async () => {
  // Clean up
  await cleanUp();
  // Copy vendor css files from components
  await copyVendorCss();

  // If watch is active
  if (watch) {
    try {
      // Build the result for the first time
      await esbuild.build(esbuildOptions);
      // Build the context, needed for incremental updates
      const ctx = await esbuild.context(esbuildOptions);

      // If there is a result
      if (ctx) {
        // Log watch start message
        console.log(chalk.green("🚀 Watch has started"));
        // Watch the files
        const watcher = chokidar.watch(watchDirectories, {
          ignored: (path, stats) => stats?.isFile() && !path.includes('src/'),
          ignoreInitial: true
        });

        watcher.on("all", async (event, path) => {
          // Clean
          await cleanUp();
          // Copy vendor css files from components
          await copyVendorCss();

          // Log action
          console.log(chalk.white(`🔨 ${event} - ${path}`));

          // Lint CSS if a SASS file has changed
          if (path.includes(".scss")) {
            await lintCss();
          }

          // Return build result
          return await ctx.rebuild();
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error during build: ${error.message}`));
      process.exit(1);
    }
  } else {
    // Build the result
    try {
      await esbuild.build(esbuildOptions);
    } catch (error) {
      console.error(chalk.red(`Error during build: ${error.message}`));
      process.exit(1);
    }
  }
})();
