---
layout: page
title: Zeffy Registration for an Event
permalink: /documentation/zeffyregistration/
---

This page shows how to take event registration through Zeffy, with the Zeffy form embedded in the event page. It works with the classic event page and with the newer [event layouts](/documentation/eventlayouts/).

## How to set it up

1. In Zeffy, open your registration (ticketing) form.
2. Select **Share**, then **More ways to share**, then **Embed**. Zeffy's menus change from time to time; you are looking for the embed code for the form.
3. In the embed code, find the address that starts with `https://www.zeffy.com` and contains `/embed/`. It looks like this:

   `https://www.zeffy.com/embed/ticketing/your-form-name`

4. In your event's data file in `_data/events/`, set these two keys:

```yaml
registrationtype: zeffy
registrationurl: https://www.zeffy.com/embed/ticketing/your-form-name
```

5. Submit a pull request as usual. See [how to submit a PR](/submitpr/).

You only pass the address. The site adds the rest of Zeffy's embed code for you.

## What attendees see

- The Zeffy form appears inside the event page, so people register without leaving it.
- Every Register now button on the page jumps to the form.
- With one of the newer layouts, registration is hidden once the event day has passed.

## FAQ

**Which Zeffy address do I use?**
The embed address, the one with `/embed/` in it. The regular share link to your form will not embed.

**Do I paste Zeffy's whole embed code into the data file?**
No. Only the address goes in `registrationurl`.

**How do I go back to a plain Register now button, for Eventbrite or another site?**
Leave `registrationtype` blank and put the link in `registrationurl`:

```yaml
registrationtype:
registrationurl: https://www.eventbrite.com/e/your-event
```

**What if my event already uses `eventbriteembed`?**
`eventbriteembed` wins. Remove it if you want the Zeffy form to show.

**The form is not showing. What should I check?**
- `registrationtype` is spelled `zeffy`, in lower case.
- `registrationurl` is the embed address and the form is published in Zeffy.
- With one of the newer layouts, the event date in `date` has not passed.

**Is there an example I can copy?**
Yes. See `_data/events/PosterTemplate2027.yml` and its page at [/PosterTemplate2027/](/PosterTemplate2027/).

**Can I take sponsorship payments the same way?**
Yes. See [Zeffy sponsorship payments](/documentation/zeffysponsorship/).
