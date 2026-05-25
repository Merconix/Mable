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

- `latest` tracks the current latest version release.
- `dev` tracks the current `dev` branch image.
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
> The easiest way to get started is with [mise](https://mise.jdx.dev/getting-started.html), it manages node, pnpm, rust, and other tooling.

```bash
mise install    # Install all required tools
mise run setup  # Install dependencies (pnpm install)
mise run dev    # Start the Vite dev server
```

Run `mise tasks` to list all available tasks (build, test, lint, etc.).

To build the app:
```sh
mise run build
```

### Desktop & Mobile (Tauri)

Sable uses [Tauri](https://v2.tauri.app) for native desktop and mobile builds.

```bash
mise run tauri:setup          # Install Rust toolchain + system packages
mise run tauri:setup:macos    # Install Xcode (macOS only)
mise run tauri:setup:windows  # Install VS Build Tools + WebView2 (Windows only)
mise run tauri wry dev        # Dev server with system webview (WebKit/WebView2)
mise run tauri cef build      # Production build with Chromium Embedded Framework
mise run tauri --help         # Any other args pass through to the Tauri CLI
```

When the first argument is `wry` or `cef` and the second is `dev` or `build`, the wrapper injects `--features <runtime>,updater --no-default-features`. Everything else is forwarded to `tauri` as-is.

## Deployment and infrastructure
Deployment workflows and infrastructure details live in
[`infra/README.md`](infra/README.md).
