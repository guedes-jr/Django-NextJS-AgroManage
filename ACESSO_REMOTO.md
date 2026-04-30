# Guia de acesso local e remoto com ngrok

## Ideia correta

O projeto deve usar apenas uma URL pública do ngrok: a URL do frontend.

Fluxo:

```text
Cliente externo
  ↓
https://SEU-FRONTEND.ngrok-free.dev
  ↓
Next.js /api/v1/* e /media/*
  ↓
Django local em http://127.0.0.1:8000
```

Com isso, o navegador nunca tenta acessar `localhost:8000` diretamente. Esse era o principal motivo de a interface abrir, mas os dados do backend não carregarem fora da sua máquina.

---

## Configuração fixa do frontend

Arquivo: `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_APP_NAME=AgroManage
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Para ngrok, você pode copiar:

```bash
cp frontend/.env.ngrok.example frontend/.env.local
```

Depois ajuste apenas o `NEXT_PUBLIC_APP_URL`, se desejar:

```env
NEXT_PUBLIC_APP_URL=https://retrace-epileptic-varsity.ngrok-free.dev
```

O mais importante é manter:

```env
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

---

## Configuração do backend

Arquivo: `backend/.env`

```env
DJANGO_SETTINGS_MODULE=config.settings.dev
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,.ngrok-free.dev
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://retrace-epileptic-varsity.ngrok-free.dev
```

Em ambiente de desenvolvimento, o arquivo `config/settings/dev.py` já aceita `https://*.ngrok-free.dev` em `CSRF_TRUSTED_ORIGINS`.

---

## Como rodar local

Terminal 1:

```bash
cd backend
source .venv/bin/activate
python manage.py runserver 127.0.0.1:8000
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Acesse:

```text
http://localhost:3000
```

---

## Como compartilhar pelo ngrok

Mantenha backend e frontend rodando como acima.

Terminal 3:

```bash
ngrok http 3000
```

Acesse a URL gerada, por exemplo:

```text
https://retrace-epileptic-varsity.ngrok-free.dev
```

Não precisa abrir um ngrok separado para o backend.

---

## Como validar se está certo

No navegador, abra F12 > Network e veja as chamadas da API.

Certo:

```text
https://retrace-epileptic-varsity.ngrok-free.dev/api/v1/auth/...
```

Errado:

```text
http://localhost:8000/api/v1/auth/...
```

Se aparecer `localhost:8000` no navegador remoto, o frontend ainda está usando URL absoluta e precisa ser reiniciado depois de alterar `frontend/.env.local`.

---

## Quando alterar algo

Uso local: não altera nada.

Uso ngrok: normalmente só roda `ngrok http 3000`. Se a URL do ngrok mudar e você quiser manter o app URL atualizado, ajuste apenas:

```env
NEXT_PUBLIC_APP_URL=https://NOVA-URL.ngrok-free.dev
```

Depois reinicie o Next.js.
