import { db } from "@/db";
import { gzappyConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

export type GzappyConfigDTO = {
  ativo: boolean;
  apiKey: string | null;
  instanceId: string | null;
  whatsappArbitragem: string | null;
};

function clean(value?: string | null) {
  const v = (value || "").trim();
  return v.length > 0 ? v : null;
}

export class GzappyConfigService {
  async obter(): Promise<GzappyConfigDTO> {
    const rows = await db
      .select({
        ativo: gzappyConfig.ativo,
        apiKey: gzappyConfig.apiKey,
        instanceId: gzappyConfig.instanceId,
        whatsappArbitragem: gzappyConfig.whatsappArbitragem,
      })
      .from(gzappyConfig)
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { ativo: false, apiKey: null, instanceId: null, whatsappArbitragem: null };
    }

    return {
      ativo: Boolean(row.ativo),
      apiKey: clean(row.apiKey),
      instanceId: clean(row.instanceId),
      whatsappArbitragem: clean(row.whatsappArbitragem),
    };
  }

  async salvar(input: Partial<GzappyConfigDTO>) {
    const currentRows = await db.select({ id: gzappyConfig.id }).from(gzappyConfig).limit(1);
    const existing = currentRows[0];

    const next: GzappyConfigDTO = {
      ativo: input.ativo ?? true,
      apiKey: input.apiKey === undefined ? null : clean(input.apiKey),
      instanceId: input.instanceId === undefined ? null : clean(input.instanceId),
      whatsappArbitragem: input.whatsappArbitragem === undefined ? null : clean(input.whatsappArbitragem),
    };

    if (existing) {
      const [updated] = await db
        .update(gzappyConfig)
        .set({
          ativo: next.ativo,
          apiKey: next.apiKey,
          instanceId: next.instanceId,
          whatsappArbitragem: next.whatsappArbitragem,
          atualizadoEm: new Date(),
        })
        .where(eq(gzappyConfig.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(gzappyConfig)
      .values({
        ativo: next.ativo,
        apiKey: next.apiKey,
        instanceId: next.instanceId,
        whatsappArbitragem: next.whatsappArbitragem,
      })
      .returning();
    return created;
  }
}

export const gzappyConfigService = new GzappyConfigService();
