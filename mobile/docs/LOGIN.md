# Primeiro incremento — Login mobile

Implementado em 6 de novembro de 2026. Este recorte inicia P01–P04; não conclui essas partes inteiras nem libera módulos operacionais.

## O que está implementado

- Home autenticada baseada na referência visual, com navegação por capacidades, resumo financeiro real e acesso explícito ao sistema web para módulos ainda não implementados no app. Veja o recorte da [Parte 05](partes/05-08-PRIMEIRO-APP.md#recorte-de-início-implementado).
- Scaffold Expo Router com React Native e TypeScript estrito, dependências próprias e `package-lock.json`.
- Login com e-mail/senha, validação local, indicador de envio, proteção contra requisições simultâneas e alternância de visibilidade da senha.
- Cadastro por e-mail no mesmo endpoint da web: nome completo, e-mail, telefone, senha e confirmação; opções de WhatsApp e alertas desmarcadas por padrão. Após sucesso, retorna ao login com o e-mail preenchido, sem autenticar automaticamente.
- Recuperação de senha com resposta genérica, sem indicar se o e-mail existe.
- Validação do perfil e organização antes de confirmar o acesso; bloqueio de contas exclusivas de plataforma/afiliados neste app.
- Tratamento da troca obrigatória de senha antes de mostrar a confirmação de acesso.
- Opção “Manter conectado”, desmarcada por padrão: marcada, salva os tokens no SecureStore Android/iOS; desmarcada, mantém a sessão somente em memória e remove credenciais persistidas anteriores. Voltar do segundo plano revalida a sessão em memória sem desconectar desnecessariamente.
- Persistência segura segregada pela URL da API. Apenas tokens são persistidos; dados financeiros/organizacionais não são gravados localmente neste incremento.
- Restauração com consulta ao servidor: sem rede, a sessão não abre a área autenticada; pode tentar novamente ou sair. Credenciais não são apagadas por uma falha transitória de rede.
- Logout local com tentativa de revogação remota. Se estiver offline, a revogação no servidor não é garantida; o acesso local é removido.
- Idioma do aparelho antes do login e idioma da organização após a validação, cobrindo pt-BR, en, es e pt-PT.
- Visual refeito a partir da referência enviada: fundo verde profundo com paisagem rural no alto à direita, ondas vetoriais em verde-lima no topo/rodapé, marca central branca e verde-lima com sublinhado curvo. O símbolo oficial existente foi mantido.
- Sem painel branco ou título promocional no login. Campos translúcidos, labels com ícones, bordas claras e foco verde-lima; senha com olho acessível. Botão “Entrar” em degradê com ícone de acesso.
- Cadastro destacado entre linhas decorativas; termos de uso e privacidade sobre o próprio fundo, com ícones e separador, seguidos de copyright em uma linha no tamanho padrão de fonte.
- Controles e alvos de toque preservam pelo menos 44 unidades. Os formulários continuam roláveis, com avanço pelo teclado e foco no primeiro campo inválido.
- Entrada com fade discreto de 220 ms, sem bloquear o formulário; respeita a preferência de movimento reduzido e interrompe a animação se essa preferência for ativada.
- Loading de abertura com logo e indicador de progresso enquanto os recursos locais são preparados; loading também durante a verificação da sessão. Não há tempo artificial de espera.
- Splash nativo configurado com a marca para evitar abertura sem identidade antes da interface React; sua aparência final exige build nativo atualizado.
- Layout com rolagem/teclado, campos legíveis e controles com área mínima de toque.

## Login com Google

O botão permanece visível no login web/mobile. Sem Client ID, informa indisponibilidade e mantém a entrada por e-mail. O backend existente verifica o ID token em `POST auth/google/`; o mobile valida perfil e organização antes de abrir a home e segue a opção “Manter conectado”, troca obrigatória de senha e bloqueio de contas de plataforma/afiliado.

Configuração local (não versionar valores):

| Arquivo | Variável |
| --- | --- |
| `backend/.env` | `GOOGLE_OAUTH_CLIENT_ID` — Client ID OAuth do tipo Web |
| `frontend/.env.local` | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — o mesmo Client ID Web |
| `mobile/.env.local` | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — o mesmo Client ID Web |
| `mobile/.env.local` | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — Client ID do aplicativo iOS |
| `mobile/.env.local` | `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` — esquema reverso do Client ID iOS, `com.googleusercontent.apps.…` |

Reinicie Django, Next.js e Expo após configurar. Google Cloud deve autorizar as origens web (`http://localhost:3000` e `http://localhost:8081` em desenvolvimento) e os clientes Android/iOS com identificadores definitivos do app, assinaturas Android/SHA e bundle iOS correspondentes. Não colocar Client Secret no frontend ou mobile.

A prévia web do mobile usa Google Identity Services em `GoogleLoginButton.web.tsx`, separado da implementação nativa. Android/iOS usam `@react-native-google-signin/google-signin` 17.0.0; `app.config.ts` inclui o plugin sem Firebase quando o esquema iOS estiver definido. O SDK Google limpa sua própria sessão após obter o ID token; somente a sessão do sistema segue a preferência de persistência.

O SDK nativo exige development build atualizado e não funciona no Expo Go. Sem configuração/build, o botão informa a limitação sem interromper o login por senha. Não habilitar silenciosamente novos identificadores de aplicativo. A configuração dos clientes no Google Cloud, consentimento real, cancelamento e retorno/segundo plano em Android/iOS ainda precisam de homologação em aparelhos. Bundles não comprovam esse fluxo. Referências: [Expo](https://docs.expo.dev/guides/google-authentication/), [configuração do SDK](https://react-native-google-signin.github.io/docs/setting-up/expo).

## Densidade visual de 75%

O login usa dimensões compactas definidas em `src/theme/tokens.ts`: conteúdo máximo de 390 (antes 520) e formulário de 360 (antes 480), com espaçamentos, marca e botões ajustados em conjunto. A referência de 75% é aplicada ao layout, sem zoom, escala global ou alteração da fonte raiz.

Os campos preservam fonte de 16 e os alvos de toque pelo menos 44 unidades. A rolagem continua disponível em telas baixas, no cadastro e com fontes ampliadas. A conferência no navegador cobre seis tamanhos, de 320 × 568 a 1440 × 900, incluindo orientação horizontal; Android e iOS ainda exigem validação em dispositivo nativo.

## Prévia da tela

[Captura da interface implementada, em prévia web de 390 × 844](screenshots/login-preview-web.png). [Loading da abertura](screenshots/loading-preview-web.png). [Rodapé com links legais](screenshots/legal-footer-preview-web.png). [Formulário de cadastro](screenshots/registration-preview-web.png). A captura não substitui a validação do aplicativo em dispositivo nativo.

## Executar

Na pasta `mobile/`, use Node compatível com `package.json` (versão usada nesta entrega: 24.13.1) e npm. As versões efetivamente resolvidas estão no lockfile.

```sh
npm ci
cp .env.example .env.local
```

Edite **apenas localmente** `EXPO_PUBLIC_API_URL`, usando o endereço completo da API acessível pelo dispositivo, incluindo `/api/v1/`. Nenhuma credencial deve ser colocada nessa variável.

- Produção: HTTPS obrigatório.
- Desenvolvimento: HTTP permitido somente em build de desenvolvimento (`__DEV__`). Isso não configura automaticamente permissões de rede HTTP do sistema operacional; prefira HTTPS ou ajuste específico de desenvolvimento quando necessário.
- Aparelho físico: `localhost` aponta para o aparelho, não para o computador do backend. Use endereço de rede ou domínio acessível.
- CORS afeta a prévia web; não relaxe a política produtiva do backend para resolver uma prévia local.
- Sem URL válida, a tela informa indisponibilidade e não envia credenciais para um destino implícito.

```sh
npm start
npm run ios
npm run android
```

Os comandos `ios`/`android` iniciam o bundler e tentam abrir o ambiente disponível. Não são builds assinados nem publicação. A versão do Expo Go, quando utilizada, precisa suportar o SDK escolhido; use build nativo de desenvolvimento para validar o app final. Identificadores definitivos de aplicativo, assinatura e pipeline de distribuição ainda pertencem às próximas tarefas P01/P17.

Para revisar somente o layout no navegador:

```sh
npm run web
```

A prévia web mantém tokens **somente em memória**, sem localStorage. Recarregar perde a sessão. Persistência segura e comportamento de teclado/SO precisam ser validados em aparelho nativo.

## Estrutura deste recorte

### Backend e mobile com um comando

Com o ambiente Python e as dependências já instalados, execute dentro de `mobile/`:

```sh
make dev
```

Ou, na raiz do repositório:

```sh
make dev-mobile
```

Para usar o túnel do Expo:

```sh
make dev-mobile-tunnel
```

O túnel usa `@expo/ngrok` instalado **localmente** em `mobile/`, já declarado nas dependências de desenvolvimento. Se o Expo pedir instalação global ou o supervisor informar pacote ausente/inválido, restaure as dependências locais:

```sh
cd mobile
npm ci --include=dev
```

Depois execute novamente o comando da raiz. Não é necessário instalar o pacote globalmente nem usar `sudo npm install`. O supervisor confere o módulo antes de iniciar o backend, evitando a tentativa de instalação global pelo Expo.

O túnel publica o Metro/Expo; ele não publica a API Django. Para um celular na mesma rede, informe `API_HOST` com o IP do computador. Fora dessa rede, a API precisa ter uma URL acessível ao aparelho, informada por `EXPO_PUBLIC_API_URL`.


O `make dev` da raiz continua iniciando backend + frontend web. O novo comando não inicia Next.js, Docker, Redis ou Celery; banco e serviços exigidos pela configuração local precisam estar disponíveis previamente. Não instala dependências, não cria arquivos `.env` e não executa migrações ou seed.

Pré-requisitos: macOS/Linux (ou WSL), `backend/.venv` configurado com as dependências do backend, `backend/.env` existente, Node/npm no PATH e `npm ci` executado em `mobile/`. O comando seleciona explicitamente `config.settings.dev`, mantendo a configuração de banco já existente sem ler ou exibir seus valores no supervisor.

O backend escuta em `0.0.0.0:8000` para permitir acesso pela rede local; Expo usa a porta `8081`. O app recebe `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1/` no processo por padrão. Essa configuração de execução prevalece sobre a variável correspondente em `.env.local`, sem alterar o arquivo.

Para celular físico, use o IP do computador na mesma rede; `127.0.0.1` não aponta para o computador nesse caso:

```sh
make dev API_HOST=192.168.1.20
```

Outras opções, a partir de `mobile/`:

```sh
make dev MOBILE_PLATFORM=web
make dev MOBILE_PLATFORM=ios
make dev MOBILE_PLATFORM=android API_HOST=10.0.2.2
make dev BACKEND_PORT=8010 EXPO_PORT=8082 API_HOST=192.168.1.20
make dev BACKEND_BIND=127.0.0.1
```

`10.0.2.2` é o endereço do computador no emulador Android padrão; outros emuladores/aparelhos podem exigir outro endereço. `BACKEND_BIND=127.0.0.1` restringe a API ao próprio computador, impedindo o acesso de um celular pela rede. O HTTP local continua sujeito às restrições do build/SO descritas anteriormente.

Uma variável `EXPO_PUBLIC_API_URL` já exportada explicitamente no terminal tem prioridade sobre a URL montada por `API_HOST` e `BACKEND_PORT`. Para usar a API local deste comando, remova esse override do terminal ou informe o endereço local pretendido. Quando a URL exportada aponta para um host externo, o supervisor inicia somente Expo, usando essa API; não inicia Django local.

`BACKEND_PYTHON` permite informar outro executável Python com as dependências instaladas. Os demais parâmetros também funcionam no alias da raiz, por exemplo `make dev-mobile API_HOST=192.168.1.20`.

O supervisor verifica portas antes de iniciar, aguarda o backend aceitar conexão e só então inicia Expo. Mantém o terminal/QR code do Expo e encerra seus próprios grupos de processos com Ctrl+C, falha ou saída de um serviço, incluindo autoreloader/Metro. Não encerra serviços anteriores nem mata processos por nome/porta. Se uma porta estiver ocupada, informa o erro para que você escolha outra ou encerre o serviço conscientemente.

Verificação isolada do supervisor: `make test-dev` dentro de `mobile/`. Os testes usam processos sintéticos, sem iniciar o backend real ou alterar o banco, e cobrem configuração, portas ocupadas, timeout, falhas, Ctrl+C e limpeza de descendentes.

## Arquivos do login

| Arquivo/pasta | Responsabilidade |
| --- | --- |
| `app/_layout.tsx`, `app/index.tsx` | Composição da rota, pré-carregamento dos assets, transição do splash, safe areas e provider |
| `src/components/AppLoading.tsx` | Loading acessível de abertura e verificação da sessão |
| `src/config/environment.ts` | Validação do endereço público e exigência de HTTPS em produção |
| `src/services/authApi.ts` | Transporte Axios, contratos e normalização segura de erros |
| `src/features/auth/contracts.ts` | Schemas de entrada, perfil, organização e tokens |
| `src/features/auth/sessionController.ts` | Estado da sessão, validação, persistência coordenada e logout |
| `src/features/auth/tokenVault.ts` | Adapter SecureStore e prévia web efêmera |
| `src/features/auth/AuthProvider.tsx` | Contexto React e revalidação ao retornar ao primeiro plano |
| `src/features/auth/LoginScreen.tsx` | Navegação entre login, cadastro e recuperação |
| `src/features/auth/RegistrationForm.tsx` | Cadastro, consentimentos, erros por campo e foco |
| `src/features/auth/SessionScreen.tsx` | Bootstrap, indisponibilidade, senha obrigatória e confirmação |
| `src/features/auth/AuthControls.tsx`, `src/theme/tokens.ts` | Controles e identidade visual |
| `src/i18n/messages.ts` | Vocabulário específico dos quatro idiomas, sem dependência Next.js |
| `tests/auth.test.ts` | Testes de contratos, transporte e transições de sessão |

## Splash e imagem de fundo

A imagem local `assets/auth-landscape.png` foi criada com a ferramenta integrada `imagegen`, sem texto/interface, para aproximar a paisagem da referência. O [prompt completo](mockups/LOGIN-LANDSCAPE-PROMPT.md) está registrado. A tela não baixa imagem externa. O recurso anterior permanece preservado, mas não é carregado neste visual. `expo-asset` prepara a logo e o fundo antes do formulário, e uma falha de preparação não mantém o app preso no loading. `expo-splash-screen` configura a abertura nativa e dá lugar ao loading React assim que ele pode ser apresentado.

Mudanças no plugin de splash exigem reconstruir o binário para aparecer no aplicativo instalado. Expo Go e builds de desenvolvimento podem apresentar diferenças em relação à splash de release; confira em build release antes da publicação. [Documentação oficial](https://docs.expo.dev/versions/latest/sdk/splash-screen/). A prévia web valida o loading React, não o splash do sistema operacional.

## Vetores e compatibilidade visual

`react-native-svg`, instalado pela seleção de versões do SDK Expo, renderiza ondas, degradês e ícones em Android/iOS/web. [Referência oficial](https://docs.expo.dev/versions/latest/sdk/svg/). Os componentes ficam em `src/components/auth/`: `AuthBackdrop` (paisagem, tons e ondas), `AuthIcon` (ícones) e `AuthButtonFill` (degradê do botão). Os elementos decorativos não recebem toque nem entram na leitura acessível. Não há filtros de blur ou animação contínua do fundo.

A aplicação mantém componentes de formulário nativos; a imagem não contém controles nem textos. Em builds nativos próprios já existentes, reconstrua o binário para incluir o módulo SVG. Geração de bundles e prévia web não comprovam renderização no aparelho: a validação Android/iOS continua pendente.

A revisão desta composição cobre seis viewports, incluindo 320 × 568, 390 × 844, 430 × 932, 768 × 1024, 844 × 390 e 1440 × 900; campos e links permanecem alcançáveis sem overflow horizontal. Os testes de login/cadastro com API simulada cobrem os quatro idiomas. A semelhança visual foi inspecionada na prévia web, preservando a marca existente e os limites de acessibilidade.

## Contratos consumidos

Todos os caminhos são relativos ao prefixo configurado, normalmente `/api/v1/`:

1. `POST auth/login/`: e-mail e senha; retorna access/refresh.
2. `GET auth/me/`: valida sessão e retorna perfil/capacidades; o app não confia apenas no perfil da resposta de login.
3. `GET organizations/me/`: contexto e idioma da organização; campos fora do recorte são descartados antes de entrar no estado do app.
4. `POST auth/password-recovery/`: solicitação por e-mail.
5. `POST auth/force-change-password/`: `new_password` e `new_password_confirm`, somente quando exigido.
6. `POST auth/logout/`: tentativa de revogação do refresh.
7. `POST auth/register/`: cadastro por e-mail com dados e consentimentos descritos abaixo.

Não houve alteração no backend nesta entrega.

## Cadastro por e-mail

O botão “Não tem conta? Cadastre-se” abre o formulário no mesmo visual verde. O cadastro usa `POST auth/register/` com `full_name`, `email`, `phone`, `password`, `password_confirm`, `phone_is_whatsapp` e `receive_system_alerts`. A API continua responsável por criar e vincular a organização; o cliente não envia papel, organização ou capacidades.

Nome e e-mail são obrigatórios, a senha tem pelo menos oito caracteres e a confirmação deve coincidir. O telefone é opcional, mas torna-se obrigatório se o usuário marcar que possui WhatsApp. Os dois consentimentos são independentes e começam desmarcados, seguindo o web; a descrição explica canais, permissões e possibilidade de desativar.

No sucesso, o app não usa os tokens devolvidos pelo endpoint: como no web, retorna ao login com mensagem de confirmação e e-mail preenchido. Não há persistência de senha ou autenticação automática. Os erros do envelope Django `error.detail` são aplicados aos campos conhecidos, inclusive e-mail já cadastrado. Toques simultâneos não criam envios concorrentes, e uma falha de rede não repete automaticamente uma criação de resultado desconhecido: a mensagem orienta tentar entrar/recuperar acesso antes de reenviar.

Este incremento cobre cadastro por e-mail. OAuth Google, atribuição por links de afiliados e aceite de novos termos não foram acrescentados ao contrato existente. Nenhuma mudança no backend foi necessária.

## Links legais e rodapé

O cabeçalho não usa mais a folha branca e o rodapé não usa mais o balão branco: a referência atual coloca a marca e os links diretamente sobre o verde. O rodapé fica no fluxo da rolagem, sem cobrir campos ou botões, e mantém áreas de link com pelo menos 44 unidades.

`EXPO_PUBLIC_SITE_URL` configura o domínio do frontend público, separado de `EXPO_PUBLIC_API_URL`. O fallback é `https://fazendamais.com`, o mesmo definido em `frontend/src/app/layout.tsx`. Os links exibidos usam as rotas existentes `/termos` e `/privacidade`; o copyright é texto. Nenhum token ou dado da sessão é incluído nas URLs. Configure um endereço HTTP local apenas em desenvolvimento; produção exige HTTPS e não aceita credenciais, parâmetros ou fragmentos na URL base.

As rotas foram conferidas na fonte e os destinos/erros de abertura foram testados com navegação simulada. A disponibilidade dessas páginas no domínio publicado não pôde ser confirmada nesta validação; confira `EXPO_PUBLIC_SITE_URL` antes da distribuição. Nenhum texto jurídico ou política da versão web foi alterado.

## Manter conectado

O controle fica ao lado de “Esqueci minha senha” e se adapta por quebra de linha em larguras pequenas. Começa desmarcado e desabilita durante envio. Não salva a senha.

Com a opção marcada, uma nova abertura do app pode restaurar a sessão salva no SecureStore, após validar o perfil/organização no servidor. Desmarcada, os tokens ficam apenas em memória durante o processo atual, inclusive ao alternar entre apps; encerramento real do processo exige novo login. Logout remove ambos os acessos e tenta revogar a sessão remotamente. Na prévia web, continua sem persistência entre recarregamentos mesmo quando marcado.

A opção não estende a validade dos tokens. A renovação transparente ainda depende do contrato backend descrito a seguir; access expirado exige novo login neste recorte. Os cinco testes adicionais cobrem as duas opções, reabertura, retorno ao primeiro plano, logout e expiração em memória.

## Limitação de renovação de sessão

Na fonte atual, `backend/apps/accounts/views.py::refresh_token_view` exige `IsAuthenticated`; a autenticação JWT padrão rejeita access token expirado antes de executar a view. O contrato para renovar uma sessão já expirada precisa ser revisado com testes de revogação, tenant e `session_version` antes de implementar renovação transparente.

Por isso este incremento **não chama refresh automaticamente**. Uma sessão salva com access ainda válido pode ser restaurada; uma resposta 401 remove o acesso salvo e retorna ao login. Não há retries automáticos de login ou loop de renovação. Isso deve ser resolvido na continuação de P02/P03, não contornado no cliente.

## Verificações e limites

Comandos disponíveis:

```sh
npm run test
npm run typecheck
npm run lint
npm run export:check
```

`export:check` gera bundles para Android, iOS e web; não equivale a compilar, instalar ou testar um binário nativo. Sem URL de API válida, o bundle ainda é gerado, mas o login fica indisponível até configurar o ambiente.

Nesta entrega: 38 testes automatizados de contrato/estado/transporte; checagem TypeScript e lint; exportação dos três bundles; compatibilidade de dependências conferida com `expo install --check`. Revisão visual da prévia web e testes de interação em larguras de 320, 390, 768 e 1440: validação, senha visível/oculta, erro de credenciais, recuperação, login, somente leitura, idioma organizacional, logout e troca obrigatória de senha. Os quatro idiomas foram verificados. O loading foi observado com atraso controlado do asset de fundo no teste, desaparecendo ao concluir; o formulário permaneceu oculto até os recursos ficarem prontos. Também foi verificada a ausência de overflow horizontal em 320 × 568, a área do ícone de senha, avanço por Enter, foco no primeiro erro e animação presente por padrão/ausente com movimento reduzido na prévia web. A revisão do cadastro cobre navegação, consentimentos iniciais, campos obrigatórios, confirmação de senha, telefone condicional, erro de e-mail duplicado no envelope Django, falha de rede, bloqueio durante envio e sucesso com retorno ao login. Esses testes usaram API simulada e não equivalem a teste com backend real.

Ainda pendentes: validação Android/iOS em aparelho, login com conta real de homologação e API acessível, renovação transparente, identidade/assinatura de distribuição e testes E2E nativos. A tela após login é uma confirmação de sessão real, sem dados fictícios de fazenda, agenda ou outros módulos.
