# Drupal front-end bundler with SDC support
This is my build/bundler script (depends on esbuild) that I use everyday in my drupal projects.
It has support for:
- CSS/SASS
- Javascript/Typescript
- Watch mode
- Tree shaking/splitting
- Works without drupal but it has some plugin magic for SDC directories

## Why did I create this bundler script
For many years I'be been using tools like gulp and webpack to bundle my SASS and javascript. Over time some of these tools got fewer updates and the compile speed became pretty slow. I then tried out newer tools like vite. Vite is excellent, it has a lof features out of the box and it compiles very fast. But I work on drupal projects on a daily basis that are not headless and need a webserver (lando or ddev for the win) that runs on apache or nginx. So using the build in node server is not an option. You can run vite in library mode but that felt like a step back.

Enter **esbuild**. Vite uses under the hood other bundlers like rollup and esbuild so evenually I landed on the esbuild home page (https://esbuild.github.io/) and I started to give this bundler a spin. What I like the most about esbuild is that it's very easy to use. It supports code splitting, typescript, JSX, ... out of the box and your config file doesn't look like a puzzle (looking at you webpack). So you can get started pretty fast but I needed a few extra things to make it work with my code requirements.

## JS
Esbuild supports typescript, jsx, code splitting, ... by default so a lot configuration is not need.

```
(build.js)
Add your JS/TS entry file to the entryPoints property of the esbuildOptions config file to get started.

My JS entry files are:
- ./src/js/main.js (main js file)
- ./src/js/messages.js (used for the drupal status messages)
```

*TODO: Support for es linting.*

## SASS
SASS is the CSS preprocessor I like to use the most. Esbuild does not have SASS support out of the box but luckily there is a plugin called esbuild-sass-plugin by glromeo (https://github.com/glromeo/esbuild-sass-plugin). It's pretty easy to install and setup. For the moment I do not use any extras like autoprefixer.

```
(build.js)
Add your SASS entry file to the entryPoints property of the esbuildOptions config file to get started.

My SASS entry files are:
- ./src/scss/style.scss (main css file)
- ./src/scss/wysiwyg.scss (wysiwyg css file, used for the editor in Drupal)
- ./src/scss/mail.scss (for the default drupal mails)
```

## Style linting
For CSS linting I use the popular stylelint (https://stylelint.io/). **Create a .stylelintrc.json file in your theme directory and add your config of choice (https://stylelint.io/user-guide/configure/)**. On each development build, all the CSS and SASS files (except for files located in my vendor directory) will be tested by stylelint. I also added stylelint-formatter-pretty (https://www.npmjs.com/package/stylelint-formatter-pretty) to make it look readable/pretty when running in the terminal.

My config file is:

```
.stylelintrc.json

{
  "extends": "stylelint-config-standard-scss",
  "rules": {
    "no-descending-specificity": null,
    "selector-class-pattern": null,
    "scss/at-extend-no-missing-placeholder": null
  },
  "ignoreFiles": ["src/scss/vendor/**/*.scss"]
}
```

## Watch mode
Esbuild has a watch mode but I had trouble making it watch files that are not imported in my entry JS or SASS files. I just wanted to watch all the files and let my bundler rebuild everything if anything changes. In order to do this I used the watch library chokidar (https://github.com/paulmillr/chokidar). Only files that are in a src directory will be watched, this was added in order to prevent compiled files from being watched.

```
(build.js)
Specify which directories you want to watch in the watchDirectories array

My watched directories are:
- ./src (My source directory contains all of my js, ts and sass files)
```

## SDC drupal support
If you don't know what SDC is, I strongly suggest you to read the official documentation (https://www.drupal.org/docs/develop/theming-drupal/using-single-directory-components).

SDC allows us to easily transfer components between drupal sites/themes with the required twig code and assets like javascript and CSS. Since I like to use typescript and SASS I also need to compile these files to JS and CSS files. I don't want to add a builder to each component (that would be total overkill) and I don't want JS files that share the same dependencies to include them on their own. These dependencies need to be split in order to keep the size of the JS files down. I wrote a esbuild plugin that takes care of these things.

### SASS
```
(build.js)
In order to watch and compile SASS files from your SDC components, add the following line to your entryPoints array:

- ./components/**/src/.scss
```

This will make sure that any SASS file that is in a src directory of a SDC component will get compiled and it's output file be placed in the SDC directory of that component. I personally use a prefix c- for my file names to indicate that this is a component.

### JS
```
(build.js)
In order to watch and compile JS/TS files from your SDC components, add the following lines to your entryPoints array:

- ./components/**/js/.js
- ./components/**/js/.ts
```

This will make sure that any JS/TS file that is in a src directory of a SDC component will get compiled and it's output file be placed in the SDC directory of that component. I personally use a prefix c- for my file names to indicate that this is a component. If you want to load the JS file as a module you will need add the following to the info.yml file of your SDC component:

```
example.component.yml
libraryOverrides:
  js:
    exmaple.js: { attributes: { type: module } }
```

*To be continued...*
