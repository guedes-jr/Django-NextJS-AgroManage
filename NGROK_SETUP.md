# Configuração do Ngrok para AgroManage

## Problema
Quando você acessa a aplicação via ngrok, há erros de redirect e conexão com a API.

## Solução

### Passo 1: Identificar as URLs do ngrok

Você tem um ngrok rodando para o frontend em:
- **Frontend**: https://retrace-epileptic-varsity.ngrok-free.dev

Para que funcione corretamente, você precisa de um ngrok rodando também para o backend. Se ainda não tem:

```bash
# Terminal 3 - Inicie o ngrok para o backend
ngrok http 8000
# Isso vai gerar uma URL similar a: https://xxxx-xxxx-xxxx.ngrok-free.dev
```

### Passo 2: Atualizar o arquivo `.env.local`

Edite `/frontend/.env.local` e adicione:

```env
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_BACKEND_URL=https://sua-url-ngrok-backend.ngrok-free.dev
```

**Substitua `sua-url-ngrok-backend` pela URL que apareceu no terminal do ngrok do backend**

Exemplo:
```env
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_BACKEND_URL=https://abc123-456-def789.ngrok-free.dev
```

### Passo 3: Configurar Django para aceitar a origem ngrok

Edite `/backend/config/settings/dev.py` e adicione sua URL do ngrok:

```python
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'https://retrace-epileptic-varsity.ngrok-free.dev',  # Seu frontend ngrok
    'https://abc123-456-def789.ngrok-free.dev',  # Seu backend ngrok
]
```

### Passo 4: Reiniciar os serviços

```bash
# Ctrl+C para parar Django e Next.js

# Restart do Django
cd backend
source .venv/bin/activate
python manage.py runserver

# Restart do Next.js (em outro terminal)
cd frontend
npm run dev
```

### Passo 5: Testar

Acesse via ngrok:
- https://retrace-epileptic-varsity.ngrok-free.dev/home/estoque/fornecedores
- https://retrace-epileptic-varsity.ngrok-free.dev/home/estoque/alertas
- https://retrace-epileptic-varsity.ngrok-free.dev/home/estoque/produtos

## Alternativa: Usar Diretamente as URLs do Backend

Se preferir fazer requisições direto ao backend ngrok sem proxy do Next.js:

1. Adicione no `.env.local`:
```env
NEXT_PUBLIC_API_URL=https://sua-url-ngrok-backend.ngrok-free.dev/api/v1
```

2. Isso vai fazer requisições direto ao backend, sem passar pelo proxy do Next.js

## Troubleshooting

### "ERR_TOO_MANY_REDIRECTS"
- Verifique se a URL do backend ngrok está correta em `NEXT_PUBLIC_BACKEND_URL`
- Certifique-se de que tem um ngrok rodando para o backend (porta 8000)

### "Network Error" ou "CORS Error"
- Verifique se as URLs estão corretas no `.env.local`
- Confirme que `/backend/config/settings/dev.py` tem as origens corretas em `CSRF_TRUSTED_ORIGINS`
- Verifique os logs do Django: `python manage.py runserver` mostrará errors de CORS

### Ainda não funciona?
1. Limpe o cache do navegador (Ctrl+Shift+Delete)
2. Feche e reabra o navegador
3. Verifique os logs do terminal do Next.js para ver qual URL está sendo usada
