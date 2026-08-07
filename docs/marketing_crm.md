# Landing page e CRM comercial

## Fluxo do lead

O formulário público grava a solicitação em `DemoRequest`, registra a primeira
atividade e preserva plano, landing page, variante A/B e parâmetros UTM. O
pipeline disponível é: novo, contato realizado, demonstração agendada,
proposta enviada, negociação, convertido e perdido.

O painel `/platform/demo-requests` permite atualizar etapa, valor estimado,
próxima ação, notas internas e motivo da perda. Agendamentos preservam data,
duração, fuso, link da reunião e histórico.

## E-mail

Configure no backend:

```env
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
DEFAULT_FROM_EMAIL=noreply@agromanage.com
DEMO_REQUEST_NOTIFICATION_EMAILS=contato@agromanage.com
```

Novos leads geram confirmação para o interessado e aviso para o comercial.
Agendamentos também enviam data, duração e link.

## Analytics e atribuição

O frontend envia eventos próprios para `/api/v1/public/events/`, incluindo
page views, cliques em CTAs e Core Web Vitals. O Google Analytics é opcional:

```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_WHATSAPP_NUMBER=5581999999999
NEXT_PUBLIC_SITE_URL=https://agromanage.com
```

A variante do CTA é persistida no navegador e vinculada ao lead. UTMs são
armazenadas no evento e no formulário.

## Conteúdo público

As páginas segmentadas, calculadora, demo interativa e central de conteúdos
fazem parte do sitemap. Informações legais e depoimentos reais só devem ser
publicados após validação e autorização dos titulares.
