# 🌍 Guia de Acesso Remoto — AgroManage

## Problema Original
- Login funciona apenas dentro da rede local
- Acesso remoto via ngrok não conseguia se comunicar com o backend

## Solução Implementada

O frontend agora usa um **proxy reverso** para rotear requisições ao backend:

```
[Cliente Remoto] 
    ↓ HTTPS ngrok
[Frontend (via ngrok)] 
    ↓ /api/v1/* (proxy interno)
[Backend Django] ✓
```

---

## 📱 Modo 1: Desenvolvimento Local

Para acessar apenas dentro da sua rede local:

### 1. Parar tudo se estiver rodando

```bash
make stop
```

### 2. Iniciar serviços localmente

```bash
make dev
```

Isso inicia:
- Django na porta `8000`
- Next.js na porta `3000`

### 3. Acessar

```
http://localhost:3000
```

✅ O frontend comunica com backend via proxy interno (`/api/v1` → `http://127.0.0.1:8000`)

---

## 🌐 Modo 2: Acesso Remoto (NGROK)

Para permitir login de redes externas:

### 1. Parar tudo

```bash
make stop
```

### 2. Copiar .env.ngrok como .env.local

```bash
cp frontend/.env.ngrok frontend/.env.local
```

### 3. Iniciar os serviços **EM 3 TERMINAIS SEPARADOS**

**Terminal 1 - Backend:**
```bash
cd backend
source .venv/bin/activate
python manage.py runserver 0.0.0.0:8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 - ngrok (Backend):**
```bash
ngrok http 8000
```
Copiar a URL como: `https://BACKEND_NGROK_URL` (ex: `https://xxxx.ngrok-free.dev`)

**Terminal 4 - ngrok (Frontend):**
```bash
ngrok http 3000
```
Copiar a URL como: `https://FRONTEND_NGROK_URL` (ex: `https://yyyy.ngrok-free.dev`)

### 4. Atualizar .env.local

```env
# frontend/.env.local
NEXT_PUBLIC_BACKEND_URL=https://BACKEND_NGROK_URL
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_APP_URL=https://FRONTEND_NGROK_URL
```

### 5. Atualizar backend/.env

```env
# backend/.env
ALLOWED_HOSTS=localhost,127.0.0.1,BACKEND_NGROK_URL
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://FRONTEND_NGROK_URL,https://BACKEND_NGROK_URL
```

### 6. Recarregar Next.js (se necessário)

```bash
# Terminal 2 - aperte Ctrl+C e rode novamente
npm run dev
```

### 7. Acessar remotamente

```
https://FRONTEND_NGROK_URL
```

✅ O frontend comunica via proxy reverso internamente

---

## 🔍 Verificação

### ✅ Local (Modo 1)

Abra o navegador em F12 → Network → copie uma URL de requisição:
```
http://localhost:3000/api/v1/auth/...
```
(Deve começar com `/api/v1`, não `http://localhost:8000`)

### ✅ Remoto (Modo 2)

Abra o navegador em F12 → Network → copie uma URL de requisição:
```
https://FRONTEND_NGROK_URL/api/v1/auth/...
```
(Deve começar com `/api/v1`, não apontar direto para backend)

---

## ⚠️ Problemas Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| 502 Bad Gateway | Backend ngrok não rodando | Iniciar `ngrok http 8000` em novo terminal |
| CORS blocked | CORS_ALLOWED_ORIGINS desatualizado | Atualizar backend/.env com URL ngrok |
| 404 Not Found | URL do backend errada | Verificar se NEXT_PUBLIC_BACKEND_URL está correto |
| Redirect loop | NEXT_PUBLIC_API_URL aponta para ngrok | Usar `/api/v1`, não URL completa |

---

## 📝 Resumo das Alterações

1. **next.config.js**: Proxy reverso que roteia `/api/v1/*` para backend
2. **.env.local**: Usa `/api/v1` (proxy), não URL externa
3. **.env.ngrok**: Novo arquivo de exemplo para modo ngrok
4. **backend/.env**: Inclui URL ngrok no ALLOWED_HOSTS e CORS

