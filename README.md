# Web Extend test shop

A tiny static shop for testing SAP Engagement Cloud Enterprise Edition **Web Extend**
tracking. Plain HTML, CSS and vanilla JavaScript: no frameworks, no npm packages,
no backend, no database. All data is synthetic. There are no API keys, no external
scripts and no payment step.

## Run it locally

The shop loads `data/products.json` with `fetch`, which browsers block on `file://`
URLs, so serve the folder over HTTP. Any static server works. The simplest one
ships with macOS:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080/>.

## Pages

| File | Purpose | Web Extend commands (besides the common ones) |
| --- | --- | --- |
| `index.html` | Homepage: hero, sale promo, category tiles, carousels (trending, on sale, new, recently viewed, picked for you when logged in) | `recommend` per carousel |
| `category.html?cat=Hardware` | Category listing with sorting; `?cat=Sale` lists discounted items | `category` |
| `category.html?q=merino` | Search results | `searchTerm` |
| `product.html?id=000000000010010563` | Product detail with sale price, stock note and 3 carousels (alternatives, also bought, recently viewed) | `view`, `recommend` |
| `cart.html` | Cart with quantity changes and a "you might also like" carousel | `recommend` |
| `checkout.html` | Checkout form (fake data) | – |
| `confirmation.html` | Order confirmation | `purchase` |
| `login.html` | Simulated customer login | `setCustomerId` (from the next page on) |

Every page sends, in this order: `testMode` (if enabled), `businessAreaId`,
`setCustomerId` (if logged in), page-specific commands, `recommend` (one per carousel), `cart`, `tag`, `go`.
Adding to cart or changing quantities re-sends `cart` + `go` without a page load.

## Test scenarios built into the data

- **Prices are synthetic**: the source list has list price 0, so prices, sale prices, stock levels and popularity were invented. Item IDs, names and categories come from the list (sold out = `Available: FALSE`).
- **Sale items** (4 products): `price` is the list price, `salePrice` is what the cart and `cart`/`purchase` payloads use.
- **Low stock** (`000000000010010376`, `000000000011010545`) and **sold out** (`000000000010010163`, `000000000010010283`, `000000000010010645`; add-to-cart disabled).
- **Recommendation slots**: carousels are labelled `slot · RELATED`, `ALSO_BOUGHT`, `POPULAR`, `DEALS`, `NEW`, `VIEWED`, `PERSONAL`, `CART`.
  They are filled by simple local rules (see `pages.js`) and mark where SAP recommendations would go.
  `recommend` and `searchTerm` are extras beyond the nine required commands; verify their exact names and options for your tenant.
- **Recently viewed** is stored in localStorage and shown on the homepage and PDP.
- **Personalisation**: logging in as a test customer adds a "Picked for you" carousel to the homepage. Add more customers in `js/store.js` once their contacts exist in the tenant (each needs a real CD ID). The five customers in `js/store.js` match the test contacts in the tenant (NL01); only their CD ID is sent.

## Project layout

```
data/products.json    20 products from the CGM catalog list (item ID = Material number)
css/styles.css        styling, including the debug console
js/web-extend.js      the Web Extend adapter + the SAP configuration section
js/debug-console.js   visible debug console (log persists across pages per tab)
js/store.js           products, cart, session (localStorage)
js/pages.js           per-page logic and the tracking sequence
```

## Web Extend adapter

`js/web-extend.js` exposes `WebExtend.category`, `view`, `cart`, `purchase`,
`setCustomerId`, `businessAreaId`, `tag`, `testMode` and `go`. For now each one
only writes its command and payload to the debug console.

All SAP settings live in the block marked **SAP TRACKING CONFIGURATION** at the top
of that file (merchant ID, business area ID, test mode, forwarding switch). The values
are placeholders; do not commit real IDs.

Direct route (no GTM): with `loadScarabScript: true` the adapter injects SAP's
`scarab-v2.js` loader for your merchant ID (the snippet from the Emarsys consultant),
and with `forwardToScarabQueue: true` every command is also pushed onto `window.ScarabQueue`.
`recommend` is never forwarded (`notForwarded`), because the carousels are filled locally.
Set both flags to `false` to go back to console-only. Use either this route or the GTM route
below, not both, otherwise events are sent twice.

Check the command names and payloads against your tenant's Web Extend documentation,
in particular `businessAreaId`, which is modelled here as a plain command.

## Connecting via GTM (option B)

With `gtm.enabled: true` in the configuration block of `js/web-extend.js`, the adapter:

1. pushes `{ event: 'webextend_init', we_merchantId, we_businessAreaId, we_testMode }` onto `window.dataLayer`,
2. loads the GTM container (`gtm.containerId`) from JavaScript, so there is no snippet to paste into each page,
3. pushes one event per command: `{ event: 'webextend_command', we_command: 'view', we_payload_json: '"000000000010010563"' }`.

`we_payload_json` is a JSON string on purpose, because GTM merges nested objects between pushes.
Commands are still written to the debug console too.

In GTM, a typical setup is:

- Data Layer Variables: `we_command`, `we_payload_json`, `we_merchantId`.
- A Custom HTML tag that loads the SAP Web Extend script with the merchant ID (take the loader from your SAP tenant).
- A Custom HTML tag on the Custom Event trigger `webextend_command` that does
  `ScarabQueue.push([cmd, payload])` with `cmd = {{we_command}}` and `payload = JSON.parse({{we_payload_json}})` (skip the payload when it is empty).

Test with GTM Preview (Tag Assistant) and the debug console side by side. Set `gtm.enabled: false` to go back to console-only.

## Test checklist

1. Open the home page. Console shows `testMode`, `businessAreaId`, `cart []`, `tag "page:home"`, `go`.
2. Click a category pill. `category "Hardware"` appears before `go`.
3. Open a product. `view "000000000010010563"` appears.
4. Click **Add to cart**. A fresh `cart [...]` + `go` pair appears.
5. Open **Log in**, choose a customer, submit. On the next page `setCustomerId "CD4709951471"` (the CD ID of Sanne de Vries, customer 1) appears.
6. Open the cart, change quantities, check the `cart` payload follows.
7. Check out with the pre-filled fake data. The confirmation page logs `purchase` with the `TEST-...` order ID. Reloading it logs "purchase skipped" instead of a duplicate.
8. Use **Clear** and **Collapse** on the console as needed.

To reset everything, clear the site's localStorage in your browser's developer tools.
