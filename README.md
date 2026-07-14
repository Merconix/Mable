# Mable

A Matrix client built to enhance the user experience with quality-of-life features, cosmetics, utilities, and sheer usability. See the [changelog](https://github.com/Merconix/Mable/blob/dev/CHANGELOG.md).

This fork is a customised version of the [Sable project](https://github.com/sablecient/sable) to stay on more stable builds for longer and apply personalized tweaks, mostly style related.
Sable is originally forked from the more stable but less feature-packed [Cinny](https://github.com/cinnyapp/cinny/), so feel free to check either out as they might better suit your needs.

## Getting started
The web app is available [here](https://merconix.com/mable) and gets updated whenever future releases have new features I'm interested in and are deemed stable.

Electron-based desktop apps can be downloaded [here](https://github.com/Merconix/Mable-Electron/releases). They auto-update by pulling the website.

## Self-hosting
These steps are primarily here for my own reference, but you can follow them to host your own instance if you really want:
To build and serve Sable yourself with nginx, clone this repo and build it:

```sh
pnpm i # Installs all dependencies
pnpm run build # Compiles the app into the dist/ directory
```

After that, you can copy the dist/ directory to your server and serve it.

* In the [`config.json`](config.json), you can modify the default homeservers, feature rooms/spaces, toggle the account switcher, and toggle experimental simplified slilding sync support.

* To deploy on subdirectory, you need to rebuild the app youself after updating the `base` path in [`build.config.ts`](build.config.ts).
    * For example, if you want to deploy on `https://sable.moe/app`, then set `base: '/app'`.
    * This is set to default to /mable in this branch
* Running on a subdirectory using Apache has given me some problems with refreshing the page leading to 404 errors, whilst not a total fix, the following rewrite rules have fixed the majority of those problems by redirecting back to the root url
```
RewriteEngine On
RewriteRule (mable/)(.+).com$ "/mable" [R]
RewriteRule (mable/home/)$ "/mable" [R]
`````

#### Optional default client settings

While the default settings are recommended for most users, you can optionally add a top-level `"settingsDefaults"` object whose keys match [client settings](src/app/state/settings.ts) (only fields you want to override) to override them. The default settings for any new logins will match these. Existing keys in local storage or users who chose to sync settings with their account data will still have their settings set.

For example:

```json
{
  "settingsDefaults": {
    "hour24Clock": true,
    "pageZoom": 110,
    "messageLayout": 2,
    "rightSwipeAction": "members",
    "captionPosition": "below",
    "renderUserCards": "both",
    "jumboEmojiSize": "large"
  }
}
```

Invalid or unknown keys are ignored.

## Local development
> [!TIP]
> We recommend using a version manager as versions change quickly. [fnm](https://github.com/Schniz/fnm) is a great cross-platform option (Windows, macOS, and Linux). [NVM on Windows](https://github.com/coreybutler/nvm-windows#installation--upgrades) and [nvm](https://github.com/nvm-sh/nvm) on Linux/macOS are also good choices. Use the version defined in [`.node-version`](.node-version).

Execute the following commands to start a development server:
```sh
fnm use --corepack-enabled # Activates the Node version and enables corepack
# If you not using fnm, install corepack manually: npm install --global corepack@latest
corepack install # Installs the pnpm version specified in package.json
pnpm i # Installs all dependencies
pnpm run dev # Serve a development version
```

To build the app:
```sh
pnpm run build # Compiles the app into the dist/ directory
```

## Deployment and infrastructure
Deployment workflows and infrastructure details live in
[`infra/README.md`](infra/README.md).
