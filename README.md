# 🔐 Servidor Proxy - Integração Efí (mTLS)
Servidor intermediário para comunicação entre Base44 e API da Efí.
## 📋 Por que este proxy é necessário?
A API da Efí exige **mTLS** (Mutual TLS), que requer envio de certificado client-side (.p12). 
O Deno Deploy (usado pelo Base44) não suporta isso nativamente.
**Este proxy resolve o problema:**
- ✅ Roda em ambiente Node.js (Vercel)
- ✅ Suporta certificado .p12
- ✅ Valida API Key para segurança
- ✅ Faz chamadas à Efí com mTLS
- ✅ Retorna resultados para o Base44

---

## 🚀 Deploy no Vercel (5 minutos)

### 1️⃣ Criar conta no Vercel
Acesse: https://vercel.com/signup

### 2️⃣ Instalar Vercel CLI (opcional)
```bash
npm install -g vercel
```

### 3️⃣ Fazer deploy

**Opção A: Via GitHub (RECOMENDADO)**
1. Criar repositório no GitHub com estes arquivos
2. Importar no Vercel: https://vercel.com/new
3. Configurar variáveis de ambiente (veja abaixo)
4. Deploy automático!

**Opção B: Via CLI**
```bash
vercel login
vercel --prod
```

### 4️⃣ Configurar Variáveis de Ambiente

No painel do Vercel → Settings → Environment Variables:

```
EFI_CLIENT_ID = [seu Client_Id]
EFI_CLIENT_SECRET = [seu Client_Secret]
EFI_CERTIFICATE_BASE64 = [certificado .p12 em base64]
EFI_AMBIENTE = homologacao (ou producao)
PROXY_API_KEY = [gere uma chave secreta forte]
```

**Como converter certificado para Base64:**
```bash
# Linux/Mac
cat certificado.p12 | base64

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificado.p12"))
```

**Como gerar PROXY_API_KEY:**
```bash
# Linux/Mac
openssl rand -hex 32

# Windows (PowerShell)
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

---

## 🔗 Configurar no Base44

Após deploy:

1. Copie a URL do Vercel (ex: `https://seu-proxy.vercel.app`)
2. No Base44 → Dashboard Admin → Configurações de Pagamento
3. Cole a URL no campo **"URL do Servidor Proxy"**
4. Cole a mesma `PROXY_API_KEY` no campo **"Chave de API do Proxy"**
5. Salvar!

---

## 📡 Endpoints

### POST /api/efi

**Headers:**
```
Authorization: Bearer {PROXY_API_KEY}
Content-Type: application/json
```

**Body (Criar Plano):**
```json
{
  "action": "create_plan",
  "data": {
    "name": "Plano Básico",
    "interval": 1,
    "repeats": null,
    "value": 9900
  }
}
```

**Body (Criar Assinatura):**
```json
{
  "action": "create_subscription",
  "data": {
    "plan_id": 123456,
    "customer": {
      "name": "João Silva",
      "cpf": "12345678900",
      "email": "joao@example.com",
      "phone_number": "11999999999"
    },
    "payment_method": "pix"
  }
}
```

---

## 🐛 Troubleshooting

### Erro: "API Key inválida"
- Verifique se a `PROXY_API_KEY` está correta
- Confirme que está usando `Bearer {chave}` no header

### Erro: "Certificado não configurado"
- Certifique-se que `EFI_CERTIFICATE_BASE64` está definida
- Verifique se o Base64 está correto

### Erro ao criar plano/assinatura
- Verifique logs no painel do Vercel: https://vercel.com/dashboard
- Confirme que `EFI_CLIENT_ID` e `EFI_CLIENT_SECRET` estão corretos
- Verifique se `EFI_AMBIENTE` está definido corretamente

---

## 📚 Documentação Efí

- API Pix: https://dev.gerencianet.com.br/docs/api-pix
- Assinaturas: https://dev.gerencianet.com.br/docs/api-recorrencia
- SDK Node.js: https://github.com/gerencianet/gn-api-sdk-node

---

## 🔒 Segurança

- ✅ API Key obrigatória em todas as requisições
- ✅ Certificado armazenado como variável de ambiente
- ✅ CORS configurado
- ✅ Logs para auditoria

---

## 📞 Suporte

Em caso de problemas, contate o desenvolvedor do sistema.
