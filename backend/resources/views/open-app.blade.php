<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{ $title }} · orgOS</title>
<style>
  :root { color-scheme: light dark; --bg:#f7f7f5; --fg:#1c1c1a; --muted:#6b6b66; --line:#d9d9d4; --accent:#1c1c1a; --accent-fg:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#121211; --fg:#f2f2ef; --muted:#9a9a94; --line:#2c2c2a; --accent:#f2f2ef; --accent-fg:#121211; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--fg);
         font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding:24px 16px; }
  main { width:100%; max-width:380px; text-align:center; }
  .brand { font-weight:700; letter-spacing:.02em; color:var(--muted); font-size:14px; margin-bottom:28px; }
  h1 { font-size:22px; margin:0 0 10px; }
  p { color:var(--muted); line-height:1.5; margin:0 0 24px; font-size:15px; }
  a.btn { display:block; padding:16px; border-radius:14px; background:var(--accent); color:var(--accent-fg); text-decoration:none; font-weight:600; font-size:17px; }
  .note { margin-top:20px; font-size:13px; border-top:1px solid var(--line); padding-top:16px; }
</style>
</head>
<body>
<main>
  <div class="brand">orgOS</div>
  <h1>{{ $title }}</h1>
  <p>Se deschide aplicația orgOS…</p>
  <a class="btn" href="{{ $deepLink }}">Deschide în orgOS</a>
  <p class="note">Dacă nu se deschide, deschide întâi Expo Go (cu proiectul orgOS pornit), apoi apasă din nou butonul.</p>
</main>
<script>window.location.replace(@json($deepLink));</script>
</body>
</html>
