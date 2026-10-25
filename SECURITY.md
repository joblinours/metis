# Security Policy

Metis Suite is built by AstraQ Cyber Defence Pvt. Ltd., a cybersecurity
company. We take vulnerabilities in our own product seriously and
respond quickly to credible reports.

## Supported versions

Security patches are issued for the latest tagged release on `main`.
Earlier releases receive critical fixes at AstraQ's discretion.

| Version                      | Supported           |
| ---------------------------- | ------------------- |
| `main` (current development) | Yes                 |
| Latest tagged release        | Yes                 |
| Older tagged releases        | Critical fixes only |

## How to report a vulnerability

Please do not open public GitHub issues for security vulnerabilities.
Public disclosure before a fix is available puts every Metis Suite user
at risk.

Email security reports to:

```
contact@astraqcyberdefence.com
```

Use the subject line `SECURITY: <short description>` so it is routed
correctly. If you want to encrypt the report, request our PGP key in
your first message and we will provide one.

Please include:

- A description of the vulnerability
- Steps to reproduce, ideally with a proof of concept
- The Metis Suite version, commit hash, and deployment type
  (self-hosted or hosted)
- Your assessment of the impact and any suggested fix
- Whether you intend to publish a writeup later and on what timeline

## What to expect

| Stage                                        | Target time                       |
| -------------------------------------------- | --------------------------------- |
| Acknowledgement that we received your report | 2 business days                   |
| Initial assessment and severity rating       | 5 business days                   |
| Fix in private branch                        | Depends on severity (see below)   |
| Patched release published                    | Within 14 days of fix being ready |
| Public advisory and credit                   | After patched release             |

Severity targets for fix:

| Severity                                                    | Target fix time |
| ----------------------------------------------------------- | --------------- |
| Critical (RCE, auth bypass, data leak across tenants)       | 7 days          |
| High (account takeover, privilege escalation)               | 14 days         |
| Medium (information disclosure, XSS in low-privilege views) | 30 days         |
| Low (rate limit bypass without escalation, minor leaks)     | 60 days         |

## Coordinated disclosure

We follow a 90 day coordinated disclosure window by default. If you
report a vulnerability we will:

1. Confirm receipt and start triage.
2. Keep you updated as we develop and test the fix.
3. Credit you in the security advisory and CHANGELOG (from v0.1 onward),
   unless you prefer to remain anonymous.
4. Publish the advisory and patch within 90 days of your report, or
   sooner once a stable fix is available.

If 90 days pass without a fix because of complexity, we will agree on
an extended timeline with you in writing before any public deadline
expires.

## Out of scope

The following are explicitly not in scope for security reports against
this repository:

- Vulnerabilities in third-party services Metis Suite talks to
  (Gmail API, Microsoft Graph, Zoho Mail API, LLM provider, Resend,
  Neon Postgres). Please report those upstream.
- The AstraQ phishing-backend, which has its own security disclosure
  process. Email the same address with subject prefix
  `SECURITY-PHISHING:`.
- Social engineering attacks on AstraQ staff or AstraQ customers.
- Physical attacks on AstraQ infrastructure.
- Issues that require a malicious or compromised admin within the
  same workspace as the victim, where the admin already has
  legitimate access to the relevant data.
- Self-XSS, missing security headers without an exploit, or other
  best-practice gaps without demonstrated impact.

## Safe harbour

AstraQ will not pursue legal action against researchers who:

- Make a good faith effort to follow this policy.
- Stop testing as soon as they confirm a vulnerability.
- Do not access, modify, or exfiltrate data belonging to other users.
- Do not perform denial of service tests against AstraQ infrastructure.
- Do not publish details before AstraQ has published a fix.

If you are unsure whether your testing is within this safe harbour,
ask first by email.

## Hall of fame

Researchers who responsibly disclose valid vulnerabilities are listed
in the project security advisory archive, unless they prefer to remain
anonymous.

## Updates to this policy

This policy may be updated as the project grows. The current version
always lives at https://github.com/trymetis/metis/blob/main/SECURITY.md.
