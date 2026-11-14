---
layout: page
title: Zeffy Sponsorship Payments for an Event
permalink: /documentation/zeffysponsorship/
---

This page shows how to take sponsorship payments through Zeffy, with a Become a sponsor button and the Zeffy form embedded in the event page.

Sponsorship payment is part of the newer [event layouts](/documentation/eventlayouts/). Your event needs `eventlayout` set to `poster`, `rail` or `tabs` for it to show.

## How to set it up

1. In Zeffy, create a form for your sponsorship levels. Keep it separate from your registration form.
2. Open the form and select **Share**, then **More ways to share**, then **Embed**. Zeffy's menus change from time to time; you are looking for the embed code for the form.
3. In the embed code, find the address that starts with `https://www.zeffy.com` and contains `/embed/`.
4. In your event's data file in `_data/events/`, set these two keys:

```yaml
sponsorpaymenttype: zeffy
sponsorpaymenturl: https://www.zeffy.com/embed/ticketing/your-sponsorship-form
```

5. Submit a pull request as usual. See [how to submit a PR](/submitpr/).

## What sponsors see

- A Become a sponsor button near the top of the page and again under the sponsor logos.
- The button jumps to the Zeffy form, which sits under your sponsorship plan.
- Your sponsorship plan (`sponsorplan`) stays on the page, inside Show the full sponsorship plan.

## FAQ

**Which Zeffy address do I use?**
The embed address, the one with `/embed/` in it.

**I do not use Zeffy. Can the button link somewhere else?**
Yes. Leave `sponsorpaymenttype` blank and put your link in `sponsorpaymenturl`. The button opens it in a new tab.

**What happens if I leave `sponsorpaymenturl` blank?**
The Become a sponsor button jumps to your sponsorship plan. If there is no sponsorship plan either, the button is not shown.

**Why is the button or form not showing?**
- The event must use one of the newer layouts. The classic event page does not have the Become a sponsor button.
- `sponsorpaymenttype` is spelled `zeffy`, in lower case.
- `sponsorpaymenturl` is the embed address and the form is published in Zeffy.

**How do sponsor logos get on the page?**
That has not changed. Add each sponsor under `sponsors` with its `type`, `image` and `link`. The logo opens the sponsor's site in a new tab.

**Can I use Zeffy for both registration and sponsorship?**
Yes. They are two forms and two sets of keys. See [Zeffy registration](/documentation/zeffyregistration/).

**Is there an example I can copy?**
Yes. See `_data/events/SideRailTemplate2027.yml` and its page at [/SideRailTemplate2027/](/SideRailTemplate2027/).
