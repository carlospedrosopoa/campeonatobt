const fs = require('fs');
const path = require('path');

const credentialsPath = path.resolve(__dirname, '../google-cloud-credentials.json');

if (!fs.existsSync(credentialsPath)) {
  console.error('Arquivo google-cloud-credentials.json não encontrado na raiz do projeto web.');
  process.exit(1);
}

const credentials = fs.readFileSync(credentialsPath);
const base64 = credentials.toString('base64');

console.log('\n--- Copie o conteúdo abaixo para a variável GOOGLE_CLOUD_KEY na Vercel ---\n');
console.log(base64);
console.log('\n------------------------------------------------------------------------\n');
