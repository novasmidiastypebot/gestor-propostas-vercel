const Gerencianet = require('gn-api-sdk-node');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // ✅ CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1️⃣ Validar API Key
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    if (!apiKey || apiKey !== process.env.PROXY_API_KEY) {
      console.error('❌ API Key inválida');
      return res.status(401).json({ 
        error: 'Unauthorized',
        details: 'API Key inválida ou não fornecida'
      });
    }

    console.log('✅ API Key validada');

    const { action, data } = req.body;

    if (!action || !data) {
      return res.status(400).json({ 
        error: 'Bad Request',
        details: 'Os campos "action" e "data" são obrigatórios'
      });
    }

    console.log(`📥 Ação recebida: ${action}`, data);

    // 2️⃣ Verificar credenciais da Efí
    if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET) {
      return res.status(500).json({ 
        error: 'Configuração incompleta',
        details: 'Credenciais da Efí não configuradas no servidor proxy'
      });
    }

    // 3️⃣ Preparar certificado .p12
    let certificatePath;
    
    if (process.env.EFI_CERTIFICATE_BASE64) {
      // Certificado em Base64 (recomendado para Vercel)
      const certBuffer = Buffer.from(process.env.EFI_CERTIFICATE_BASE64, 'base64');
      certificatePath = path.join('/tmp', 'certificado.p12');
      fs.writeFileSync(certificatePath, certBuffer);
      console.log('📄 Certificado decodificado e salvo em /tmp');
    } else if (process.env.EFI_CERTIFICATE_PATH) {
      // Caminho do certificado
      certificatePath = process.env.EFI_CERTIFICATE_PATH;
    } else {
      return res.status(500).json({ 
        error: 'Certificado não configurado',
        details: 'Configure EFI_CERTIFICATE_BASE64 ou EFI_CERTIFICATE_PATH'
      });
    }

    // 4️⃣ Configurar SDK da Efí
    const options = {
      client_id: process.env.EFI_CLIENT_ID,
      client_secret: process.env.EFI_CLIENT_SECRET,
      certificate: certificatePath,
      sandbox: process.env.EFI_AMBIENTE !== 'producao',
      debug: false
    };

    console.log('⚙️ SDK configurado:', {
      sandbox: options.sandbox,
      hasCertificate: !!certificatePath
    });

    const gerencianet = new Gerencianet(options);

    // 5️⃣ Executar ação
    let response;

    switch (action) {
      case 'create_plan':
        console.log('📤 Criando plano na Efí...');
        response = await gerencianet.createPlan({}, data);
        console.log('✅ Plano criado:', response.data.plan_id);
        
        // Limpar certificado temporário
        if (process.env.EFI_CERTIFICATE_BASE64) {
          fs.unlinkSync(certificatePath);
        }
        
        return res.json({ 
          plan_id: response.data.plan_id,
          full_response: response.data
        });

      case 'create_subscription':
        console.log('📤 Criando assinatura na Efí...');
        response = await gerencianet.createSubscription({}, data);
        console.log('✅ Assinatura criada:', response.data.subscription_id);
        
        // Limpar certificado temporário
        if (process.env.EFI_CERTIFICATE_BASE64) {
          fs.unlinkSync(certificatePath);
        }
        
        return res.json({ 
          subscription_id: response.data.subscription_id,
          charge_id: response.data.charge?.id,
          payment_data: response.data.payment,
          full_response: response.data
        });

      case 'cancel_subscription':
        console.log('📤 Cancelando assinatura na Efí...');
        response = await gerencianet.cancelSubscription({ id: data.subscription_id }, {});
        console.log('✅ Assinatura cancelada');
        
        // Limpar certificado temporário
        if (process.env.EFI_CERTIFICATE_BASE64) {
          fs.unlinkSync(certificatePath);
        }
        
        return res.json({ 
          success: true,
          message: 'Assinatura cancelada com sucesso'
        });

      default:
        return res.status(400).json({ 
          error: 'Ação inválida',
          details: `Ação "${action}" não é suportada`
        });
    }

  } catch (error) {
    console.error('💥 Erro ao processar requisição:', error);
    
    // Limpar certificado temporário em caso de erro
    try {
      if (process.env.EFI_CERTIFICATE_BASE64) {
        fs.unlinkSync(path.join('/tmp', 'certificado.p12'));
      }
    } catch (e) {
      // Ignorar
    }
    
    return res.status(500).json({ 
      error: error.message || 'Erro interno do servidor',
      details: error.stack,
      type: error.name
    });
  }
};