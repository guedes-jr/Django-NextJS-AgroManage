comando para criar usuarios admin de todas as organizações

```sh
read -rsp "Digite a senha: " PLATFORM_STAFF_PASSWORD
echo
export PLATFORM_STAFF_PASSWORD

./backend/.venv/bin/python backend/manage.py create_platform_staff \
  --email joao.admin@agro.com \
  --name "João Guedes" \
  --role platform_owner

unset PLATFORM_STAFF_PASSWORD
```

ou 

```sh


```
