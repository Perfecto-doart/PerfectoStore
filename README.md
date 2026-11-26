# Perfecto's outfit store

Your store site. Once it's set up, GitHub updates it every hour by itself:
products, prices and product images from Jinxxy + Gumroad, and the newest images
from your Discord WIP channel.

## Files

| File | What it is |
|---|---|
| `index.html` | The website |
| `data/products.json` | Product list (rewritten automatically every hour) |
| `data/overrides.json` | Your manual fixes: move a product to another collection, fix its avatar bases, or hide it |
| `data/wip.json` + `wip/` | WIP images copied from Discord (automatic) |
| `scripts/sync.mjs` | The script that pulls everything |
| `.github/workflows/update-store.yml` | Tells GitHub to run the script every hour and publish the site |

---

## Setup (one time, about 15 minutes)

### 1. Upload the files
1. On GitHub, click **+** (top right) → **New repository**.
2. Name it `perfecto-store`, set it to **Public**, and click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Unzip `perfecto-store.zip` on your computer. Open the folder and drag **everything inside it** onto the GitHub page. That includes the `.github` folder, which may be hidden. On Windows, turn on View → Show → Hidden items. On Mac, press Cmd + Shift + . in Finder.
5. Click **Commit changes**.

> If the `.github` folder doesn't upload: click **Add file → Create new file**, type
> `.github/workflows/update-store.yml` as the name, paste in the contents of that file, and commit.

### 2. Turn on the website
**Settings → Pages →** under *Build and deployment*, set **Source** to **GitHub Actions**.

### 3. Make new keys (important)
The keys you pasted into the chat earlier are no longer safe. Make new ones:
- **Jinxxy:** go to Creator Dashboard → API Keys, delete the old key, and create a new one with the **products_read** permission.
- **Gumroad:** go to Settings → Advanced → your application and generate a new access token.

### 4. Make the Discord bot
1. Go to https://discord.com/developers/applications → **New Application** and name it something like "Store WIP".
2. **Bot** tab → **Reset Token** → copy the token.
3. Still on the Bot tab, turn on **Message Content Intent** and click Save. (The bot needs this to see images in messages.)
4. **OAuth2 → URL Generator** → tick **bot**, then under permissions tick **View Channels** and **Read Message History**. Open the link it gives you and add the bot to your server.
5. In your server, make sure the bot can see your WIP channel.
6. Get the channel ID: in Discord, go to User Settings → Advanced → turn on **Developer Mode**. Then right-click your WIP channel → **Copy Channel ID**.

### 5. Add the 4 secrets
In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add each of these:

| Name | Value |
|---|---|
| `JINXXY_API_KEY` | your new Jinxxy key |
| `GUMROAD_TOKEN` | your new Gumroad access token |
| `DISCORD_BOT_TOKEN` | the bot token from step 4 |
| `DISCORD_CHANNEL_ID` | the WIP channel ID |

### 6. Run it
**Actions** tab → **Update store** → **Run workflow**. Once it's green, your site is live at
`https://YOUR-USERNAME.github.io/perfecto-store/`.

After that, it runs every hour by itself. If a run turns red, click it and open
**"Pull products and WIP images"** to see the error. Even then, the site stays up with the last good data.

---

## Everyday changes

**A product landed in the wrong collection, has the wrong avatar list, or should be hidden.**
Edit `data/overrides.json` on GitHub (pencil icon) and use the product's name as shown on the site:

```json
{
  "Brooklyn Sweater Meme Outfit For Novabeast": { "collection": "winter" },
  "Nurse Outfit For Winterpaw Male & Female": { "bases": ["Winterpaw"] },
  "Some Old Product": { "hide": true }
}
```

Collections you can use: `winter christmas valentine summer yoga halloween school sports wrestler robin nurse pride goth anime special fx`

**Coupon code box:** edit `data/coupons.json`. Each code hides itself after its `ends` date. To show no code, make the file `[]`.

```json
[{ "code": "BLACKFRIDAY2026", "title": "Black Friday sale", "details": "Use this code at checkout on Jinxxy or Gumroad.", "ends": "2026-11-30" }]
```

**Avatar icons (left side):** upload square pictures to `images/avatars/`, named after the avatar in lowercase with dashes,
for example `winterpaw.png`, `novabeast.png`, `shawn-the-shark.png`. Until a picture exists, the avatar's initials show instead.

**Avatars with more than one name:** in `index.html`, edit `GROUPS`. For example, Winterpaw already covers MascCanine, Femcanine and Feline.

**Season dates:** in `index.html`, edit `SEASONS` (format: start month-day, end month-day).

**Microgramma font:** the site uses Microgramma Extd D if it can find it, and Michroma (a free look-alike) until then.
Upload your licensed font file to a `fonts/` folder named `microgramma.woff2`, `microgramma.otf` or `microgramma.ttf`.

**Logo:** `images/logo.png` (white on transparent). The site fills it with the holo gradient automatically.
