ALTER TABLE inscricao_pagamentos
ADD COLUMN status text NOT NULL DEFAULT 'PENDENTE';

UPDATE inscricao_pagamentos
SET status = 'PAGO'
WHERE pago = true;

