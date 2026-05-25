# Mable

A Matrix client built to enhance the user experience with quality-of-life features, cosmetics, utilities, and sheer usability. See the [changelog](https://github.com/Merconix/Mable/blob/dev/CHANGELOG.md).

This fork is a customised version of the [Sable project](https://github.com/sablecient/sable) to stay on more stable builds for longer, and apply personalized tweaks, mostly style related.
Sable is originally forked from [Cinny](https://github.com/cinnyapp/cinny/), so feel free to check either out as they might better suit your needs.

## Getting started
The web app is available [here](https://merconix.com/mable) and gets updated whenever future releases have new features I'm interested in and are deemed stable.

Electron-based desktop apps can be downloaded [here](https://github.com/Merconix/Mable-Electron/releases). They auto-update by pulling the website.

## Self-hosting
There are a few options for self hosting, but I do not maintain them, so you are best off using Cinny/Sable for that - The instructions below generally work for them as well so are kept here for reference:
1. Run the prebuilt docker container.
2. Deploy on a site like GitLab Pages. Jae has a [guide here](https://docs.j4.lc/Tutorials/Deploying-Sable-on-GitLab-Pages).
3. Build it yourself.

### Docker

Prebuilt images are published to `ghcr.io/sableclient/sable`.

- `latest` tracks the current `dev` branch image.
- `X.Y.Z` tags are versioned releases.
- `X.Y` tags float within a release line.
- Pushes to `dev` also publish a short commit SHA tag.

Run the latest image with:

```sh
docker run --rm -p 8080:8080 ghcr.io/sableclient/sable:latest
```

Then open `http://localhost:8080`.

If you want to override the bundled [`config.json`](config.json), mount your own
file at `/app/config.json`:

```yaml
services:
  sable:
    image: ghcr.io/sableclient/sable:latest
    ports:
      - '8080:8080'
    volumes:
      - ./config.json:/app/config.json:ro
```

### Build it yourself

To build and serve Sable yourself with nginx, clone this repo and build it:

```sh
pnpm i # Installs all dependencies
pnpm run build # Compiles the app into the dist/ directory
```

After that, you can copy the dist/ directory to your server and serve it.

* In the [`config.json`](config.json), you can modify the default homeservers, feature rooms/spaces, toggle the account switcher, and toggle experimental simplified slilding sync support.

* To deploy on subdirectory, you need to rebuild the app youself after updating the `base` path in [`build.config.ts`](build.config.ts).
    * For example, if you want to deploy on `https://sable.moe/app`, then set `base: '/app'`.

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
