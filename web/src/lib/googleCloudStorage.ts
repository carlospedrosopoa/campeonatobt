// lib/googleCloudStorage.ts - Serviço de upload para Google Cloud Storage
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import { existsSync } from 'fs';
import path from 'path';

// Inicializar cliente do GCS
const getStorage = () => {
  // Em produção (Vercel/Cloud Run), usar Application Default Credentials (ADC)
  // As bibliotecas do Google Cloud fazem autenticação automática
  // Apenas precisa do projectId e bucket configurados
  
  // Opção 1: Usar chave em base64 (se fornecido - para casos específicos)
  if (process.env.GOOGLE_CLOUD_KEY) {
    try {
      const key = JSON.parse(
        Buffer.from(process.env.GOOGLE_CLOUD_KEY, 'base64').toString()
      );
      return new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        credentials: key,
      });
    } catch (error) {
      console.error('Erro ao parsear GOOGLE_CLOUD_KEY:', error);
      throw new Error('Configuração inválida do Google Cloud Storage');
    }
  }
  
  // Opção 2: Usar arquivo de credenciais (apenas para desenvolvimento local)
  // Verificar se o arquivo existe antes de tentar usar
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credentialsPath = path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (existsSync(credentialsPath)) {
      return new Storage({
        keyFilename: credentialsPath,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      });
    } else {
      console.warn(`Arquivo de credenciais não encontrado: ${credentialsPath}. Removendo GOOGLE_APPLICATION_CREDENTIALS e tentando ADC...`);
      // Evitar que a SDK tente usar um caminho inválido via variável de ambiente
      try { delete (process.env as any).GOOGLE_APPLICATION_CREDENTIALS; } catch {}
    }
  }
  
  // Opção 3: Application Default Credentials (ADC) - automático em Cloud Run/Vercel
  // Não precisa configurar credenciais - a biblioteca detecta automaticamente
  if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
    try {
      return new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        // Sem credentials - usa ADC automaticamente
      });
    } catch (error) {
      console.error('Erro ao inicializar Storage com ADC:', error);
      // Em desenvolvimento, permite continuar sem GCS
      if (process.env.NODE_ENV === 'development') {
        console.warn('ADC não disponível. Uploads serão ignorados em desenvolvimento.');
        return null;
      }
      throw error;
    }
  }
  
  // Se não configurado, retornar null (permitir funcionar sem GCS)
  if (process.env.NODE_ENV === 'development') {
    console.warn('Google Cloud Storage não configurado. Uploads serão ignorados.');
    return null;
  }
  
  throw new Error('Google Cloud Storage não configurado');
};

let storageInstance: Storage | null = null;
let initializationAttempted = false;

const initializeStorage = () => {
  if (initializationAttempted && storageInstance) {
    return storageInstance;
  }
  
  initializationAttempted = true;
  
  try {
    storageInstance = getStorage();
    if (storageInstance) {
      console.log('[GCS] Storage inicializado com sucesso');
    } else {
      console.warn('[GCS] Storage não inicializado - getStorage retornou null');
    }
  } catch (error: any) {
    console.error('[GCS] Erro ao inicializar Google Cloud Storage:', error.message);
    // Em produção, se ADC não estiver disponível, ainda pode funcionar para algumas operações
    if (process.env.NODE_ENV === 'production') {
      console.warn('[GCS] ADC não disponível. Algumas operações podem falhar.');
      console.warn('[GCS] Configure GOOGLE_CLOUD_KEY nas variáveis de ambiente do Vercel para habilitar todas as funcionalidades.');
    }
    storageInstance = null;
  }
  
  return storageInstance;
};

// Tentar inicializar na carga do módulo
initializeStorage();

const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || '';

export interface UploadResult {
  url: string;
  fileName: string;
  size: number;
}

/**
 * Faz upload de uma imagem para o Google Cloud Storage
 * @param fileBuffer Buffer do arquivo
 * @param originalName Nome original do arquivo
 * @param folder Pasta onde salvar (ex: 'atletas', 'points')
 * @returns URL pública da imagem
 */
