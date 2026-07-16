# Sandbox de desenvolvedor

Este componente executa Python fora do processo Django. Ele ainda não está conectado ao painel.

## Fronteiras de segurança

- sem interface TCP e com `network_mode: none`;
- comunicação apenas por socket Unix;
- usuário não-root e todas as capabilities removidas;
- filesystem da imagem somente leitura;
- diretório temporário descartável e montado com `noexec`, `nosuid` e `nodev`;
- limite de CPU, memória, PIDs, arquivos abertos, tamanho de arquivos e saída;
- subprocesso novo para cada solicitação;
- Python iniciado com `-I -S`, sem pacotes ou configuração do projeto;
- nenhum código, secret, volume do backend ou credencial do banco é montado.

O token do serviço deve ser gerado fora do repositório e disponibilizado como `SANDBOX_AUTH_TOKEN`. O mesmo secret será usado futuramente pelo cliente interno do backend.

## Pendências antes da integração

1. validar a imagem em ambiente Linux com Docker/Podman;
2. definir rotação do token e permissões do volume do socket;
3. adicionar uma política seccomp específica;
4. integrar somente grants JIT válidos;
5. persistir entrada, saída e encerramento na auditoria;
6. executar testes de fuga e carga;
7. decidir se IPython é realmente necessário — a imagem inicial oferece Python isolado não interativo.

Não monte `/var/run/docker.sock`, o repositório, `.env`, diretórios do backend ou sockets do banco neste container.
