# Security Policy

Thank you for taking the time to help secure **tsc-run**!  
This monorepo contains the **CLI, adapters, and core framework runtime**.  
Because we’re still in **alpha**, some timelines and guarantees differ from a mature project.

---

## 📌 Scope

| If the vulnerability affects… | Report **here** (monorepo) | Instead, report in… |
| ----------------------------- | :------------------------: | ------------------- |
| CLI command code (`packages/cli`) | ✅ | |
| Adapter packages (`packages/adapter-*`) | ✅ | |
| Core framework & shared utils (`packages/core`) | ✅ | |
| Starter template scaffolding | | **Starter repo** <https://github.com/tsc-run/tsc-run> |
| Documentation site / markdown guides | | **Docs repo** <https://github.com/tsc-run/docs> |

*Not sure?* → Create a private advisory **here**; we’ll triage.

---

## ⚠️ Alpha Status & Expectations

* APIs are still changing; breaking updates may land without deprecations.  
* **Security issues take precedence**, but all timelines are “best-effort” (see below).  
* We don’t recommend production deployments until we reach beta.

---

## 🛡️ Supported Versions

During alpha we patch **only** the default branch:

| Branch / Tag | Supported? |
|--------------|-----------|
| `main` (latest alpha) | ✅ |
| Any tag `< 0.2.0-alpha.7` | ❌ *(please upgrade before reporting)* |

Patches are released as soon as they merge into `main`.

---

## 🔒 How to Report a Vulnerability

| Method | Link |
| ------ | ---- |
| **Encrypted email** | `security@tsc-run.dev` |
| **GitHub Security Advisory** | [Create one](../../security/advisories/new) |

Please include:

1. Description, impact, and affected area (CLI, adapter name, etc.).  
2. Steps to reproduce or PoC.  
3. Commit SHA / version details.  
4. Preferred contact for follow-up.

> **Do NOT** open public issues or pull requests for security concerns.

---

## ⏱️ Response Targets (Best-Effort)

| Stage | Target window (business days) |
|-------|-------------------------------|
| Acknowledge receipt | 3 days |
| Initial assessment & triage | 7 days |
| Patch merged to `main` | 14 days (complex issues may require more time; we’ll keep you updated) |

---

## 🤝 Disclosure

* We follow **coordinated disclosure** – no public details until a fix ships.  
* You may request public credit once the advisory is published.  
* No paid bug-bounty is active yet, but we’re grateful for community reports.