export async function uploadImage(
  fileBuffer: Buffer,
  originalName: string,
  folder: string = 'uploads'
): Promise<UploadResult> {
  console.log('[GCS uploadImage] Iniciando upload:', { originalName, folder, bufferSize: fileBuffer.length });
  // Se a variável de arquivo de credenciais aponta para um caminho inexistente,
  // limpe a variável e force re-inicialização para usar ADC
  try {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : null;
    if (credPath && !existsSync(credPath)) {
      console.warn(`[GCS uploadImage] Credenciais inexistentes em ${credPath}. Limpando e reinicializando para ADC...`);
      try { delete (process.env as any).GOOGLE_APPLICATION_CREDENTIALS; } catch {}
      storageInstance = null;
      initializationAttempted = false;
    }
  } catch {}
  
  // Tentar inicializar/reinicializar se necessário
  if (!storageInstance) {
    console.warn('[GCS uploadImage] Storage instance não inicializado, tentando reinicializar...');
    const newStorage = initializeStorage();
    if (!newStorage) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[GCS uploadImage] GCS não configurado - retornando URL mock');
        return {
          url: `https://via.placeholder.com/300?text=${encodeURIComponent(originalName)}`,
          fileName: `${folder}/${uuidv4()}.jpg`,
          size: fileBuffer.length,
        };
      }
      throw new Error('Google Cloud Storage não configurado. Verifique as variáveis de ambiente GOOGLE_CLOUD_PROJECT_ID e GOOGLE_CLOUD_STORAGE_BUCKET.');
    }
  }

  if (!bucketName) {
    console.error('[GCS uploadImage] Bucket name não configurado');
    throw new Error('GOOGLE_CLOUD_STORAGE_BUCKET não configurado nas variáveis de ambiente');
  }

  // Verificação final - garantir que storageInstance não é null
  if (!storageInstance) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GCS uploadImage] Storage não configurado - retornando URL mock');
      return {
        url: `https://via.placeholder.com/300?text=${encodeURIComponent(originalName)}`,
        fileName: `${folder}/${uuidv4()}.jpg`,
        size: fileBuffer.length,
      };
    }
    throw new Error('Google Cloud Storage não configurado. Verifique as variáveis de ambiente.');
  }

  try {
    const bucket = storageInstance.bucket(bucketName);
    
    // Verificar se o bucket existe e está acessível
    const [exists] = await bucket.exists();
    if (!exists) {
      throw new Error(`Bucket "${bucketName}" não existe ou não está acessível`);
    }
    
    // Gerar nome único para o arquivo
    const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${folder}/${uuidv4()}.${extension}`;
    
    console.log('[GCS uploadImage] Criando arquivo:', fileName);
    
    // Criar arquivo no bucket
    const file = bucket.file(fileName);
    
    // Determinar content type
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const contentType = contentTypeMap[extension] || 'image/jpeg';
    
    console.log('[GCS uploadImage] Fazendo upload com contentType:', contentType);
    
    // Upload do buffer
    await file.save(fileBuffer, {
      metadata: {
        contentType,
        cacheControl: 'public, max-age=31536000', // Cache por 1 ano
      },
      public: true, // Tornar público
    });
    
    console.log('[GCS uploadImage] Upload concluído com sucesso');
    
    // Retornar URL pública
    const url = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    
    return {
      url,
      fileName,
      size: fileBuffer.length,
    };
  } catch (error: any) {
    console.error('[GCS uploadImage] Erro durante upload:', {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    });
    
    // Em desenvolvimento, não bloquear o fluxo: retornar URL mock
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GCS uploadImage] Falha no upload em desenvolvimento. Retornando URL mock. Detalhe:', error.message);
      return {
        url: `https://via.placeholder.com/1080x1920?text=${encodeURIComponent(originalName)}`,
        fileName: `${folder}/${uuidv4()}.png`,
        size: fileBuffer.length,
      };
    }

    // Verificar tipos específicos de erro
    if (error.code === 403 || error.message?.includes('permission') || error.message?.includes('Permission denied')) {
      throw new Error('Sem permissão para fazer upload no Google Cloud Storage. Verifique as credenciais.');
    }
    if (error.code === 404 || error.message?.includes('not found')) {
      throw new Error(`Bucket "${bucketName}" não encontrado. Verifique o nome do bucket.`);
    }
    if (error.message?.includes('authentication') || error.message?.includes('credentials')) {
      throw new Error('Erro de autenticação no Google Cloud Storage. Verifique as credenciais configuradas.');
    }
    
    throw error;
  }
}

/**
 * Remove uma imagem do Google Cloud Storage
 */
