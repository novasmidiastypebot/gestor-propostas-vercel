module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  return res.status(200).json({
    status: 'ok',
    message: 'Servidor proxy funcionando',
    timestamp: new Date().toISOString(),
    version: '5.0-efi-flow',
    environment: {
      hasClientId: !!process.env.EFI_CLIENT_ID,
      hasClientSecret: !!process.env.EFI_CLIENT_SECRET,
      hasCertificate: !!process.env.EFI_CERTIFICATE_BASE64,
      hasProxyKey: !!process.env.PROXY_API_KEY,
      ambiente: process.env.EFI_AMBIENTE || 'nao-configurado',
      hasEfiChavePix: !!process.env.EFI_CHAVE_PIX
    }
  });
};