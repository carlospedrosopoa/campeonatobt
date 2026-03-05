// app/api/geocode/route.ts - Geocodificação de endereços
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-request';

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação (opcional, mas recomendado para evitar abuso da API externa via seu servidor)
    const authResult = await requireUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const endereco = searchParams.get('endereco');

    if (!endereco) {
      return NextResponse.json(
        { mensagem: 'Endereço é obrigatório' },
        { status: 400 }
      );
    }

    // Usar Nominatim (OpenStreetMap) - API gratuita e sem necessidade de chave
    // IMPORTANTE: Respeite os limites de uso do Nominatim (1 request/segundo)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CampeonatoBT/1.0', // Nominatim requer User-Agent
      },
    });

    if (!response.ok) {
      throw new Error('Erro ao buscar geocodificação');
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return NextResponse.json(
        { mensagem: 'Endereço não encontrado', latitude: null, longitude: null },
        { status: 404 }
      );
    }

    const resultado = data[0];
    const latitude = parseFloat(resultado.lat);
    const longitude = parseFloat(resultado.lon);

    return NextResponse.json({
      latitude,
      longitude,
      enderecoCompleto: resultado.display_name,
    });
  } catch (error: any) {
    console.error('Erro ao geocodificar endereço:', error);
    return NextResponse.json(
      { mensagem: 'Erro ao buscar localização', error: error.message },
      { status: 500 }
    );
  }
}
