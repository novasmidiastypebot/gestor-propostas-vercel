const https = require('https');

function httpsRequest(options, postData = null, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error('Excesso de redirecionamentos (loop?).'));
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      
      if (res.statusCode === 301 || res.statusCode === 302) {
        if (!res.headers.location) {
          return reject(new Error('HTTP ' + res.statusCode + ' mas sem header location.'));
        }
        
        console.log('[httpsRequest] Redirecionado (' + res.statusCode + ') para: ' + res.headers.location);
        
        const newUrl = new URL(res.headers.location);
        
        const newOptions = {
          ...options,
          hostname: newUrl.hostname,
          path: newUrl.pathname + newUrl.search,
        };

        httpsRequest(newOptions, postData, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('=== REQUISICAO RECEBIDA ===');
  console.log('Metodo:', req.method);
  console.log('URL:', req.url);

  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (apiKey === process.env.PROXY_API_KEY) {
    console.log('✅ API Key válida - processando requisição');
    
    let parsedBody;
    try {
      if (typeof req.body === 'string') {
        parsedBody = JSON.parse(req.body);
      } else if (req.body && typeof req.body === 'object') {
        parsedBody = req.body;
      } else {
        throw new Error('Body nao pode ser parseado');
      }
    } catch (e) {
      console.error('❌ Erro ao parsear body:', e.message);
      return res.status(400).json({ 
        error: 'Body invalido', 
        details: e.message
      });
    }

    const { action, data } = parsedBody;

    if (!action || !data) {
      return res.status(400).json({ 
        error: 'action e data obrigatorios'
      });
    }

    let pfxBuffer;
    try {
      if (process.env.EFI_CERTIFICATE_BASE64) {
        pfxBuffer = Buffer.from(process.env.EFI_CERTIFICATE_BASE64, 'base64');
      }
    } catch (e) {
      console.error('❌ Erro ao carregar certificado:', e.message);
      return res.status(500).json({ error: 'Erro no certificado', details: e.message });
    }

    const ambiente = process.env.EFI_AMBIENTE || 'homologacao';
    
    const subscriptionApiHost = ambiente === 'producao' 
      ? 'cobrancas.api.efipay.com.br'
      : 'cobrancas-h.api.efipay.com.br';

    const pixApiHost = ambiente === 'producao'
      ? 'pix.api.efipay.com.br'
      : 'pix-h.api.efipay.com.br';
    
    const getSubscriptionOAuthToken = async () => {
      const credentials = Buffer.from(
        process.env.EFI_CLIENT_ID + ':' + process.env.EFI_CLIENT_SECRET
      ).toString('base64');
      
      const tokenOptions = {
        hostname: subscriptionApiHost,
        port: 443,
        path: '/v1/authorize',
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + credentials,
          'Content-Type': 'application/json'
        }
      };

      const tokenPostData = JSON.stringify({ grant_type: 'client_credentials' });
      const tokenResponse = await httpsRequest(tokenOptions, tokenPostData);
      
      if (tokenResponse.status !== 200) {
        throw new Error('Falha ao obter token: ' + tokenResponse.data);
      }
      
      const tokenData = JSON.parse(tokenResponse.data);
      return tokenData.access_token;
    };

    const getPixOAuthToken = async () => {
      if (!pfxBuffer) {
        throw new Error('Certificado (EFI_CERTIFICATE_BASE64) é obrigatorio para obter token PIX.');
      }
      const credentials = Buffer.from(
        process.env.EFI_CLIENT_ID + ':' + process.env.EFI_CLIENT_SECRET
      ).toString('base64');
      
      const tokenOptions = {
        hostname: pixApiHost,
        port: 443,
        path: '/oauth/token',
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + credentials,
          'Content-Type': 'application/json'
        },
        pfx: pfxBuffer,
        passphrase: ''
      };

      const tokenPostData = JSON.stringify({ grant_type: 'client_credentials' });
      const tokenResponse = await httpsRequest(tokenOptions, tokenPostData);
      
      if (tokenResponse.status !== 200) {
        throw new Error('Falha OAuth PIX: ' + tokenResponse.data);
      }
      
      const tokenData = JSON.parse(tokenResponse.data);
      return tokenData.access_token;
    };

    try {
      // ===== CREATE_PLAN =====
      if (action === 'create_plan') {
        console.log('📝 Criando plano...');

        const token = await getSubscriptionOAuthToken();

        const body = JSON.stringify({
          name: data.name,
          interval: data.interval,
          repeats: data.repeats || null
        });

        const planOptions = {
          hostname: subscriptionApiHost,
          port: 443,
          path: '/v1/plan',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        };

        const planResponse = await httpsRequest(planOptions, body);
        
        if (planResponse.status !== 200) {
          const errorData = JSON.parse(planResponse.data);
          return res.status(500).json({
            success: false,
            error: 'Erro ao criar plano',
            details: errorData
          });
        }

        const result = JSON.parse(planResponse.data);

        return res.status(200).json({
          success: true,
          plan_id: result.data.plan_id,
          nota: 'Plano criado como template. O valor sera especificado na assinatura.'
        });
      }

      // ===== LIST_PLANS =====
      if (action === 'list_plans') {
        const token = await getSubscriptionOAuthToken();

        const listOptions = {
          hostname: subscriptionApiHost,
          port: 443,
          path: '/v1/plans',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        };

        const listResponse = await httpsRequest(listOptions);

        if (listResponse.status !== 200) {
          const errorData = JSON.parse(listResponse.data);
          return res.status(500).json({
            success: false,
            error: 'Erro ao listar',
            details: errorData
          });
        }

        const result = JSON.parse(listResponse.data);

        return res.status(200).json({
          success: true,
          plans: result.data,
          ambiente: ambiente
        });
      }

      // ===== GET_PLAN =====
      if (action === 'get_plan') {
        const token = await getSubscriptionOAuthToken();

        const getOptions = {
          hostname: subscriptionApiHost,
          port: 443,
          path: '/v1/plan/' + data.plan_id,
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        };

        const getResponse = await httpsRequest(getOptions);

        if (getResponse.status === 404) {
          return res.status(200).json({
            success: false,
            error: 'Plano nao encontrado',
            plan_id: data.plan_id,
            ambiente: ambiente
          });
        }

        if (getResponse.status !== 200) {
          const errorData = JSON.parse(getResponse.data);
          return res.status(500).json({
            success: false,
            error: 'Erro ao buscar plano',
            details: errorData
          });
        }

        const result = JSON.parse(getResponse.data);

        return res.status(200).json({
          success: true,
          plan: result.data,
          ambiente: ambiente
        });
      }

      // ===== CREATE_SUBSCRIPTION =====
      if (action === 'create_subscription') {
        console.log('📝 Criando assinatura (FLUXO CORRETO EFÍ)...');

        const token = await getSubscriptionOAuthToken();

        // PASSO 1: Criar assinatura no plano
        const subscriptionBody = JSON.stringify({
          items: [
            {
              name: 'Assinatura',
              amount: 1,
              value: data.value || 200
            }
          ]
        });

        const subscriptionOptions = {
          hostname: subscriptionApiHost,
          port: 443,
          path: '/v1/plan/' + data.plan_id + '/subscription',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        };

        const subscriptionResponse = await httpsRequest(subscriptionOptions, subscriptionBody);
        
        if (subscriptionResponse.status !== 200) {
          const errorData = JSON.parse(subscriptionResponse.data);
          return res.status(500).json({
            success: false,
            error: 'Erro ao criar assinatura',
            details: errorData
          });
        }

        const subscriptionResult = JSON.parse(subscriptionResponse.data);
        const subscriptionId = subscriptionResult.data.subscription_id;

        // PASSO 2: Definir método de pagamento (se PIX)
        let paymentData = null;
        
        if (data.payment_method === 'pix') {
          const pixToken = await getPixOAuthToken();
          const pixValueReais = ((data.value || 200) / 100).toFixed(2);

          const pixPayload = JSON.stringify({
            calendario: {
              expiracao: 86400
            },
            devedor: {
              cpf: data.customer.cpf,
              nome: data.customer.name
            },
            valor: {
              original: pixValueReais
            },
            chave: process.env.EFI_CHAVE_PIX,
            solicitacaoPagador: 'Assinatura ' + subscriptionId
          });

          const pixOptions = {
            hostname: pixApiHost,
            port: 443,
            path: '/v2/cob',
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + pixToken,
              'Content-Type': 'application/json'
            },
            pfx: pfxBuffer,
            passphrase: ''
          };

          const pixResponse = await httpsRequest(pixOptions, pixPayload);
          
          if (pixResponse.status === 200 || pixResponse.status === 201) {
            const pixResult = JSON.parse(pixResponse.data);
            
            const qrcodeOptions = {
              hostname: pixApiHost,
              port: 443,
              path: '/v2/loc/' + pixResult.loc.id + '/qrcode',
              method: 'GET',
              headers: {
                'Authorization': 'Bearer ' + pixToken
              },
              pfx: pfxBuffer,
              passphrase: ''
            };

            const qrcodeResponse = await httpsRequest(qrcodeOptions);

            if (qrcodeResponse.status === 200) {
              const qrcodeResult = JSON.parse(qrcodeResponse.data);

              paymentData = {
                pix: {
                  qrcode: pixResult.pixCopiaECola,
                  qrcode_image: qrcodeResult.imagemQrcode,
                  txid: pixResult.txid
                }
              };
            }
          }
        }

        return res.status(200).json({
          success: true,
          subscription_id: subscriptionId,
          payment_data: paymentData
        });
      }

      return res.status(400).json({
        error: 'Action invalida',
        action: action
      });

    } catch (error) {
      console.error('💥 ERRO:', error.message);
      return res.status(500).json({
        error: 'Erro interno',
        details: error.message
      });
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
};