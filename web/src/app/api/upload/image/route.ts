// app/api/upload/image/route.ts - Upload de imagens para Google Cloud Storage
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-request';
import { uploadImage, validateImage } from '@/lib/googleCloudStorage';

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação
    const authResult = await requireUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Obter FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'uploads';

    if (!file) {
      return NextResponse.json(
        { mensagem: 'Arquivo não fornecido' },
        { status: 400 }
      );
    }

    // Validar imagem
    const validation = validateImage(file);
    if (!validation.valid) {
      return NextResponse.json(
        { mensagem: validation.error },
        { status: 400 }
      );
    }

    // Converter File para Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Fazer upload para Google Cloud Storage
    const result = await uploadImage(buffer, file.name, folder);

    return NextResponse.json({
      url: result.url,
      fileName: result.fileName,
      size: result.size,
      mensagem: 'Upload realizado com sucesso',
    });
  } catch (error: any) {
    console.error('Erro ao fazer upload:', error);
    return NextResponse.json(
      { 
        mensagem: 'Erro ao fazer upload da imagem',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
