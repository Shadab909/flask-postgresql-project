# Self-Healing Multi-Tier Deployment — InfoMarket Challenge

This repository extends the original [InfoMarket CRUD challenge](https://infomarketpesquisa.com/) — a Flask + PostgreSQL user/address management application — with a fully automated, self-healing multi-tier infrastructure built using **Ansible** and **AWX**.

What's new here is the **deployment and operations layer**: a set of Ansible roles that provision, configure, and keep the application running across a 4-node lab environment, orchestrated through AWX.

## Architecture

```
                        ┌──────────────────┐
                        │   Load Balancer  │
                        │   (nginx, lb01)  │
                        │  192.168.56.10   │
                        └────────┬─────────┘
                                 │
                 ┌───────────────┴────────────────┐
                 │                                │
        ┌────────▼─────────┐             ┌────────▼─────────┐
        │   App Server 1   │             │   App Server 2   │
        │  Flask + Gunicorn│             │  Flask + Gunicorn│
        │  192.168.56.11   │             │  192.168.56.12   │
        └────────┬─────────┘             └────────┬─────────┘
                 │                                │
                 └───────────────┬────────────────┘
                                 │
                       ┌─────────▼─────────┐
                       │   Database (db01) │
                       │    PostgreSQL     │
                       │   192.168.56.13   │
                       └───────────────────┘
```

- **1 Database node** — PostgreSQL, hardened with per-host access rules
- **2 Application nodes** — Flask backend (Gunicorn) + static frontend, load-balanced
- **1 Load Balancer node** — nginx, reverse-proxying `/api/*` to the Flask backends and `/` to the frontends, using `least_conn` across both app servers

All four nodes are CentOS Stream 9 VMs provisioned via Vagrant, and all configuration is applied and re-applied idempotently through **AWX** job templates backed by this git repository.

## Tech stack

| Layer | Tool |
|---|---|
| Configuration management | Ansible |
| Orchestration / UI | AWX (self-hosted on k3s) |
| OS | CentOS Stream 9 (Vagrant/VirtualBox) |
| App server | Gunicorn (systemd-managed) |
| Reverse proxy / LB | nginx |
| Database | PostgreSQL |
| Secrets | Ansible Vault |
| CI trigger | GitHub webhook → AWX Job Template |

## Repository structure

```
ansible/
├── inventory/
│   └── inventory.ini          # plain host/IP declarations, no secrets
├── group_vars/
│   ├── db/
│   │   ├── vars.yml           # non-secret db vars
│   │   └── secrets.yml        # vault-encrypted (db password)
│   ├── app/
│   │   ├── vars.yml
│   │   └── secrets.yml        # vault-encrypted (per-host passwords, keyed by inventory_hostname)
│   └── lb/
├── roles/
│   ├── db-setup/
│   │   ├── tasks/main.yml
│   │   ├── handlers/main.yml
│   │   ├── vars/main.yml
│   ├── app-setup/
│   │   ├── tasks/main.yml
│   │   ├── templates/
│   │   │   ├── flask_backend.service.j2
│   │   │   └── flask_frontend.service.j2
│   │   ├── handlers/main.yml
│   │   ├── vars/main.yml
│   └── lb-setup/
│       ├── tasks/main.yml
│       ├── templates/
│       │   └── nginx.conf.j2
│       ├── handlers/main.yml
│       ├── vars/main.yml
├── database_setup.yml
├── app_setup.yml
└── lb_setup.yml
```

## What each role does

### `db-setup`
- Installs and initializes PostgreSQL (`postgresql-setup --initdb`, idempotent via `creates`)
- Sets `password_encryption = scram-sha-256` and forces a config reload mid-play (`meta: flush_handlers`) before the user's password is set, ensuring SCRAM (not legacy MD5) hashing
- Creates the application database/user (`createuser` / `createdb`, made idempotent via `failed_when` string-matching on "already exists")
- Configures `listen_addresses` and `pg_hba.conf` (via `blockinfile`) to accept connections only from the known app server IPs
- Opens PostgreSQL's port via `firewalld` rich rules, scoped per app-server IP — dynamically resolved from inventory via `hostvars`/`groups['app']`, so adding a new app server requires no playbook changes
- Runs Flask-Migrate's `db init` (one-time, guarded by `creates`) and `db upgrade` (idempotent, safe to rerun every deploy) against the shared database

### `app-setup`
- Clones the application repo (`force: true`, so manual on-box edits never block a redeploy)
- Installs Python dependencies from `requirements.txt` under the `vagrant` user's own environment (`pip3 install --user`) — deliberately **not** run as root, to avoid path/ownership mismatches between the install user and the runtime user
- Templates the backend `.env` file with per-host `API_HOST`/`API_PORT`/`DATABASE_URL`
- Deploys **systemd unit files** (templated) for both the Gunicorn backend and the static frontend server, replacing an earlier `nohup`-based approach:
  - `Restart=on-failure` — this is the core of the "self-healing" behavior: a crashed worker restarts automatically, no manual intervention or Ansible rerun required
  - Logs go to the systemd journal (`journalctl -u flask_backend -f`) rather than a loose log file
- Corrects the **SELinux file context** on the `pip --user`-installed Gunicorn binary (`bin_t`, via `semanage fcontext` + `restorecon`) — SELinux blocks systemd from executing binaries left with the default `gconf_home_t` label on a user's home directory, even though the same binary runs fine from an interactive shell
- Opens the app ports via `firewalld`

### `lb-setup`
- Installs nginx and deploys a Jinja2-templated `nginx.conf`
- The `upstream` blocks for both the frontend and backend are generated by looping over `groups['app']` and pulling each host's `ansible_host` — the load balancer config is fully dynamic and never needs manual IP edits
- Sets the `httpd_can_network_connect` SELinux boolean so nginx is permitted to proxy outbound connections (without this, every proxied request returns a 502 despite a valid config)
- Backs up the original `nginx.conf` once (`force: false`, so the backup isn't overwritten on every rerun)
- Validates config with `nginx -t` before reloading

## Secrets management

All sensitive values (database passwords, per-host SSH passwords) are stored in Ansible Vault-encrypted `secrets.yml` files, kept **outside** the directory tree the AWX inventory source scans — AWX's git-sourced inventory sync cannot decrypt vault content at sync time (a known AWX limitation), so vault files live alongside the playbooks instead, loaded only at playbook-run time via `group_vars` auto-discovery. One Vault credential in AWX, attached to each Job Template, covers all of them.

## Running this via AWX

1. **Projects** — point an AWX Project at this repository; enable "Update Revision on Launch"
2. **Inventory** — add an inventory source of type "Sourced from a Project", pointed at `ansible/inventory/inventory.ini`
3. **Credentials** — one Machine (SSH) credential per environment, one shared Vault credential
4. **Job Templates** — one per role (`db_setup`, `app_setup`, `lb_setup`), each with the Machine + Vault credentials attached
5. **Webhook (optional)** — a GitHub webhook on the Job Template auto-triggers a run on every push to `main`; for a locally-hosted AWX instance without a public IP, this requires a tunnel (e.g. `ngrok`) between GitHub and the AWX NodePort

## Self-healing, in scope

What's implemented today is **process-level self-healing**:
- If Gunicorn, the frontend server, or nginx crashes, systemd restarts it automatically (`Restart=on-failure`, `RestartSec=5`)
- If a whole app node goes down, nginx's `least_conn` upstream continues routing to the remaining healthy app server
- Every playbook is fully idempotent — rerunning any role against an already-configured or partially-broken node converges it back to the correct state

**Not yet implemented** (natural next steps):
- Infrastructure-level healing (automatically rebuilding a fully-downed VM)
- An application `/health` endpoint and an external watcher/alerting loop
- Scheduled AWX health-check workflows with conditional remediation jobs