export async function deleteImage(fileUrl: string): Promise<void> {
  if (!storageInstance || !bucketName) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GCS] Storage não configurado - ignorando delete');
      return;
    }
    console.warn('[GCS] Storage não configurado - ignorando delete em produção');
    return;
  }
  
  try {
    // Extrair nome do arquivo da URL
    let fileName: string | null = null;
    
    // Tentar extrair de diferentes formatos de URL
    if (fileUrl.includes(`${bucketName}/`)) {
      fileName = fileUrl.split(`${bucketName}/`)[1];
    } else if (fileUrl.includes('storage.googleapis.com/')) {
      const parts = fileUrl.split('storage.googleapis.com/');
      if (parts.length > 1) {
        const path = parts[1];
        const pathParts = path.split('/');
        if (pathParts.length > 1) {
          fileName = pathParts.slice(1).join('/');
        }
      }
    } else if (fileUrl.includes('storage.cloud.google.com/')) {
      const parts = fileUrl.split('storage.cloud.google.com/');
      if (parts.length > 1) {
        const path = parts[1];
        const pathParts = path.split('/');
        if (pathParts.length > 1) {
          fileName = pathParts.slice(1).join('/');
        }
      }
    }
    
    if (!fileName) {
      console.warn('[GCS] Não foi possível extrair nome do arquivo da URL:', fileUrl);
      return;
    }
    
    const bucket = storageInstance.bucket(bucketName);
    const file = bucket.file(fileName);
    
    const [exists] = await file.exists();
    if (exists) {
      await file.delete();
      console.log('[GCS] Imagem deletada com sucesso:', fileName);
    } else {
      console.log('[GCS] Arquivo não existe (já foi deletado?):', fileName);
    }
  } catch (error: any) {
    // Não lançar erro - pode ser que a imagem já não exista ou credenciais não estejam disponíveis
    // No Vercel, ADC pode não estar disponível, então apenas logar o erro
    if (error.message?.includes('default credentials') || error.message?.includes('authentication')) {
      console.warn('[GCS] Credenciais não disponíveis para deletar imagem. Ignorando delete:', fileUrl);
      console.warn('[GCS] Para habilitar delete no Vercel, configure GOOGLE_CLOUD_KEY nas variáveis de ambiente.');
    } else {
      console.error('[GCS] Erro ao deletar imagem:', error.message);
    }
    // Não lançar erro - operação não crítica
  }
}

/**
 * Valida se é uma imagem válida
 */
export function validateImage(file: File): { valid: boolean; error?: string } {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: 'Tipo de arquivo não permitido. Use JPG, PNG, GIF ou WEBP.' 
    };
  }
  
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: 'Arquivo muito grande. Máximo 5MB.' 
    };
  }
  
  return { valid: true };
}

/**
 * Converte base64 para Buffer (para compatibilidade com código existente)
 */
export function base64ToBuffer(base64String: string): Buffer {
  // Remove data URL prefix se existir (ex: "data:image/jpeg;base64,")
  const base64Data = base64String.includes(',') 
    ? base64String.split(',')[1] 
    : base64String;
  
  return Buffer.from(base64Data, 'base64');
}

/**
 * Gera uma Signed URL para um arquivo no GCS (útil quando o arquivo não é público)
 * @param fileName Nome do arquivo no bucket (ex: 'templates/card_base.png')
 * @param expiresIn Segundos até a URL expirar (padrão: 1 hora)
 * @returns Signed URL ou null se não conseguir gerar
 */
export async function getSignedUrl(
  fileName: string,
  expiresIn: number = 3600
): Promise<string | null> {
  if (!storageInstance || !bucketName) {
    console.warn('[GCS] Storage não configurado, não é possível gerar signed URL');
    return null;
  }

  try {
    const bucket = storageInstance.bucket(bucketName);
    const file = bucket.file(fileName);
    
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });
    
    return url;
  } catch (error: any) {
    console.error('[GCS] Erro ao gerar signed URL:', error.message);
    return null;
  }
}

/**
 * Extrai o nome do arquivo de uma URL do GCS
 * Ex: https://storage.googleapis.com/bucket/templates/card.png -> templates/card.png
 */
export function extractFileNameFromUrl(url: string): string | null {
  try {
    // storage.googleapis.com/bucket-name/path/to/file
    if (url.includes('storage.googleapis.com/')) {
      const parts = url.split('storage.googleapis.com/');
      if (parts.length > 1) {
        const path = parts[1];
        // Remove o nome do bucket (primeira parte)
        const pathParts = path.split('/');
        if (pathParts.length > 1) {
          return pathParts.slice(1).join('/');
        }
      }
    }
    
    // storage.cloud.google.com/bucket-name/path/to/file
    if (url.includes('storage.cloud.google.com/')) {
      const parts = url.split('storage.cloud.google.com/');
      if (parts.length > 1) {
        const path = parts[1];
        const pathParts = path.split('/');
        if (pathParts.length > 1) {
          return pathParts.slice(1).join('/');
        }
      }
    }
    
    return null;
  } catch {
    return null;
  }
}