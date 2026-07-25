# Bottle images: Pixabay setup

Everything needed to switch on image search in the wine form. All of it can be
done from a phone browser — **no terminal, no Mac, no wrangler**.

Budget about 15 minutes. Two free accounts, one copy-paste, one URL.

---

## Read this first: what Pixabay will and will not give you

Pixabay is a **free stock-photography library**. It has no idea what
Château Meyney 2019 looks like.

Searching for a wine returns generic wine photography — a bottle on a table, a
vineyard at sunset, a glass beside some grapes. It does **not** return the
actual label of a specific producer and vintage. For a collection of 125
individually identifiable fine wines, most results will be decorative rather
than accurate, and some will be plainly wrong (a Bordeaux château illustrated
with a photo of a Chianti bottle).

So it's worth being clear about which of these you want:

| Goal | Pixabay delivers it? |
| --- | --- |
| Warmer, less text-heavy screens; something to look at | **Yes** |
| The real label of *your* bottle | **No** |

If the goal is real labels, the honest answer is that no free API provides
them. Vivino and Wine-Searcher have the data but no open API. The approach
that actually works is photographing your own bottles — see
[The alternative worth considering](#the-alternative-worth-considering) at the
end.

Pixabay is still worth switching on: the form lets you **pick** from the
results rather than auto-assigning, so you keep whatever looks right and skip
the rest. Just go in expecting mood, not accuracy.

---

## Part A — Pixabay API key (about 3 minutes)

1. Go to **<https://pixabay.com/accounts/register/>** and create a free
   account. Email and password only; no card.
2. Confirm the email if prompted.
3. While logged in, open **<https://pixabay.com/api/docs/>**.
4. Near the top of that page, under *Search Images*, your personal API key is
   shown in a box — a long string of letters and numbers, something like
   `12345678-abcdef1234567890abcdef123`.
5. Copy it. Treat it like a password.

**Gotcha:** the key is only visible on that docs page *while logged in*. If it
looks like documentation with no key in it, you are logged out.

---

## Part B — Cloudflare Worker (about 10 minutes)

The worker is a tiny proxy. It exists so the API key lives on a server instead
of being baked into the app where anyone could read it. Cloudflare's free tier
covers 100,000 requests a day; this app will use a handful.

1. Create a free account at **<https://dash.cloudflare.com/sign-up>**. No card
   required for the Workers free plan.
2. In the dashboard sidebar, open **Compute** → **Workers & Pages**
   (older accounts show it as just *Workers & Pages*).
3. Click **Create** → **Start with Hello World!** → **Deploy**.
   - Name it `wine-image-search`.
   - You are deploying the placeholder first; the real code goes in next.
4. Once deployed, click **Edit code** (or *</> Edit code*).
5. Select everything in the editor and delete it, then paste the entire
   contents of **`wine-image-worker/dashboard-worker.js`** from this repo.
6. Click **Deploy** in the editor.
7. Go back to the worker's page → **Settings** → **Variables and Secrets**
   (may appear as *Variables* on older dashboards).
8. Add a **Secret** — not a plain-text variable:
   - Name: `PIXABAY_API_KEY` (exactly this, case-sensitive)
   - Value: the key from Part A
   - Save, then **Deploy** again if prompted.
9. Find the worker's URL on its overview page. It looks like
   `https://wine-image-search.<your-account>.workers.dev`.

### Test it before going any further

Open this in your phone browser, replacing the first part with your URL:

```
https://wine-image-search.<your-account>.workers.dev/?q=bordeaux
```

| What you see | What it means |
| --- | --- |
| `{"images":[{"url":"https://pixabay.com/...` | Working. Copy the URL and you're done. |
| `{"error":"PIXABAY_API_KEY not configured"}` | The secret is missing, misnamed, or you didn't redeploy after adding it. Check the spelling exactly. |
| `{"error":"Missing query parameter"}` | The worker is alive but you left off `?q=bordeaux`. |
| `{"error":"Search API error","status":400}` | The key was pasted wrong — a stray space or a truncated copy. |
| Cloudflare error page | The paste didn't deploy. Re-open *Edit code* and check the whole file is there. |

**Do not skip this test.** It separates "the worker is broken" from "the app is
broken", which is the thing that makes API setups painful when it goes wrong.

---

## Part C — hand the URL over

Send me the worker URL and I'll do the rest: wire it into the build, deploy,
and confirm image search works end to end on the live site.

You do not need to edit any file yourself. In particular **do not** just put
the URL in `wine-app/.env` and expect it to work — see the first gotcha below.

---

## Gotchas

**The `.env` file is a trap.** `wine-app/.env` contains
`VITE_IMAGE_WORKER_URL=` and is committed to the repo. Vite bakes that value in
**at build time**, and the build that reaches your phone is produced by GitHub
Actions, not by your machine. Setting it locally changes nothing for the
deployed app. It needs to be set where CI can see it — which is my side of the
job, and why Part C exists.

**The key would be public if we skipped the worker.** Anything in a Vite
`VITE_*` variable ends up readable in the shipped JavaScript. That's the entire
reason for the proxy — the app calls the worker, the worker calls Pixabay.

**Images come from Pixabay's servers, not ours.** Two consequences: they need a
network connection, so they won't appear when the PWA is offline; and the app
stores the Pixabay URL permanently against each wine. If Pixabay ever moves or
removes an image, that wine silently loses its picture. Worth a glance at
Pixabay's API terms regarding caching versus hotlinking before you lean on it
heavily.

**Your cards will get taller again.** Empty image placeholders were removed
recently, which roughly halved the scroll length of the cellar grid. Every wine
that gains an image gets that height back. If it feels long once images start
appearing, say so and I'll switch the grid to a smaller thumbnail treatment.

**Search results are chosen, not automatic.** Nothing is assigned to a wine
until you pick it in the form — hold the wine, tap *Search*, choose a
thumbnail. Nothing happens to your 125 wines just because the worker exists.

**Free tier limits.** Cloudflare: 100,000 requests/day. Pixabay: 100 requests
per 60 seconds. Neither is reachable by one person tagging bottles.

**Cloudflare renames things.** The dashboard's menu labels shift every few
months. If *Variables and Secrets* isn't where this says, look for anything
named Variables, Secrets, or Environment under the worker's Settings — the
concept is stable even when the wording isn't.

---

## The alternative worth considering

If what you actually want is the real label on the real bottle, the reliable
route is your own camera. You already carry the collection in your pocket.

The wine form has an image field, so this needs only a small change: an
*upload / take photo* button that stores the picture on the device alongside
the wine, instead of a remote URL. That would give you:

- the genuine label of your genuine bottle, correct vintage and all
- images that work offline, since nothing is fetched from the internet
- no API key, no account, no third party, nothing to expire

The cost is effort: 125 photographs is a chore in one sitting. But it doesn't
have to be one sitting — snap a bottle when it comes home in a delivery, or
when you open it. The collection fills in as you use it, which is roughly how
the drinking log will work too.

The two aren't exclusive. Pixabay can carry the mood now, and the camera can
replace it wine by wine. Say the word and I'll build the upload path.
