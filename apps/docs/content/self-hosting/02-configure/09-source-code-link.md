---
title: Source code link
description: Point the source code link on every page at the source of the version you run, as the AGPL requires.
---

Metis Suite is released under the GNU Affero General Public License, version 3 or later (AGPL). You can run, change and share it freely.

If you change Metis Suite and let other people use your changed version over a network, section 13 of the AGPL requires you to offer those people the source code of your changed version.

For this, every page shows a **Source code** link with the running version, for example "Source code · v1.2.3". It appears in the left rail, at the bottom of the account settings and dashboard sidebars, and in the footer of the pages before sign-in.

## Set the link

The link goes to the address in `METIS_SOURCE_URL`. It defaults to the official Metis Suite repository, `https://github.com/trymetis/metis`.

- **If you run Metis Suite unchanged,** leave the default.
- **If you run a changed version,** publish your source and set `METIS_SOURCE_URL` to where it lives:

```bash
METIS_SOURCE_URL=https://git.example.com/you/metis-suite
```

`METIS_SOURCE_URL` is read at startup, so restart the app after you change it.
