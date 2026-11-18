# Divai — gerador de projetos com IA

## Requisitos
- Node.js 18 ou superior
- Uma chave gratuita da Groq (o plano Free tem limites de uso; não exige contratar a API paga)

## Instalação
1. Extraia a pasta do projeto.
2. Abra um terminal dentro dela.
3. Execute `npm install`.
4. Crie uma conta gratuita em [GroqCloud](https://console.groq.com/) e gere uma chave em [API Keys](https://console.groq.com/keys).
5. Copie `.env.example` para `.env`.
   - Windows PowerShell: `Copy-Item .env.example .env`
   - CMD: `copy .env.example .env`
6. Abra `.env` e substitua `coloque_sua_chave_aqui` pela sua chave `GROQ_API_KEY`.
7. Execute `npm start`.
8. Acesse `http://localhost:3000` no navegador.

**Importante:** o projeto usa a Groq no plano gratuito e o modelo `openai/gpt-oss-120b`. O plano gratuito tem limites de requisições e tokens; ao atingir o limite, aguarde a renovação. Não é necessário ativar o plano pago para testar dentro da franquia gratuita. Nunca coloque sua chave no `script.js`, no HTML ou em qualquer arquivo enviado ao navegador: ela deve ficar somente no `.env` do servidor.

## Funcionalidades
- Geração de páginas/aplicações HTML com IA.
- Alteração iterativa do HTML gerado.
- Pré-visualização isolada e visualização do código.
- Copiar código e baixar arquivo `.html`.
- Templates para preencher o prompt.
- Histórico compartilhado no TiDB com abertura e exclusão individual (até 30 projetos recentes exibidos).
- Endpoint de saúde em `/api/health`.

## Endpoints
- `GET /api/health`
- `POST /api/generate` — `{ "prompt": "..." }`
- `POST /api/modify` — `{ "html": "...", "instruction": "..." }`

O HTML gerado roda no navegador do usuário. Recursos que dependam de banco de dados, autenticação real, pagamentos ou serviços externos exigem integrações e credenciais próprias; o gerador não provisiona esses serviços automaticamente.


## Solução para erro 405
Não abra o `index.html` pelo Live Server ou diretamente pelo navegador. O Live Server serve apenas arquivos estáticos e não executa as rotas `/api`. Inicie o backend com `npm start` e acesse exatamente `http://localhost:3000`. A aba Visual é aberta automaticamente após a geração; a aba Código fica disponível ao lado.

## Conectar ao TiDB

O histórico é compartilhado entre as pessoas que acessam o servidor. A tabela `divai_projects` é criada automaticamente no primeiro acesso ao histórico, portanto o usuário do banco precisa ter permissão para criar tabelas. O comando de teste abaixo apenas verifica o acesso, sem criar tabelas nem alterar dados.

1. No painel do TiDB Cloud, abra sua instância e clique em **Connect**. Confirme o host, usuário e banco e obtenha a senha com o responsável pela conta. Não compartilhe a senha no chat.
2. Se necessário, baixe o certificado CA em **Connect > CA cert**. Salve-o em um local acessível e informe seu caminho em `TIDB_CA_PATH` no `.env`. Se deixar vazio, o Node.js usará suas CAs confiáveis; o TLS continua obrigatório e o certificado do servidor é verificado.
3. Copie `.env.example` para `.env` se ainda não existir e preencha `TIDB_PASSWORD`. Use uma nova chave Groq em `GROQ_API_KEY`.
4. Execute `npm install` e depois `npm run db:test`. O teste consulta somente o nome do banco e a versão do servidor.

Se ocorrer erro de autenticação, confira usuário e senha. Se houver erro de conexão, confira host, porta 4000, acesso à rede e, quando aplicável, a lista de IPs permitidos no painel. Se houver erro de certificado, confira o arquivo CA e o caminho informado. Veja a [documentação oficial de conexão Node.js com TiDB](https://docs.pingcap.com/tidb/dev/dev-guide-sample-application-nodejs-mysql2/).

## Apresentação em sala

1. Configure no `.env` uma chave Groq válida e os dados do TiDB. Execute `npm install`, `npm run db:test` e `npm start`.
2. Abra `http://localhost:3000`, descreva uma página e clique em **Gerar projeto**. É possível alterar, copiar ou baixar o resultado.
3. O histórico é compartilhado: qualquer pessoa com acesso à aplicação pode abrir ou apagar projetos. Mostra os 30 mais recentes; o botão Limpar apaga todo o histórico, inclusive projetos mais antigos. Projetos antes guardados no navegador não são migrados automaticamente.
4. Para outras pessoas acessarem, precisam alcançar o computador do servidor pela rede e usar seu endereço IP na porta configurada; `localhost` em outro computador aponta para ele mesmo.
