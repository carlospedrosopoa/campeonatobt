ALTER TABLE "torneios" ADD COLUMN "valor_primeira_inscricao" numeric(10,2);
ALTER TABLE "torneios" ADD COLUMN "valor_inscricao_adicional" numeric(10,2);

ALTER TABLE "inscricao_pagamentos" ADD COLUMN "valor_devido" numeric(10,2);
