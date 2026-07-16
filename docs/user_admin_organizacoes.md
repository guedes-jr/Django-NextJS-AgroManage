comando para criar usuarios admin de todas as organizações

'''sh
./backend/.venv/bin/python backend/manage.py create_platform_staff \
  --email joao.admin@agro.com \
  --name "João Guedes" \
  --role platform_owner
'''