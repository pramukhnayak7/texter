# OpenRouter Chat — Setup

## Requirements

* Node.js 18+
* npm
* OpenRouter API key

---

## Linux

### Fedora

```bash
sudo dnf install nodejs npm
```

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install nodejs npm
```

### Arch Linux

```bash
sudo pacman -S nodejs npm
```

Check:

```bash
node -v
npm -v
```

---

## Windows

Install **Node.js LTS** from:

```text
https://nodejs.org/
```

Then open PowerShell or Command Prompt:

```powershell
node -v
npm -v
```

---

## Install Project Libraries

Inside the project folder:

```bash
npm install express dotenv
```

Optional — development auto-reload:

```bash
npm install --save-dev nodemon
```

---

## `.env`

Create a file named:

```text
.env
```

Put it in the same directory as `server.js`.

```env
OPENROUTER_API_KEY=sk-or-v1-YOUR_API_KEY_HERE
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
PORT=3000
```

Replace `YOUR_API_KEY_HERE` with your OpenRouter API key.

---

## Supabase Global Chat

1. Create a Supabase project and enable the Email provider under **Authentication → Providers**.
2. Run [`supabase/global-chat.sql`](supabase/global-chat.sql) in the Supabase SQL Editor.
3. Add the project URL and anon key to `.env` as shown above. The server exposes only these public client settings; never put a Supabase `service_role` key in the app.
4. Set the Supabase Auth site URL and allowed redirect URLs to your app origin, such as `http://localhost:3000` and your deployed origin.

Global Chat requires users to sign in or create an account. Normal AI chat does not require a Supabase account. Row-level security limits message reads and inserts to authenticated users, and users can insert only messages attributed to their own account.

---

## `.gitignore`

Create:

```text
.gitignore
```

Add:

```gitignore
node_modules/
.env
```

---

## Run

```bash
node server.js
```

Or, if using nodemon:

```bash
npx nodemon server.js
```

Open:

```text
http://localhost:3000
```
