
# Configurar PDV como app nativo (Capacitor)

Vou preparar o projeto para virar um app nativo instalável no Android e iPhone usando Capacitor, mantendo o hot-reload direto do sandbox da Lovable durante o desenvolvimento.

## O que será feito no projeto

1. **Instalar dependências do Capacitor**
   - `@capacitor/core`
   - `@capacitor/cli` (dev)
   - `@capacitor/ios`
   - `@capacitor/android`

2. **Criar `capacitor.config.ts` na raiz** com:
   - `appId`: `app.lovable.2f2c57092905478eb8b5917e6ced8784`
   - `appName`: `pdv1980burguer`
   - `webDir`: `dist`
   - Bloco `server` com URL do sandbox + `cleartext: true` para hot-reload no celular enquanto desenvolve.

3. **Sem mudanças no código do PDV** — a aplicação web continua igual; o Capacitor só empacota.

## O que você precisa fazer depois (no seu computador)

Capacitor exige build local — não dá pra rodar emulador/iPhone dentro da Lovable. Passo a passo:

1. **Exportar para o GitHub** (botão "Export to GitHub" no topo direito) e fazer `git clone` no seu PC.
2. `npm install`
3. Adicionar plataformas:
   - Android: `npx cap add android` e depois `npx cap update android`
   - iOS (precisa de Mac com Xcode): `npx cap add ios` e depois `npx cap update ios`
4. `npm run build`
5. `npx cap sync` (rode isso sempre depois de `git pull` com novas mudanças)
6. Rodar no dispositivo/emulador:
   - Android: `npx cap run android` (precisa Android Studio)
   - iOS: `npx cap run ios` (precisa Mac + Xcode)

## Observações importantes

- **iPhone** só pode ser compilado em um **Mac com Xcode**. Para publicar na App Store é necessário conta Apple Developer (US$ 99/ano).
- **Android** precisa do **Android Studio**. Publicar na Play Store custa US$ 25 (uma vez).
- Enquanto o bloco `server.url` apontar para o sandbox, o app no celular carrega ao vivo do preview da Lovable. Para gerar o APK/IPA final de produção, remova essa URL antes do build.
- Recursos nativos extras (câmera, impressora Bluetooth, notificações) podem ser adicionados depois via plugins do Capacitor — só me avisar quais você precisa.

Recomendo ler depois: https://lovable.dev/blog/2025-02-21-making-mobile-apps-with-lovable-capacitor

Posso seguir com a instalação e configuração?
